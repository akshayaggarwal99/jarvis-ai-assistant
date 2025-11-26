export interface TranscriptionProvider {
  transcribe(audioPath: string, options?: TranscriptionOptions): Promise<TranscriptionResult>;
}

export interface TranscriptionOptions {
  customPrompt?: string;
  language?: string;
  format?: 'text' | 'detailed';
  temperature?: number;
  responseFormat?: 'text' | 'json' | 'srt' | 'verbose_json';
  onPartialTranscript?: (partialText: string) => void;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  duration?: number;
}

export interface ContextAwareTranscriber extends TranscriptionProvider {
  transcribeWithContext(audioPath: string, context: AppContext): Promise<TranscriptionResult>;
}

export interface AppContext {
  activeApp: string;
  windowTitle: string;
  type: 'email' | 'messaging' | 'document' | 'code' | 'default';
}
