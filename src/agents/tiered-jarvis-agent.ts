import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { Logger } from "../core/logger";
import * as os from "os";

// Import tools for different tiers
import { textResponseTool } from "../tools/text-response";
import { visionTool } from "../tools/vision-tool";
import { appLauncherTool } from "../tools/app-launcher-tool";
import { cliTool } from "../tools/cli-tool";
import { fileSystemTool } from "../tools/filesystem-tool";
import { fileOrganizerTool } from "../tools/file-organizer-tool";
import { systemInfoTool } from "../tools/system-info-tool";

/**
 * Tiered Jarvis Agent for optimal performance
 * 
 * Tier 1: Direct API (0.5-1s) - 90% of simple text queries
 * Tier 2: Manual Tool Routing (1-3s) - 8% of single tool operations  
 * Tier 3: Full Agent (3-5s) - 2% of complex multi-step workflows
 */
import { CloudLLMService } from "../core/llm-service";

/**
 * Tiered Jarvis Agent for optimal performance
 * 
 * Tier 1: Direct API (0.5-1s) - 90% of simple text queries
 * Tier 2: Manual Tool Routing (1-3s) - 8% of single tool operations  
 * Tier 3: Full Agent (3-5s) - 2% of complex multi-step workflows
 */
export class TieredJarvisAgent {
  private openaiKey: string | null = null;
  private geminiKey: string | null = null;
  private ollamaSettings: { useOllama: boolean; ollamaUrl: string; ollamaModel: string } | null = null;
  private fullAgent: any;
  private llmService: CloudLLMService;
  private checkpointSaver = new MemorySaver();

  constructor(
    openaiKey: string | undefined,
    geminiKey?: string,
    ollamaSettings?: { useOllama: boolean; ollamaUrl: string; ollamaModel: string }
  ) {
    this.openaiKey = openaiKey || null;
    this.geminiKey = geminiKey || null;
    this.ollamaSettings = ollamaSettings || null;

    // Initialize provider-agnostic LLM service for Tier 1
    this.llmService = new CloudLLMService(
      openaiKey || '',
      geminiKey || '',
      '', // anthropic
      ollamaSettings?.useOllama || false,
      ollamaSettings?.ollamaUrl,
      ollamaSettings?.ollamaModel
    );

    if (this.openaiKey) {
      this.initializeFullAgent();
    }
  }

  private initializeFullAgent(): void {
    const llm = new ChatOpenAI({
      apiKey: this.openaiKey,
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1024,
      timeout: 8000,
      maxRetries: 1
    });

    // Full agent with all tools for complex workflows
    this.fullAgent = createReactAgent({
      llm,
      tools: [
        textResponseTool,
        appLauncherTool,
        cliTool,
        visionTool,
        fileSystemTool,
        fileOrganizerTool,
        systemInfoTool
      ],
      checkpointSaver: this.checkpointSaver
    });
  }

  async processQuery(
    query: string,
    sessionId: string,
    userContext?: { userId?: string, displayName?: string, email?: string }
  ): Promise<string> {
    const startTime = Date.now();
    const cleanQuery = query.replace(/\s+/g, ' ').trim();

    Logger.info(`🎯 [TieredAgent] Processing query: "${cleanQuery}"`);

    // TIER 1: Direct API for simple text generation (90% of cases)
    if (this.isSimpleTextQuery(cleanQuery)) {
      Logger.info(`⚡ [Tier1] Using direct API for text generation`);
      return this.processDirectAPI(cleanQuery, userContext, startTime);
    }

    // TIER 2: Manual tool routing for single operations (8% of cases)
    if (this.isSingleToolQuery(cleanQuery)) {
      Logger.info(`🔧 [Tier2] Using manual tool routing`);
      return this.processManualToolRouting(cleanQuery, userContext, startTime);
    }

    // TIER 3: Full agent for complex workflows (2% of cases)
    Logger.info(`🤖 [Tier3] Using full agent for complex workflow`);
    return this.processFullAgent(cleanQuery, sessionId, userContext, startTime);
  }

