import { Logger } from '../core/logger';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Native macOS Audio Recorder using AVFoundation
 * No FFmpeg dependency - works on every Mac
 */
export class NativeAudioRecorder {
  private nativeModule: any = null;
  private isRecording = false;
  private audioChunks: Buffer[] = [];
  private recordingStartTime = 0;
  private onAudioLevel?: (level: number) => void;
  private inputSampleRate = 16000;
  private hasLoggedResamplerActivation = false;
  private totalInputBytes = 0;
  private totalOutputBytes = 0;

  constructor() {
    try {
      // Try to load the native module with static imports first
      let nativeModule = null;
      
      // Try different require strategies to work around webpack limitations
      try {
        // Method 1: Direct require for development
        nativeModule = eval('require')('../../build/Release/audio_capture.node');
        Logger.debug('✅ [NativeAudio] Loaded via direct require (development)');
      } catch (e1) {
        try {
          // Method 2: Try production path
          nativeModule = eval('require')('./audio_capture.node');
          Logger.debug('✅ [NativeAudio] Loaded via production path');
        } catch (e2) {
          try {
            // Method 3: Try absolute path
            const modulePath = path.join(process.cwd(), 'build/Release/audio_capture.node');
            nativeModule = eval('require')(modulePath);
            Logger.debug('✅ [NativeAudio] Loaded via absolute path:', modulePath);
          } catch (e3) {
            Logger.error('❌ [NativeAudio] All require methods failed:', { e1, e2, e3 });
            throw new Error('Native audio module not found');
          }
        }
      }
      
      if (!nativeModule) {
        throw new Error('Native audio module failed to load');
      }
      
      this.nativeModule = nativeModule;
      Logger.success('✅ Native audio module loaded successfully');
    } catch (error) {
      Logger.error('❌ Failed to load native audio module:', error);
      throw new Error('Native audio recording not available');
    }
  }

