import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Logger } from "../core/logger";

/**
 * Ultra-fast Jarvis Agent using OpenAI function calling instead of LangGraph
 * Expected performance: 1-3 seconds vs 9+ seconds with LangGraph
 */
export class FastJarvisAgent {
  private llm: ChatOpenAI;
  private openaiKey: string;

  constructor(openaiKey: string) {
    this.openaiKey = openaiKey;
    this.llm = new ChatOpenAI({
      apiKey: openaiKey,
      model: "gpt-4o-mini",
      temperature: 0.1,
      maxTokens: 512,
      timeout: 3000,
      maxRetries: 1
    });
  }

  async processQuery(query: string, userContext?: any): Promise<string> {
    const startTime = Date.now();
    Logger.info(`⚡ [FastAgent] Processing: "${query}"`);

    try {
      // 90% of queries are simple text generation - handle directly
      if (this.isSimpleTextQuery(query)) {
        return this.handleTextQuery(query, userContext, startTime);
      }

      // 10% need tools - use OpenAI function calling
      return this.handleToolQuery(query, userContext, startTime);
    } catch (error) {
      Logger.error('❌ [FastAgent] Error:', error);
      return "I encountered an error. Please try again.";
    }
  }

  private isSimpleTextQuery(query: string): boolean {
    const toolKeywords = ['open', 'launch', 'screenshot', 'file', 'terminal', 'run'];
    return !toolKeywords.some(keyword => query.toLowerCase().includes(keyword));
  }

  private async handleTextQuery(query: string, userContext: any, startTime: number): Promise<string> {
    const systemPrompt = `You are Jarvis. Be helpful and concise.${
      userContext?.displayName ? ` User: ${userContext.displayName}.` : ''
    }`;

    const response = await this.llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(query)
    ]);

    const result = response.content as string;
    const time = Date.now() - startTime;
    Logger.info(`⚡ [FastAgent] Text query completed in ${time}ms`);
    return result;
  }

  private async handleToolQuery(query: string, userContext: any, startTime: number): Promise<string> {
    // Define available functions
    const functions = [
      {
        name: "launch_app",
        description: "Open or launch applications",
        parameters: {
          type: "object",
          properties: {
            app_name: { type: "string", description: "Name of app to launch" }
          }
        }
      },
      {
        name: "take_screenshot", 
        description: "Take a screenshot and analyze it",
        parameters: { type: "object", properties: {} }
      }
    ];

    const response = await this.llm.invoke([
      new SystemMessage("You are Jarvis. Use the available functions to help the user."),
      new HumanMessage(query)
    ], {
      functions,
      function_call: "auto"
    });

    // Execute the function if one was called
    if (response.additional_kwargs?.function_call) {
      const functionCall = response.additional_kwargs.function_call;
      const result = await this.executeFunction(functionCall.name, functionCall.arguments);
      
      const time = Date.now() - startTime;
      Logger.info(`⚡ [FastAgent] Tool query completed in ${time}ms`);
      return result;
    }

    // Fallback to text response
    const time = Date.now() - startTime;
    Logger.info(`⚡ [FastAgent] Fallback text response in ${time}ms`);
    return response.content as string;
  }

  private async executeFunction(name: string, args: string): Promise<string> {
    const params = JSON.parse(args);
    
    switch (name) {
      case "launch_app":
        // Import and use app launcher service
        const { appLauncherService } = await import("../services/app-launcher-service");
        return await appLauncherService.launchApp(params.app_name);
        
      case "take_screenshot":
        // Import and use vision tool
        const { captureScreen } = await import("../tools/vision-tool");
        return await captureScreen();
        
      default:
        return "Function not implemented";
    }
  }
}