  /**
   * TIER 1: Detect simple text generation queries
   */
  private isSimpleTextQuery(query: string): boolean {
    // Check for vision analysis keywords first (should go to Tier 3)
    const visionAnalysisPatterns = /(analyze.*screen|what.*(can you see|do you see|see|on).*screen|describe.*screen|tell me.*about.*screen|explain.*what.*(see|on))/i;
    if (visionAnalysisPatterns.test(query)) {
      return false; // Force vision analysis to use full agent (Tier 3)
    }

    // Check for complex analysis keywords first (should go to Tier 3)
    const complexKeywords = [
      'analyze', 'analysis', 'comprehensive', 'detailed report',
      'research and', 'organize and', 'plan a', 'strategy',
      'workflow', 'debug', 'optimize', 'suggest', 'recommend',
      'create a detailed', 'multi-step', 'complex'
    ];

    const hasComplexKeyword = complexKeywords.some(keyword =>
      query.toLowerCase().includes(keyword)
    );

    if (hasComplexKeyword) return false;

    const textPatterns = [
      // Direct text generation requests
      /^(write|create|generate|draft|compose)/i,
      /^(explain|describe|tell me about|what is|how does)/i,
      /^(help me (with|understand)|can you help)/i,

      // Question patterns
      /^(what|why|how|when|where|who)/i,
      /\?$/,

      // Conversational patterns
      /^(hi|hello|hey|good morning|good afternoon)/i,
      /^(thanks|thank you|thx)/i,
      /^(yes|no|okay|ok|sure)/i,

      // Content creation
      /(email|letter|message|text|content|summary|report)/i,
      /(idea|suggestion|advice|recommendation)/i
    ];

    // Check if query doesn't contain action keywords
    const actionKeywords = [
      'open', 'launch', 'start', 'run', 'execute',
      'screenshot', 'capture', 'take a picture',
      'find', 'search', 'locate', 'look for',
      'organize', 'move', 'delete', 'create folder',
      'install', 'update', 'download'
    ];

    const hasActionKeyword = actionKeywords.some(keyword =>
      query.toLowerCase().includes(keyword)
    );

    if (hasActionKeyword) return false;

    // Check if matches text patterns
    return textPatterns.some(pattern => pattern.test(query));
  }

  /**
   * TIER 2: Detect single tool operations (excluding vision analysis)
   */
  private isSingleToolQuery(query: string): boolean {
    // Only vision ANALYSIS queries should go to full agent
    // Simple screenshot capture should stay in Tier 2 for speed
    const visionAnalysisPatterns = /(analyze.*screen|what.*(can you see|do you see|see|on).*screen|describe.*screen|tell me.*about.*screen|explain.*what.*(see|on))/i;
    if (visionAnalysisPatterns.test(query)) {
      return false; // Force vision analysis to use full agent (Tier 3)
    }

    const toolPatterns = {
      screenshot: /(take|capture|get|grab) .*(screenshot|screen capture|screen shot)/i,
      // Match any "open X", "launch X", "start X" - let the tool figure out what X is
      appLauncher: /(open|launch|start)\s+\S+/i,
      cli: /(run|execute|terminal|command|git|npm|brew|curl|ping)/i,
      fileSystem: /(find|search|locate|look for) .*(file|folder|document)/i
    };

    return Object.values(toolPatterns).some(pattern => pattern.test(query));
  }

  /**
   * TIER 1: Direct API call for text generation
   */
  private async processDirectAPI(
    query: string,
    userContext?: { userId?: string, displayName?: string, email?: string },
    startTime?: number
  ): Promise<string> {
    try {
      let fullText = '';

      // Use the provider-agnostic llmService for Tier 1
      await this.llmService.streamResponse(query, [], {
        onToken: (token) => { fullText += token; },
        onComplete: (text) => { fullText = text; },
        onError: (err) => { throw err; }
      }, true); // Manual trigger for direct response

      const processingTime = Date.now() - (startTime || Date.now());
      Logger.info(`⚡ [Tier1] Completed in ${processingTime}ms`);

      return fullText;
    } catch (error) {
      Logger.error('❌ [Tier1] LLM Service failed:', error);
      // Fallback to Tier 3 if OpenAI is available, otherwise return error
      if (this.openaiKey) {
        return this.processFullAgent(query, `fallback-${Date.now()}`, userContext, startTime);
      }
      return "I encountered an error processing your request. Please check your AI settings.";
    }
  }

