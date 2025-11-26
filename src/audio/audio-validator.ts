import { Logger } from '../core/logger';

export class AudioValidator {
  // Common garbage transcriptions to filter out
  private static GARBAGE_PATTERNS = [
    /^learn english for free/i,
    /^www\./i,
    /^format this text with proper punctuation/i,
    /^proper punctuation.*capitalization.*natural sentence structure/i,
    /^capitalization.*natural sentence structure.*for general use/i,
    /^for general use/i,
    /^a{4,}/i, // Four or more 'a' characters (not just 3)
    /^[a-z]{1,2}(\s[a-z]{1,2}){4,}/i, // Single/double letters repeated 5+ times
    /^\s*$/, // Empty or whitespace only
    // Only very specific system sound patterns
    /^MBC 뉴스 이학수입니다\.?$/i, // Exact Korean notification 
    /^MBC 뉴스 이덕영입니다\.?$/i, // Exact Korean notification
    /this audio may contain these terms:/i, // Dictionary hint from Deepgram
  ];

  /**
   * Validates if transcription text is legitimate speech
   */
  static isValidTranscription(text: string, minWords = 1): boolean {
    if (!text || typeof text !== 'string') {
      Logger.warning('Invalid transcription: empty or non-string');
      return false;
    }

    const trimmed = text.trim();
    
    // Check minimum length
    if (trimmed.length < 1) {
      Logger.warning('Invalid transcription: too short');
      return false;
    }

    // Check word count
    const words = trimmed.split(/\s+/).filter(word => word.length > 0);
    if (words.length < minWords) {
      Logger.warning(`Invalid transcription: only ${words.length} words (min: ${minWords})`);
      return false;
    }

    // Check against garbage patterns
    for (const pattern of this.GARBAGE_PATTERNS) {
      if (pattern.test(trimmed)) {
        Logger.warning(`Invalid transcription: matches garbage pattern: ${trimmed}`);
        return false;
      }
    }

    Logger.debug(`Valid transcription: ${trimmed.substring(0, 50)}...`);
    return true;
  }

  /**
   * Validates audio recording has sufficient content
   */
  static isValidAudioDuration(durationMs: number, minDurationMs = 500): boolean {
    if (durationMs < minDurationMs) {
      Logger.warning(`Invalid audio: too short (${durationMs}ms, min: ${minDurationMs}ms)`);
      return false;
    }
    return true;
  }
}
