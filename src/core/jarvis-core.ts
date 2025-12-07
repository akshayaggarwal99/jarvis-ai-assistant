import { MCPClient, MCPSearchResult } from './knowledge-service';
import { CloudLLMService, StreamingLLMResponse } from './llm-service';
import { agentManager } from './agent-manager';
import { Logger } from './logger';

export interface SuggestionResult {
  suggestion: string;
  context: MCPSearchResult[];
  latency: {
    vectorSearch: number;
    firstToken: number;
    total: number;
  };
}

export class JarvisCore {
  private mcpClient: MCPClient;
  private llmService: CloudLLMService;
  private transcriptBuffer: string[] = [];
  private isProcessing = false;

  constructor(
    openaiKey: string, 
    geminiKey: string, 
    anthropicKey?: string,
    ollamaUrl?: string,
    ollamaModel?: string
  ) {
    this.mcpClient = new MCPClient();
    this.llmService = new CloudLLMService(openaiKey, geminiKey, anthropicKey, ollamaUrl, ollamaModel);
  }

  async initialize(): Promise<void> {
    await this.mcpClient.connect();
  }

  async processTranscript(
    newTranscript: string,
    onSuggestion: (result: SuggestionResult) => void,
    forceSuggestion: boolean = false
  ): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Add to transcript buffer (keep last 20 lines)
      this.transcriptBuffer.push(newTranscript);
      if (this.transcriptBuffer.length > 20) {
        this.transcriptBuffer.shift();
      }

      // Store in memory
      await this.mcpClient.addMemory(newTranscript);

      // Use only the current transcript for context search, not the entire buffer
      const vectorStartTime = Date.now();
      const context = await this.mcpClient.searchContext(newTranscript, 3);
      const vectorLatency = Date.now() - vectorStartTime;

      const contextTexts = context.map((c: MCPSearchResult) => c.text);
      const fullTranscript = this.transcriptBuffer.join('\n');

      let suggestion = '';
      let firstTokenTime = 0;
      let gotFirstToken = false;

      // Stream LLM response
      await this.llmService.streamResponse(fullTranscript, contextTexts, {
        onToken: (token: string) => {
          if (!gotFirstToken) {
            firstTokenTime = Date.now() - startTime;
            gotFirstToken = true;
          }
          suggestion += token;
        },
        onComplete: (fullText: string) => {
          const totalLatency = Date.now() - startTime;
          
          onSuggestion({
            suggestion: fullText,
            context,
            latency: {
              vectorSearch: vectorLatency,
              firstToken: firstTokenTime,
              total: totalLatency
            }
          });
        },
        onError: (error: Error) => {
          console.error('LLM streaming error:', error);
        }
      }, forceSuggestion);

    } catch (error) {
      console.error('Error processing transcript:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async shutdown(): Promise<void> {
    await this.mcpClient.disconnect();
  }

  // New method specifically for chat processing using the LangGraph agent
  async processChat(
    message: string,
    context: string,
    onToken: (token: string) => void,
    onComplete: (fullText: string) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      // Use the LangGraph agent for chat to enable tool usage and identity capabilities
      try {
        const agent = agentManager.getAgent();
        const sessionId = `chat-${Date.now()}`;

        // Format the message with screen context
        const chatMessage = context ? 
          `Screen context: ${context}\n\nUser question: ${message}` : 
          message;

        Logger.info('🤖 Using LangGraph agent for chat with tool capabilities');

        // Get response from the agent (non-streaming)
        const response = await agent.processQuery(chatMessage, sessionId);
        
        // Simulate streaming by sending the response token by token
        if (response) {
          const tokens = response.split(' ');
          for (let i = 0; i < tokens.length; i++) {
            const token = i === 0 ? tokens[i] : ' ' + tokens[i];
            onToken(token);
            // Small delay to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          onComplete(response);
        } else {
          onComplete('');
        }
      } catch (agentError) {
        Logger.warning('▲ Agent not available, falling back to simple LLM service:', agentError);
        // Fallback to simple LLM service if agent not available
        const contextArray = context ? [context] : [];
        await this.llmService.streamResponse(message, contextArray, {
          onToken,
          onComplete,
          onError
        }, true); // Force manual trigger for chat
      }
    } catch (error) {
      onError(error as Error);
    }
  }

  getRecentTranscript(): string {
    return this.transcriptBuffer.slice(-5).join('\n');
  }

  clearTranscript(): void {
    this.transcriptBuffer = [];
  }
}
