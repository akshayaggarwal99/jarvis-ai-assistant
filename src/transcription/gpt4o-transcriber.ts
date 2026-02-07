import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { Logger } from '../core/logger';
import { GoogleGenAI } from '@google/genai';
import { createDictationPrompt, createAssistantPrompt } from '../prompts/prompt-manager';
import { SecureAPIService } from '../services/secure-api-service';
import { AppSettingsService } from '../services/app-settings-service';

export interface GPT4oTranscribeResult {
  text: string | null;
}

function getSmartFormattingPrompt(transcript?: string): string {
  try {
    // If we have the transcript, check if it's an assistant request
    if (transcript) {
      return createAssistantPrompt(transcript);
    }
    // Default to dictation prompt
    return createDictationPrompt();
  } catch (error) {
    console.log('⚠️ Context detection failed:', String(error));
    return createDictationPrompt();
  }
}

function needsPostProcessing(text: string, context: string): boolean {
  return false; // Simplified - no post-processing needed with good prompts
}

async function postProcessForEmail(text: string): Promise<string> {
  try {
    // Check if post-processing is actually needed
    if (!needsPostProcessing(text, 'email')) {
      console.log('📝 Email text looks good, skipping post-processing');
      return text;
    }

    console.log('🔧 Applying minimal email post-processing...');

    const secureAPI = SecureAPIService.getInstance();
    const openaiKey = await secureAPI.getOpenAIKey();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that lightly improves transcribed email text. Only make minimal changes: 1. Add line breaks between greeting, body, and closing if they\'re missing 2. Fix obvious spelling errors 3. Ensure proper email structure only if it\'s clearly an email format 4. Keep professional email formatting with proper paragraphs. Keep the original tone and don\'t over-format. Only format as email if it has clear email elements (greeting, closing, signature).'
          },
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    if (!response.ok) {
      console.log('⚠️ Post-processing failed, using original text');
      return text;
    }

    const result = await response.json() as any;
    const processedText = result.choices?.[0]?.message?.content?.trim() || text;

    console.log('🤖 Post-processed result:', processedText);
    return processedText;
  } catch (error) {
    console.log('⚠️ Post-processing error:', error);
    return text;
  }
}

async function transcribeWithGPT4oMini(audioFilePath: string, dictionaryContext?: string): Promise<string | null> {
  try {
    const secureAPI = SecureAPIService.getInstance();
    const openaiKey = await secureAPI.getOpenAIKey();

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model', 'gpt-4o-mini-transcribe');
    formData.append('response_format', 'text');

    const settings = AppSettingsService.getInstance().getSettings();
    const language = settings.transcriptionLanguage || 'en-US';
    formData.append('language', language);

    // Add dictionary keywords as prompt if available (for word recognition hints)
    if (dictionaryContext) {
      // Format as recognition hints rather than instructions to avoid prompt leakage
      const promptHint = `This audio may contain these terms: ${dictionaryContext}`;
      formData.append('prompt', promptHint);
      Logger.info(`📖 [gpt-4o-mini] Using keyword hints: ${dictionaryContext.substring(0, 50)}...`);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) throw new Error(`gpt-4o-mini-transcribe failed: ${response.status}`);

    const text = await response.text();
    return text?.trim() || null;
  } catch (error) {
    Logger.warning('gpt-4o-mini-transcribe failed:', String(error));
    return null;
  }
}

async function transcribeWithGPT4oTranscribe(audioFilePath: string, dictionaryContext?: string): Promise<string | null> {
  try {
    const secureAPI = SecureAPIService.getInstance();
    const openaiKey = await secureAPI.getOpenAIKey();

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model', 'gpt-4o-transcribe');
    formData.append('response_format', 'text');

    const settings = AppSettingsService.getInstance().getSettings();
    const language = settings.transcriptionLanguage || 'en-US';
    formData.append('language', language);

    // Add dictionary keywords as prompt if available (for word recognition hints)
    if (dictionaryContext) {
      // Format as recognition hints rather than instructions to avoid prompt leakage
      const promptHint = `This audio may contain these terms: ${dictionaryContext}`;
      formData.append('prompt', promptHint);
      Logger.info(`📖 [gpt-4o-transcribe] Using keyword hints: ${dictionaryContext.substring(0, 50)}...`);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) throw new Error(`gpt-4o-transcribe failed: ${response.status}`);

    const text = await response.text();
    return text?.trim() || null;
  } catch (error) {
    Logger.warning('gpt-4o-transcribe failed:', String(error));
    return null;
  }
}

