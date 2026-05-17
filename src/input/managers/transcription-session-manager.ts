import { Logger } from '../../core/logger';
import { FastAssistantTranscriber } from '../../transcription/fast-assistant-transcriber';
import { AppSettingsService } from '../../services/app-settings-service';
import { OptimizedAnalyticsManager } from '../../analytics/optimized-analytics-manager';
import { posthog } from '../../analytics/posthog';
import { AudioValidator } from '../../audio/audio-validator';
import { TranscriptionResult, StreamingControl, AudioSessionData } from '../types/push-to-talk-types';

// Coarse error category — never carries any text from the error message,
// which can contain transcripts, file paths, or other private data.
function classifyTranscriptionError(err: unknown): string {
  if (!err) return 'unknown';
  const msg = String((err as any)?.message || err).toLowerCase();
  // Network / API
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('etimeout')) return 'timeout';
  if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('econnreset')) return 'network';
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) return 'rate_limited';
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('invalid_api_key')) return 'auth';
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('bad gateway')) return 'server_5xx';
  // Local model / Sherpa / Whisper
  if (msg.includes('sherpa') || msg.includes('onnx') || msg.includes('recognizer')) return 'sherpa_onnx';
  if (msg.includes('whisper')) return 'whisper_local';
  if (msg.includes('ffmpeg')) return 'ffmpeg';
  if (msg.includes('model') && (msg.includes('not found') || msg.includes('missing') || msg.includes('not downloaded'))) return 'model_missing';
  if (msg.includes('out of memory') || msg.includes('oom') || msg.includes('alloc')) return 'oom';
  // Audio capture
  if (msg.includes('audio') && (msg.includes('short') || msg.includes('silent'))) return 'audio_invalid';
  if (msg.includes('microphone') || msg.includes('permission') || msg.includes('avaudio')) return 'mic_permission';
  if (msg.includes('audio') && msg.includes('buffer')) return 'audio_buffer';
  // AI post-processing
  if (msg.includes('cleantranscription') || msg.includes('post-process') || msg.includes('postprocess')) return 'post_processing';
  if (msg.includes('json') && (msg.includes('parse') || msg.includes('unexpected'))) return 'json_parse';
  // Native crash / abort
  if (msg.includes('abort') || msg.includes('sigtrap') || msg.includes('check_op') || msg.includes('check failed')) return 'native_abort';
  if (msg.includes('stream') && msg.includes('closed')) return 'stream_closed';
  return 'other';
}

// Short, PII-free signature of the error so we can disambiguate the
// "other" bucket without leaking transcripts/paths. Strips quoted
// substrings, file paths, URLs, numbers, hex addresses — keeps the
// structural shape of the message (~first 80 chars).
function sanitizeErrorSignature(err: unknown): string {
  if (!err) return '';
  let msg = String((err as any)?.message || err);
  msg = msg.replace(/"[^"]*"/g, '"…"');           // quoted strings
  msg = msg.replace(/'[^']*'/g, "'…'");
  msg = msg.replace(/\/[\w./\-]+/g, '<path>');     // file paths
  msg = msg.replace(/https?:\/\/\S+/gi, '<url>');  // URLs
  msg = msg.replace(/0x[0-9a-f]+/gi, '<hex>');     // memory addresses
  msg = msg.replace(/\b\d{3,}\b/g, '<n>');         // long numbers
  msg = msg.replace(/\s+/g, ' ').trim();
  return msg.slice(0, 80);
}

export class TranscriptionSessionManager {
  private transcriber: FastAssistantTranscriber;
  private analyticsManager: OptimizedAnalyticsManager;
  private streamingControl: StreamingControl | null = null;
  private useStreamingTranscription: boolean = false;
  private lastSentChunkIndex: number = 0;
  private streamingPartialText: string = '';
  private streamingFinalText: string = '';

