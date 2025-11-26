import { AppContext } from '../../interfaces/transcription';

export interface PushToTalkOptions {
  useStreamingTranscription?: boolean;
  audioFeedback?: boolean;
  onAudioLevel?: (level: number) => void;
  onStateChange?: (isActive: boolean) => void;
  onTranscriptionState?: (isTranscribing: boolean) => void;
  onPartialTranscript?: (partialText: string) => void;
}

export interface TranscriptionSession {
  id: string;
  startTime: number;
  keyReleaseTime: number;
  audioBuffer?: Buffer;
  duration: number;
  isActive: boolean;
}

export interface TranscriptionResult {
  text: string;
  model: string;
  confidence?: number;
  isAssistantCommand?: boolean;
  preComputedAssistant?: {
    text: string;
    isAssistant: boolean;
  };
}

export interface ProcessingResult {
  text: string;
  isAssistantCommand: boolean;
  processingType: 'jarvis' | 'app' | 'assistant' | 'dictation';
  skipRemainingProcessing?: boolean;
}

export interface StreamingControl {
  sendAudio: (buffer: Buffer) => boolean;
  finish: () => Promise<string>;
  stop: () => Promise<void>;
}

export interface AudioSessionData {
  buffer: Buffer | null;
  duration: number;
  chunks: Buffer[];
  hasSignificantAudio: boolean;
}

export interface PostProcessingOptions {
  enableDictionaryCorrections?: boolean;
  enableContextFormatting?: boolean;
  enableSmartKeywords?: boolean;
  fastMode?: boolean;
}

export interface PostProcessingResult {
  processedText: string;
  appliedCorrections: number;
  detectedContext: string;
  formattingApplied: string[];
  processingTime: number;
}

export interface OutputOptions {
  useStreaming?: boolean;
  enableCorrections?: boolean;
  method?: 'fast' | 'clipboard' | 'keystroke';
}

export interface SessionState {
  isActive: boolean;
  isTranscribing: boolean;
  currentTranscriptionId: string | null;
  currentSessionId: string | null;
  preDetectedContext?: AppContext;
}

export interface PushToTalkEvents {
  onAudioLevel?: (level: number) => void;
  onStateChange?: (isActive: boolean) => void;
  onTranscriptionState?: (isTranscribing: boolean) => void;
  onPartialTranscript?: (partialText: string) => void;
}

export type CancellationReason = 'user' | 'timeout' | 'error' | 'new_session';