async function transcribeWithWhisper1(audioFilePath: string, dictionaryContext?: string): Promise<string | null> {
  try {
    const secureAPI = SecureAPIService.getInstance();
    const openaiKey = await secureAPI.getOpenAIKey();

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'text');

    const settings = AppSettingsService.getInstance().getSettings();
    const language = settings.transcriptionLanguage || 'en-US';
    formData.append('language', language);

    // Add dictionary keywords as prompt if available (for word recognition hints)
    if (dictionaryContext) {
      // Format as recognition hints rather than instructions to avoid prompt leakage
      const promptHint = `This audio may contain these terms: ${dictionaryContext}`;
      formData.append('prompt', promptHint);
      Logger.info(`📖 [whisper-1] Using keyword hints: ${dictionaryContext.substring(0, 50)}...`);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) throw new Error(`whisper-1 failed: ${response.status}`);

    const text = await response.text();
    return text?.trim() || null;
  } catch (error) {
    Logger.warning('whisper-1 failed:', String(error));
    return null;
  }
}

async function transcribeWithGemini(audioFilePath: string): Promise<string | null> {
  try {
    // Gemini transcription temporarily disabled due to API complexity
    Logger.warning('Gemini transcription not yet implemented');
    return null;
  } catch (error) {
    Logger.warning('Gemini transcription failed:', String(error));
    return null;
  }
}

async function transcribeWithGeminiFlashLite(audioFilePath: string, dictionaryContext?: string): Promise<string | null> {
  try {
    const secureAPI = SecureAPIService.getInstance();
    const geminiApiKey = await secureAPI.getGeminiKey();

    if (!geminiApiKey) {
      Logger.warning('Gemini API key not available');
      return null;
    }

    // Convert audio to base64
    const audioBuffer = fs.readFileSync(audioFilePath);
    const audioBase64 = audioBuffer.toString('base64');

    // Build transcription prompt with keyword hints
    let transcriptionPrompt = 'TRANSCRIPTION TASK. DO NOT CONVERSE. OUTPUT ONLY THE EXACT TRANSCRIPT OF THE AUDIO. IF AUDIO IS SILENT OR UNINTELLIGIBLE, OUTPUT NOTHING.';
    if (dictionaryContext) {
      transcriptionPrompt += ` (Note: Audio may contain these terms: ${dictionaryContext})`;
      Logger.info(`📖 [gemini-2.5-flash-lite] Using keyword hints: ${dictionaryContext.substring(0, 50)}...`);
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
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
    });

    if (!response.ok) throw new Error(`gemini-2.5-flash-lite failed: ${response.status}`);

    const result = await response.json() as any;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch (error) {
    Logger.warning('gemini-2.5-flash failed:', String(error));
    return null;
  }
}

async function transcribeWithParakeet(audioFilePath: string): Promise<string | null> {
  try {
    const { SherpaOnnxTranscriber } = await import('./sherpa-onnx-transcriber');
    const { PARAKEET_MODELS } = await import('./sherpa-models');
    const transcriber = SherpaOnnxTranscriber.getInstance();

    // Check if enabled first
    const settings = AppSettingsService.getInstance().getSettings();

    // Must be enabled AND have a Parakeet model selected
    if (!settings.useLocalModel) {
      Logger.info('🦜 [Parakeet] Skipped: Local model disabled');
      return null;
    }

    const modelId = settings.localModelId;
    const isParakeet = PARAKEET_MODELS.some(m => m.id === modelId);

    if (!isParakeet) {
      Logger.info(`🦜 [Parakeet] Skipped: Selected model ${modelId} is not a Parakeet model`);
      return null;
    }

    Logger.info(`🦜 [Parakeet] Attempting transcription with model ${modelId}...`);
    const text = await transcriber.transcribe(audioFilePath);

    if (text) {
      Logger.info(`🦜 [Parakeet] Success: "${text.substring(0, 50)}..."`);
      return text;
    }
    return null;
  } catch (error) {
    Logger.warning('🦜 [Parakeet] Transcription failed:', String(error));
    return null;
  }
}