  // Rolling-decode state: when the user is on a Parakeet local model and
  // speaks long-form, we don't wait for Fn-release to start decoding. Every
  // ROLLING_CHUNK_BYTES of buffered audio kicks off a background decode on
  // the warm safe (CPU) recognizer. On Fn-release only the trailing partial
  // chunk needs decoding, so total wall-clock = max(speech_time, total_decode_time)
  // instead of speech_time + total_decode_time.
  private rollingActive = false;
  private rollingModelId: string | null = null;
  private rollingPending: Buffer[] = [];
  private rollingPendingBytes = 0;
  private rollingInflight: Promise<void> | null = null;
  private rollingPieces: string[] = [];
  private static readonly ROLLING_CHUNK_BYTES = 30 * 16000 * 2; // 30 s of 16-kHz mono 16-bit

  // Callbacks
  private onPartialTranscript?: (partialText: string) => void;

  constructor(
    analyticsManager: OptimizedAnalyticsManager,
    useStreamingTranscription: boolean = false,
    onPartialTranscript?: (partialText: string) => void
  ) {
    this.analyticsManager = analyticsManager;
    this.useStreamingTranscription = useStreamingTranscription;
    this.onPartialTranscript = onPartialTranscript;

    // Pre-initialize transcriber to avoid first-time delays
    this.transcriber = new FastAssistantTranscriber();
  }

