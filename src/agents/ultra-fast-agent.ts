/**
 * Ultra-lightweight Jarvis Agent - Zero LangGraph overhead
 * Expected performance: 1-2 seconds for most queries
 */
export class UltraFastJarvisAgent {
  private openaiKey: string;

  constructor(openaiKey: string) {
    this.openaiKey = openaiKey;
  }

  async processQuery(query: string, userContext?: any): Promise<string> {
    const startTime = Date.now();
    console.log(`⚡ [UltraFast] Processing: "${query}"`);

    // Simple routing based on keywords - much faster than LLM-based tool selection
    const route = this.routeQuery(query);
    
    try {
      let result: string;
      
      switch (route.type) {
        case 'app_launch':
          result = await this.launchApp(route.params.appName);
          break;
          
        case 'screenshot':
          result = await this.takeScreenshot();
          break;
          
        case 'text_generation':
        default:
          result = await this.generateText(query, userContext);
          break;
      }

      const time = Date.now() - startTime;
      console.log(`⚡ [UltraFast] Completed in ${time}ms`);
      return result;
      
    } catch (error) {
      console.error('❌ [UltraFast] Error:', error);
      return "I encountered an error. Please try again.";
    }
  }

  private routeQuery(query: string): { type: string; params: any } {
    const lower = query.toLowerCase();
    
    // App launching patterns
    const appPatterns = [
      { pattern: /open\s+(\w+)/i, extract: (match: RegExpMatchArray) => match[1] },
      { pattern: /launch\s+(\w+)/i, extract: (match: RegExpMatchArray) => match[1] },
      { pattern: /start\s+(\w+)/i, extract: (match: RegExpMatchArray) => match[1] }
    ];
    
    for (const { pattern, extract } of appPatterns) {
      const match = query.match(pattern);
      if (match) {
        return { type: 'app_launch', params: { appName: extract(match) } };
      }
    }
    
    // Screenshot patterns
    if (lower.includes('screenshot') || lower.includes('capture screen')) {
      return { type: 'screenshot', params: {} };
    }
    
    // Default to text generation
    return { type: 'text_generation', params: {} };
  }

  private async generateText(query: string, userContext?: any): Promise<string> {
    const prompt = this.buildTextPrompt(query, userContext);
    
    // Direct OpenAI API call - no LangChain overhead
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Jarvis. Be helpful and concise.' },
          { role: 'user', content: query }
        ],
        max_tokens: 512,
        temperature: 0.1,
        timeout: 3000
      })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || "I couldn't generate a response.";
  }

  private async launchApp(appName: string): Promise<string> {
    try {
      // Dynamic import to avoid loading unused modules
      const { appLauncherService } = await import('../services/app-launcher-service');
      await appLauncherService.findAndLaunchApp(appName);
      return `Launching ${appName}...`;
    } catch (error) {
      return `Failed to launch ${appName}. ${error}`;
    }
  }

  private async takeScreenshot(): Promise<string> {
    try {
      // Dynamic import
      const { captureScreen } = await import('../tools/vision-tool');
      await captureScreen();
      return "Screenshot captured!";
    } catch (error) {
      return `Failed to take screenshot. ${error}`;
    }
  }

  private buildTextPrompt(query: string, userContext?: any): string {
    let prompt = query;
    if (userContext?.displayName) {
      prompt = `User: ${userContext.displayName}\nQuery: ${query}`;
    }
    return prompt;
  }
}
