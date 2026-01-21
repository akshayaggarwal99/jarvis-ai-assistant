export interface LLMResponse {
  text: string;
  finished: boolean;
}

export interface StreamingLLMResponse {
  onToken: (token: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

export class CloudLLMService {
  private openaiKey: string;
  private geminiKey: string;
  private anthropicKey: string;
  private useOllama: boolean;
  private ollamaUrl: string;
  private ollamaModel: string;

  constructor(
    openaiKey: string,
    geminiKey: string,
    anthropicKey?: string,
    useOllama: boolean = false,
    ollamaUrl: string = 'http://127.0.0.1:11434',
    ollamaModel: string = 'llama3'
  ) {
    this.openaiKey = openaiKey;
    this.geminiKey = geminiKey;
    this.anthropicKey = anthropicKey || '';
    this.useOllama = useOllama;
    this.ollamaUrl = ollamaUrl;
    this.ollamaModel = ollamaModel;
  }

  async streamResponse(
    transcript: string,
    context: string[],
    callbacks: StreamingLLMResponse,
    manualTrigger: boolean = false
  ): Promise<void> {
    // Only provide suggestions if manually triggered
    if (!manualTrigger) {
      callbacks.onComplete(""); // Empty response for auto-transcription
      return;
    }

    const prompt = this.buildPrompt(transcript, context);
    console.log('🎯 Manual help requested for:', transcript.substring(0, 50) + '...');
    console.log('📋 Context provided:', context.length, 'items');

    try {
      if (this.useOllama) {
        try {
          await this.streamOllama(prompt, callbacks);
          return;
        } catch (ollamaError) {
          console.error('Ollama failed, falling back to Gemini:', ollamaError);
        }
      }

      await this.streamGemini(prompt, callbacks);
    } catch (error) {
      console.error('Gemini failed, falling back to Claude:', error);
      try {
        await this.streamClaude(prompt, callbacks);
      } catch (claudeError) {
        console.error('Claude failed, falling back to OpenAI:', claudeError);
        try {
          await this.streamOpenAI(prompt, callbacks);
        } catch (openaiError) {
          callbacks.onError(openaiError as Error);
        }
      }
    }
  }

  private buildPrompt(transcript: string, context: string[]): string {
    const lastLine = this.getLastMeaningfulLine(transcript);

    if (this.isNonSpeechContent(lastLine)) {
      return `Transcript contains non-speech audio (${lastLine}). Respond with: "Waiting for speech..."`;
    }

    return `You are Jarvis, an intelligent assistant helping during conversations. Analyze the transcript and provide helpful, actionable assistance.

CONTEXT & KNOWLEDGE:
${context.join('\n')}

CURRENT TRANSCRIPT: "${lastLine}"

Based on what was said and the available context:
- If the context has relevant information, use it to provide a helpful response
- If it's a question, help answer it or suggest how to find the answer
- If it's a business conversation, provide appropriate guidance
- If it's casual conversation, offer relevant assistance
- Always be helpful and specific to what was actually said

Keep response under 25 words and be practical and actionable.

SUGGESTION:`;
  }

  private isNonSpeechContent(text: string): boolean {
    const nonSpeechPatterns = [
      /^\(.*music.*\)$/i,
      /^\(.*static.*\)$/i,
      /^\(.*crackling.*\)$/i,
      /^\(.*cough.*\)$/i,
      /^\(.*speaking in.*language.*\)$/i,
      /^\(.*silence.*\)$/i,
      /^\(.*noise.*\)$/i,
      /^\(.*clicks.*\)$/i,
      /^\(.*camera.*\)$/i,
      /^wards the camera$/i,
      /^\s*$/, // empty or whitespace only
    ];

    return nonSpeechPatterns.some(pattern => pattern.test(text.trim()));
  }

  private async streamGemini(prompt: string, callbacks: StreamingLLMResponse): Promise<void> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${this.geminiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.3,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Send the complete response immediately (Gemini doesn't have real streaming)
    callbacks.onToken(text);
    callbacks.onComplete(text);
  }

  private async streamClaude(prompt: string, callbacks: StreamingLLMResponse): Promise<void> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.anthropicKey}`,
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.3,
        stream: true
      })
    });

    if (!response.body) {
      throw new Error('No response body from Claude');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const token = parsed.delta?.text;
              if (token) {
                fullText += token;
                callbacks.onToken(token);
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      }
      callbacks.onComplete(fullText);
    } finally {
      reader.releaseLock();
    }
  }

  private async streamOpenAI(prompt: string, callbacks: StreamingLLMResponse): Promise<void> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.3,
        stream: true
      })
    });

    if (!response.body) {
      throw new Error('No response body from OpenAI');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const token = parsed?.choices?.[0]?.delta?.content;
              if (token) {
                fullText += token;
                callbacks.onToken(token);
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      }
      callbacks.onComplete(fullText);
    } finally {
      reader.releaseLock();
    }
  }

  private getLastMeaningfulLine(transcript: string): string {
    const lines = transcript.split('\n').map(line => line.trim()).filter(line => line);

    // Look for the last line that isn't non-speech
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!this.isNonSpeechContent(line)) {
        return line;
      }
    }

    return lines[lines.length - 1] || transcript;
  }

  private async streamOllama(prompt: string, callbacks: StreamingLLMResponse): Promise<void> {
    // Normalize localhost to 127.0.0.1 to avoid IPv6 resolution issues
    const normalizedUrl = this.ollamaUrl.replace('localhost', '127.0.0.1');
    const url = `${normalizedUrl}/api/chat`; // Correct endpoint for chat

    // System prompt to match cloud model response style
    const systemPrompt = `You are Jarvis, a helpful AI assistant. Be concise and direct. 
Do NOT add preamble like "Here is..." or postamble like "Would you like me to...".
Just provide the requested content directly without any meta-commentary.`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.ollamaModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        stream: true
      })
    });

    if (!response.ok) {
      // Try fallback to generate endpoint if chat fails, or just throw
      throw new Error(`Ollama API error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body from Ollama');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const token = parsed.message?.content; // For chat endpoint

            if (token) {
              fullText += token;
              callbacks.onToken(token);
            }

            if (parsed.done) {
              break;
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
      callbacks.onComplete(fullText);
    } finally {
      reader.releaseLock();
    }
  }
}
