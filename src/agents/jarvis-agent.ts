import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { textResponseTool } from "../tools/text-response";
import { visionTool } from "../tools/vision-tool";
import { appLauncherTool } from "../tools/app-launcher-tool";
import { cliTool } from "../tools/cli-tool";
import { fileSystemTool } from "../tools/filesystem-tool";
import { fileOrganizerTool } from "../tools/file-organizer-tool";
import { systemInfoTool } from "../tools/system-info-tool";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { assistantPrompt, codeAssistantPrompt } from "../prompts/prompts";
import { Logger } from "../core/logger";
import { appLauncherService } from "../services/app-launcher-service";
import { smartBrowserService } from "../services/smart-browser-service";

export class JarvisAgent {
  private openaiAgent: any;
  private checkpointSaver = new MemorySaver();
  private geminiKey: string | null = null;
  private openaiKey: string;

  constructor(openaiKey: string, geminiKey?: string) {
    this.openaiKey = openaiKey;
    this.geminiKey = geminiKey || null;
    
    // Initialize AI parser for app launcher and smart browser services
    appLauncherService.initializeAIParser(openaiKey, geminiKey);
    smartBrowserService.initializeAIParser(openaiKey, geminiKey);

    // Create OpenAI agent optimized for speed with reduced tools
    const llm = new ChatOpenAI({ 
      apiKey: openaiKey,
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1024,
      timeout: 8000,      // Reduced timeout
      maxRetries: 1       // Single retry for speed
    });

    this.openaiAgent = createReactAgent({
      llm,
      // Only load essential tools to reduce selection overhead
      tools: [
        textResponseTool,   // Most common - text generation
        appLauncherTool,    // Second most common - launching apps
        cliTool,           // For system commands
        visionTool         // For screenshots/images
        // Removed less common tools: fileSystemTool, fileOrganizerTool, systemInfoTool
      ],
      messageModifier: async (messages) => {
        // Simplified prompt for faster processing
        const systemPrompt = `${assistantPrompt}

Available Tools (use sparingly):
- textResponseTool: Text generation, conversations, writing
- appLauncherTool: Open/launch applications and websites  
- cliTool: Terminal commands and system operations
- visionTool: Screenshot analysis and image processing

SPEED PRIORITY: Prefer textResponseTool for most queries unless specific tool functionality is clearly needed.`;
        
        return [new SystemMessage(systemPrompt), ...messages];
      }
    });
  }

  async processQuery(
    query: string, 
    sessionId: string, 
    userContext?: { userId?: string, displayName?: string, email?: string }
  ): Promise<string> {
    const startTime = Date.now();
    const cleanQuery = query.replace(/\s+/g, ' ').trim();
    
    Logger.info(`🤖 [JarvisAgent] Processing query: "${cleanQuery}"`);
    Logger.info(`🔑 [JarvisAgent] Session ID: ${sessionId}`);
    
    // ⚡ FAST LANE: Detect simple text generation tasks that don't need tools
    const isFastLaneTask = this.detectFastLaneTask(cleanQuery);
    
    if (isFastLaneTask) {
      Logger.info(`⚡ [FastLane] Using optimized path for text generation`);
      return this.processFastLaneQuery(cleanQuery, userContext, startTime);
    }
    
    // Complex tasks use full agent with tools
    Logger.info(`🔧 [FullAgent] Using complete agent with tools`);
    return this.processComplexQuery(cleanQuery, sessionId, userContext, startTime);
  }

  /**
   * Detect if this is a simple text generation task that doesn't need tools
   */
  private detectFastLaneTask(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    
    // Use keyword-based routing instead of LLM-based tool selection for speed
    const toolRequiredKeywords = [
      'open ', 'launch ', 'start ', 'run ', 'execute',
      'screenshot', 'capture screen', 'take picture',
      'find file', 'search file', 'read file', 'write file',
      'terminal', 'command line', 'kill process'
    ];
    
    // If it clearly needs tools, use full agent (or better yet, direct function calls)
    if (toolRequiredKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return false;
    }
    
    // Everything else is text generation - use fast lane
    return true;
  }

  /**
   * Fast lane processing using direct OpenAI API without LangGraph overhead
   */
  private async processFastLaneQuery(
    query: string, 
    userContext?: { userId?: string, displayName?: string, email?: string },
    startTime?: number
  ): Promise<string> {
    try {
      // Create ultra-lightweight LLM instance for maximum speed
      const fastLLM = new ChatOpenAI({ 
        apiKey: this.openaiKey,
        model: "gpt-4o-mini",
        temperature: 0.1,     // Lower temperature for faster inference
        maxTokens: 512,       // Reduced for faster response
        timeout: 3000,        // Aggressive 3-second timeout
        maxRetries: 1,        // Single retry for speed
        // Additional speed optimizations
        topP: 0.8,           // Reduce search space
        frequencyPenalty: 0,  // Disable penalties for speed
        presencePenalty: 0
      });

      // Minimal system prompt for speed
      let systemPrompt = `You are Jarvis. Be helpful and concise.`;
      
      if (userContext?.displayName) {
        systemPrompt += ` User: ${userContext.displayName}.`;
      }

      const response = await fastLLM.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(query)
      ]);

