/**
 * Ollama Provider
 * Implements LLMProvider interface for local Ollama models with native function calling
 */

import { LLMProvider, LLMResponse, StreamCallbacks, ToolDefinition } from '../llm-provider';
import { Logger } from '../logger';

export class OllamaProvider implements LLMProvider {
    readonly name = 'Ollama';
    private baseUrl: string;
    private model: string;

    constructor(baseUrl: string = 'http://127.0.0.1:11434', model: string = 'llama3.2:latest') {
        // Normalize localhost to 127.0.0.1 to avoid IPv6 issues
        this.baseUrl = baseUrl.replace('localhost', '127.0.0.1');
        this.model = model;
        Logger.info(`🦙 [OllamaProvider] Initialized with model: ${model}`);
    }

    supportsToolCalling(): boolean {
        // Ollama supports function calling via the tools parameter
        return true;
    }

    async generateText(
        prompt: string,
        systemPrompt?: string,
        callbacks?: StreamCallbacks
    ): Promise<string> {
        const url = `${this.baseUrl}/api/chat`;

        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    stream: !!callbacks
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            if (callbacks && response.body) {
                // Streaming response
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim());

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            if (data.message?.content) {
                                fullText += data.message.content;
                                callbacks.onToken?.(data.message.content);
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }

                callbacks.onComplete?.(fullText);
                return fullText;
            } else {
                // Non-streaming response
                const data = await response.json();
                return data.message?.content || '';
            }
        } catch (error) {
            Logger.error('❌ [OllamaProvider] generateText failed:', error);
            callbacks?.onError?.(error as Error);
            throw error;
        }
    }

    async callWithTools(
        prompt: string,
        tools: ToolDefinition[],
        systemPrompt?: string
    ): Promise<LLMResponse> {
        const url = `${this.baseUrl}/api/chat`;

        // Convert our tool definitions to Ollama format
        const ollamaTools = tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));

        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        try {
            Logger.debug(`🦙 [OllamaProvider] Calling with ${tools.length} tools`);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    tools: ollamaTools,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            const data = await response.json();
            Logger.debug('🦙 [OllamaProvider] Response:', JSON.stringify(data).substring(0, 200));

            // Check if Ollama returned a tool call
            if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
                const toolCall = data.message.tool_calls[0];
                Logger.info(`🔧 [OllamaProvider] Tool call: ${toolCall.function.name}`);

                return {
                    type: 'tool_call',
                    toolCall: {
                        name: toolCall.function.name,
                        arguments: typeof toolCall.function.arguments === 'string'
                            ? JSON.parse(toolCall.function.arguments)
                            : toolCall.function.arguments
                    }
                };
            }

            // No tool call, return text response
            return {
                type: 'text',
                text: data.message?.content || ''
            };
        } catch (error) {
            Logger.error('❌ [OllamaProvider] callWithTools failed:', error);
            throw error;
        }
    }
}
