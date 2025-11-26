import { Logger } from '../core/logger';
import { EventEmitter } from 'events';
import WebSocket from 'ws';

interface DeepgramStreamingConfig {
  model?: string;
  language?: string;
  smart_format?: boolean;
  punctuate?: boolean;
  capitalization?: boolean;
  encoding?: string;
  sample_rate?: number;
  keyterm?: string; // Changed from keywords to keyterm for Nova-3 compatibility
}

interface DeepgramMessage {
  type: string;
  transaction_key?: string;
  channel_index?: number[];
  metadata?: any;
  // Include transcript result properties for type compatibility
  channel?: {
    alternatives: {
      transcript: string;
      confidence: number;
      words?: Array<{
        word: string;
        start: number;
        end: number;
        confidence: number;
      }>;
    }[];
  };
  is_final?: boolean;
  speech_final?: boolean;
  duration?: number;
  start?: number;
  [key: string]: any;
}

export class DeepgramStreamingTranscriber extends EventEmitter {
  private apiKey: string;
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private isConnected = false;
  private config: DeepgramStreamingConfig;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private finalTranscript = '';
  private accumulatedTranscript = '';
  private isFinished = false;

  constructor(apiKey: string, config: DeepgramStreamingConfig = {}) {
    super();
    this.apiKey = apiKey;
    this.config = {
      model: 'nova-3',
      language: 'en-US',
      smart_format: true,
      punctuate: true,
      capitalization: true,
      encoding: 'linear16',
      sample_rate: 16000,
      ...config
    };
  }

