import fs from 'fs';
import FormData from 'form-data';
import { Logger } from '../core/logger';
import { ContextDetector } from '../context/context-detector';
import { ScreenVision } from '../vision/screen-vision';
import { SecureAPIService } from '../services/secure-api-service';
import { RobustApiCaller } from '../utils/robust-api-caller';
import { NetworkDiagnostics } from '../utils/network-diagnostics';
import { AppSettingsService } from '../services/app-settings-service';
import { ChunkedTranscriber, CompressedTranscriber, TranscriptionContext } from './chunked-transcriber';

export class FastAssistantTranscriber {
  private secureAPI: SecureAPIService;
  private contextDetector: ContextDetector;
  private screenVision: ScreenVision;
  private dictionaryContext: string = '';
  private dictionaryLoaded: boolean = false;
  private servicesWarmed: boolean = false;
  private chunkedTranscriber: ChunkedTranscriber | null = null;
  private compressedTranscriber: CompressedTranscriber | null = null;

  private lastRequestTime = 0;
  private minRequestInterval = 1000;

  constructor() {
    this.secureAPI = SecureAPIService.getInstance();
    this.contextDetector = new ContextDetector();
    this.screenVision = new ScreenVision();
    
    // Pre-warm services in background to avoid first-time delays
    this.warmUpServices();
  }

  private getTranscriptionContext(): TranscriptionContext {
    return {
      dictionaryContext: this.dictionaryContext,
      getOpenAIKey: () => this.secureAPI.getOpenAIKey(),
      getGeminiKey: () => this.secureAPI.getGeminiKey()
    };
  }

  private getChunkedTranscriber(): ChunkedTranscriber {
    if (!this.chunkedTranscriber) {
      this.chunkedTranscriber = new ChunkedTranscriber(this.getTranscriptionContext());
    }
    return this.chunkedTranscriber;
  }

  private getCompressedTranscriber(): CompressedTranscriber {
    if (!this.compressedTranscriber) {
      this.compressedTranscriber = new CompressedTranscriber(this.getTranscriptionContext());
    }
    return this.compressedTranscriber;
  }

  private async warmUpServices(): Promise<void> {
    if (this.servicesWarmed) return;
    
    try {
      // Pre-load dictionary context once
      if (!this.dictionaryLoaded) {
        await this.loadDictionaryContext();
      }
      
      // Pre-fetch API keys to cache them
      Promise.all([
        this.secureAPI.getOpenAIKey().catch(() => null),
        this.secureAPI.getDeepgramKey().catch(() => null),
        this.secureAPI.getGeminiKey().catch(() => null)
      ]);
      
      this.servicesWarmed = true;
    } catch (error) {
      Logger.debug('Service warm-up failed:', error);
    }
  }

  private async loadDictionaryContext(): Promise<void> {
    if (this.dictionaryLoaded) return;
    
    try {
      const { nodeDictionaryService } = await import('../services/node-dictionary');
      this.dictionaryContext = nodeDictionaryService.getWordsForTranscription();
      this.dictionaryLoaded = true;
      
      if (this.dictionaryContext) {
        Logger.info(`📖 [Dictionary] Loaded keywords: ${this.dictionaryContext.substring(0, 50)}...`);
      } else {
        Logger.info('📖 [Dictionary] No custom terms loaded - dictionary may be empty');
      }
    } catch (error) {
      Logger.warning('Failed to load dictionary context:', error);
      this.dictionaryContext = '';
      this.dictionaryLoaded = true;
    }
  }

  /**
   * Refresh dictionary context (call this when dictionary is updated)
   */
  async refreshDictionaryContext(): Promise<void> {
    this.dictionaryLoaded = false;
    await this.loadDictionaryContext();
  }

  async transcribeAndRespond(audioPath: string): Promise<{ text: string; isAssistant: boolean; model: string }> {
    Logger.info('🎯 [FastAssistant] Starting transcription...');
    
    // Try OpenAI first for speed, then fallback to Gemini
    try {
      return await this.transcribeWithOpenAI(audioPath);
    } catch (error) {
      Logger.warning('OpenAI failed, trying Gemini:', error);
      return await this.transcribeWithGeminiFlash(audioPath);
    }
  }

