import fs from 'fs';
import path from 'path';
import { Logger } from '../core/logger';

export interface AudioChunk {
  buffer: Buffer;
  startMs: number;
  endMs: number;
  index: number;
}

export interface ChunkingOptions {
  maxChunkSizeBytes: number;  // Max chunk size in bytes (default: 20MB for safety under 25MB limit)
  maxChunkDurationMs: number; // Max chunk duration in milliseconds (default: 30 seconds)
  overlapMs: number;          // Overlap between chunks in ms to avoid cutting words
}

/**
 * Audio Chunker for handling long audio files that exceed API limits
 * Splits audio into smaller chunks to prevent timeout and size limit issues
 */
export class AudioChunker {
  private static readonly DEFAULT_OPTIONS: ChunkingOptions = {
    maxChunkSizeBytes: 20 * 1024 * 1024, // 20MB (safety margin under 25MB OpenAI limit)
    maxChunkDurationMs: 120 * 1000,      // 2 minutes (Deepgram can handle long audio)
    overlapMs: 1000                      // 1 second overlap to avoid cutting words
  };

  /**
   * Check if audio needs chunking based on size or duration
   */
  static needsChunking(audioBuffer: Buffer, durationMs?: number, options: Partial<ChunkingOptions> = {}): boolean {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    
    // Check file size
    if (audioBuffer.length > opts.maxChunkSizeBytes) {
      Logger.info(`🔄 [Chunker] Audio needs chunking: ${audioBuffer.length} bytes > ${opts.maxChunkSizeBytes} bytes`);
      return true;
    }
    
    // Check duration if provided
    if (durationMs && durationMs > opts.maxChunkDurationMs) {
      Logger.info(`🔄 [Chunker] Audio needs chunking: ${durationMs}ms > ${opts.maxChunkDurationMs}ms`);
      return true;
    }
    
    return false;
  }

  /**
   * Split audio buffer into chunks based on size and duration
   */
  static chunkAudio(audioBuffer: Buffer, durationMs: number, options: Partial<ChunkingOptions> = {}): AudioChunk[] {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const chunks: AudioChunk[] = [];
    
    Logger.info(`🔄 [Chunker] Splitting ${audioBuffer.length} bytes (${durationMs}ms) into chunks...`);
    
    // For PCM 16-bit mono at 16kHz: 2 bytes per sample, 16000 samples per second
    const bytesPerSecond = 16000 * 2; // 32000 bytes per second
    const chunkDurationBytes = Math.floor((opts.maxChunkDurationMs / 1000) * bytesPerSecond);
    const overlapBytes = Math.floor((opts.overlapMs / 1000) * bytesPerSecond);
    
    // Ensure even number of bytes for 16-bit samples
    const alignedChunkSize = Math.floor(chunkDurationBytes / 2) * 2;
    const alignedOverlap = Math.floor(overlapBytes / 2) * 2;
    
    // Calculate step size (must be positive to make progress)
    const stepSize = Math.max(alignedChunkSize - alignedOverlap, bytesPerSecond); // At least 1 second progress
    
    Logger.debug(`🔄 [Chunker] Chunk size: ${alignedChunkSize} bytes, Overlap: ${alignedOverlap} bytes, Step: ${stepSize} bytes`);
    
    // Ensure we can make progress
    if (stepSize <= 0) {
      Logger.error('🔄 [Chunker] Invalid configuration: overlap >= chunk size, using single chunk');
      return [{
        buffer: audioBuffer,
        startMs: 0,
        endMs: durationMs,
        index: 0
      }];
    }
    
    let currentPosition = 0;
    let chunkIndex = 0;
    const maxChunks = 10; // Safety limit
    
    while (currentPosition < audioBuffer.length && chunkIndex < maxChunks) {
      const remainingBytes = audioBuffer.length - currentPosition;
      const actualChunkSize = Math.min(alignedChunkSize, remainingBytes);
      
      // Skip if chunk would be too small (less than 1 second)
      if (actualChunkSize < bytesPerSecond) {
        Logger.debug(`🔄 [Chunker] Skipping small chunk at position ${currentPosition}: ${actualChunkSize} bytes`);
        break;
      }
      
      // Extract chunk buffer
      const chunkBuffer = audioBuffer.subarray(currentPosition, currentPosition + actualChunkSize);
      
      // Calculate timing
      const startMs = Math.floor((currentPosition / bytesPerSecond) * 1000);
      const endMs = Math.floor(((currentPosition + actualChunkSize) / bytesPerSecond) * 1000);
      
      chunks.push({
        buffer: chunkBuffer,
        startMs,
        endMs,
        index: chunkIndex
      });
      
      Logger.debug(`🔄 [Chunker] Chunk ${chunkIndex}: ${actualChunkSize} bytes, ${startMs}-${endMs}ms (pos: ${currentPosition})`);
      
      // Move to next chunk position
      currentPosition += stepSize;
      chunkIndex++;
    }
    
    if (chunkIndex >= maxChunks && currentPosition < audioBuffer.length) {
      Logger.info(`🔄 [Chunker] Hit maximum chunk limit (${maxChunks}), some audio may be truncated`);
    }
    
    Logger.info(`🔄 [Chunker] Created ${chunks.length} chunks from ${audioBuffer.length} bytes`);
    return chunks;
  }

