/**
 * Chunked and Compressed Transcription Module
 * 
 * Handles long audio transcription through:
 * 1. Audio chunking - splits long audio into smaller pieces
 * 2. Audio compression - compresses audio to reduce upload size
 * 3. Retry logic for individual chunks
 */

import { Logger } from '../core/logger';
import { AudioChunker, AudioChunk } from '../audio/audio-chunker';
import { AudioCompressor } from '../audio/compressor';
import { RobustApiCaller } from '../utils/robust-api-caller';
import FormData from 'form-data';

export interface ChunkedTranscriptionResult {
  text: string;
  model: string;
}

export interface TranscriptionContext {
  dictionaryContext?: string;
  getOpenAIKey: () => Promise<string>;
  getGeminiKey: () => Promise<string>;
}

/**
 * Handles chunked transcription for long audio files
 */
export class ChunkedTranscriber {
  private context: TranscriptionContext;

  constructor(context: TranscriptionContext) {
    this.context = context;
  }

  /**
   * Transcribe long audio using chunking
   */
  async transcribeChunkedBuffer(audioBuffer: Buffer, audioDurationMs: number): Promise<ChunkedTranscriptionResult> {
    Logger.info(`🔄 [Chunker] Chunked transcription for ${Math.round(audioDurationMs/1000)}s audio`);
    
    const chunks = AudioChunker.chunkAudio(audioBuffer, audioDurationMs);
    const chunkResults: Array<{ text: string; startMs: number; endMs: number }> = [];
    
    let successfulChunks = 0;
    let chosenModel = 'unknown';
    
    for (const [index, chunk] of chunks.entries()) {
      try {
        const result = await this.transcribeChunkWithRetry(chunk);
        
        if (result && result.text.trim()) {
          chunkResults.push({
            text: result.text,
            startMs: chunk.startMs,
            endMs: chunk.endMs
          });
          chosenModel = result.model;
          successfulChunks++;
        }
        
        if (index < chunks.length - 1) {
          await this.sleep(100);
        }
        
      } catch (error) {
        Logger.error(`❌ [Chunker] Chunk ${index + 1} failed:`, error);
        if (successfulChunks === 0 && index > chunks.length / 2) {
          throw new Error('Too many chunk failures');
        }
      }
    }
    
    if (chunkResults.length === 0) {
      throw new Error('All chunks failed to transcribe');
    }
    
    const combinedText = AudioChunker.combineTranscriptionResults(chunkResults);
    Logger.info(`🔄 [Chunker] Completed: ${successfulChunks}/${chunks.length} chunks successful`);
    
    return { text: combinedText, model: `${chosenModel}-chunked` };
  }

  /**
   * Transcribe a single chunk with retry logic
   */
  private async transcribeChunkWithRetry(chunk: AudioChunk): Promise<{ text: string; model: string } | null> {
    // Try OpenAI first
    try {
      const openaiKey = await this.context.getOpenAIKey();
      if (openaiKey) {
        const result = await this.transcribeChunkWithOpenAI(chunk.buffer, openaiKey);
        if (result) {
          return { text: result, model: 'gpt-4o-mini-transcribe' };
        }
      }
    } catch (error) {
      Logger.warning(`OpenAI chunk transcription failed:`, error);
    }
    
    // Fallback to Gemini
    try {
      const geminiKey = await this.context.getGeminiKey();
      if (geminiKey) {
        const result = await this.transcribeChunkWithGemini(chunk.buffer, geminiKey);
        if (result) {
          return { text: result, model: 'gemini-2.5-flash-lite' };
        }
      }
    } catch (error) {
      Logger.warning(`Gemini chunk transcription failed:`, error);
    }
    
    return null;
  }

  /**
   * Transcribe chunk using OpenAI
   */
  private async transcribeChunkWithOpenAI(chunkBuffer: Buffer, openaiKey: string): Promise<string | null> {
    const { NativeAudioRecorder } = await import('../audio/native-audio-recorder');
    const wavBuffer = NativeAudioRecorder.convertPCMToWAV(chunkBuffer);
    
    const formData = new FormData();
    formData.append('file', wavBuffer, { filename: 'chunk.wav', contentType: 'audio/wav' });
    formData.append('model', 'gpt-4o-mini-transcribe');
    
    if (this.context.dictionaryContext) {
      formData.append('prompt', `This audio may contain these terms: ${this.context.dictionaryContext}`);
    }

    const response = await RobustApiCaller.createTimeoutSafeUpload(
      formData,
      'https://api.openai.com/v1/audio/transcriptions',
      {
        'Authorization': `Bearer ${openaiKey}`,
        ...formData.getHeaders()
      },
      45000
    );

    const result = await response.json() as any;
    return result.text?.trim() || null;
  }

  /**
   * Transcribe chunk using Gemini
   */
  private async transcribeChunkWithGemini(chunkBuffer: Buffer, geminiKey: string): Promise<string | null> {
    const audioBase64 = chunkBuffer.toString('base64');
    let transcriptionPrompt = 'Transcribe this audio accurately with proper punctuation and capitalization.';
    if (this.context.dictionaryContext) {
      transcriptionPrompt += ` (Note: Audio may contain these terms: ${this.context.dictionaryContext})`;
    }

    const response = await RobustApiCaller.fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: transcriptionPrompt },
              { inline_data: { mime_type: 'audio/wav', data: audioBase64 } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
        })
      },
      { timeoutMs: 45000 },
      'Gemini chunk transcription'
    );

    const result = await response.json() as any;
    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Handles compressed transcription for large audio files
 */
export class CompressedTranscriber {
  private context: TranscriptionContext;
  private chunkedTranscriber: ChunkedTranscriber;