  /**
   * TIER 2: Manual tool routing for single operations
   */
  private async processManualToolRouting(
    query: string,
    userContext?: { userId?: string, displayName?: string, email?: string },
    startTime?: number
  ): Promise<string> {
    try {
      // Route to specific tool based on query patterns
      if (/(take|capture|get|grab) .*(screenshot|screen capture|screen shot)/i.test(query)) {
        Logger.info(`📸 [Tier2] Routing to screenshot tool`);
        return await visionTool.func({ action: "capture", query: null });
      }

      if (/(open|launch|start)/i.test(query)) {
        Logger.info(`🚀 [Tier2] Routing to app launcher`);
        // Extract just the app/site name from the query
        const appMatch = query.match(/(open|launch|start)\s+(\w+)/i);
        const appName = appMatch ? appMatch[2] : query;
        return await appLauncherTool.func({ command: `open ${appName}`, directExecution: true });
      }

      if (/(run|execute|terminal|command)/i.test(query)) {
        Logger.info(`💻 [Tier2] Routing to CLI tool`);
        // Extract command from query
        const commandMatch = query.match(/(run|execute)\s+(.*)/i);
        const command = commandMatch ? commandMatch[2] : query;
        return await cliTool.func({ command });
      }

      if (/(find|search|locate|look for)/i.test(query)) {
        Logger.info(`📁 [Tier2] Routing to file system tool`);
        // Use list operation to find files in common directories
        const searchPath = os.homedir(); // Default to home directory
        return await fileSystemTool.func({ operation: 'list', filePath: searchPath });
      }

      // If no specific tool match, fallback to Tier 3 (OpenAI) or Tier 1 (Others)
      if (this.openaiKey) {
        Logger.info(`🔄 [Tier2] No tool match, falling back to full agent`);
        return this.processFullAgent(query, `tier2-fallback-${Date.now()}`, userContext, startTime);
      } else {
        Logger.info(`🔄 [Tier2] No tool match, falling back to Tier 1`);
        return this.processDirectAPI(query, userContext, startTime);
      }

    } catch (error) {
      Logger.error('❌ [Tier2] Manual routing failed:', error);
      // Fallback to Tier 3 if available, otherwise Tier 1
      if (this.openaiKey) {
        return this.processFullAgent(query, `tier2-error-${Date.now()}`, userContext, startTime);
      }
      return this.processDirectAPI(query, userContext, startTime);
    }
  }

  /**
   * TIER 3: Full agent for complex workflows
   */
  private async processFullAgent(
    query: string,
    sessionId: string,
    userContext?: { userId?: string, displayName?: string, email?: string },
    startTime?: number
  ): Promise<string> {
    if (!this.openaiKey) {
      // Fallback to Tier 1 if OpenAI is missing
      return this.processDirectAPI(query, userContext, startTime);
    }

    try {
      const result = await this.fullAgent.invoke(
        {
          messages: [new HumanMessage(query)]
        },
        {
          configurable: {
            thread_id: sessionId
          }
        }
      );

      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];

      let response = '';
      if (lastMessage?.content) {
        response = typeof lastMessage.content === 'string'
          ? lastMessage.content
          : lastMessage.content.map((c: any) => c.text || '').join(' ');
      }

      if (!response) {
        response = "I processed your request but couldn't generate a response. Please try again.";
      }

      const processingTime = Date.now() - (startTime || Date.now());
      Logger.info(`🤖 [Tier3] Completed in ${processingTime}ms`);

      return response;
    } catch (error) {
      Logger.error('❌ [Tier3] Full agent failed:', error);
      return "I encountered an error processing your request. Please try again.";
    }
  }

  async clearMemory(sessionId?: string): Promise<void> {
    if (sessionId) {
      Logger.info(`🧹 [TieredAgent] Clearing memory for session: ${sessionId}`);
      // Clear specific session from checkpoint saver
      // Note: MemorySaver doesn't have a direct delete method, so we'll let it expire naturally
    } else {
      Logger.info(`🧹 [TieredAgent] Clearing all memory`);
      this.checkpointSaver = new MemorySaver();
      this.initializeFullAgent(); // Reinitialize with fresh memory
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): { tier1Count: number, tier2Count: number, tier3Count: number } {
    // This would be implemented with actual counters in production
    return { tier1Count: 0, tier2Count: 0, tier3Count: 0 };
  }
}
