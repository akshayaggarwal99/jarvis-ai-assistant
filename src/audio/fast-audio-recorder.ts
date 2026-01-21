import { Logger } from '../core/logger';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export class FastAudioRecorder {
  private recordingProcess: any = null;
  private isRecording = false;
  private audioChunks: Buffer[] = [];
  private recordingStartTime = 0;

  async start(onAudioLevel?: (level: number) => void): Promise<void> {
    if (this.isRecording) return;

    try {
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.audioChunks = [];

      Logger.debug('Starting audio recording...');

      await this.startRecording(onAudioLevel);

      Logger.debug('Audio recording started successfully');
    } catch (error) {
      Logger.error('Failed to start audio recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  private async startRecording(onAudioLevel?: (level: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Try using the bundled ffmpeg first, then system ffmpeg
        const ffmpegPaths = [
          path.join(process.resourcesPath || __dirname, 'ffmpeg'),
          '/usr/local/bin/ffmpeg',
          'ffmpeg'
        ];

        let ffmpegPath = 'ffmpeg';
        for (const testPath of ffmpegPaths) {
          try {
            if (fs.existsSync(testPath)) {
              ffmpegPath = testPath;
              Logger.debug(`Found ffmpeg at: ${ffmpegPath}`);
              break;
            }
          } catch (e) {
            // Continue checking other paths
          }
        }

        Logger.debug(`Using ffmpeg at: ${ffmpegPath}`);

        // Stream directly to memory - much faster!
        const args = [
          '-f', 'avfoundation',
          '-i', ':0',  // Default audio input - TODO: autodetect via 'ffmpeg -list_devices true -f avfoundation -i ""'
          '-ar', '16000',
          '-ac', '1',
          '-f', 'wav',
          '-loglevel', 'info', // Increased log level temporarily to debug issues
          'pipe:1'
        ];

        Logger.debug(`🎤 [FastAudio] Spawning FFmpeg with args: ${args.join(' ')}`);
        this.recordingProcess = spawn(ffmpegPath, args);

        const stderrChunks: string[] = [];

        this.recordingProcess.stdout.on('data', (data: Buffer) => {
          this.audioChunks.push(data);

          if (onAudioLevel) {
            const level = this.calculateAudioLevel(data);
            onAudioLevel(level);
          }
        });

        this.recordingProcess.stderr.on('data', (data: Buffer) => {
          const output = data.toString();
          stderrChunks.push(output);
          // Only log critical errors to avoid spam, but keep for debugging
          if (output.toLowerCase().includes('error') || output.toLowerCase().includes('fail')) {
            Logger.warning(`⚠️ [FastAudio] FFmpeg stderr: ${output.trim()}`);
          }
        });

        this.recordingProcess.on('error', (err: Error) => {
          Logger.error('❌ [FastAudio] Recording process error:', err);
          this.isRecording = false;
          reject(err);
        });

        this.recordingProcess.on('spawn', () => {
          Logger.debug('✅ [FastAudio] Recording process spawned successfully');
        });

        this.recordingProcess.on('exit', (code: number) => {
          if (code !== 0 && code !== null && this.isRecording) {
            const errorOutput = stderrChunks.join('\n');
            Logger.error(`❌ [FastAudio] FFmpeg exited with code ${code}. Stderr: ${errorOutput}`);
            this.isRecording = false;
          }
        });

        // Timeout to ensure initial data flow
        setTimeout(() => {
          if (this.recordingProcess && !this.recordingProcess.killed) {
            if (this.audioChunks.length > 0) {
              Logger.debug('✅ [FastAudio] Recording confirmed active (data flowing)');
              resolve();
            } else {
              Logger.warning('⚠️ [FastAudio] Process running but no audio chunks received yet');
              // Don't reject yet, give it a bit more time or let it fail gracefully later
              resolve();
            }
          } else {
            Logger.error('❌ [FastAudio] Recording process failed to start within timeout');
            reject(new Error('Recording process failed to start'));
          }
        }, 2000);

      } catch (error) {
        Logger.error('Error in startRecording:', error);
        reject(error);
      }
    });
  }

  stop(): Buffer | null {
    if (!this.isRecording) return null;

    try {
      // Stop the recording process
      if (this.recordingProcess) {
        this.recordingProcess.kill('SIGTERM');
        this.recordingProcess = null;
      }

      this.isRecording = false;

      // Pre-allocate buffer size for faster concatenation
      const totalSize = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const audioBuffer = Buffer.concat(this.audioChunks, totalSize);
      this.audioChunks = [];

      const duration = Date.now() - this.recordingStartTime;
      Logger.debug(`Audio captured: ${audioBuffer.length} bytes (${duration}ms)`);

      return audioBuffer;
    } catch (error) {
      Logger.error('Error stopping recording:', error);
      return null;
    }
  }

  get recording(): boolean {
    return this.isRecording;
  }

  private calculateAudioLevel(chunk: Buffer): number {
    // Simple audio level calculation for monitoring
    let sum = 0;
    for (let i = 0; i < chunk.length; i += 2) {
      if (i + 1 < chunk.length) {
        const sample = chunk.readInt16LE(i);
        sum += sample * sample;
      }
    }
    const rms = Math.sqrt(sum / (chunk.length / 2));
    return Math.min(100, (rms / 32768) * 100);
  }
}
