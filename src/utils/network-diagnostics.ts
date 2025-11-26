import { Logger } from '../core/logger';

/**
 * Network diagnostic utility to help debug fetch failures
 */
export class NetworkDiagnostics {
  
  /**
   * Test basic connectivity to API endpoints
   */
  static async testConnectivity(): Promise<void> {
    Logger.info('🔍 [Network] Running connectivity diagnostics...');
    
    // Test OpenAI
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch('https://api.openai.com', { 
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      Logger.info(`✅ [Network] OpenAI reachable: ${response.status}`);
    } catch (error) {
      Logger.error(`❌ [Network] OpenAI unreachable:`, error);
    }
    
    // Test Gemini
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch('https://generativelanguage.googleapis.com', { 
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      Logger.info(`✅ [Network] Gemini reachable: ${response.status}`);
    } catch (error) {
      Logger.error(`❌ [Network] Gemini unreachable:`, error);
    }
    
    // Test general internet
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('https://www.google.com', { 
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      Logger.info(`✅ [Network] Internet connectivity: ${response.status}`);
    } catch (error) {
      Logger.error(`❌ [Network] No internet connectivity:`, error);
    }
  }
  
  /**
   * Quick connectivity check
   */
  static async isConnected(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Quick 3s timeout
      
      const response = await fetch('https://www.google.com', { 
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Log detailed error information for debugging
   */
  static logDetailedError(error: any, context: string): void {
    Logger.error(`🔍 [Network] Detailed error analysis for ${context}:`, {
      message: error.message,
      name: error.name,
      code: error.code,
      status: error.status,
      stack: error.stack?.split('\n').slice(0, 3), // First 3 lines of stack
      type: typeof error,
      keys: Object.keys(error)
    });
  }
}