      const result = response.content as string;
      
      const processingTime = Date.now() - (startTime || Date.now());
      Logger.info(`⚡ [FastLane] Query processed in ${processingTime}ms`);
      
      return result || "I processed your request but couldn't generate a response. Please try again.";
    } catch (error) {
      Logger.warning(`⚡ [FastLane] Failed, falling back to full agent:`, error);
      // Fallback to full agent if fast lane fails
      return this.processComplexQuery(query, `fallback_${Date.now()}`, userContext, startTime);
    }
  }

  /**
   * Full agent processing with tools for complex tasks
   */
  private async processComplexQuery(
    query: string, 
    sessionId: string, 
    userContext?: { userId?: string, displayName?: string, email?: string },
    startTime?: number
  ): Promise<string> {
    // Simple contextual prompt with user info if available
    let contextualPrompt = assistantPrompt;
    if (userContext?.displayName || userContext?.email) {
      contextualPrompt += `\n\nUser Context:`;
      if (userContext.displayName) contextualPrompt += `\n- Name: ${userContext.displayName}`;
      if (userContext.email) contextualPrompt += `\n- Email: ${userContext.email}`;
    }

    try {
      // Process the query with the OpenAI agent
      const result = await this.openaiAgent.invoke(
        {
          messages: [new HumanMessage(query)]
        },
        {
          configurable: {
            thread_id: sessionId
          }
        }
      );

      // Extract response from messages
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
      Logger.info(`🔧 [FullAgent] Query processed successfully in ${processingTime}ms`);
      
      return response;
    } catch (error) {
      Logger.error('❌ [JarvisAgent] Error processing query:', error);
      
      if (error instanceof Error && error.message.includes('API key')) {
        return "I need a valid API key to process your request. Please check your OpenAI API key in settings.";
      } else if (error instanceof Error && error.message.includes('timeout')) {
        return "The request took too long to process. Please try again with a simpler query.";
      } else {
        return "I encountered an error while processing your request. Please try again.";
      }
    }
  }

  analyzeApplicationContext(query: string): { targetApp?: string; searchQuery?: string; isSearch: boolean } {
    const lowerQuery = query.toLowerCase();
    
    const searchIndicators = ['find', 'search', 'look for', 'show me', 'list', 'what'];
    const isSearch = searchIndicators.some(indicator => lowerQuery.includes(indicator));
    
    const appKeywords = {
      'browser': ['chrome', 'safari', 'firefox', 'browser', 'web'],
      'music': ['spotify', 'music', 'itunes', 'apple music'],
      'chat': ['slack', 'discord', 'messages', 'whatsapp', 'telegram'],
      'code': ['vscode', 'visual studio', 'code', 'xcode', 'sublime'],
      'terminal': ['terminal', 'iterm', 'console'],
      'notes': ['notes', 'notion', 'obsidian', 'bear'],
      'email': ['mail', 'gmail', 'outlook'],
      'calendar': ['calendar', 'cal', 'fantastical'],
      'video': ['zoom', 'meet', 'teams', 'facetime']
    };
    
    for (const [category, keywords] of Object.entries(appKeywords)) {
      for (const keyword of keywords) {
        if (lowerQuery.includes(keyword)) {
          return { 
            targetApp: keyword, 
            searchQuery: isSearch ? query : undefined,
            isSearch 
          };
        }
      }
    }
    
    return { searchQuery: query, isSearch: true };
  }

  async clearMemory(sessionId?: string): Promise<void> {
    try {
      if (sessionId) {
        Logger.debug(`🧹 Clearing memory for session: ${sessionId}`);
      } else {
        Logger.debug('🧹 Clearing all agent memory');
        this.checkpointSaver = new MemorySaver();
        
        const llm = new ChatOpenAI({ 
          apiKey: this.openaiKey,
          model: "gpt-4o-mini",
          temperature: 0.3,
          maxTokens: 1024,
          timeout: 10000
        });

        this.openaiAgent = createReactAgent({
          llm,
          tools: [
            fileSystemTool,
            fileOrganizerTool,
            textResponseTool,
            appLauncherTool,
            cliTool,
            systemInfoTool,
            visionTool
          ]
        });
      }
      Logger.info('✅ Memory cleared successfully');
    } catch (error) {
      Logger.error('❌ Failed to clear memory:', error);
    }
  }
}