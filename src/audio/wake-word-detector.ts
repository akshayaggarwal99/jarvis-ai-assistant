export class FastWakeWordDetector {
  private isListening = false;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onWakeWordDetected?: () => void;

  constructor(onWakeWordDetected?: () => void) {
    this.onWakeWordDetected = onWakeWordDetected;
  }

  async start(): Promise<void> {
    try {
      this.audioContext = new AudioContext();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000,
          channelCount: 1 
        } 
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      let audioBuffer: Float32Array[] = [];
      let bufferLength = 0;
      const maxBufferLength = 16000 * 3; // 3 seconds at 16kHz

      this.processor.onaudioprocess = (event) => {
        if (!this.isListening) return;

        const inputData = event.inputBuffer.getChannelData(0);
        audioBuffer.push(new Float32Array(inputData));
        bufferLength += inputData.length;

        // Keep only last 3 seconds
        while (bufferLength > maxBufferLength) {
          const removed = audioBuffer.shift();
          if (removed) bufferLength -= removed.length;
        }

        // Simple energy-based detection for "Hey Jarvis"
        if (this.detectWakeWord(inputData)) {
          this.onWakeWordDetected?.();
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      this.isListening = true;

    } catch (error) {
      console.error('Failed to start wake word detection:', error);
    }
  }

  private detectWakeWord(audioData: Float32Array): boolean {
    // Simple energy threshold detection
    let energy = 0;
    for (let i = 0; i < audioData.length; i++) {
      energy += audioData[i] * audioData[i];
    }
    energy = Math.sqrt(energy / audioData.length);

    // If energy is above threshold, could be speech
    return energy > 0.01;
  }

  stop(): void {
    this.isListening = false;
    this.processor?.disconnect();
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
  }
}