  async start(onAudioLevel?: (level: number) => void): Promise<void> {
    if (this.isRecording) {
      Logger.warning('⚠️ [NativeAudio] Already recording, ensuring capture is active');
      // Validate that audio capture is actually working
      const initialChunkCount = this.audioChunks.length;
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      const newChunkCount = this.audioChunks.length;
      
      if (newChunkCount === initialChunkCount) {
        Logger.warning('⚠️ [NativeAudio] No new audio chunks detected, restarting capture');
        try {
          this.nativeModule.stopCapture();
          this.isRecording = false;
        } catch (e) {
          Logger.debug('Error during force stop:', e);
        }
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for clean reset
      } else {
        Logger.debug('✅ [NativeAudio] Audio capture is active, continuing');
        return;
      }
    }

    try {
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.audioChunks = [];
      this.onAudioLevel = onAudioLevel;
      this.totalInputBytes = 0;
      this.totalOutputBytes = 0;
      this.hasLoggedResamplerActivation = false;
      
      Logger.debug('🎤 Starting native audio recording...');
      Logger.debug(`[NativeAudio][Diagnostics] Native sample-rate probe available: ${typeof this.nativeModule.getCurrentSampleRate === 'function'}`);

      // Start native audio capture with callback
      const success = this.nativeModule.startCapture((audioBuffer: Buffer) => {
        this.totalInputBytes += audioBuffer?.length || 0;

        if (typeof this.nativeModule.getCurrentSampleRate === 'function') {
          const detectedRate = Number(this.nativeModule.getCurrentSampleRate());
          if (Number.isFinite(detectedRate) && detectedRate >= 8000 && detectedRate <= 192000 && detectedRate !== this.inputSampleRate) {
            this.inputSampleRate = detectedRate;
            Logger.debug(`🎙️ [NativeAudio] Detected input sample rate: ${detectedRate}Hz`);
          }
        }

        const processedBuffer = this.ensure16kLinear16(audioBuffer);
        this.totalOutputBytes += processedBuffer.length;

        // Add normalized (16k) audio data to chunks
        this.audioChunks.push(processedBuffer);
        
        // Calculate and report audio level
        if (this.onAudioLevel) {
          const level = this.calculateAudioLevel(processedBuffer);
          this.onAudioLevel(level);
        }
      });

      if (!success) {
        throw new Error('Failed to start native audio capture');
      }

      // Validate that audio capture actually started by waiting for first chunk
      let audioStarted = false;
      let totalBytesReceived = 0;
      for (let i = 0; i < 50; i++) { // Wait up to 500ms for meaningful audio
        await new Promise(resolve => setTimeout(resolve, 10));
        totalBytesReceived = this.audioChunks.reduce((sum, chunk) => sum + (chunk?.length || 0), 0);
        if (totalBytesReceived > 1000) { // At least 1KB of audio data
          audioStarted = true;
          break;
        }
      }
      
      if (!audioStarted) {
        Logger.error(`❌ [NativeAudio] CRITICAL: Only ${totalBytesReceived} bytes received after 500ms - microphone not working!`);
        Logger.error(`❌ [NativeAudio] Chunks received: ${this.audioChunks.length}, Total bytes: ${totalBytesReceived}`);
        
        // Attempt recovery if we got some data but not enough (indicates corruption)
        if (totalBytesReceived > 0 && totalBytesReceived < 500) {
          Logger.debug('🔧 [NativeAudio] Attempting microphone recovery...');
          try {
            this.nativeModule.stopCapture();
            this.cleanup();
            
            // Wait for hardware to reset
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Try starting again
            const retrySuccess = this.nativeModule.startCapture((audioBuffer: Buffer) => {
              this.totalInputBytes += audioBuffer?.length || 0;

              if (typeof this.nativeModule.getCurrentSampleRate === 'function') {
                const detectedRate = Number(this.nativeModule.getCurrentSampleRate());
                if (Number.isFinite(detectedRate) && detectedRate >= 8000 && detectedRate <= 192000 && detectedRate !== this.inputSampleRate) {
                  this.inputSampleRate = detectedRate;
                  Logger.debug(`🎙️ [NativeAudio] Detected input sample rate (retry): ${detectedRate}Hz`);
                }
              }

              const processedBuffer = this.ensure16kLinear16(audioBuffer);
              this.totalOutputBytes += processedBuffer.length;
              this.audioChunks.push(processedBuffer);
              if (this.onAudioLevel) {
                const level = this.calculateAudioLevel(processedBuffer);
                this.onAudioLevel(level);
              }
            });
            
            if (retrySuccess) {
              // Re-validate the retry
              for (let j = 0; j < 30; j++) { // Wait up to 300ms for retry
                await new Promise(resolve => setTimeout(resolve, 10));
                const retryBytes = this.audioChunks.reduce((sum, chunk) => sum + (chunk?.length || 0), 0);
                if (retryBytes > 1000) {
                  audioStarted = true;
                  Logger.success('✅ [NativeAudio] Recovery successful - audio capturing properly');
                  break;
                }
              }
            }
          } catch (recoveryError) {
            Logger.error('❌ [NativeAudio] Recovery attempt failed:', recoveryError);
          }
        }
        
        if (!audioStarted) {
          try {
            this.nativeModule.stopCapture();
          } catch (stopError) {
            Logger.debug('⚠️ [NativeAudio] stopCapture during startup failure failed:', stopError);
          }
          this.cleanup();
          this.isRecording = false;
          throw new Error(`Native audio capture did not become active (bytes=${totalBytesReceived})`);
        }
      }

      Logger.success('✅ Native audio recording started successfully');
    } catch (error) {
      Logger.error('❌ Failed to start native audio recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  stop(): Buffer | null {
    if (!this.isRecording) return null;

    try {
      // Stop native audio capture
      this.nativeModule.stopCapture();
      this.isRecording = false;

      // Log detailed audio capture statistics
      const chunkCount = this.audioChunks.length;
      const chunkSizes = this.audioChunks.map(chunk => chunk?.length || 0);
      const totalSize = chunkSizes.reduce((sum, size) => sum + size, 0);
      const duration = Date.now() - this.recordingStartTime;
      const expectedSize = Math.floor((duration / 1000) * 16000 * 2); // 16kHz, 16-bit = 32KB/sec
      
      if (totalSize < expectedSize * 0.1) {
        Logger.error(`❌ [NativeAudio] CRITICAL AUDIO FAILURE: Only captured ${totalSize} bytes, expected ~${expectedSize}`);
        Logger.error(`❌ [NativeAudio] This indicates microphone access failure or audio session conflict`);
        Logger.error(`❌ [NativeAudio] Chunk sizes: ${chunkSizes.slice(0, 10).join(', ')}${chunkCount > 10 ? '...' : ''}`);
      }

      const pcmBuffer = Buffer.concat(this.audioChunks, totalSize);
      
      // Clear chunks and reset state for next recording
      this.cleanup();
      
      Logger.debug(`[NativeAudio][Diagnostics] Capture summary: inputRate=${this.inputSampleRate}Hz targetRate=16000Hz inputBytes=${this.totalInputBytes} outputBytes=${this.totalOutputBytes}`);
      Logger.success(`🎵 Audio captured: ${pcmBuffer.length} bytes Linear16 PCM (${duration}ms) - Deepgram ready`);
      
      return pcmBuffer; // Return raw PCM - Deepgram uses it directly, OpenAI converts to WAV
    } catch (error) {
      Logger.error('❌ Error stopping native audio recording:', error);
      this.cleanup(); // Ensure cleanup even on error
      return null;
    }
  }

  /**
   * Force cleanup of audio resources and state
   */
  cleanup(): void {
    try {
      if (this.isRecording) {
        this.nativeModule.stopCapture();
      }
      this.isRecording = false;
      this.audioChunks = [];
      this.recordingStartTime = 0;
      this.onAudioLevel = undefined; // Clear callback to prevent memory leaks
      this.inputSampleRate = 16000;
      this.hasLoggedResamplerActivation = false;
      this.totalInputBytes = 0;
      this.totalOutputBytes = 0;
      Logger.debug('🧹 [NativeAudio] Cleanup completed - resources released');
    } catch (error) {
      Logger.error('❌ [NativeAudio] Cleanup error:', error);
      // Force reset state even if native cleanup fails
      this.isRecording = false;
      this.audioChunks = [];
      this.recordingStartTime = 0;
      this.onAudioLevel = undefined;
      this.inputSampleRate = 16000;
      this.hasLoggedResamplerActivation = false;
      this.totalInputBytes = 0;
      this.totalOutputBytes = 0;
    }
  }

  /**
   * Emergency stop - force cleanup without error handling
   */
  emergencyStop(): void {
    try {
      this.nativeModule?.stopCapture();
    } catch (e) { /* ignore errors in emergency stop */ }
    
    this.isRecording = false;
    this.audioChunks = [];
    this.recordingStartTime = 0;
    this.onAudioLevel = undefined;
    this.inputSampleRate = 16000;
    this.hasLoggedResamplerActivation = false;
    this.totalInputBytes = 0;
    this.totalOutputBytes = 0;
    Logger.debug('🚨 [NativeAudio] Emergency stop completed');
  }

  private ensure16kLinear16(chunk: Buffer): Buffer {
    if (!chunk || chunk.length < 2) return Buffer.alloc(0);

    const alignedLength = chunk.length - (chunk.length % 2);
    const alignedChunk = alignedLength === chunk.length ? chunk : chunk.subarray(0, alignedLength);

    if (this.inputSampleRate === 16000) {
      return alignedChunk;
    }

    if (!this.hasLoggedResamplerActivation) {
      this.hasLoggedResamplerActivation = true;
      Logger.debug(`[NativeAudio][Diagnostics] Resampler active: ${this.inputSampleRate}Hz -> 16000Hz`);
    }

    return this.downsampleLinear16Mono(alignedChunk, this.inputSampleRate, 16000);
  }

  private downsampleLinear16Mono(input: Buffer, inRate: number, outRate: number): Buffer {
    if (inRate <= 0 || outRate <= 0 || input.length < 2) return Buffer.alloc(0);
    if (inRate === outRate) return input;

    const inputSampleCount = Math.floor(input.length / 2);
    if (inputSampleCount <= 1) return Buffer.alloc(0);

    const outputSampleCount = Math.max(1, Math.floor((inputSampleCount * outRate) / inRate));
    const output = Buffer.alloc(outputSampleCount * 2);
    const ratio = inRate / outRate;

    for (let i = 0; i < outputSampleCount; i++) {
      const sourceIndex = i * ratio;
      const index0 = Math.floor(sourceIndex);
      const index1 = Math.min(index0 + 1, inputSampleCount - 1);
      const frac = sourceIndex - index0;

      const sample0 = input.readInt16LE(index0 * 2);
      const sample1 = input.readInt16LE(index1 * 2);
      const value = Math.round(sample0 + (sample1 - sample0) * frac);

      output.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
    }

    return output;
  }

  /**
   * Convert raw PCM to WAV format for services that require it (like OpenAI)
   */
  static convertPCMToWAV(pcmBuffer: Buffer): Buffer {
    const sampleRate = 16000; // 16kHz
    const numChannels = 1;     // Mono
    const bitsPerSample = 16;  // 16-bit
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmBuffer.length;
    const fileSize = 44 + dataSize; // 44 bytes for WAV header + data

    // Create WAV header buffer
    const wavHeader = Buffer.alloc(44);
    let offset = 0;

    // RIFF chunk descriptor
    wavHeader.write('RIFF', offset); offset += 4;
    wavHeader.writeUInt32LE(fileSize - 8, offset); offset += 4;
    wavHeader.write('WAVE', offset); offset += 4;

    // fmt sub-chunk
    wavHeader.write('fmt ', offset); offset += 4;
    wavHeader.writeUInt32LE(16, offset); offset += 4;
    wavHeader.writeUInt16LE(1, offset); offset += 2;
    wavHeader.writeUInt16LE(numChannels, offset); offset += 2;
    wavHeader.writeUInt32LE(sampleRate, offset); offset += 4;
    wavHeader.writeUInt32LE(byteRate, offset); offset += 4;
    wavHeader.writeUInt16LE(blockAlign, offset); offset += 2;
    wavHeader.writeUInt16LE(bitsPerSample, offset); offset += 2;

    // data sub-chunk
    wavHeader.write('data', offset); offset += 4;
    wavHeader.writeUInt32LE(dataSize, offset);

    // Combine header + PCM data
    return Buffer.concat([wavHeader, pcmBuffer]);
  }

  get recording(): boolean {
    return this.isRecording;
  }

  /**
   * Calculate audio level from PCM data for visual feedback
   * ⚡ IMPROVED SENSITIVITY for better waveform response
   */
  private calculateAudioLevel(chunk: Buffer): number {
    if (!chunk || chunk.length === 0) return 0;

    // Calculate RMS level from PCM data
    let sum = 0;
    const samples = chunk.length / 2; // 16-bit samples
    
    for (let i = 0; i < chunk.length; i += 2) {
      // Read 16-bit sample (little endian)
      const sample = chunk.readInt16LE(i);
      sum += sample * sample;
    }
    
    const rms = Math.sqrt(sum / samples);
    // Normalize to 0-100 range
    const level = Math.min(100, (rms / 32767) * 100);
    
    return level;
  }

  /**
   * Get latest audio chunks for streaming (for real-time transcription)
   */
  getLatestChunks(fromIndex: number = 0): Buffer[] {
    if (!this.isRecording || fromIndex < 0) return [];
    return this.audioChunks.slice(fromIndex);
  }

  /**
   * Get total number of audio chunks recorded so far
   */
  getChunkCount(): number {
    return this.audioChunks.length;
  }

  /**
   * Get a copy of all audio chunks (for fallback when streaming fails)
   */
  getAllChunks(): Buffer[] {
    return [...this.audioChunks];
  }

  /**
   * Check if native audio recording is available
   */
  static isAvailable(): boolean {
    try {
      // Try multiple possible paths for the native module
      const possiblePaths = [
        // Development paths
        path.join(process.cwd(), 'build/Release/audio_capture.node'),
        path.join(process.cwd(), 'packages/jarvis-ai-assistant/build/Release/audio_capture.node'),
        // Production paths - same location as fn_key_monitor.node
        path.join(__dirname, 'audio_capture.node'),
        path.join(process.resourcesPath || '', 'audio_capture.node')
      ];
      
      Logger.debug('🔍 [NativeAudio] Checking availability in paths:', possiblePaths);
      
      for (const testPath of possiblePaths) {
        try {
          // Use fs.existsSync instead of require.resolve to avoid webpack issues
          if (fs.existsSync(testPath)) {
            Logger.debug('✅ [NativeAudio] Module found at:', testPath);
            return true;
          } else {
            Logger.debug('❌ [NativeAudio] Not found at:', testPath);
          }
        } catch (e) {
          Logger.debug('❌ [NativeAudio] Error checking:', testPath, e);
        }
      }
      
      Logger.debug('❌ [NativeAudio] Module not found in any expected location');
      return false;
    } catch (error) {
      Logger.debug('❌ [NativeAudio] Error checking availability:', (error as Error).message);
      return false;
    }
  }
}
