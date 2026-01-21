/**
 * Unified Agent
 * A clean, provider-agnostic agent that uses native function calling
 */

import { LLMProvider, LLMResponse } from '../core/llm-provider';
import { ToolRegistry, createDefaultToolRegistry } from '../tools/tool-registry';
import { Logger } from '../core/logger';

// System prompt for the agent
const SYSTEM_PROMPT = `You are Jarvis, a helpful AI assistant. You have access to tools to help the user.

When the user asks you to do something that requires a tool, use the appropriate tool.
When the user asks a general question or wants text content, respond directly without using tools.

Be concise and direct in your responses. Do not add unnecessary preamble or follow-up questions.`;

export class UnifiedAgent {
    private provider: LLMProvider;
    private toolRegistry: ToolRegistry;

    constructor(provider: LLMProvider, toolRegistry?: ToolRegistry) {
        this.provider = provider;
        this.toolRegistry = toolRegistry || createDefaultToolRegistry();
        Logger.info(`🤖 [UnifiedAgent] Initialized with ${this.provider.name} provider and ${this.toolRegistry.size} tools`);
    }

    /**
     * Process a user query
     * Uses function calling to determine if a tool should be used
     */
    async processQuery(
        query: string,
        sessionId?: string,
        userContext?: { userId?: string; displayName?: string; email?: string }
    ): Promise<string> {
        const startTime = Date.now();

        try {
            Logger.info(`📥 [UnifiedAgent] Processing query: "${query.substring(0, 50)}..."`);

            // If the provider supports tool calling, use it
            if (this.provider.supportsToolCalling()) {
                return await this.processWithTools(query, startTime);
            }

            // Fallback to text generation for providers without tool support
            return await this.processTextOnly(query, startTime);
        } catch (error) {
            Logger.error('❌ [UnifiedAgent] Query processing failed:', error);
            return 'I encountered an error processing your request. Please try again.';
        }
    }

    /**
     * Process query using function calling
     */
    private async processWithTools(query: string, startTime: number): Promise<string> {
        const tools = this.toolRegistry.getToolDefinitions();
        console.log(`[DEBUG] UnifiedAgent.processWithTools: ${tools.length} tools available`);

        try {
            console.log(`[DEBUG] UnifiedAgent: Calling provider.callWithTools...`);
            const response = await this.provider.callWithTools(query, tools, SYSTEM_PROMPT);
            console.log(`[DEBUG] UnifiedAgent: Response type=${response.type}, toolCall=${response.toolCall?.name || 'none'}`);

            if (response.type === 'tool_call' && response.toolCall) {
                // Execute the tool
                console.log(`[DEBUG] UnifiedAgent: Executing tool ${response.toolCall.name} with args:`, JSON.stringify(response.toolCall.arguments));
                Logger.info(`🔧 [UnifiedAgent] Executing tool: ${response.toolCall.name}`);
                const result = await this.toolRegistry.execute(
                    response.toolCall.name,
                    response.toolCall.arguments
                );

                const elapsed = Date.now() - startTime;
                Logger.info(`✅ [UnifiedAgent] Tool execution completed in ${elapsed}ms`);
                return result;
            }

            // Text response
            console.log(`[DEBUG] UnifiedAgent: Text response: "${response.text?.substring(0, 50)}..."`);
            const elapsed = Date.now() - startTime;
            Logger.info(`✅ [UnifiedAgent] Text response in ${elapsed}ms`);
            return response.text || 'I could not generate a response.';

        } catch (error) {
            Logger.error('❌ [UnifiedAgent] Tool calling failed, falling back to text:', error);
            return this.processTextOnly(query, startTime);
        }
    }

    /**
     * Process query as text-only (no tools)
     */
    private async processTextOnly(query: string, startTime: number): Promise<string> {
        const response = await this.provider.generateText(query, SYSTEM_PROMPT);
        const elapsed = Date.now() - startTime;
        Logger.info(`✅ [UnifiedAgent] Text-only response in ${elapsed}ms`);
        return response;
    }

    /**
     * Clear conversation memory (if applicable)
     */
    async clearMemory(sessionId?: string): Promise<void> {
        Logger.info(`🧹 [UnifiedAgent] Memory cleared`);
        // Future: implement conversation memory if needed
    }
}
