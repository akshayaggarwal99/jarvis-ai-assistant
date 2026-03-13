import { Logger } from '../core/logger';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';

export class FastAudioRecorder {
  private recordingProcess: any = null;
  private isRecording = false;
  private audioChunks: Buffer[] = [];
  private recordingStartTime = 0;

  private getCaptureArgs(): string[] {
    if (process.platform === 'darwin') {
      return [
        '-f', 'avfoundation',
        '-i', ':0',
        '-ar', '16000',
        '-ac', '1',
        '-f', 'wav',
        '-loglevel', 'info',
        'pipe:1'
      ];
    }

    if (process.platform === 'win32') {
      return [
        '-f', 'dshow',
        '-i', 'audio=default',
        '-ar', '16000',
        '-ac', '1',
        '-f', 'wav',
        '-loglevel', 'info',
        'pipe:1'
      ];
    }

    return [
      '-f', 'pulse',
      '-i', 'default',
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      '-loglevel', 'info',
      'pipe:1'
    ];
  }

  private resolveFfmpegBinary(): string {
    const bundledBinary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const candidates = [
      path.join(process.resourcesPath || __dirname, bundledBinary),
      process.platform === 'darwin' ? '/opt/homebrew/bin/ffmpeg' : null,
      process.platform === 'darwin' ? '/usr/local/bin/ffmpeg' : null,
      process.platform === 'darwin' ? '/usr/bin/ffmpeg' : null,
      'ffmpeg'
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      const isAbsolute = path.isAbsolute(candidate);
      if (isAbsolute && !fs.existsSync(candidate)) {
        continue;
      }

      const probe = spawnSync(candidate, ['-version'], {
        encoding: 'utf8',
        timeout: 5000,
        shell: !isAbsolute
      });

      if (probe.status === 0) {
        Logger.debug(`✅ [FastAudio] ffmpeg probe succeeded: ${candidate}`);
        return candidate;
      }
    }

    throw new Error(`No working ffmpeg binary found for platform ${process.platform}`);
  }

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
        const ffmpegPath = this.resolveFfmpegBinary();
        Logger.debug(`Using ffmpeg at: ${ffmpegPath}`);

        const args = this.getCaptureArgs();

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
              Logger.error('❌ [FastAudio] Process running but no audio chunks received - treating as startup failure');
              try {
                this.recordingProcess.kill('SIGTERM');
              } catch (killError) {
                Logger.debug('⚠️ [FastAudio] Failed to terminate stalled FFmpeg process:', killError);
              }
              this.recordingProcess = null;
              this.isRecording = false;
              reject(new Error('FFmpeg started but produced no audio chunks'));
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
