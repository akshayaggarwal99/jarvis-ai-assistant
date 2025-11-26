export interface AudioProcessor {
  process(filePath: string): Promise<string>;
}

export interface AudioCompressor {
  compress(inputPath: string, outputPath: string): Promise<CompressionResult>;
}

export interface CompressionResult {
  outputPath: string;
  stats: {
    compressionTime: number;
    compressionRatio: number;
  };
}

export interface AudioRecorder {
  start(): Promise<void>;
  stop(): Promise<string>;
  isRecording(): boolean;
}
