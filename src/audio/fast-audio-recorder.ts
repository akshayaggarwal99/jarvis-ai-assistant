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
        this.recordingProcess = spawn(ffmpegPath, [
          '-f', 'avfoundation',
          '-i', ':0',  // Default audio input
          '-ar', '16000',
          '-ac', '1',
          '-f', 'wav',
          '-loglevel', 'error',
          'pipe:1'  // Stream to stdout instead of file
        ]);

        this.recordingProcess.stdout.on('data', (data: Buffer) => {
          this.audioChunks.push(data);
          
          if (onAudioLevel) {
            const level = this.calculateAudioLevel(data);
            onAudioLevel(level);
          }
        });

        this.recordingProcess.stderr.on('data', (data: Buffer) => {
          const output = data.toString();
          Logger.debug('FFmpeg stderr:', output);
        });

        this.recordingProcess.on('error', (err: Error) => {
          Logger.error('Recording process error:', err);
          this.isRecording = false;
          reject(err);
        });

        this.recordingProcess.on('spawn', () => {
          Logger.debug('Recording process spawned successfully');
          resolve();
        });

        this.recordingProcess.on('exit', (code: number) => {
          Logger.debug(`FFmpeg process exited with code: ${code}`);
        });

        // Timeout to ensure process starts
        setTimeout(() => {
          if (this.recordingProcess && !this.recordingProcess.killed) {
            Logger.debug('Recording process confirmed running');
            resolve();
          } else {
            Logger.error('Recording process failed to start within timeout');
            reject(new Error('Recording process failed to start'));
          }
        }, 1500);

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
