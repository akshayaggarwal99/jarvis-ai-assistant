import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { TranscriptionProvider, TranscriptionOptions, TranscriptionResult } from '../interfaces/transcription';
import { Logger } from '../core/logger';

export class OpenAITranscriber implements TranscriptionProvider {
  constructor(private apiKey: string) {}

  async transcribe(audioPath: string, options?: TranscriptionOptions): Promise<TranscriptionResult> {
    Logger.info(`🎯 [OpenAI API] Starting transcription for: ${audioPath}`);
    
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const fileStats = fs.statSync(audioPath);
    Logger.info(`📊 [OpenAI API] Audio file size: ${fileStats.size} bytes`);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath));
    formData.append('model', 'whisper-1');
    
    // Use verbose_json for better formatting control
    formData.append('response_format', 'verbose_json'); // Get detailed response with segments
    
    // Temperature for consistency (0 = deterministic, 1 = creative)
    if (options?.temperature !== undefined) {
      formData.append('temperature', options.temperature.toString());
      Logger.info(`🌡️ [OpenAI API] Temperature: ${options.temperature}`);
    }
    
    // Language for better accuracy
    if (options?.language) {
      formData.append('language', options.language);
      Logger.info(`🌍 [OpenAI API] Language: ${options.language}`);
    }
    
    // Context prompt (what the audio contains, not formatting instructions)
    if (options?.customPrompt) {
      Logger.info(`📝 [OpenAI API] Context prompt: "${options.customPrompt.substring(0, 100)}..."`);
      formData.append('prompt', options.customPrompt);
    }

    Logger.info('🌐 [OpenAI API] Sending request to OpenAI...');
    const startTime = Date.now();
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const duration = Date.now() - startTime;
    Logger.info(`📡 [OpenAI API] Response: ${response.status} ${response.statusText} (${duration}ms)`);

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(`❌ [OpenAI API] Error response: ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Handle different response formats
    let result: any;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      result = await response.json();
      Logger.info(`✅ [OpenAI API] JSON result: "${result.text || 'NO TEXT'}"`);
    } else {
      // Plain text response (shouldn't happen with verbose_json)
      const textResult = await response.text();
      result = { text: textResult };
      Logger.info(`✅ [OpenAI API] Text result: "${textResult || 'NO TEXT'}"`);
    }
    
    return {
      text: result.text || result || '',
      confidence: 1.0, // OpenAI doesn't provide confidence scores
    };
  }
}
