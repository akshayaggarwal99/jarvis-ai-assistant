import { JarvisAgent } from "../agents/jarvis-agent";
import { Logger } from "../core/logger";

/**
 * Global agent manager - initializes once at app startup and keeps agent in memory
 * Enables persistent conversations and eliminates initialization overhead
 */
class AgentManager {
  private static instance: AgentManager;
  private agent: JarvisAgent | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  async initialize(openaiKey: string, geminiKey?: string): Promise<void> {
    if (this.isInitialized) {
      Logger.debug('🤖 Agent already initialized, skipping...');
      return;
    }

    try {
      Logger.info('🚀 Initializing Jarvis Agent...');
      this.agent = new JarvisAgent(openaiKey, geminiKey);
      this.isInitialized = true;
      Logger.info('✅ Jarvis Agent initialized and ready');
    } catch (error) {
      Logger.error('❌ Failed to initialize Jarvis Agent:', error);
      throw error;
    }
  }

  getAgent(): JarvisAgent {
    if (!this.agent || !this.isInitialized) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }
    return this.agent;
  }

  updateKeys(openaiKey: string, geminiKey?: string): void {
    if (this.agent) {
      if (geminiKey) {
        this.agent.setGeminiKey(geminiKey);
      }
      // For OpenAI key updates, we'd need to recreate the agent
      // For now, log that keys were updated
      Logger.debug('🔑 Agent keys updated');
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.agent !== null;
  }
}

// Export singleton instance
export const agentManager = AgentManager.getInstance();
