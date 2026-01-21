/**
 * LLM Provider Interface
 * Common abstraction for all LLM providers (OpenAI, Gemini, Ollama)
 */

// Tool definition for function calling
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
            enum?: string[];
        }>;
        required?: string[];
    };
}

// Response from LLM - either text or a tool call
export interface LLMResponse {
    type: 'text' | 'tool_call';
    text?: string;
    toolCall?: {
        name: string;
        arguments: Record<string, any>;
    };
}

// Streaming callbacks
export interface StreamCallbacks {
    onToken?: (token: string) => void;
    onComplete?: (fullText: string) => void;
    onError?: (error: Error) => void;
}

/**
 * LLM Provider Interface
 * All providers must implement this interface for consistent behavior
 */
export interface LLMProvider {
    /**
     * Provider name for logging
     */
    readonly name: string;

    /**
     * Generate a text response (no tools)
     */
    generateText(
        prompt: string,
        systemPrompt?: string,
        callbacks?: StreamCallbacks
    ): Promise<string>;

    /**
     * Call with tools - LLM decides whether to use a tool or respond with text
     */
    callWithTools(
        prompt: string,
        tools: ToolDefinition[],
        systemPrompt?: string
    ): Promise<LLMResponse>;

    /**
     * Check if this provider supports native function calling
     */
    supportsToolCalling(): boolean;
}
