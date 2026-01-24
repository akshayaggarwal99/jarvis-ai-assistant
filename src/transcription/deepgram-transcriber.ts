import { Logger } from '../core/logger';

export class DeepgramTranscriber {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribeFromBuffer(audioBuffer: Buffer, options?: { language?: string }): Promise<{ text: string; model: string; isAssistant: boolean } | null> {
    try {
      const startTime = Date.now();
      Logger.info('🎙️ [Deepgram] Starting Nova-3 transcription...');

      // Get dictionary context for custom vocabulary
      let keywords = '';
      try {
        const { nodeDictionaryService } = await import('../services/node-dictionary');
        const entries = nodeDictionaryService.getDictionary();
        if (entries.length > 0) {
          // Format as comma-separated keyterms for Deepgram Nova-3 boosting
          keywords = entries.map((entry: any) => entry.word).join(',');
          Logger.info(`🎙️ [Deepgram] Using ${entries.length} dictionary keywords: ${keywords.substring(0, 50)}...`);
        }
      } catch (error) {
        Logger.debug('🎙️ [Deepgram] No dictionary context available');
      }

      const language = options?.language || 'en-US';
      // Build URL with enhanced formatting and low-volume audio detection
      // Configure for Linear16 PCM format (raw PCM data at 16kHz)
      // Enhanced parameters for whisper-level audio detection
      let url = `https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true&capitalization=true&model=nova-3&language=${language}&detect_language=false&encoding=linear16&sample_rate=16000`;

      // Opt out of Deepgram Model Improvement Program (prevents storage beyond request processing)
      url += '&mip_opt_out=true';

      // Add enhanced parameters for low-volume whisper detection
      url += '&vad_events=true';  // Voice Activity Detection for better silence handling
      url += '&endpointing=false'; // Disable auto-endpointing for whisper audio
      url += '&utterances=true';  // Better utterance segmentation
      // Note: Nova-3 models have improved accuracy and language understanding

      if (keywords) {
        url += `&keyterm=${encodeURIComponent(keywords)}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'audio/l16;rate=16000', // Linear16 PCM at 16kHz
        },
        body: audioBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error(`🎙️ [Deepgram] API error (${response.status}): ${errorText}`);
        return null;
      }

      const result = await response.json();

      if (result.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
        const transcript = result.results.channels[0].alternatives[0].transcript;
        const confidence = result.results.channels[0].alternatives[0].confidence || 0;

        const duration = Date.now() - startTime;
        Logger.info(`🎙️ [Deepgram] Success in ${duration}ms (confidence: ${(confidence * 100).toFixed(1)}%): "${transcript.substring(0, 50)}..."`);

        return {
          text: transcript,
          model: 'deepgram-nova-3',
          isAssistant: false
        };
      } else {
        Logger.warning('🎙️ [Deepgram] No transcription results returned');
        return null;
      }
    } catch (error) {
      Logger.error('🎙️ [Deepgram] Transcription failed:', error);
      return null;
    }
  }
}
