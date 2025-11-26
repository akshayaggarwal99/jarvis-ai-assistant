import { Logger } from '../../core/logger';
import { TextPaster } from '../text-paster';
import { FastStreamingPaster } from '../fast-streaming-paster';
import { OptimizedAnalyticsManager } from '../../analytics/optimized-analytics-manager';
import { OutputOptions } from '../types/push-to-talk-types';

export class OutputManager {
  private textPaster: TextPaster;
  private analyticsManager: OptimizedAnalyticsManager;

  constructor(analyticsManager: OptimizedAnalyticsManager) {
    this.analyticsManager = analyticsManager;
    this.textPaster = new TextPaster();
  }

  /**
   * Output text using the most appropriate method
   */
  async outputText(text: string, modelUsed: string, options: OutputOptions = {}): Promise<void> {
    const outputStartTime = Date.now();
    const keyReleaseTime = (global as any).keyReleaseTime || outputStartTime;
    
    Logger.info(`📋 [Output] Starting text output: "${text.substring(0, 50)}..."`);
    Logger.performance('🟢 [TIMING] Key release → Output started', outputStartTime - keyReleaseTime);

    try {
      // Choose output method based on options and context
      const method = this.selectOutputMethod(text, options);
      
      await this.executeOutput(text, method, modelUsed);
      
      const outputTime = Date.now() - outputStartTime;
      const totalTime = Date.now() - keyReleaseTime;
      
      Logger.info(`📋 [Output] Successfully output in ${outputTime}ms using ${method} method`);
      Logger.performance('✅ [TIMING] TOTAL END-TO-END TIME: Key release → Text output', totalTime);
      
      // Track successful output
      this.analyticsManager.trackEvent('text_output_success', {
        textLength: text.length,
        model: modelUsed,
        method: method,
        outputTime: outputTime,
        totalTime: totalTime,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const outputTime = Date.now() - outputStartTime;
      const totalTime = Date.now() - keyReleaseTime;
      
      Logger.error(`❌ [Output] Failed to output text after ${outputTime}ms:`, error);
      Logger.performance('❌ [TIMING] FAILED END-TO-END TIME: Key release → Output failed', totalTime);
      
      // Track output failure
      this.analyticsManager.trackError('text_output_failed', {
        error: error instanceof Error ? error.message : String(error),
        text: text,
        outputTime: outputTime,
        totalTime: totalTime,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    } finally {
      // Clear dictation mode after output attempt
      this.clearDictationMode();
    }
  }

  /**
   * Output text using ultra-fast streaming paste
   */
  async outputTextUltraFast(text: string, modelUsed: string): Promise<void> {
    const outputStartTime = Date.now();
    const keyReleaseTime = (global as any).keyReleaseTime || outputStartTime;
    
    Logger.info('⚡ [Output] Using ultra-fast streaming paste');
    
    try {
      await FastStreamingPaster.pasteFast(text);
      
      const outputTime = Date.now() - outputStartTime;
      const totalTime = Date.now() - keyReleaseTime;
      
      Logger.performance('⚡ [TIMING] ULTRA-FAST TOTAL: Key release → Text pasted', totalTime);
      
      // Track ultra-fast output
      this.analyticsManager.trackEvent('ultra_fast_output', {
        textLength: text.length,
        model: modelUsed,
        outputTime: outputTime,
        totalTime: totalTime,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      Logger.error('⚡ [Output] Ultra-fast paste failed:', error);
      throw error;
    } finally {
      this.clearDictationMode();
    }
  }

  /**
   * Select the best output method based on text and options
   */
  private selectOutputMethod(text: string, options: OutputOptions): 'fast' | 'clipboard' | 'keystroke' {
    // Force fast method if specified
    if (options.method) {
      return options.method;
    }

    // Use fast method for streaming or shorter text
    if (options.useStreaming || text.length < 100) {
      return 'fast';
    }

    // Use clipboard method for longer text (more reliable)
    if (text.length > 500) {
      return 'clipboard';
    }

    // Default to fast method
    return 'fast';
  }

  /**
   * Execute the actual output using the specified method
   */
  private async executeOutput(text: string, method: 'fast' | 'clipboard' | 'keystroke', modelUsed: string): Promise<void> {
    Logger.debug(`📋 [Output] Using ${method} method for text: "${text}"`);
    
    switch (method) {
      case 'fast':
        await FastStreamingPaster.pasteFast(text);
        break;
      
      case 'clipboard':
        await this.textPaster.pasteText(text);
        break;
      
      case 'keystroke':
        await this.pasteViaKeystroke(text);
        break;
      
      default:
        throw new Error(`Unknown output method: ${method}`);
    }
  }

  /**
   * Paste text via keystroke simulation (fallback method)
   */
  private async pasteViaKeystroke(text: string): Promise<void> {
    // Implementation for keystroke-based pasting
    // This would use system-level APIs to simulate typing
    Logger.warning('📋 [Output] Keystroke method not implemented, falling back to clipboard');
    await this.textPaster.pasteText(text);
  }

  /**
   * Clear dictation mode flag
   */
  private clearDictationMode(): void {
    try {
      const { setDictationMode } = require('../../main');
      setDictationMode(false);
      Logger.debug('🎯 [Output] Cleared dictation mode');
    } catch (error) {
      Logger.debug('Could not clear dictation mode:', error);
    }
  }

  /**
   * Get output statistics
   */
  getOutputStats(): any {
    // Return relevant statistics about output operations
    return {
      // This could include success rates, average times, etc.
      // For now, return a placeholder
      totalOutputs: 0,
      averageOutputTime: 0
    };
  }

  /**
   * Clear any pending corrections
   */
  clearCorrections(): void {
    // Clear any correction monitoring or pending corrections
    Logger.debug('🧹 [Output] Cleared corrections');
  }

  /**
   * Stop correction monitoring
   */
  stopCorrectionMonitoring(): void {
    // Stop any active correction monitoring
    Logger.debug('🛑 [Output] Stopped correction monitoring');
  }
}
