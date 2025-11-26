/**
 * Streaming Jarvis Agent - Provides instant feedback
 * User sees response immediately as it's generated
 */
export class StreamingJarvisAgent {
  private openaiKey: string;

  constructor(openaiKey: string) {
    this.openaiKey = openaiKey;
  }

  async processQueryStreaming(
    query: string, 
    onChunk: (chunk: string) => void,
    userContext?: any
  ): Promise<void> {
    console.log(`🌊 [Streaming] Processing: "${query}"`);

    try {
      // Route the query
      const route = this.routeQuery(query);
      
      if (route.type === 'text_generation') {
        await this.streamTextGeneration(query, onChunk, userContext);
      } else {
        // For tool calls, provide immediate feedback then execute
        onChunk(`Processing ${route.type}...\n`);
        const result = await this.executeNonStreamingTask(route);
        onChunk(result);
      }
    } catch (error) {
      onChunk(`Error: ${error}`);
    }
  }

  private async streamTextGeneration(
    query: string, 
    onChunk: (chunk: string) => void,
    userContext?: any
  ): Promise<void> {
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
        stream: true // Enable streaming
      })
    });

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private routeQuery(query: string): { type: string; params: any } {
    const lower = query.toLowerCase();
    
    if (lower.includes('open') || lower.includes('launch')) {
      return { type: 'app_launch', params: { query } };
    }
    
    if (lower.includes('screenshot')) {
      return { type: 'screenshot', params: {} };
    }
    
    return { type: 'text_generation', params: {} };
  }

  private async executeNonStreamingTask(route: any): Promise<string> {
    switch (route.type) {
      case 'app_launch':
        return "App launched successfully!";
      case 'screenshot':
        return "Screenshot captured!";
      default:
        return "Task completed!";
    }
  }
}