export async function transcribeWithBestModel(audioFilePath: string): Promise<GPT4oTranscribeResult> {
  Logger.info('🎯 Starting dictation transcription with proper fallback chain');

  Logger.info('� [Fallback] gpt-4o-mini-transcribe → gpt-4o-transcribe → whisper-1 → gemini-2.5-flash-lite → whisper local');

  // Get dictionary context for enhanced prompts
  const { nodeDictionaryService } = await import('../services/node-dictionary');
  const dictionaryContext = nodeDictionaryService.getWordsForTranscription();

  const settings = AppSettingsService.getInstance().getSettings();

  // Step 0: Try Local Model (if enabled and compatible)
  if (settings.useLocalModel) {
    Logger.info('🚀 [Step 0] Trying Local Model (Parakeet check)...');
    const result = await transcribeWithParakeet(audioFilePath);
    if (result) {
      Logger.info('✅ [Step 0] Success with Local Model');
      return { text: result };
    }
    Logger.warning('⚠️ [Step 0] Local Model failed or not Parakeet, falling back to cloud models');
  }

  // Step 1: Try gpt-4o-mini-transcribe
  Logger.info('🚀 [Step 1] Trying gpt-4o-mini-transcribe...');
  let result = await transcribeWithGPT4oMini(audioFilePath, dictionaryContext);
  if (result) {
    Logger.info('✅ [Step 1] Success with gpt-4o-mini-transcribe');
    return { text: result };
  }

  // Step 2: Try gpt-4o-transcribe
  Logger.info('� [Step 2] Trying gpt-4o-transcribe...');
  result = await transcribeWithGPT4oTranscribe(audioFilePath, dictionaryContext);
  if (result) {
    Logger.info('✅ [Step 2] Success with gpt-4o-transcribe');
    return { text: result };
  }

  // Step 3: Try whisper-1
  Logger.info('🚀 [Step 3] Trying whisper-1...');
  result = await transcribeWithWhisper1(audioFilePath, dictionaryContext);
  if (result) {
    Logger.info('✅ [Step 3] Success with whisper-1');
    return { text: result };
  }

  // Step 4: Try gemini-2.5-flash
  Logger.info('🚀 [Step 4] Trying gemini-2.5-flash...');
  result = await transcribeWithGeminiFlashLite(audioFilePath, dictionaryContext);
  if (result) {
    Logger.info('✅ [Step 4] Success with gemini-2.5-flash');
    return { text: result };
  }

  Logger.error('❌ All transcription models failed');
  return { text: null };
}

async function transcribeWithPrompt(audioFilePath: string, prompt: string): Promise<string | null> {
  // Get dictionary keywords and enhance the prompt
  const { nodeDictionaryService } = await import('../services/node-dictionary');
  const dictionaryContext = nodeDictionaryService.getWordsForTranscription();

  // Combine the original prompt with keyword hints
  const enhancedPrompt = dictionaryContext ?
    `${prompt}\n\nNote: This audio may contain these terms: ${dictionaryContext}` :
    prompt;

  if (dictionaryContext) {
    Logger.info(`📖 [Dictionary] Enhanced prompt with keywords: ${dictionaryContext.substring(0, 50)}...`);
  }

  // Try gpt-4o-mini with prompt
  let result = await transcribeWithGPT4oMiniPrompt(audioFilePath, enhancedPrompt);
  if (result) return result;

  // Try gpt-4o-transcribe with prompt
  result = await transcribeWithGPT4oTranscribePrompt(audioFilePath, enhancedPrompt);
  if (result) return result;

  // Try whisper-1 with prompt
  result = await transcribeWithWhisper1Prompt(audioFilePath, prompt);
  if (result) return result;

  return null;
}

async function transcribeWithGPT4oMiniPrompt(audioFilePath: string, prompt: string): Promise<string | null> {
  try {
    const secureAPI = SecureAPIService.getInstance();
    const openaiKey = await secureAPI.getOpenAIKey();

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model', 'gpt-4o-mini-transcribe');
    formData.append('prompt', prompt);

    const settings = AppSettingsService.getInstance().getSettings();
    const language = settings.transcriptionLanguage || 'en-US';
    formData.append('language', language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) throw new Error(`GPT-4o Mini failed: ${response.status}`);

    const result = await response.json() as any;
    return result.text?.trim() || null;
  } catch (error) {
    Logger.warning('GPT-4o Mini with prompt failed:', String(error));
    return null;
  }
}

async function transcribeWithGPT4oTranscribePrompt(audioFilePath: string, prompt: string): Promise<string | null> {
  try {
    const secureAPI = SecureAPIService.getInstance();
    const openaiKey = await secureAPI.getOpenAIKey();

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model', 'gpt-4o-transcribe');
    formData.append('prompt', prompt);

    const settings = AppSettingsService.getInstance().getSettings();
    const language = settings.transcriptionLanguage || 'en-US';
    formData.append('language', language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) throw new Error(`GPT-4o Transcribe failed: ${response.status}`);

    const result = await response.json() as any;
    return result.text?.trim() || null;
  } catch (error) {
    Logger.warning('GPT-4o Transcribe with prompt failed:', String(error));
    return null;
  }
}

async function transcribeWithWhisper1Prompt(audioFilePath: string, prompt: string): Promise<string | null> {
  try {
    const secureAPI = SecureAPIService.getInstance();
    const openaiKey = await secureAPI.getOpenAIKey();

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model', 'whisper-1');

    const settings = AppSettingsService.getInstance().getSettings();
    const language = settings.transcriptionLanguage || 'en-US';
    formData.append('language', language);
    formData.append('prompt', prompt);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) throw new Error(`Whisper-1 failed: ${response.status}`);

    const result = await response.json() as any;
    return result.text?.trim() || null;
  } catch (error) {
    Logger.warning('Whisper-1 with prompt failed:', String(error));
    return null;
  }
}