  async transcribeFromBuffer(audioBuffer: Buffer, audioDurationMs?: number): Promise<{ text: string; isAssistant: boolean; model: string }> {
    Logger.info(`🎯 [FastAssistant] Starting buffer transcription (${Math.round(audioBuffer.length/1024)}KB, ${audioDurationMs ? Math.round(audioDurationMs/1000) + 's' : 'unknown duration'})`);

    // Ensure services are warmed up (usually already done in constructor)
    await this.warmUpServices();

    // Check if audio needs compression for long recordings (instead of chunking)
    const compressedTranscriber = this.getCompressedTranscriber();
    const needsCompression = compressedTranscriber.needsCompression(audioBuffer, audioDurationMs);
    
    if (needsCompression && audioDurationMs) {
      Logger.info(`️ [Fast] Long audio detected (${Math.round(audioDurationMs/1000)}s, ${Math.round(audioBuffer.length/1024)}KB) - using compression`);
      const result = await compressedTranscriber.transcribeCompressedBuffer(audioBuffer, audioDurationMs);
      return this.processTranscription(result.text, result.model);
    }

    // Smart API selection based on audio duration
    const shouldUseOpenAI = !audioDurationMs || audioDurationMs > 10000; // >10s or unknown duration
    Logger.debug(`🎯 [SmartAPI] Audio duration: ${audioDurationMs}ms, using ${shouldUseOpenAI ? 'OpenAI' : 'Deepgram'}`);

    if (shouldUseOpenAI) {
      // For longer audio (>10s) or unknown duration, use OpenAI for better accuracy and formatting
      try {
        const openaiKey = await this.secureAPI.getOpenAIKey();
        if (openaiKey) {
          const keyPreview = openaiKey.substring(0, 10) + '...' + openaiKey.slice(-4);
          Logger.info(`🔑 [OpenAI] Using API key: ${keyPreview}`);
          
          try {
            return await this.transcribeWithOpenAIBuffer(audioBuffer);
          } catch (error) {
            Logger.warning('OpenAI failed, falling back to Gemini:', error);
          }
        } else {
          Logger.warning('🔑 [OpenAI] No API key found');
        }
      } catch (error) {
        Logger.warning('Failed to get OpenAI key:', error);
      }
    } else {
      // For shorter audio (<10s), try Deepgram first for speed
      try {
        const deepgramResult = await this.transcribeWithDeepgram(audioBuffer);
        if (deepgramResult) {
          return deepgramResult;
        }
      } catch (error) {
        Logger.warning('Deepgram failed, falling back to OpenAI:', error);
      }
      
      // Fallback to OpenAI for short audio too
      try {
        const openaiKey = await this.secureAPI.getOpenAIKey();
        if (openaiKey) {
          return await this.transcribeWithOpenAIBuffer(audioBuffer);
        }
      } catch (error) {
        Logger.warning('OpenAI fallback failed:', error);
      }
    }

    try {
      const geminiKey = await this.secureAPI.getGeminiKey();
      if (geminiKey) {
        return await this.transcribeWithGeminiFlashBuffer(audioBuffer);
      } else {
        Logger.warning('🔑 [Gemini] No API key found');
      }
    } catch (error) {
      Logger.warning('Failed to get Gemini key:', error);
    }

    // Run network diagnostics if both APIs failed
    Logger.warning('🔍 [Network] Both OpenAI and Gemini failed - running diagnostics...');
    try {
      await NetworkDiagnostics.testConnectivity();
    } catch (diagnosticError) {
      Logger.error('🔍 [Network] Diagnostic test failed:', diagnosticError);
    }

    throw new Error('No API keys available');
  }

  // Simplified methods that will work with SecureAPIService
  private async transcribeWithGeminiFlash(audioPath: string): Promise<{ text: string; isAssistant: boolean; model: string }> {
    Logger.info('⚡ [Gemini] Using Flash 2.0 for transcription...');
    
    const audioBuffer = fs.readFileSync(audioPath);
    return await this.transcribeWithGeminiFlashBuffer(audioBuffer);
  }

  private async transcribeWithOpenAI(audioPath: string): Promise<{ text: string; isAssistant: boolean; model: string }> {
    Logger.info('🔥 [OpenAI] Attempting transcription...');
    
    const audioBuffer = fs.readFileSync(audioPath);
    return await this.transcribeWithOpenAIBuffer(audioBuffer);
  }

  private async transcribeWithGeminiFlashBuffer(audioBuffer: Buffer): Promise<{ text: string; isAssistant: boolean; model: string }> {
    try {
      const geminiKey = await this.secureAPI.getGeminiKey();
      const audioBase64 = audioBuffer.toString('base64');

      let transcriptionPrompt = 'Transcribe this audio accurately with proper punctuation and capitalization.';
      if (this.dictionaryContext) {
        transcriptionPrompt += ` (Note: Audio may contain these terms: ${this.dictionaryContext})`;
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
                {
                  inline_data: {
                    mime_type: 'audio/wav',
                    data: audioBase64
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024
            }
          })
        },
        {
          timeoutMs: 60000 // 60 second timeout
        },
        'Gemini transcription'
      );

