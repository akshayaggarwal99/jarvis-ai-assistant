import { JarvisAgent } from '../agents/jarvis-agent';
import { TieredJarvisAgent } from '../agents/tiered-jarvis-agent';
import { agentManager } from '../core/agent-manager';
import { SecureAPIService } from '../services/secure-api-service';
import { Logger } from '../core/logger';
import { loadAuthState } from '../main';
import { ScreenVision } from '../vision/screen-vision';

/**
 * Handles agent operations for push-to-talk service
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

  private jarvisAgent: JarvisAgent | null = null;
  private tieredAgent: TieredJarvisAgent | null = null;
  private secureAPI: SecureAPIService;
  private currentSessionId: string | null = null;
  private lastActivityTime: number = 0;
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly USE_TIERED_AGENT = true; // Feature flag to switch between agents

  private constructor() {
    this.secureAPI = SecureAPIService.getInstance();
    this.initializeAgent();
  }

  private async initializeAgent(): Promise<void> {
    try {
      const [openaiKey, geminiKey] = await Promise.all([
        this.secureAPI.getOpenAIKey(),
        this.secureAPI.getGeminiKey()
      ]);

      if (openaiKey) {
        if (this.USE_TIERED_AGENT) {
          this.tieredAgent = new TieredJarvisAgent(openaiKey, geminiKey || undefined);
          Logger.info(`🎯 Tiered Agent initialized - Gemini: ${geminiKey ? 'available' : 'fallback only'}`);
        } else {
          this.jarvisAgent = new JarvisAgent(openaiKey, geminiKey || undefined);
          Logger.info(`🤖 Standard Agent initialized - Gemini: ${geminiKey ? 'available' : 'fallback only'}`);
        }
      } else {
        Logger.info('🔑 No OpenAI key available during startup, agent will initialize after authentication');
      }
    } catch (error) {
      // Check if this is the expected authentication error during startup
      const errorMessage = error?.message || '';
      if (errorMessage.includes('No auth token available') || errorMessage.includes('Please authenticate first')) {
        Logger.info('🔑 Agent initialization waiting for authentication...');
      } else {
        Logger.error('❌ Failed to initialize agent:', error);
      }
    }
  }

  /**
   * Get or create a conversation session ID
   * Sessions expire after 5 minutes of inactivity
   */
  private getSessionId(): string {
    const now = Date.now();
    
    // Check if current session is still valid (within timeout)
    if (this.currentSessionId && (now - this.lastActivityTime) < this.SESSION_TIMEOUT) {
      this.lastActivityTime = now;
      Logger.debug(`🔄 Continuing session: ${this.currentSessionId}`);
      return this.currentSessionId;
    }
    
    // Create new session
    this.currentSessionId = `session_${now}_${Math.random().toString(36).substr(2, 9)}`;
    this.lastActivityTime = now;
    Logger.debug(`🔄 Starting fresh session: ${this.currentSessionId}`);
    return this.currentSessionId;
  }

  async processQuery(userMessage: string): Promise<string> {
    try {
      // Get or create session ID with conversation continuity
      const sessionId = this.getSessionId();
      
      // Get active app for context-aware formatting
      const { AudioProcessor } = await import('../audio/processor');
      const activeApp = await AudioProcessor.getActiveApp();
      Logger.debug(`🎯 Active app detected: ${activeApp}`);
      
      // Try persistent agent first
      if (agentManager.isReady()) {
        const agent = agentManager.getAgent();
        // Use standard 2-3 arg signature
        return await agent.processQuery(userMessage, sessionId, this.getUserContext());
      }
      
      // Use tiered agent if available, otherwise fallback to standard agent
      if (this.USE_TIERED_AGENT && this.tieredAgent) {
        return await this.tieredAgent.processQuery(userMessage, sessionId, this.getUserContext());
      }
      
      // Fallback to standard agent
      if (!this.jarvisAgent && !this.tieredAgent) {
        await this.initializeAgent();
      }

      if (this.jarvisAgent) {
        return await this.jarvisAgent.processQuery(userMessage, sessionId, this.getUserContext());
      }

      throw new Error('No agent available');
    } catch (error) {
      Logger.error('❌ Processing failed:', error);
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
          userId: authState.uid || authState.email // Use uid, fallback to email as userId
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
