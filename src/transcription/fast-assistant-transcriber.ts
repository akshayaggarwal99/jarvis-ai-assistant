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
import { PARAKEET_MODELS } from './sherpa-models';
import { WHISPER_MODELS } from './local-whisper-transcriber';

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

      // Check settings for Ollama warm-up
      const settings = AppSettingsService.getInstance().getSettings();
      if (settings.useOllama && settings.ollamaUrl) {
        Logger.info(`🔥 [Warmup] Triggering background warm-up for Ollama (${settings.ollamaModel})...`);

        // Warm up Ollama (fire and forget)
        this.triggerOllamaWarmup(settings).catch(err => {
          Logger.debug('Ollama warm-up failed (non-fatal):', err);
        });
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

  private async triggerOllamaWarmup(settings: any): Promise<void> {
    try {
      // Force IPv4 loopback if localhost is used
      const safeOllamaUrl = settings.ollamaUrl.replace('localhost', '127.0.0.1');

      await RobustApiCaller.fetchWithRetry(
        `${safeOllamaUrl}/api/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: settings.ollamaModel || 'llama3.2:1b',
            prompt: ' ', // Empty prompt just to load model
            stream: false,
            options: { num_predict: 1 }
          })
        },
        { timeoutMs: 5000 },
        'Ollama warmup'
      );
      Logger.info(`✅ [Warmup] Ollama model '${settings.ollamaModel}' warmed up and ready`);
    } catch (error) {
      Logger.debug('Ollama warm-up failed (non-fatal):', error);
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
    const startTime = Date.now();
    Logger.info(`🎯 [FastAssistant] Starting buffer transcription (${Math.round(audioBuffer.length / 1024)}KB, ${audioDurationMs ? Math.round(audioDurationMs / 1000) + 's' : 'unknown duration'})`);

    // Ensure services are warmed up (usually already done in constructor)
    await this.warmUpServices();

    // Check if local Transcription is enabled in settings
    const settings = AppSettingsService.getInstance().getSettings();
    console.log(`🎯 [FastAssistant] Settings check - useLocalModel: ${settings.useLocalModel}, localModelId: ${settings.localModelId}`);
    Logger.info(`🎯 [FastAssistant] Settings check - useLocalModel: ${settings.useLocalModel}, localModelId: ${settings.localModelId}`);

    if (settings.useLocalModel === true) {
      Logger.info('🎤 [FastAssistant] Local model mode enabled - using offline transcription');
      try {
        const localResult = await this.transcribeWithLocalModel(audioBuffer);
        if (localResult) {
          return localResult;
        }
        Logger.warning('🎤 [FastAssistant] Local model failed, falling back to cloud APIs');
      } catch (error) {
        Logger.warning('🎤 [FastAssistant] Local model error, falling back to cloud APIs:', error);
      }
    }

    const transcriptionLanguage = settings.transcriptionLanguage || 'en-US';

    // Check if audio needs compression for long recordings (instead of chunking)
    const compressedTranscriber = this.getCompressedTranscriber();
    const needsCompression = compressedTranscriber.needsCompression(audioBuffer, audioDurationMs);

    if (needsCompression && audioDurationMs) {
      Logger.info(`️ [Fast] Long audio detected (${Math.round(audioDurationMs / 1000)}s, ${Math.round(audioBuffer.length / 1024)}KB) - using compression`);
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
            return await this.transcribeWithOpenAIBuffer(audioBuffer, transcriptionLanguage);
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
        const deepgramResult = await this.transcribeWithDeepgram(audioBuffer, transcriptionLanguage);
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
          return await this.transcribeWithOpenAIBuffer(audioBuffer, transcriptionLanguage);
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

    const totalTime = Date.now() - startTime;
    Logger.info(`⏱️ [FastAssistant] Total buffer transcription took ${totalTime}ms`);
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

      console.log('⚡ [Gemini] Preparing transcription request...');

      let transcriptionPrompt = 'TRANSCRIPTION TASK. DO NOT CONVERSE. OUTPUT ONLY THE EXACT TRANSCRIPT OF THE AUDIO. IF AUDIO IS SILENT OR UNINTELLIGIBLE, OUTPUT NOTHING.';
      if (this.dictionaryContext) {
        transcriptionPrompt += ` (Note: Audio may contain these terms: ${this.dictionaryContext})`;
      }

      const response = await RobustApiCaller.fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
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

  private async transcribeWithOpenAIBuffer(audioBuffer: Buffer, language?: string): Promise<{ text: string; isAssistant: boolean; model: string }> {
    try {
      const openaiKey = await this.secureAPI.getOpenAIKey();

      // Use gpt-4o-mini-transcribe with the correct API approach
      const result = await this.tryOpenAIModelBuffer(audioBuffer, 'gpt-4o-mini-transcribe', openaiKey, language);
      if (result) {
        return await this.processTranscription(result, 'gpt-4o-mini-transcribe');
      }

      throw new Error('OpenAI gpt-4o-mini-transcribe failed');
    } catch (error) {
      Logger.error('OpenAI transcription failed:', error);
      throw error;
    }
  }

  private async tryOpenAIModelBuffer(audioBuffer: Buffer, model: string, openaiKey: string, language?: string): Promise<string | null> {
    try {
      // All models (whisper-1, gpt-4o-mini-transcribe, gpt-4o-transcribe) use the same transcriptions API
      return await this.transcribeWithWhisperAPI(audioBuffer, model, openaiKey, language);
    } catch (error) {
      Logger.warning(`${model} failed:`, error);
      return null;
    }
  }

  private async transcribeWithWhisperAPI(audioBuffer: Buffer, model: string, openaiKey: string, language?: string): Promise<string | null> {
    // For gpt-4o-mini-transcribe, use WAV format directly (PCM often fails)
    // For other models like whisper-1, try PCM first for efficiency
    const useWAVFirst = model === 'gpt-4o-mini-transcribe' || model === 'gpt-4o-transcribe';

    if (useWAVFirst) {
      return await this.tryWAVFormat(audioBuffer, model, openaiKey, language);
    } else {
      return await this.tryPCMThenWAV(audioBuffer, model, openaiKey, language);
    }
  }

  private async tryWAVFormat(audioBuffer: Buffer, model: string, openaiKey: string, language?: string): Promise<string | null> {
    try {
      const { NativeAudioRecorder } = await import('../audio/native-audio-recorder');
      const wavBuffer = NativeAudioRecorder.convertPCMToWAV(audioBuffer);
      Logger.debug(`🎵 [OpenAI] Using WAV: ${audioBuffer.length} bytes PCM → ${wavBuffer.length} bytes WAV`);

      const formData = new FormData();
      formData.append('file', wavBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
      formData.append('model', model);

      // Enhanced parameters for better low-volume audio detection
      formData.append('temperature', '0'); // Deterministic for consistency with whisper audio
      formData.append('language', language || 'en');

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

  private async tryPCMThenWAV(audioBuffer: Buffer, model: string, openaiKey: string, language?: string): Promise<string | null> {
    try {
      // Try raw PCM first (more efficient)
      const formData = new FormData();
      formData.append('file', audioBuffer, { filename: 'audio.pcm', contentType: 'audio/pcm' });
      formData.append('model', model);

      // Enhanced parameters for better low-volume audio detection
      formData.append('temperature', '0'); // Deterministic for consistency with whisper audio
      formData.append('language', language || 'en');

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
    const startTime = Date.now();
    Logger.info(`📝 [${model}] Raw transcript: "${transcriptText}"`);

    if (!transcriptText) {
      throw new Error('No transcript generated');
    }

    // ISSUE #12: Filter out silence/noise tokens from transcription
    const noiseTokens = [
      /\[BLANK_AUDIO\]/g,
      /\[SILENCE\]/g,
      /\[NOISE\]/g,
      /\(music\)/g,
      /\(static\)/g,
      /\(laughter\)/g,
      /\s*\[\s*.*?\s*\]\s*/g, // Any bracketed tokens
    ];

    let filteredText = transcriptText;
    for (const pattern of noiseTokens) {
      filteredText = filteredText.replace(pattern, ' ');
    }
    filteredText = filteredText.trim().replace(/\s+/g, ' ');

    if (!filteredText) {
      Logger.info('🔇 [FastAssistant] Transcription contained only noise - skipping');
      throw new Error('No transcript generated (noise filtered)');
    }

    transcriptText = filteredText;

    // Check if this is an assistant request using the RAW text (before cleanup)
    // This prevents the AI cleaner from removing the wake word (e.g. "Hey Jarvis")
    const isAssistant = this.isAssistantRequest(transcriptText);

    if (isAssistant) {
      Logger.info('🤖 [Assistant] Detected assistant request - skipping dictation cleanup');
      Logger.info('🤖 [Assistant] Clearing previous context');

      // Clear any previous context for fresh assistant conversation
      if ((global as any).conversationContext) {
        (global as any).conversationContext = [];
      }

      // Stop any existing correction monitoring
      if ((global as any).correctionDetector) {
        (global as any).correctionDetector.stopMonitoring();
      }

      // Return the raw text (or we could lightly clean it, but usually raw is better for command parsing)
      return { text: transcriptText, isAssistant: true, model };
    }

    // AUTO-CLEANUP: Process with AI if enabled (handles Ollama/Gemini based on settings)
    // This fixes local transcription not having proper formatting or command/punctuation cleanup
    let processedText = transcriptText;

    // SMART SKIP: If text already appears well-formatted (from Deepgram smart_format), skip AI cleanup
    // This check: starts with uppercase, ends with sentence punctuation, has some internal punctuation
    const looksFormatted = /^[A-Z]/.test(transcriptText) && /[.!?]$/.test(transcriptText.trim());
    const isFromFormattedSource = model.includes('deepgram') || model.includes('gpt-4o');

    if (looksFormatted && isFromFormattedSource) {
      console.log(`⚡ [SmartSkip] Text already formatted from ${model}, skipping AI cleanup for speed`);
    } else {
      try {
        if (this.isAiPostProcessingEnabled()) {
          console.log(`🔄 [AI Cleanup] Starting cleanup for ${model}...`);
          const cleanupStart = Date.now();
          const cleaned = await this.cleanTranscriptionWithAI(transcriptText);
          console.log(`⏱️ [AI Cleanup] Took ${Date.now() - cleanupStart}ms`);
          if (cleaned && cleaned !== transcriptText) {
            processedText = cleaned;
            Logger.info(`✨ [AutoClean] Applied AI formatting: "${transcriptText.substring(0, 30)}..." → "${processedText.substring(0, 30)}..."`);
          }
        }
      } catch (error) {
        // Don't fail the whole transcription if cleanup fails
        Logger.warning('Process transcription cleanup failed:', error);
      }
    }

    Logger.info('💬 [Dictation] Processing as dictation');
    Logger.info(`⏱️ [FastAssistant] Transcription processing took ${Date.now() - startTime}ms`);
    return { text: processedText, isAssistant: false, model };
  }

  isAssistantRequest(text: string): boolean {
    if (!text) return false;

    // Strict rule: Assistant mode only if "Jarvis" is in the first 3 words
    const lowerText = text.toLowerCase().trim();
    // Remove ALL punctuation using a more robust regex (keep letters, numbers, spaces)
    const cleanText = lowerText.replace(/[^\w\s]|_/g, '');
    const words = cleanText.split(/\s+/);

    // Check first 3 words
    const firstThreeWords = words.slice(0, 3);

    Logger.debug(`🔍 [AssistantCheck] Text: "${text}" -> Clean: "${cleanText}" -> Words: ${JSON.stringify(firstThreeWords)}`);

    // Check if any of the first 3 words is "jarvis"
    const isMatch = firstThreeWords.some(word => word === 'jarvis');

    if (isMatch) {
      Logger.info(`🤖 [AssistantCheck] MATCH DETECTED in words: ${JSON.stringify(firstThreeWords)}`);
    }

    return isMatch;
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
  private async transcribeWithDeepgram(audioBuffer: Buffer, language?: string): Promise<{ text: string; isAssistant: boolean; model: string } | null> {
    try {
      const deepgramKey = await this.secureAPI.getDeepgramKey();
      if (!deepgramKey) {
        Logger.warning('🔑 [Deepgram] No API key found');
        return null;
      }

      const { DeepgramTranscriber } = await import('./deepgram-transcriber');
      const deepgram = new DeepgramTranscriber(deepgramKey);
      const startTime = Date.now();
      const result = await deepgram.transcribeFromBuffer(audioBuffer, { language });
      Logger.info(`⏱️ [Deepgram] Transcription API call took ${Date.now() - startTime}ms`);

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
   * Transcribe using local model (Whisper or Sherpa/Parakeet)
   */
  private async transcribeWithLocalModel(audioBuffer: Buffer): Promise<{ text: string; isAssistant: boolean; model: string } | null> {
    try {
      const settings = AppSettingsService.getInstance().getSettings();
      const modelId = settings.localModelId || 'tiny.en';

      // Check if it's a Parakeet model (Sherpa-ONNX)
      const isParakeet = PARAKEET_MODELS.some(m => m.id === modelId);
      console.log(`🦜 [FastAssistant] Local model check - modelId: ${modelId}, isParakeet: ${isParakeet}`);

      if (isParakeet) {
        console.log(`🦜 [FastAssistant] Using Sherpa-ONNX model: ${modelId}`);
        Logger.info(`🦜 [FastAssistant] Using Sherpa-ONNX model: ${modelId}`);

        try {
          console.log(`🦜 [FastAssistant] Importing sherpa-onnx-transcriber...`);
          const { SherpaOnnxTranscriber } = await import('./sherpa-onnx-transcriber');
          console.log(`🦜 [FastAssistant] Import successful, getting instance...`);
          const sherpa = SherpaOnnxTranscriber.getInstance();
          console.log(`🦜 [FastAssistant] Got instance, calling transcribeFromBuffer...`);

          const result = await sherpa.transcribeFromBuffer(audioBuffer);
          console.log(`🦜 [FastAssistant] transcribeFromBuffer returned:`, result);

          if (result) {
            return result;
          }
          console.log(`🦜 [FastAssistant] Sherpa returned null, falling back...`);
          return null;
        } catch (sherpaError) {
          console.error(`🦜 [FastAssistant] Sherpa-ONNX error:`, sherpaError);
          Logger.error(`🦜 [FastAssistant] Sherpa-ONNX error:`, sherpaError);
          return null;
        }
      }

      // Default to Whisper
      Logger.info(`🎤 [FastAssistant] Using Local Whisper model: ${modelId}`);
      const { LocalWhisperTranscriber } = await import('./local-whisper-transcriber');
      const localWhisper = new LocalWhisperTranscriber();

      // Check if model is downloaded
      if (!localWhisper.isModelDownloaded(modelId)) {
        Logger.warning(`🎤 [FastAssistant] Model ${modelId} not downloaded, attempting download...`);
        const downloaded = await localWhisper.downloadModel(modelId, (percent, downloaded, total) => {
          Logger.info(`🎤 [FastAssistant] Downloading: ${percent}% (${downloaded}/${total} MB)`);
        });
        if (!downloaded) {
          Logger.error(`🎤 [FastAssistant] Failed to download model ${modelId}`);
          return null;
        }
      }

      const result = await localWhisper.transcribeFromBuffer(audioBuffer, modelId);

      if (result) {
        return await this.processTranscription(result.text, result.model);
      }
      return null;
    } catch (error) {
      Logger.warning('Local model transcription failed:', error);
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
    const startTime = Date.now();
    if (!rawText || !rawText.trim()) {
      return rawText;
    }

    // Check if AI post-processing is enabled
    if (!this.isAiPostProcessingEnabled()) {
      Logger.debug('🤖 [Cleanup] AI post-processing disabled in settings, skipping cleanup');
      return rawText;
    }

    try {
      const settings = AppSettingsService.getInstance().getSettings();
      const cleanupPrompt = `Clean up this voice transcription by ONLY removing filler words and fixing grammar. DO NOT change or remove any meaningful words.

ONLY remove these filler words: um, uh, like, you know, so, well, actually, basically, literally, totally, really (when used as filler)

DO NOT remove or change: maybe, perhaps, possibly, let's see, I think, we should, consider, proposal, any meaningful content words
DO NOT remove "Jarvis", "Hey Jarvis", "Assistant", or "Hey Assistant" (these are command triggers)

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

CRITICAL - EMOJIS:
• If the user describes an emoji (e.g., "muscle emoji", "smiley face", "heart emoji"), replace it with the actual emoji symbol.
• Examples: "muscle emoji" → "💪", "smiley face" → "🙂", "thumbs up" → "👍", "heart emoji" → "❤️", "fire emoji" → "🔥"
• DO NOT add emojis that were not explicitly described or spoken (e.g., do not add 😊 unless user said "smiley face").

CRITICAL - SELF CORRECTIONS:
• If the user corrects themselves (e.g., "at 4pm, sorry 5pm" or "on Monday, I mean Tuesday"), use ONLY the correction.
• Example: "meet at 4pm sorry 5pm" → "meet at 5pm"
• Example: "Hello John, I mean Jane" → "Hello Jane"

Rules:
1. PRESERVE meaningful content (but apply self-corrections)
2. Only remove obvious filler words from the list above
3. Fix punctuation and capitalization
4. Keep the same sentence structure and meaning
5. Do not make the text more concise by removing content (unless it's a self-correction)
6. NEVER change email signatures or closings
7. Convert "dot" to "." when followed by file extensions
8. Convert spoken emoji descriptions to actual emoji symbols
9. CRITICAL: Output ONLY the cleaned text. Do NOT add preamble like "Sure" or "Here is the cleaned text".

Original: "${rawText}"

Cleaned (Output ONLY the cleaned text, no "Here is the result", no quotes, no explanations):`;

      // 1. Try Ollama if enabled
      if (settings.useOllama && settings.ollamaUrl) {
        try {
          Logger.info(`🦙 [Cleanup] Using Ollama (${settings.ollamaModel || 'llama3.2:1b'})...`);

          // Fix: Node 17+ resolves localhost to ::1 (IPv6) which Ollama might not listen on
          // Force IPv4 loopback if localhost is used
          const safeOllamaUrl = settings.ollamaUrl.replace('localhost', '127.0.0.1');

          const response = await RobustApiCaller.fetchWithRetry(
            `${safeOllamaUrl}/api/chat`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: settings.ollamaModel || 'qwen2.5:0.5b',
                messages: [
                  { role: 'system', content: 'You are a text formatting tool, not a chatbot. You must accept the input text and output ONLY the formatted version using the rules provided. Do not acknowledge, do not explain, do not add preamble. Just output the result.' },
                  { role: 'user', content: cleanupPrompt }
                ],
                stream: false,
                options: {
                  temperature: 0.1,
                  num_predict: 500
                }
              })
            },
            { timeoutMs: 30000 },
            'Ollama text cleanup'
          );

          const result = await response.json() as any;
          // Check both formats: chat (message.content) and generate (response)
          const cleanedText = result.message?.content?.trim() || result.response?.trim();

          if (cleanedText) {
            return this.verifyAndReturnCleanup(rawText, cleanedText);
          }
        } catch (ollamaError) {
          Logger.warning('🦙 [Cleanup] Ollama failed, falling back to Gemini:', ollamaError);
          // Fall through to Gemini
        }
      }

      // 2. Fallback to Gemini
      const geminiKey = await this.secureAPI.getGeminiKey();
      if (!geminiKey) {
        Logger.warning('🔄 [Cleanup] No Gemini key available for text cleanup');
        return rawText;
      }

      const response = await RobustApiCaller.fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: cleanupPrompt }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 500,
              topP: 0.8,
              topK: 40
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

      Logger.info(`⏱️ [AI Cleanup] Cleanup with ${settings.useOllama ? 'Ollama' : 'Gemini'} took ${Date.now() - startTime}ms`);

      if (cleanedText) {
        return this.verifyAndReturnCleanup(rawText, cleanedText);
      }

      return rawText;
    } catch (error) {
      Logger.warning('🔄 [Cleanup] Text cleanup failed, using original:', error);
      return rawText;
    }
  }

  /**
   * Verify cleanup didn't break signatures or critical content
   */
  private verifyAndReturnCleanup(rawText: string, cleanedText: string): string {
    if (cleanedText && cleanedText !== rawText) {
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
  }
}
