import { agentManager } from '../core/agent-manager';
import { SecureAPIService } from '../services/secure-api-service';
import { Logger } from '../core/logger';
import { loadAuthState } from '../main';
import { ScreenVision } from '../vision/screen-vision';
import { AppSettingsService } from '../services/app-settings-service';

/**
 * Handles agent operations for push-to-talk service
 * Simplified to use UnifiedAgent via agentManager
 */
export class AgentHandler {
  // --- Singleton support ---
  private static instance: AgentHandler | null = null;
  public static getInstance(): AgentHandler {
    if (!AgentHandler.instance) {
      AgentHandler.instance = new AgentHandler();
    }
    return AgentHandler.instance;
  }

  private secureAPI: SecureAPIService;
  private currentSessionId: string | null = null;
  private lastActivityTime: number = 0;
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.secureAPI = SecureAPIService.getInstance();
    this.ensureAgentInitialized();
  }

  private async ensureAgentInitialized(): Promise<void> {
    if (agentManager.isReady()) {
      return;
    }

    try {
      let openaiKey: string | null = null;
      let geminiKey: string | null = null;

      try {
        openaiKey = await this.secureAPI.getOpenAIKey();
      } catch (e) {
        Logger.debug('[AgentHandler] OpenAI key not available');
      }
      try {
        geminiKey = await this.secureAPI.getGeminiKey();
      } catch (e) {
        Logger.debug('[AgentHandler] Gemini key not available');
      }

      const settings = AppSettingsService.getInstance().getSettings();
      console.log(`[DEBUG] AgentHandler.ensureAgentInitialized: useOllama=${settings.useOllama}, ollamaUrl=${settings.ollamaUrl}, ollamaModel=${settings.ollamaModel}`);
      Logger.debug(`[AgentHandler] Initializing: openAI=${!!openaiKey}, gemini=${!!geminiKey}, ollama=${settings.useOllama}`);

      await agentManager.initialize(openaiKey || undefined, geminiKey || undefined, {
        useOllama: settings.useOllama,
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: settings.ollamaModel
      });
    } catch (error) {
      Logger.error('❌ [AgentHandler] Failed to initialize agent:', error);
    }
  }

  /**
   * Get or create a conversation session ID
   */
  private getSessionId(): string {
    const now = Date.now();

    if (this.currentSessionId && (now - this.lastActivityTime) < this.SESSION_TIMEOUT) {
      this.lastActivityTime = now;
      return this.currentSessionId;
    }

    this.currentSessionId = `session_${now}_${Math.random().toString(36).substr(2, 9)}`;
    this.lastActivityTime = now;
    Logger.debug(`🔄 New session: ${this.currentSessionId}`);
    return this.currentSessionId;
  }

  async processQuery(userMessage: string): Promise<string> {
    try {
      const sessionId = this.getSessionId();

      // Ensure agent is ready
      if (!agentManager.isReady()) {
        Logger.info('[AgentHandler] Agent not ready, initializing...');
        await this.ensureAgentInitialized();
      }

      if (agentManager.isReady()) {
        const agent = agentManager.getAgent();
        Logger.debug(`[AgentHandler] Using ${agent.constructor.name}`);
        const response = await agent.processQuery(userMessage, sessionId, this.getUserContext());
        Logger.debug(`[AgentHandler] Response: "${response?.substring(0, 50)}..."`);
        return response;
      }

      throw new Error('No agent available');
    } catch (error) {
      Logger.error('❌ [AgentHandler] Processing failed:', error);
      throw error;
    }
  }

  private getUserContext(): any {
    try {
      const authState = loadAuthState();
      if (authState && authState.displayName && authState.email) {
        return {
          displayName: authState.displayName,
          email: authState.email,
          userId: authState.uid || authState.email
        };
      }
    } catch (error) {
      Logger.warning('Failed to get user context:', error);
    }
    return null;
  }

  async processVisionQuery(userMessage: string): Promise<string> {
    try {
      Logger.info('🔍 [AgentHandler] Processing vision query via ScreenVision');
      const vision = new ScreenVision();
      const secure = SecureAPIService.getInstance();
      const geminiKey = await secure.getGeminiKey();
      const visionResult = await vision.analyzeScreen(userMessage, geminiKey || undefined);
      if (visionResult) return visionResult;
      Logger.warning('🔍 [AgentHandler] Vision analysis returned null, falling back to text agent');
      // Fallback to text agent response
      return await this.processQuery(userMessage);
    } catch (error) {
      Logger.error('❌ Failed to process vision query:', error);
      return `I encountered an error while analyzing your screen: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  async clearAgentMemory(): Promise<void> {
    try {
      Logger.debug('🧹 Clearing agent memory');

      // Clear persistent agent memory
      if (agentManager.isReady()) {
        const agent = agentManager.getAgent();
        if (agent.clearMemory) {
          await agent.clearMemory();
        }
      }

      // Clear tiered agent memory
      if (this.tieredAgent) {
        await this.tieredAgent.clearMemory();
      }

      // Clear local agent memory
      if (this.jarvisAgent) {
        await this.jarvisAgent.clearMemory();
      }
    } catch (error) {
      Logger.error('❌ Failed to clear agent memory:', error);
    }
  }

  /**
   * Get performance statistics from tiered agent
   */
  getPerformanceStats() {
    if (this.tieredAgent) {
      return this.tieredAgent.getPerformanceStats();
    }
    return { tier1Count: 0, tier2Count: 0, tier3Count: 0 };
  }

  /**
   * Switch between tiered and standard agent
   */
  async switchAgentMode(useTiered: boolean): Promise<void> {
    Logger.info(`🔄 Switching to ${useTiered ? 'tiered' : 'standard'} agent mode`);
    (this as any).USE_TIERED_AGENT = useTiered;
    await this.initializeAgent();
  }
}