  async connect(): Promise<boolean> {
    if (this.isConnecting || this.isConnected) {
      Logger.debug('🎙️ [DeepgramStream] Already connected or connecting');
      return true;
    }

    try {
      this.isConnecting = true;
      Logger.info('🎙️ [DeepgramStream] Connecting to Deepgram WebSocket...');

      // Reset transcripts for new session
      this.clearTranscript();

      // Get dictionary keywords if available
      await this.loadDictionaryKeywords();

      // Build WebSocket URL with query parameters
      const wsUrl = this.buildWebSocketUrl();
      Logger.debug(`🎙️ [DeepgramStream] Connecting to: ${wsUrl}`);

      // Create WebSocket connection with authorization header
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Token ${this.apiKey}`
        }
      });
      
      // Set up event handlers
      this.setupEventHandlers();

      // Wait for connection to establish
      return new Promise((resolve, reject) => {
        this.connectionTimeout = setTimeout(() => {
          Logger.error('🎙️ [DeepgramStream] Connection timeout');
          this.cleanup();
          reject(new Error('Connection timeout'));
        }, 10000); // 10 second timeout

        this.once('connected', () => {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          resolve(true);
        });

        this.once('error', (error) => {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          reject(error);
        });
      });

    } catch (error) {
      this.isConnecting = false;
      Logger.error('🎙️ [DeepgramStream] Connection failed:', error);
      throw error;
    }
  }

  private async loadDictionaryKeywords(): Promise<void> {
    try {
      const { nodeDictionaryService } = await import('../services/node-dictionary');
      const entries = nodeDictionaryService.getDictionary();
      if (entries.length > 0) {
        const keywords = entries.map((entry: any) => entry.word).join(',');
        this.config.keyterm = keywords; // Changed from keywords to keyterm
        Logger.info(`🎙️ [DeepgramStream] Loaded ${entries.length} dictionary keywords`);
      }
    } catch (error) {
      Logger.debug('🎙️ [DeepgramStream] No dictionary context available');
    }
  }

  private buildWebSocketUrl(): string {
    const baseUrl = 'wss://api.deepgram.com/v1/listen';
    const params = new URLSearchParams();

    // Add configuration parameters
    Object.entries(this.config).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    return `${baseUrl}?${params.toString()}`;
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      Logger.info('🎙️ [DeepgramStream] Connected successfully');
      this.isConnecting = false;
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startKeepAlive();
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const message: DeepgramMessage = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        Logger.error('🎙️ [DeepgramStream] Failed to parse message:', error);
      }
    });

    this.ws.on('error', (error) => {
      Logger.error('🎙️ [DeepgramStream] WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', (code, reason) => {
      Logger.info(`🎙️ [DeepgramStream] Connection closed: ${code} ${reason}`);
      this.cleanup();
      this.emit('disconnected', code, reason);

      // Auto-reconnect for unexpected closures
      if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        Logger.info(`🎙️ [DeepgramStream] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        setTimeout(() => this.connect().catch(console.error), 1000);
      }
    });
  }

  private handleMessage(message: DeepgramMessage): void {
    if (message.type === 'Results') {
      if (message.channel?.alternatives?.[0]) {
        const transcript = message.channel.alternatives[0].transcript;
        const confidence = message.channel.alternatives[0].confidence;

        if (transcript && transcript.trim()) {
          // Only log detailed streaming in non-tutorial mode to prevent lag
          if (!(global as any).isVoiceTutorialMode) {
            Logger.debug(`🎙️ [DeepgramStream] ${message.is_final ? 'Final' : 'Interim'}: "${transcript}"`);
          }
          
          if (message.is_final) {
            // Accumulate final segments instead of overwriting
            if (this.accumulatedTranscript) {
              this.accumulatedTranscript += ' ' + transcript;
            } else {
              this.accumulatedTranscript = transcript;
            }
            
            // Only log detailed timing in non-tutorial mode to prevent lag
            if (!(global as any).isVoiceTutorialMode) {
              Logger.info(`🎙️ [DeepgramStream] ⏱️ FINAL SEGMENT at ${new Date().toISOString()}: "${transcript}"`);
              Logger.info(`🎙️ [DeepgramStream] ⏱️ ACCUMULATED: "${this.accumulatedTranscript}"`);
            }
            
            // Check if this is a late-arriving transcript (after finish has been called)
            if (this.isFinished) {
              if (!(global as any).isVoiceTutorialMode) {
                Logger.info(`🎙️ [DeepgramStream] ⏱️ LATE TRANSCRIPT detected: "${this.accumulatedTranscript}"`);
              }
              this.emit('late-transcript', this.accumulatedTranscript);
            } else {
              this.emit('final_transcript', {
                text: transcript,
                confidence: confidence,
                words: message.channel.alternatives[0].words,
                accumulated: this.accumulatedTranscript
              });
            }
          } else {
            this.emit('interim_transcript', {
              text: transcript,
              confidence: confidence
            });
          }
        }
      }
    } else if (message.type === 'Metadata') {
      Logger.debug('🎙️ [DeepgramStream] Received metadata:', message.transaction_key);
      this.emit('metadata', message);
    } else {
      Logger.debug('🎙️ [DeepgramStream] Unknown message type:', message.type);
    }
  }

  private startKeepAlive(): void {
    // Send keepalive every 8 seconds (Deepgram disconnects after ~10 seconds of inactivity)
    this.keepAliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
          // Only log keepalive in non-tutorial mode to prevent lag
          if (!(global as any).isVoiceTutorialMode) {
            Logger.debug('🎙️ [DeepgramStream] Sent keepalive');
          }
        } catch (error) {
          Logger.error('🎙️ [DeepgramStream] Failed to send keepalive:', error);
        }
      }
    }, 8000);
  }

  sendAudioData(audioBuffer: Buffer): boolean {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // More detailed logging for debugging connection issues
      Logger.warning(`🎙️ [DeepgramStream] Cannot send audio - Connection state: connected=${this.isConnected}, ws=${!!this.ws}, readyState=${this.ws?.readyState}`);
      
      // Try to reconnect if connection was lost
      if (this.ws && this.ws.readyState === WebSocket.CLOSED && this.reconnectAttempts < this.maxReconnectAttempts) {
        Logger.info('🎙️ [DeepgramStream] Attempting to reconnect for audio streaming...');
        this.connect().catch(error => {
          Logger.error('🎙️ [DeepgramStream] Reconnection failed:', error);
        });
      }
      
      return false;
    }

    try {
      this.ws.send(audioBuffer);
      return true;
    } catch (error) {
      Logger.error('🎙️ [DeepgramStream] Failed to send audio data:', error);
      
      // If send fails, mark as disconnected and try to reconnect
      this.isConnected = false;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        Logger.info('🎙️ [DeepgramStream] Send failed, attempting to reconnect...');
        this.connect().catch(reconnectError => {
          Logger.error('🎙️ [DeepgramStream] Reconnection after send failure failed:', reconnectError);
        });
      }
      
      return false;
    }
  }

  finishStream(): Promise<string> {
    const startTime = Date.now();
    Logger.info(`🎙️ [DeepgramStream] ⏱️ FINISH STREAM STARTED at ${new Date().toISOString()}`);
    
    // Mark as finished to enable late transcript detection
    this.isFinished = true;
    
    return new Promise((resolve) => {
      if (!this.isConnected || !this.ws) {
        const endTime = Date.now();
        Logger.info(`🎙️ [DeepgramStream] ⏱️ RESOLVED (no connection) in ${endTime - startTime}ms`);
        resolve(this.accumulatedTranscript);
        return;
      }

      // Send close message to Deepgram first
      try {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        Logger.info(`🎙️ [DeepgramStream] ⏱️ CloseStream sent at ${Date.now() - startTime}ms`);
      } catch (error) {
        Logger.error('🎙️ [DeepgramStream] Failed to send CloseStream:', error);
      }

      // Timeout for final transcript - wait for final segments that typically arrive within 200-600ms
      const timeout = setTimeout(() => {
        const endTime = Date.now();
        Logger.info(`🎙️ [DeepgramStream] ⏱️ TIMEOUT RESOLVED in ${endTime - startTime}ms - using accumulated transcript`);
        this.finalTranscript = this.accumulatedTranscript;
        resolve(this.accumulatedTranscript);
      }, 800); // Increased from 300ms to 800ms to allow for proper final transcript delivery

      // Listen for any additional final transcripts with quick resolution
      const finalHandler = (result: any) => {
        const endTime = Date.now();
        clearTimeout(timeout);
        Logger.info(`🎙️ [DeepgramStream] ⏱️ FINAL SEGMENT RESOLVED in ${endTime - startTime}ms`);
        this.finalTranscript = result.accumulated;
        this.removeListener('final_transcript', finalHandler);
        resolve(result.accumulated);
      };

      this.on('final_transcript', finalHandler);
    });
  }

  disconnect(): void {
    Logger.info('🎙️ [DeepgramStream] Disconnecting...');
    
    // Immediately stop keepalive to prevent further messages
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      } catch (error) {
        Logger.debug('🎙️ [DeepgramStream] Failed to send CloseStream on disconnect');
      }
      this.ws.close(1000, 'Normal closure');
    }
    
    this.cleanup();
  }

  private cleanup(): void {
    Logger.debug('🎙️ [DeepgramStream] Performing cleanup');
    this.isConnecting = false;
    this.isConnected = false;
    this.isFinished = false;
    
    // Stop all intervals and timeouts
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Close and clear WebSocket
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Normal closure');
      }
      this.ws = null;
    }
    
    // Reset transcript state
    this.finalTranscript = '';
    this.accumulatedTranscript = '';
    
    Logger.debug('🎙️ [DeepgramStream] Cleanup completed');
  }

  isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  getFinalTranscript(): string {
    return this.accumulatedTranscript || this.finalTranscript;
  }

  clearTranscript(): void {
    this.finalTranscript = '';
    this.accumulatedTranscript = '';
    this.isFinished = false;
  }
}
