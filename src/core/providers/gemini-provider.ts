/**
 * Gemini Provider
 * Implements LLMProvider interface for Google's Gemini models
 */

import { LLMProvider, LLMResponse, StreamCallbacks, ToolDefinition } from '../llm-provider';
import { Logger } from '../logger';

export class GeminiProvider implements LLMProvider {
    readonly name = 'Gemini';
    private modelName: string;
    private apiKey: string;
    private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

    constructor(apiKey: string, modelName: string = 'gemini-2.5-flash-lite') {
        this.apiKey = apiKey;
        this.modelName = modelName;
        Logger.info(`💎 [GeminiProvider] Initialized with model: ${modelName} (Optimized for latency)`);
    }

    supportsToolCalling(): boolean {
        return true;
    }

    async generateText(
        prompt: string,
        systemPrompt?: string,
        callbacks?: StreamCallbacks
    ): Promise<string> {
        try {
            const url = `${this.baseUrl}/${this.modelName}:streamGenerateContent?key=${this.apiKey}`;

            const contents = [];
            if (systemPrompt) {
                contents.push({ role: 'user', parts: [{ text: systemPrompt + "\n\n" + prompt }] }); // Gemini system instructions are newer, using prompt prefix for compatibility
            } else {
                contents.push({ role: 'user', parts: [{ text: prompt }] });
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        maxOutputTokens: 1024,
                        temperature: 0.2,
                        topP: 0.8,
                        topK: 40
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            if (callbacks && response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    // Parse JSON stream format from Gemini (starts with [, separates with ,)
                    // Simplified parsing for robustness
                    const matches = chunk.matchAll(/"text":\s*"([^"]*)"/g);
                    for (const match of matches) {
                        const text = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                        fullText += text;
                        callbacks.onToken?.(text);
                    }
                }

                callbacks.onComplete?.(fullText);
                return fullText;
            } else {
                const data = await response.json();
                return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            }
        } catch (error) {
            Logger.error('❌ [GeminiProvider] generateText failed:', error);
            callbacks?.onError?.(error as Error);
            throw error;
        }
    }

    async callWithTools(
        prompt: string,
        tools: ToolDefinition[],
        systemPrompt?: string
    ): Promise<LLMResponse> {
        const url = `${this.baseUrl}/${this.modelName}:generateContent?key=${this.apiKey}`;

        // Map tools to Gemini format
        const geminiTools = [{
            function_declarations: tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters
            }))
        }];

        const contents = [{ role: 'user', parts: [{ text: prompt }] }];
        if (systemPrompt) {
            // Prepend system prompt to user message for simplicity
            contents[0].parts[0].text = `${systemPrompt}\n\n${prompt}`;
        }

        try {
            Logger.debug(`💎 [GeminiProvider] Calling with ${tools.length} tools`);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    tools: geminiTools,
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.1, // Lower temperature for more reliable tool calling
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            const part = candidate?.content?.parts?.[0];

            if (part?.functionCall) {
                const fc = part.functionCall;
                Logger.info(`🔧 [GeminiProvider] Tool call: ${fc.name}`);
                return {
                    type: 'tool_call',
                    toolCall: {
                        name: fc.name,
                        arguments: fc.args
                    }
                };
            }

            return {
                type: 'text',
                text: part?.text || ''
            };
        } catch (error) {
            Logger.error('❌ [GeminiProvider] callWithTools failed:', error);
            throw error;
        }
    }
}
