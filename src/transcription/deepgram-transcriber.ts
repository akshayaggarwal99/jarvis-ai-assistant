import { Logger } from '../core/logger';

const DEEPGRAM_TIMEOUT_MS = 60_000;

export class DeepgramTranscriber {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Returns transcript on success, null when Deepgram succeeded but produced
   * no text (genuine silence). Throws on auth/network/timeout/server errors
   * so the caller can classify and try the next provider.
   */
  async transcribeFromBuffer(audioBuffer: Buffer, options?: { language?: string }): Promise<{ text: string; model: string; isAssistant: boolean } | null> {
    const startTime = Date.now();
    Logger.info('🎙️ [Deepgram] Starting Nova-3 transcription...');

    let keywords = '';
    try {
      const { nodeDictionaryService } = await import('../services/node-dictionary');
      const entries = nodeDictionaryService.getDictionary();
      if (entries.length > 0) {
        keywords = entries.map((entry: any) => entry.word).join(',');
        Logger.info(`🎙️ [Deepgram] Using ${entries.length} dictionary keywords: ${keywords.substring(0, 50)}...`);
      }
    } catch {
      Logger.debug('🎙️ [Deepgram] No dictionary context available');
    }

    // Normalize language for Nova-3:
    //   'auto' → 'multi' (Nova-3 multilingual mode; 'auto' is not valid)
    //   en-* / en → kept as-is (Nova-3 keyterm only works in English)
    //   anything else → kept; Deepgram will validate
    const rawLanguage = options?.language || 'en-US';
    const language = rawLanguage === 'auto' ? 'multi' : rawLanguage;
    const isEnglish = /^en(-|$)/i.test(language);

    // /v1/listen is the prerecorded endpoint. vad_events / endpointing are
    // streaming-only; sending them to the prerecorded endpoint returns
    // "No such model/language/tier combination found." Drop them.
    // `capitalization` is not a real Deepgram param — smart_format covers it.
    const params = new URLSearchParams({
      model: 'nova-3',
      language,
      smart_format: 'true',
      punctuate: 'true',
      utterances: 'true',
      detect_language: 'false',
      encoding: 'linear16',
      sample_rate: '16000',
      mip_opt_out: 'true'
    });
    if (keywords && isEnglish) {
      params.set('keyterm', keywords);
    }
    const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEEPGRAM_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'audio/l16;rate=16000',
        },
        body: audioBuffer,
        signal: controller.signal
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError') {
        throw new Error(`Deepgram timeout after ${DEEPGRAM_TIMEOUT_MS}ms`);
      }
      // Network-level failure (DNS, ECONNREFUSED, ECONNRESET, etc.) — rethrow
      // so the router can mark it as a network error.
      throw err;
    }
    clearTimeout(timeout);

    if (response.status === 401 || response.status === 403) {
      const body = await response.text().catch(() => '');
      Logger.error(`🎙️ [Deepgram] Auth failed (${response.status}): ${body.slice(0, 200)}`);
      throw new Error(`Deepgram unauthorized (${response.status}): invalid API key`);
    }
    if (response.status === 429) {
      throw new Error('Deepgram rate limited (429)');
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // Log URL on 4xx so config bugs (bad language/model combo) are diagnosable.
      Logger.error(`🎙️ [Deepgram] API error (${response.status}) url=${url} body=${body.slice(0, 300)}`);
      throw new Error(`Deepgram error ${response.status}: ${body.slice(0, 100)}`);
    }

    const result = await response.json() as any;
    const alt = result?.results?.channels?.[0]?.alternatives?.[0];
    if (alt?.transcript) {
      const confidence = alt.confidence || 0;
      const duration = Date.now() - startTime;
      Logger.info(`🎙️ [Deepgram] Success in ${duration}ms (confidence: ${(confidence * 100).toFixed(1)}%): "${alt.transcript.substring(0, 50)}..."`);
      return { text: alt.transcript, model: 'deepgram-nova-3', isAssistant: false };
    }

    Logger.warning('🎙️ [Deepgram] No transcription results returned (silence?)');
    return null;
  }
}