  /**
   * Initialize streaming transcription if needed
   */
  async initializeStreaming(): Promise<void> {
    // Always cleanup existing streaming control first to prevent race conditions
    if (this.streamingControl) {
      Logger.warning('🌊 [Transcription] Already initialized, stopping previous session');
      try {
        await this.streamingControl.stop();
      } catch (error) {
        Logger.warning('🌊 [Transcription] Error stopping previous session:', error);
      }
      this.streamingControl = null;

      // Add a small delay to ensure cleanup completes
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    try {
      // Check if streaming is enabled in settings
      const settings = AppSettingsService.getInstance().getSettings();

      // Local model path. If the configured model is a streaming-format
      // sherpa-onnx model, we still want streaming — fed locally instead of
      // through Deepgram. Offline-format local models (Whisper, Parakeet
      // TDT) skip streaming and fall back to the traditional buffer path.
      if (settings.useLocalModel) {
        const { STREAMING_MODELS } = await import('../../transcription/sherpa-models');
        const isStreamingLocal = STREAMING_MODELS.some(m => m.id === settings.localModelId);
        if (!isStreamingLocal) {
          Logger.info('🌊 [Transcription] Offline local model — streaming disabled');
          this.streamingControl = null;
          this.useStreamingTranscription = false;
          return;
        }

        console.log(`🦅 [Transcription] Initializing local streaming model: ${settings.localModelId}`);
        Logger.info(`🦅 [Transcription] Initializing local streaming model: ${settings.localModelId}`);
        this.lastSentChunkIndex = 0;
        this.streamingPartialText = '';
        this.streamingFinalText = '';

        const { SherpaOnlineTranscriber } = await import('../../transcription/sherpa-online-transcriber');
        const online = SherpaOnlineTranscriber.getInstance();
        const started = online.startSession();
        if (!started) {
          console.error('🦅 [Transcription] Failed to start local streaming session — likely model not downloaded or config mismatch');
          Logger.error('🦅 [Transcription] Failed to start local streaming session');
          this.streamingControl = null;
          this.useStreamingTranscription = false;
          return;
        }

        // Adapter that matches the Deepgram-shaped StreamingControl
        // interface so the rest of the pipeline (sendAudioToStream,
        // handleStreamingTranscription) doesn't branch on backend.
        this.streamingControl = {
          sendAudio: (buffer: Buffer) => {
            const text = online.feedAudio(buffer);
            if (text) {
              // Surface partials to the UI callback only — do NOT populate
              // streamingPartialText/Final. That field drives the
              // orchestrator's "ultra-fast" path which skips finalize() and
              // pastes raw text. We want finalize() to run so the streaming
              // text gets normalized (capitalization + period) before paste.
              this.onPartialTranscript?.(text);
            }
            return true;
          },
          finish: async () => {
            const text = await online.finalize();
            this.streamingFinalText = text;
            return text;
          },
          stop: async () => {
            online.cancel();
          }
        };

        // shouldUseStreaming gate in transcribe() needs this flipped on
        // so the streaming finalize path runs instead of the
        // traditional-buffer fallback. Mirrors how Deepgram is enabled
        // below.
        this.useStreamingTranscription = true;
        console.log('🦅 [Transcription] Local streaming session active');
        Logger.success('🦅 [Transcription] Local streaming session active');
        return;
      }

      if (!settings.useDeepgramStreaming) {
        Logger.info('🌊 [Transcription] Deepgram streaming disabled in settings');
        this.streamingControl = null;
        return;
      }

      Logger.info('🌊 [Transcription] Initializing Deepgram streaming transcription...');

      // Reset streaming state
      this.lastSentChunkIndex = 0;
      this.streamingPartialText = '';
      this.streamingFinalText = '';

      // Start streaming transcription with callbacks
      this.streamingControl = await this.transcriber.startStreamingTranscription(
        (partialText: string) => {
          this.streamingPartialText = partialText;
          this.onPartialTranscript?.(partialText);
          Logger.debug(`🌊 [Partial] ${partialText}`);
        },
        (finalText: string) => {
          this.streamingFinalText = finalText;
          Logger.info(`🌊 [Final] ${finalText}`);
        }
      );

      if (this.streamingControl) {
        Logger.success('🌊 [Transcription] Deepgram streaming initialized successfully');
      } else {
        throw new Error('Failed to get streaming control interface');
      }
    } catch (error) {
      Logger.error('🌊 [Transcription] Failed to initialize streaming:', error);
      this.streamingControl = null;
      this.useStreamingTranscription = false;
    }
  }

  /**
   * Per-chunk live feed for streaming transcribers (sherpa-onnx OnlineRecognizer,
   * or any future StreamingControl-shaped backend). Called from the audio
   * recorder's chunk callback while recording is active. Cheap when no
   * streaming control is set up.
   */
  feedStreamingChunk(buf: Buffer): void {
    // Cloud-streaming path (Deepgram-style StreamingControl adapter).
    if (this.streamingControl) {
      try { this.streamingControl.sendAudio(buf); } catch (e) { console.error('🔌 sendAudio threw:', e); }
    }
    // Local rolling-decode path (Parakeet offline, decode-during-recording).
    if (this.rollingActive) {
      this.feedRollingChunk(buf);
    }
  }

  /**
   * Begin rolling-decode for the given Parakeet model. Audio chunks fed via
   * feedStreamingChunk during recording will be batched into 30 s blocks
   * and decoded in the background on the safe (CPU) recognizer. Only the
   * trailing partial block is decoded after Fn-release in finishRollingDecode().
   */
  startRollingDecode(modelId: string): void {
    this.rollingActive = true;
    this.rollingModelId = modelId;
    this.rollingPending = [];
    this.rollingPendingBytes = 0;
    this.rollingInflight = null;
    this.rollingPieces = [];
    console.log(`🌀 [Rolling] Started for ${modelId} (chunk = ${TranscriptionSessionManager.ROLLING_CHUNK_BYTES / 32000}s)`);
  }

  private feedRollingChunk(buf: Buffer): void {
    if (!this.rollingActive) return;
    this.rollingPending.push(buf);
    this.rollingPendingBytes += buf.length;
    if (this.rollingPendingBytes >= TranscriptionSessionManager.ROLLING_CHUNK_BYTES && !this.rollingInflight) {
      this.kickOffRollingDecode();
    }
  }

  private kickOffRollingDecode(): void {
    if (!this.rollingModelId || this.rollingPending.length === 0) return;
    const slice = Buffer.concat(this.rollingPending);
    this.rollingPending = [];
    this.rollingPendingBytes = 0;
    const pieceIndex = this.rollingPieces.length;
    this.rollingPieces.push(''); // reserve slot to keep order

    this.rollingInflight = (async () => {
      const startedAt = Date.now();
      try {
        const { SherpaOnnxTranscriber } = await import('../../transcription/sherpa-onnx-transcriber');
        const result = await SherpaOnnxTranscriber.getInstance().transcribeBufferWithModel(slice, this.rollingModelId!);
        const ms = Date.now() - startedAt;
        const text = result?.text?.trim() || '';
        this.rollingPieces[pieceIndex] = text;
        console.log(`🌀 [Rolling] chunk #${pieceIndex} (${(slice.length / 32000).toFixed(1)}s audio → ${ms}ms decode): "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
      } catch (err) {
        console.warn('🌀 [Rolling] decode failed (chunk dropped):', err);
      } finally {
        this.rollingInflight = null;
        // If a new full chunk accumulated while we were decoding, fire next one
        if (this.rollingActive && this.rollingPendingBytes >= TranscriptionSessionManager.ROLLING_CHUNK_BYTES) {
          this.kickOffRollingDecode();
        }
      }
    })();
  }

  /**
   * Stop rolling, drain inflight decode, decode any trailing partial chunk,
   * and return the joined text. Cheaper than full-audio decode because the
   * head of the audio is already done.
   */
  async finishRollingDecode(): Promise<string | null> {
    if (!this.rollingActive) return null;
    this.rollingActive = false;

    // Wait for any inflight chunk to land
    if (this.rollingInflight) {
      try { await this.rollingInflight; } catch { /* logged inside */ }
    }

    // Decode trailing partial (≤ 30 s)
    if (this.rollingPending.length > 0 && this.rollingModelId) {
      const tail = Buffer.concat(this.rollingPending);
      this.rollingPending = [];
      this.rollingPendingBytes = 0;
      const startedAt = Date.now();
      try {
        const { SherpaOnnxTranscriber } = await import('../../transcription/sherpa-onnx-transcriber');
        const result = await SherpaOnnxTranscriber.getInstance().transcribeBufferWithModel(tail, this.rollingModelId);
        const ms = Date.now() - startedAt;
        const text = result?.text?.trim() || '';
        this.rollingPieces.push(text);
        console.log(`🌀 [Rolling] tail (${(tail.length / 32000).toFixed(1)}s → ${ms}ms): "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
      } catch (err) {
        console.warn('🌀 [Rolling] tail decode failed:', err);
      }
    }

    const joined = this.rollingPieces.filter(p => p && p.length > 0).join(' ').trim();
    console.log(`🌀 [Rolling] Done. ${this.rollingPieces.length} pieces → ${joined.length} chars`);
    this.rollingPieces = [];
    this.rollingModelId = null;
    return joined || null;
  }

  isRollingActive(): boolean {
    return this.rollingActive;
  }

  /**
   * Send audio chunks to streaming transcription
   */
  sendAudioToStream(audioChunks: Buffer[], currentChunkCount: number): void {
    if (!this.streamingControl || !this.useStreamingTranscription) return;

    try {
      // Only send chunks we haven't sent yet
      if (currentChunkCount > this.lastSentChunkIndex) {
        const newChunks = audioChunks.slice(this.lastSentChunkIndex);
        this.lastSentChunkIndex = currentChunkCount;

        // Send new chunks to streaming transcription
        let sentCount = 0;
        for (const chunk of newChunks) {
          if (chunk && chunk.length > 0) {
            const sent = this.streamingControl.sendAudio(chunk);
            if (sent) {
              sentCount++;
            } else {
              Logger.warning('🌊 [Transcription] Failed to send audio chunk to stream');
              break;
            }
          }
        }

        if (sentCount > 0) {
          Logger.debug(`🌊 [Transcription] Sent ${sentCount} audio chunks to streaming`);
        }
      }
    } catch (error) {
      Logger.error('🌊 [Transcription] Error sending audio to stream:', error);
    }
  }

  /**
   * Transcribe audio using streaming or traditional method
   */
  async transcribe(audioSessionData: AudioSessionData, transcriptionId: string, keyReleaseTime: number): Promise<TranscriptionResult | null> {
    const shouldUseStreaming = this.useStreamingTranscription && this.streamingControl;

    if (shouldUseStreaming) {
      return await this.handleStreamingTranscription(transcriptionId, keyReleaseTime, audioSessionData);
    } else {
      return await this.handleTraditionalTranscription(audioSessionData, transcriptionId, keyReleaseTime);
    }
  }

  /**
   * Handle streaming transcription completion
   */
  private async handleStreamingTranscription(transcriptionId: string, keyReleaseTime: number, audioSessionData?: AudioSessionData): Promise<TranscriptionResult | null> {
    try {
      Logger.info('🌊 [Transcription] Finishing streaming transcription...');

      if (!this.streamingControl) {
        Logger.warning('🌊 [Transcription] No streaming control available');
        return null;
      }

      // Check for ultra-fast mode with accumulated text
      if (this.streamingFinalText && this.streamingFinalText.trim().length > 0) {
        Logger.info('⚡ [Transcription] Using accumulated streaming text');

        const result: TranscriptionResult = {
          text: this.streamingFinalText.trim(),
          model: 'deepgram-streaming-immediate'
        };

        // Track ultra-fast streaming
        this.analyticsManager.trackEvent('ultra_fast_streaming_transcription', {
          textLength: result.text.length,
          model: result.model,
          timestamp: new Date().toISOString()
        });

        return result;
      }

      // Finish streaming transcription
      const streamingFinishStartTime = Date.now();
      const finalText = await this.streamingControl.finish();
      const streamingFinishTime = Date.now() - streamingFinishStartTime;

      Logger.performance('🌊 [Transcription] Streaming finish completed', streamingFinishTime);

      // Use streaming result or fallback
      let resultText = finalText || this.streamingFinalText;

      if (!resultText) {
        Logger.warning('🌊 [Transcription] No streaming result available');
        return null;
      }

      Logger.success(`🌊 [Transcription] Final streaming result: "${resultText}"`);

      return {
        text: resultText,
        model: 'streaming-only'
      };

    } catch (error) {
      Logger.error('🌊 [Transcription] Error in streaming transcription:', error);
      posthog.capture('transcription_failed', {
        path: 'streaming',
        error_type: classifyTranscriptionError(error),
        error_signature: sanitizeErrorSignature(error)
      });
      return null;
    } finally {
      // Always clean up streaming resources
      if (this.streamingControl) {
        try {
          await this.streamingControl.stop();
        } catch (error) {
          Logger.warning('🌊 [Transcription] Error during streaming cleanup:', error);
        }
        this.streamingControl = null;
      }

      // Reset streaming state
      this.lastSentChunkIndex = 0;
      this.streamingPartialText = '';
      this.streamingFinalText = '';
    }
  }

  /**
   * Handle traditional (non-streaming) transcription
   */
  private async handleTraditionalTranscription(audioSessionData: AudioSessionData, transcriptionId: string, keyReleaseTime: number): Promise<TranscriptionResult | null> {
    Logger.info(`🎙️ [Transcription] Starting traditional transcription - ID: ${transcriptionId}`);

    const { buffer: audioBuffer, duration } = audioSessionData;

    if (!audioBuffer) {
      Logger.error('❌ [Transcription] No audio buffer available');
      return null;
    }

    // Validate audio duration
    if (duration < 150) {
      Logger.warning(`⚠️ [Transcription] Audio duration too short (${duration}ms < 150ms)`);
      this.analyticsManager.trackEvent('audio_too_short', {
        transcriptionId,
        duration,
        threshold: 150,
        timestamp: new Date().toISOString()
      });
      posthog.capture('dictation_skipped', { reason: 'audio_too_short', duration_ms: duration });
      return null;
    }

    // Validate audio content
    if (!audioSessionData.hasSignificantAudio) {
      Logger.warning('⚠️ [Transcription] Audio appears to be silence or low-level noise');
      this.analyticsManager.trackEvent('audio_silent', {
        transcriptionId,
        duration,
        bufferSize: audioBuffer.length,
        timestamp: new Date().toISOString()
      });
      posthog.capture('dictation_skipped', { reason: 'audio_silent', duration_ms: duration });
      return null;
    }

    const transcriptionStartTime = Date.now();
    Logger.info(`🚀 [Transcription] Starting cloud transcription (${duration}ms audio, ${audioBuffer.length} bytes)`);

    try {
      const result = await this.transcriber.transcribeFromBuffer(audioBuffer, duration);

      if (result?.text) {
        const transcriptionTime = Date.now() - transcriptionStartTime;
        Logger.info(`✅ [Transcription] Completed in ${transcriptionTime}ms: "${result.text}"`);

        // Track performance
        this.analyticsManager.trackPerformance('transcription_latency', transcriptionTime, {
          model: result.model,
          audioDuration: duration,
          textLength: result.text.length,
          audioBufferSize: audioBuffer.length,
          transcriptionId,
          timestamp: new Date().toISOString()
        });

        // Validate transcription result
        if (!AudioValidator.isValidTranscription(result.text.trim())) {
          Logger.warning('⚠️ [Transcription] Invalid transcription result');
          return null;
        }

        return {
          text: result.text.trim(),
          model: result.model,
          isAssistant: result.isAssistant
        };
      } else {
        Logger.warning('⚠️ [Transcription] API returned no text');
        return null;
      }
    } catch (error) {
      const transcriptionTime = Date.now() - transcriptionStartTime;
      Logger.error(`❌ [Transcription] Failed in ${transcriptionTime}ms:`, error);

      posthog.capture('transcription_failed', {
        path: 'traditional',
        error_type: classifyTranscriptionError(error),
        error_signature: sanitizeErrorSignature(error),
        audio_duration_ms: duration
      });

      // Track error
      this.analyticsManager.trackError('transcription_failed', {
        error: error instanceof Error ? error.message : String(error),
        duration,
        model: 'whisper-cloud',
        transcriptionTime,
        transcriptionId,
        timestamp: new Date().toISOString()
      });

      return null;
    }
  }

  /**
   * Get accumulated streaming text (for ultra-fast mode)
   */
  getStreamingText(): string {
    return this.streamingFinalText || this.streamingPartialText;
  }

  /**
   * Enable or disable streaming mode
   */
  setStreamingMode(enabled: boolean): void {
    this.useStreamingTranscription = enabled;
    Logger.info(`🌊 [Transcription] Streaming mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if streaming is enabled
   * Also returns false if local whisper is enabled (offline mode)
   */
  isStreamingEnabled(): boolean {
    const settings = AppSettingsService.getInstance().getSettings();
    console.log(`🔍 [Transcription] isStreamingEnabled check - useLocalModel: ${settings.useLocalModel}, useStreamingTranscription: ${this.useStreamingTranscription}, localModelId: ${settings.localModelId}`);
    Logger.info(`🔍 [Transcription] isStreamingEnabled check - useLocalModel: ${settings.useLocalModel}, useStreamingTranscription: ${this.useStreamingTranscription}`);
    if (settings.useLocalModel) {
      // Local + streaming-format model → streaming is on (sherpa-onnx
      // OnlineRecognizer). Bypass the constructor-time
      // `useStreamingTranscription` flag, since main.ts only recomputes
      // it on hotkey restart — switching the local model in Settings
      // would otherwise never take effect until app relaunch.
      // Local + offline-format model (Whisper / Parakeet TDT) → buffer path.
      const { STREAMING_MODELS } = require('../../transcription/sherpa-models');
      const isStreamingLocal = STREAMING_MODELS.some((m: { id: string }) => m.id === settings.localModelId);
      console.log(`🔍 [Transcription] Local Model streaming-capable: ${isStreamingLocal}`);
      Logger.info(`🔍 [Transcription] Local Model streaming-capable: ${isStreamingLocal}`);
      return isStreamingLocal;
    }
    return this.useStreamingTranscription;
  }

  /**
   * Clean up streaming resources
   */
  async cleanup(): Promise<void> {
    Logger.info('🌊 [Transcription] Cleaning up streaming resources');

    if (this.streamingControl) {
      try {
        await this.streamingControl.stop();
      } catch (error) {
        Logger.warning('Failed to stop streaming control during cleanup:', error);
      }
      this.streamingControl = null;
    }

    // Reset all streaming state
    this.lastSentChunkIndex = 0;
    this.streamingPartialText = '';
    this.streamingFinalText = '';
    this.useStreamingTranscription = false;

    Logger.info('🌊 [Transcription] Cleanup completed');
  }
}
