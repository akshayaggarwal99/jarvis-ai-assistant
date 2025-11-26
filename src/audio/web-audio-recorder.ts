import { Logger } from '../core/logger';

export class WebAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private onAudioLevel?: (level: number) => void;

  async start(onAudioLevel?: (level: number) => void): Promise<void> {
    if (this.isRecording) return;

    try {
      this.onAudioLevel = onAudioLevel;
      
      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      // Setup audio level monitoring
      if (onAudioLevel) {
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);
        this.startLevelMonitoring();
      }

      // Record to memory - no files!
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];
      this.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
      Logger.debug('Web Audio recording started');
    } catch (error) {
      Logger.error('Failed to start web audio recording:', error);
      throw error;
    }
  }

  async stop(): Promise<ArrayBuffer | null> {
    if (!this.isRecording || !this.mediaRecorder) return null;

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        // Convert recorded chunks to single buffer
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        this.cleanup();
        Logger.debug(`Audio captured: ${arrayBuffer.byteLength} bytes`);
        resolve(arrayBuffer);
      };

      this.mediaRecorder!.stop();
      this.isRecording = false;
    });
  }

  private startLevelMonitoring(): void {
    if (!this.analyser || !this.onAudioLevel) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const monitor = () => {
      if (!this.isRecording) return;
      
      this.analyser!.getByteFrequencyData(dataArray);
      
      // Calculate RMS for audio level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = (rms / 255) * 100;
      
      this.onAudioLevel!(level);
      requestAnimationFrame(monitor);
    };
    
    monitor();
  }

  private cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.audioChunks = [];
  }

  get recording(): boolean {
    return this.isRecording;
  }
}
