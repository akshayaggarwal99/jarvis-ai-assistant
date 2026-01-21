import { Logger } from "../core/logger";
import { UnifiedAgent } from "../agents/unified-agent";
import { LLMProvider } from "../core/llm-provider";
import { OllamaProvider } from "../core/providers/ollama-provider";
import { GeminiProvider } from "../core/providers/gemini-provider";

/**
 * Global agent manager - initializes once at app startup and keeps agent in memory
 * Now uses the clean UnifiedAgent architecture with provider abstraction
 */
class AgentManager {
  private static instance: AgentManager;
  private agent: UnifiedAgent | null = null;
  private isInitialized = false;

  private constructor() { }

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  async initialize(
    openaiKey: string | undefined,
    geminiKey?: string,
    ollamaSettings?: { useOllama?: boolean, ollamaUrl?: string, ollamaModel?: string }
  ): Promise<void> {
    if (this.isInitialized) {
      Logger.debug('🤖 Agent already initialized, skipping...');
      return;
    }

    try {
      let provider: LLMProvider | null = null;

      // Priority: Ollama (currently only fully implemented provider)
      // TODO: Add OpenAI and Gemini providers when implemented

      if (ollamaSettings?.useOllama) {
        console.log(`[DEBUG] AgentManager: Creating OllamaProvider (${ollamaSettings.ollamaModel})`);
        Logger.info(`🦙 Initializing with Ollama provider (${ollamaSettings.ollamaModel})...`);
        provider = new OllamaProvider(
          ollamaSettings.ollamaUrl || 'http://127.0.0.1:11434',
          ollamaSettings.ollamaModel || 'llama3.2:latest'
        );
      } else if (geminiKey) {
        console.log(`[DEBUG] AgentManager: Creating GeminiProvider`);
        Logger.info('💎 Initializing with Gemini provider...');
        provider = new GeminiProvider(geminiKey);
      } else if (openaiKey) {
        // TODO: Create OpenAIProvider when implemented
        Logger.warning('⚠️ OpenAI provider not yet implemented, falling back...');
      }

      if (provider) {
        console.log(`[DEBUG] AgentManager: Creating UnifiedAgent with ${provider.name} provider`);
        this.agent = new UnifiedAgent(provider);
        this.isInitialized = true;
        Logger.info('✅ UnifiedAgent initialized and ready');
      } else {
        console.log(`[DEBUG] AgentManager: No provider available!`);
        Logger.warning('⚠️ No AI providers available for AgentManager initialization');
      }
    } catch (error) {
      Logger.error('❌ Failed to initialize agent:', error);
      throw error;
    }
  }

  getAgent(): UnifiedAgent {
    if (!this.agent || !this.isInitialized) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }
    return this.agent;
  }

  updateKeys(openaiKey: string, geminiKey?: string): void {
    // With the new architecture, we'd need to recreate the agent with new providers
    Logger.debug('🔑 Agent key update requested - would require re-initialization');
  }

  isReady(): boolean {
    return this.isInitialized && this.agent !== null;
  }
}

// Export singleton instance
export const agentManager = AgentManager.getInstance();