  /**
   * Combine transcription results from multiple chunks
   */
  static combineTranscriptionResults(chunkResults: Array<{ text: string; startMs: number; endMs: number }>): string {
    if (chunkResults.length === 0) return '';
    if (chunkResults.length === 1) return chunkResults[0].text;
    
    Logger.info(`🔄 [Chunker] Combining ${chunkResults.length} transcription results...`);
    
    // Sort by start time to ensure correct order
    const sortedResults = chunkResults.sort((a, b) => a.startMs - b.startMs);
    
    // Combine with intelligent overlapping text removal
    let combinedText = '';
    let lastEndWords: string[] = [];
    
    for (let i = 0; i < sortedResults.length; i++) {
      const result = sortedResults[i];
      let chunkText = result.text.trim();
      
      if (i > 0 && lastEndWords.length > 0) {
        // Remove potential duplicate words from overlap
        const chunkWords = chunkText.split(/\s+/);
        const wordsToRemove = Math.min(3, lastEndWords.length); // Remove up to 3 overlapping words
        
        for (let j = 0; j < wordsToRemove; j++) {
          if (chunkWords[j] && lastEndWords[lastEndWords.length - wordsToRemove + j]) {
            const chunkWord = chunkWords[j].toLowerCase().replace(/[.,!?]/, '');
            const lastWord = lastEndWords[lastEndWords.length - wordsToRemove + j].toLowerCase().replace(/[.,!?]/, '');
            
            if (chunkWord === lastWord) {
              chunkWords.shift(); // Remove the duplicate word
            } else {
              break; // Stop if words don't match
            }
          }
        }
        
        chunkText = chunkWords.join(' ');
      }
      
      // Add appropriate spacing
      if (combinedText && chunkText) {
        combinedText += ' ' + chunkText;
      } else {
        combinedText += chunkText;
      }
      
      // Remember last few words for next iteration
      const words = chunkText.split(/\s+/);
      lastEndWords = words.slice(-3); // Keep last 3 words
    }
    
    Logger.info(`🔄 [Chunker] Combined text: ${combinedText.length} characters`);
    return combinedText.trim();
  }

  /**
   * Get estimated chunk count for audio
   */
  static getEstimatedChunkCount(audioBuffer: Buffer, durationMs: number, options: Partial<ChunkingOptions> = {}): number {
    if (!this.needsChunking(audioBuffer, durationMs, options)) {
      return 1;
    }
    
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const chunkDurationMs = Math.min(opts.maxChunkDurationMs, durationMs);
    return Math.ceil(durationMs / chunkDurationMs);
  }
}