  constructor(context: TranscriptionContext) {
    this.context = context;
    this.chunkedTranscriber = new ChunkedTranscriber(context);
  }

  /**
   * Check if audio needs compression based on size or duration
   */
  needsCompression(audioBuffer: Buffer, durationMs?: number): boolean {
    const maxSizeBytes = 1 * 1024 * 1024;  // 1MB
    const maxDurationMs = 15 * 1000;       // 15 seconds
    
    if (audioBuffer.length > maxSizeBytes) {
      Logger.info(`🗜️ [Compression] Audio needs compression: ${Math.round(audioBuffer.length/1024)}KB > ${Math.round(maxSizeBytes/1024)}KB`);
      return true;
    }
    
    if (durationMs && durationMs > maxDurationMs) {
      Logger.info(`🗜️ [Compression] Audio needs compression: ${Math.round(durationMs/1000)}s > ${Math.round(maxDurationMs/1000)}s`);
      return true;
    }
    
    return false;
  }

  /**
   * Transcribe long audio using compression
   */
  async transcribeCompressedBuffer(audioBuffer: Buffer, audioDurationMs: number): Promise<ChunkedTranscriptionResult & { isAssistant?: boolean }> {
    Logger.info(`🗜️ [Compression] Starting compressed transcription for ${Math.round(audioDurationMs/1000)}s audio`);
    
    const tempDir = require('os').tmpdir();
    const tempInputFile = require('path').join(tempDir, `audio_input_${Date.now()}.wav`);
    let tempCompressedFile: string | null = null;
    
    try {
      // Write audio buffer to temporary file
      const { NativeAudioRecorder } = await import('../audio/native-audio-recorder');
      const wavBuffer = NativeAudioRecorder.convertPCMToWAV(audioBuffer);
      require('fs').writeFileSync(tempInputFile, wavBuffer);
      
      Logger.info(`🗜️ [Compression] Created temp file: ${tempInputFile} (${Math.round(wavBuffer.length/1024)}KB)`);
      
      // Get optimal compression settings
      const { format, quality } = AudioCompressor.getOptimalSettings(audioDurationMs, 'dictation');
      Logger.info(`🗜️ [Compression] Using ${format}/${quality} compression for ${Math.round(audioDurationMs/1000)}s audio`);
      
      // Compress the audio
      const compressionResult = await AudioCompressor.compressAudio(tempInputFile, format, quality);
      tempCompressedFile = compressionResult.file;
      
      const stats = compressionResult.stats;
      Logger.info(`🗜️ [Compression] Compressed: ${Math.round(stats.originalSize/1024)}KB → ${Math.round(stats.compressedSize/1024)}KB (${stats.compressionRatio.toFixed(1)}% smaller) in ${stats.compressionTime}ms`);
      
      // Read compressed audio and transcribe
      const compressedBuffer = require('fs').readFileSync(tempCompressedFile);
      Logger.info(`🔥 [OpenAI] Transcribing compressed audio (${Math.round(compressedBuffer.length/1024)}KB)`);
      
      const openaiKey = await this.context.getOpenAIKey();
      const result = await this.transcribeCompressedAudioWithOpenAI(compressedBuffer, format, openaiKey);
      
      if (result && result.trim()) {
        Logger.info(`✅ [Compression] Compressed transcription successful: "${result.substring(0, 100)}..."`);
        return { text: result, model: 'gpt-4o-mini-transcribe' };
      } else {
        throw new Error('Compressed transcription returned empty result');
      }
      
    } catch (error) {
      Logger.error(`❌ [Compression] Compressed transcription failed:`, error);
      
      // Fallback to chunking
      Logger.info(`🔄 [Fallback] Attempting chunked transcription as fallback`);
      return this.chunkedTranscriber.transcribeChunkedBuffer(audioBuffer, audioDurationMs);
      
    } finally {
      // Clean up temporary files
      try {
        if (require('fs').existsSync(tempInputFile)) {
          require('fs').unlinkSync(tempInputFile);
        }
        if (tempCompressedFile && require('fs').existsSync(tempCompressedFile)) {
          require('fs').unlinkSync(tempCompressedFile);
        }
      } catch (cleanupError) {
        Logger.warning('Failed to clean up temporary files:', cleanupError);
      }
    }
  }

  /**
   * Transcribe compressed audio with OpenAI
   */
  private async transcribeCompressedAudioWithOpenAI(audioBuffer: Buffer, format: string, openaiKey: string): Promise<string | null> {
    const formData = new FormData();
    
    // Map compression format to correct MIME type
    let filename: string;
    let contentType: string;
    
    switch (format) {
      case 'mp3':
        filename = 'audio.mp3';
        contentType = 'audio/mpeg';
        break;
      case 'm4a':
        filename = 'audio.m4a';
        contentType = 'audio/mp4';
        break;
      case 'ogg':
        filename = 'audio.ogg';
        contentType = 'audio/ogg';
        break;
      default:
        filename = 'audio.wav';
        contentType = 'audio/wav';
    }
    
    Logger.debug(`🎵 [OpenAI] Sending compressed ${format} audio as ${filename} (${contentType})`);
    
    formData.append('file', audioBuffer, {
      filename,
      contentType,
      knownLength: audioBuffer.length
    });
    formData.append('model', 'gpt-4o-mini-transcribe');
    
    if (this.context.dictionaryContext) {
      formData.append('prompt', `This audio may contain these terms: ${this.context.dictionaryContext}`);
    }

    const response = await RobustApiCaller.createTimeoutSafeUpload(
      formData,
      'https://api.openai.com/v1/audio/transcriptions',
      {
        'Authorization': `Bearer ${openaiKey}`,
        ...formData.getHeaders()
      },
      60000
    );

    const result = await response.json() as any;
    return result.text?.trim() || null;
  }
}