      const result = await response.json() as any;
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      
      return await this.processTranscription(text, 'gemini-2.5-flash-lite');
    } catch (error) {
      const analysis = RobustApiCaller.analyzeError(error);
      Logger.error(`Gemini transcription failed (${analysis.category}): ${error.message}`, { suggestion: analysis.suggestion });
      throw error;
    }
  }

  private async transcribeWithOpenAIBuffer(audioBuffer: Buffer): Promise<{ text: string; isAssistant: boolean; model: string }> {
    try {
      const openaiKey = await this.secureAPI.getOpenAIKey();
      
      // Use gpt-4o-mini-transcribe with the correct API approach
      const result = await this.tryOpenAIModelBuffer(audioBuffer, 'gpt-4o-mini-transcribe', openaiKey);
      if (result) {
        return await this.processTranscription(result, 'gpt-4o-mini-transcribe');
      }

      throw new Error('OpenAI gpt-4o-mini-transcribe failed');
    } catch (error) {
      Logger.error('OpenAI transcription failed:', error);
      throw error;
    }
  }

  private async tryOpenAIModelBuffer(audioBuffer: Buffer, model: string, openaiKey: string): Promise<string | null> {
    try {
      // All models (whisper-1, gpt-4o-mini-transcribe, gpt-4o-transcribe) use the same transcriptions API
      return await this.transcribeWithWhisperAPI(audioBuffer, model, openaiKey);
    } catch (error) {
      Logger.warning(`${model} failed:`, error);
      return null;
    }
  }

  private async transcribeWithWhisperAPI(audioBuffer: Buffer, model: string, openaiKey: string): Promise<string | null> {
    // For gpt-4o-mini-transcribe, use WAV format directly (PCM often fails)
    // For other models like whisper-1, try PCM first for efficiency
    const useWAVFirst = model === 'gpt-4o-mini-transcribe' || model === 'gpt-4o-transcribe';
    
    if (useWAVFirst) {
      return await this.tryWAVFormat(audioBuffer, model, openaiKey);
    } else {
      return await this.tryPCMThenWAV(audioBuffer, model, openaiKey);
    }
  }

  private async tryWAVFormat(audioBuffer: Buffer, model: string, openaiKey: string): Promise<string | null> {
    try {
      const { NativeAudioRecorder } = await import('../audio/native-audio-recorder');
      const wavBuffer = NativeAudioRecorder.convertPCMToWAV(audioBuffer);
      Logger.debug(`🎵 [OpenAI] Using WAV: ${audioBuffer.length} bytes PCM → ${wavBuffer.length} bytes WAV`);
      
      const formData = new FormData();
      formData.append('file', wavBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
      formData.append('model', model);
      
      // Enhanced parameters for better low-volume audio detection
      formData.append('temperature', '0'); // Deterministic for consistency with whisper audio
      formData.append('language', 'en'); // Force English to avoid language detection overhead
      
      if (this.dictionaryContext) {
        const promptHint = `This audio may contain these terms: ${this.dictionaryContext}`;
        formData.append('prompt', promptHint);
      }

      const response = await RobustApiCaller.createTimeoutSafeUpload(
        formData,
        'https://api.openai.com/v1/audio/transcriptions',
        {
          'Authorization': `Bearer ${openaiKey}`,
          ...formData.getHeaders()
        },
        60000 // 60 second timeout for main audio
      );

      const result = await response.json() as any;
      return result.text?.trim() || null;
    } catch (error) {
      const analysis = RobustApiCaller.analyzeError(error);
      Logger.error(`${model} WAV format failed (${analysis.category}): ${error.message}`, { suggestion: analysis.suggestion });
      return null;
    }
  }

  private async tryPCMThenWAV(audioBuffer: Buffer, model: string, openaiKey: string): Promise<string | null> {
    try {
      // Try raw PCM first (more efficient)
      const formData = new FormData();
      formData.append('file', audioBuffer, { filename: 'audio.pcm', contentType: 'audio/pcm' });
      formData.append('model', model);
      
      // Enhanced parameters for better low-volume audio detection
      formData.append('temperature', '0'); // Deterministic for consistency with whisper audio
      formData.append('language', 'en'); // Force English to avoid language detection overhead
      
      if (this.dictionaryContext) {
        const promptHint = `This audio may contain these terms: ${this.dictionaryContext}`;
        formData.append('prompt', promptHint);
      }

      const response = await RobustApiCaller.createTimeoutSafeUpload(
        formData,
        'https://api.openai.com/v1/audio/transcriptions',
        {
          'Authorization': `Bearer ${openaiKey}`,
          ...formData.getHeaders()
        },
        60000 // 60 second timeout
      );

      const result = await response.json() as any;
      return result.text?.trim() || null;
    } catch (error) {
      const analysis = RobustApiCaller.analyzeError(error);
      Logger.warning(`${model} with PCM failed (${analysis.category}), trying WAV conversion: ${error.message}`, { suggestion: analysis.suggestion });
      
      // Fallback: Convert to WAV if PCM fails
      return await this.tryWAVFormat(audioBuffer, model, openaiKey);
    }
  }

  private async processTranscription(transcriptText: string, model: string): Promise<{ text: string; isAssistant: boolean; model: string }> {
    Logger.info(`📝 [${model}] Raw transcript: "${transcriptText}"`);
    
    if (!transcriptText) {
      throw new Error('No transcript generated');
    }

    // Check if this is an assistant request
    const isAssistant = this.isAssistantRequest(transcriptText);
    
    if (isAssistant) {
      Logger.info('🤖 [Assistant] Detected assistant request - clearing previous context');
      
      // Clear any previous context for fresh assistant conversation
      if ((global as any).conversationContext) {
        (global as any).conversationContext = [];
      }
      
      // Stop any existing correction monitoring
      if ((global as any).correctionDetector) {
        (global as any).correctionDetector.stopMonitoring();
      }
      
      return { text: transcriptText, isAssistant: true, model };
    } else {
      Logger.info('💬 [Dictation] Processing as dictation');
      return { text: transcriptText, isAssistant: false, model };
    }
  }

  isAssistantRequest(text: string): boolean {
    const lowerText = text.toLowerCase().trim();
    
    // Only trigger on explicit assistant invocations
    const explicitTriggers = [
      'jarvis',
      'hey jarvis',
      'assistant',
      'hey assistant'
    ];
    
    // Check for explicit triggers anywhere in the text
    if (explicitTriggers.some(trigger => lowerText.includes(trigger))) {
      return true;
    }
    
    // Check for question patterns at the START of the text only (not in the middle)
    const questionStarters = [
      'help',
      'help me',
      'can you help',
      'can you tell me',
      'what is',
      'what are',
      'how do',
      'how can',
      'where is',
      'where can',
      'when is',
      'when can',
      'why is',
      'why does'
    ];
    
    return questionStarters.some(starter => lowerText.startsWith(starter));
  }

  private async retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxRetries) break;
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        Logger.info(`⏳ Retry ${attempt}/${maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  }

  // Smart API selection methods
  private async transcribeWithDeepgram(audioBuffer: Buffer): Promise<{ text: string; isAssistant: boolean; model: string } | null> {
    try {
      const deepgramKey = await this.secureAPI.getDeepgramKey();
      if (!deepgramKey) {
        Logger.warning('🔑 [Deepgram] No API key found');
        return null;
      }

      const { DeepgramTranscriber } = await import('./deepgram-transcriber');
      const deepgram = new DeepgramTranscriber(deepgramKey);
      const result = await deepgram.transcribeFromBuffer(audioBuffer);
      
      if (result) {
        return await this.processTranscription(result.text, result.model);
      }
      return null;
    } catch (error) {
      Logger.warning('Deepgram transcription failed:', error);
      return null;
    }
  }

  /**
   * Hybrid streaming transcription: Deepgram for speed + OpenAI for quality
   * Uses Deepgram for real-time feedback, then OpenAI for intelligent cleanup
   */
  async startStreamingTranscription(onPartialText?: (text: string) => void, onComplete?: (text: string) => void): Promise<{ 
    sendAudio: (buffer: Buffer) => boolean; 
    finish: () => Promise<string>; 
    stop: () => Promise<void> 
  } | null> {
    // Check which streaming modes are enabled
    const { AppSettingsService } = await import('../services/app-settings-service');
    const settings = AppSettingsService.getInstance().getSettings();
    
    if (!settings.useDeepgramStreaming) {
      Logger.info('🌊 [Streaming] Deepgram streaming disabled, returning null');
      return null;
    }
    
    // Note: OpenAI streaming is for future hybrid mode implementation
    Logger.info(`🌊 [Streaming] Starting Deepgram streaming transcription`);
    
    try {
      const deepgramKey = await this.secureAPI.getDeepgramKey();
      if (!deepgramKey) {
        throw new Error('No Deepgram API key available');
      }

      // Buffer to collect audio for OpenAI post-processing
      let audioChunks: Buffer[] = [];
      let deepgramResult = '';

      // Import and create streaming service
      const { StreamingTranscriptionService } = await import('./streaming-transcription-service');
      const streamingService = new StreamingTranscriptionService();

      // Start streaming session with hybrid callbacks
      const started = await streamingService.startStreaming(
        deepgramKey,
        (partialText) => {
          // Real-time feedback from Deepgram (with filler words)
          if (onPartialText) {
            onPartialText(`${partialText} [processing...]`);
          }
        },
        async (completeText) => {
          // Store raw Deepgram result
          deepgramResult = completeText;
          Logger.info(`🎙️ [Deepgram] Raw result: "${completeText}"`);
          
          // Immediately show Deepgram result
          if (onComplete) {
            onComplete(completeText);
          }
        }
      );

      if (!started) {
        throw new Error('Failed to start streaming session');
      }

      Logger.success('🌊 [Hybrid] Deepgram streaming session active');

      // Return enhanced control interface
      return {
        sendAudio: (buffer: Buffer) => {
          // Store audio chunks for OpenAI post-processing
          audioChunks.push(buffer);
          return streamingService.sendAudioData(buffer);
        },
        
        finish: async () => {
          const deepgramFinal = await streamingService.finishStreaming();
          
          // Post-process with OpenAI for intelligent cleanup
          if (audioChunks.length > 0 && deepgramFinal && deepgramFinal.trim().length > 10) {
            try {
              // Check if AI post-processing is enabled before attempting cleanup
              if (!this.isAiPostProcessingEnabled()) {
                Logger.debug('🤖 [Hybrid] AI post-processing disabled in settings, skipping cleanup');
                return deepgramFinal;
              }
              
              Logger.info('🔄 [Hybrid] Post-processing with AI text cleanup...');
              const cleanedText = await this.cleanTranscriptionWithAI(deepgramFinal);
              
              if (cleanedText && cleanedText !== deepgramFinal) {
                Logger.success(`✨ [Hybrid] AI cleanup: "${deepgramFinal}" → "${cleanedText}"`);
                
                // Send the cleaned result as final
                if (onComplete) {
                  onComplete(cleanedText);
                }
                return cleanedText;
              }
            } catch (error) {
              Logger.warning('🔄 [Hybrid] AI text cleanup failed, using Deepgram result:', error);
            }
          }
          
          return deepgramFinal;
        },
        
        stop: async () => {
          audioChunks = []; // Clear audio buffer
          return streamingService.stopStreaming();
        }
      };

    } catch (error) {
      Logger.error('🌊 [Hybrid] Failed to initialize hybrid streaming:', error);
      return null;
    }
  }

  /**
   * Check if AI post-processing is enabled in settings
   */
  private isAiPostProcessingEnabled(): boolean {
    try {
      const appSettings = AppSettingsService.getInstance();
      const settings = appSettings.getSettings();
      const isEnabled = settings.aiPostProcessing;
      Logger.info(`🤖 [Cleanup] AI post-processing setting check: ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
      return isEnabled;
    } catch (error) {
      Logger.warning('Failed to get AI post-processing setting, defaulting to enabled:', error);
      return true; // Default to enabled if there's an error
    }
  }

  /**
   * Clean up transcription text using Gemini 2.5 Flash Lite for fast processing
   * Removes filler words and improves readability while preserving meaning
   * Uses Gemini for 44% faster processing than GPT-4o-mini
   */
  async cleanTranscriptionWithAI(rawText: string): Promise<string> {
    if (!rawText || !rawText.trim()) {
      return rawText;
    }

    // Check if AI post-processing is enabled
    if (!this.isAiPostProcessingEnabled()) {
      Logger.debug('🤖 [Cleanup] AI post-processing disabled in settings, skipping cleanup');
      return rawText;
    }

    try {
      const geminiKey = await this.secureAPI.getGeminiKey();
      if (!geminiKey) {
        Logger.warning('🔄 [Cleanup] No Gemini key available for text cleanup');
        return rawText;
      }

      const cleanupPrompt = `Clean up this voice transcription by ONLY removing filler words and fixing grammar. DO NOT change or remove any meaningful words.

ONLY remove these filler words: um, uh, like, you know, so, well, actually, basically, literally, totally, really (when used as filler)

DO NOT remove or change: maybe, perhaps, possibly, let's see, I think, we should, consider, proposal, any meaningful content words

CRITICAL - PRESERVE SIGNATURES:
• If the text contains email signatures like "Best, [Name]", "Regards, [Name]", "Thanks, [Name]", "Sincerely, [Name]", "Cheers, [Name]" - PRESERVE THEM EXACTLY
• Do NOT change "Best" to "Regards" or vice versa
• Do NOT change any signature the user spoke
• If user says "Best, Akshay" keep it as "Best, Akshay"
• If user says "Regards, John" keep it as "Regards, John"

CRITICAL - FILE EXTENSIONS:
• When the user says "dot" followed by a file extension, convert it to a period (.)
• Examples: "readme dot md" → "readme.md", "main dot java" → "main.java", "config dot json" → "config.json"
• Common file extensions: md, txt, pdf, doc, docx, xls, xlsx, ppt, pptx, jpg, png, gif, mp3, mp4, avi, zip, tar, gz, js, ts, py, java, cpp, c, h, css, html, xml, yaml, yml, sql, sh, bat, exe, dll, so, dmg, app

Rules:
1. PRESERVE ALL meaningful words exactly as spoken
2. Only remove obvious filler words from the list above
3. Fix punctuation and capitalization
4. Keep the same sentence structure and meaning
5. Do not make the text more concise by removing content
6. NEVER change email signatures or closings
7. Convert "dot" to "." when followed by file extensions

Original: "${rawText}"

Cleaned:`;

      const response = await RobustApiCaller.fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: cleanupPrompt }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 500
            }
          })
        },
        {
          timeoutMs: 8000 // 8 second timeout for fast cleanup
        },
        'Gemini text cleanup'
      );

      const result = await response.json() as any;
      const cleanedText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (cleanedText && cleanedText !== rawText) {
        Logger.info(`✨ [Cleanup] "${rawText}" → "${cleanedText}"`);
        
        // CRITICAL: Only restore signatures if CONTENT changes, not just formatting
        const originalSignature = rawText.match(/(Best|Regards|Thanks|Sincerely|Cheers),?\s*[A-Za-z]+/i);
        const newSignatureSingleLine = cleanedText.match(/(Best|Regards|Thanks|Sincerely|Cheers),?\s*[A-Za-z]+/i);
        const newSignatureMultiLine = cleanedText.match(/(Best|Regards|Thanks|Sincerely|Cheers),?\s*\n\s*[A-Za-z]+/i);
        const newSignature = newSignatureSingleLine || newSignatureMultiLine;
        
        if (originalSignature) {
          if (newSignature) {
            // Extract just the signature words to compare content, not format
            // This allows AI to improve formatting (add commas, line breaks) while preserving content
            const originalWords = originalSignature[0].replace(/[,\s\n]+/g, ' ').trim().toLowerCase();
            const newWords = newSignature[0].replace(/[,\s\n]+/g, ' ').trim().toLowerCase();
            
            if (originalWords !== newWords) {
              Logger.warning(`⚠️ [Cleanup] SIGNATURE CONTENT CHANGED: "${originalSignature[0]}" → "${newSignature[0]}" - RESTORING ORIGINAL`);
              // Restore the original signature
              const signaturePattern = /(Best|Regards|Thanks|Sincerely|Cheers),?\s*\n?\s*[A-Za-z]+/i;
              const finalText = cleanedText.replace(signaturePattern, originalSignature[0]);
              Logger.info(`🛡️ [Cleanup] RESTORED original signature: "${originalSignature[0]}"`);
              return finalText;
            } else {
              Logger.info(`✅ [Cleanup] Signature content preserved: "${originalSignature[0]}" → "${newSignature[0]}"`);
            }
          } else {
            Logger.warning(`⚠️ [Cleanup] Signature was removed! Original: "${originalSignature[0]}"`);
            const finalText = cleanedText + ' ' + originalSignature[0];
            Logger.info(`🛡️ [Cleanup] RESTORED removed signature: "${originalSignature[0]}"`);
            return finalText;
          }
        }
        
        return cleanedText;
      }

      return rawText;
    } catch (error) {
      Logger.warning('🔄 [Cleanup] Text cleanup failed, using original:', error);
      return rawText;
    }
  }
}
