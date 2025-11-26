import { Logger } from '../core/logger';
import { captureScreen } from '../tools/vision-tool';
import { clipboard, nativeImage } from 'electron';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { WindowManager } from './window-manager';
import { AnalysisOverlayService } from './analysis-overlay-service';

export interface JarvisCommand {
  isJarvisCommand: boolean;
  needsScreenshot: boolean;
  fullCommand: string;
  cleanCommand: string; // Command without "Jarvis" prefix
  keywords: string[];
}

export interface JarvisOutput {
  text: string;
  type: 'screenshot' | 'analysis' | 'plain';
  timestamp: Date;
}

export class JarvisCommandProcessor {
  // More specific pattern - only catch screenshot/capture commands, not conversational queries
  // Let conversational queries like "what do you know about me" go to AssistantProcessor
  private static readonly JARVIS_PREFIX_PATTERN = /^jarvis[\s,]*(screenshot|capture|take a screenshot|screen shot|grab this|capture this|take a picture|snap this)/i;
  private static readonly SCREENSHOT_KEYWORDS = [
    'screenshot', 'capture', 'take a screenshot', 'screen shot',
    'grab this', 'capture this', 'take a picture', 'snap this'
  ];

  /**
   * Parse voice transcription to detect Jarvis commands
   */
  static parseVoiceCommand(transcription: string): JarvisCommand {
    const trimmed = transcription.trim();
    const isJarvisCommand = this.JARVIS_PREFIX_PATTERN.test(trimmed);
    
    // Remove only "Jarvis" prefix, keep the command part
    const cleanCommand = isJarvisCommand 
      ? trimmed.replace(/^jarvis[\s,]*/i, '').trim()
      : trimmed;

    // Check for screenshot keywords in the original transcription (not cleanCommand)
    const lowerTranscription = trimmed.toLowerCase();
    const needsScreenshot = isJarvisCommand && this.SCREENSHOT_KEYWORDS.some(keyword => 
      lowerTranscription.includes(keyword.toLowerCase())
    );

    // Extract relevant keywords for context
    const keywords = this.extractKeywords(cleanCommand);

    return {
      isJarvisCommand,
      needsScreenshot,
      fullCommand: transcription,
      cleanCommand,
      keywords
    };
  }

  /**
   * Process a Jarvis command and return formatted output
   */
  static async processJarvisCommand(command: JarvisCommand): Promise<JarvisOutput> {
    Logger.info(`🎯 [Jarvis] Processing command: ${command.isJarvisCommand ? 'Jarvis' : 'Regular'}, Screenshot: ${command.needsScreenshot}`);
    
    try {
      if (command.needsScreenshot) {
        return await this.processScreenshotCommand(command);
      } else if (command.isJarvisCommand) {
        return await this.processAnalysisCommand(command);
      } else {
        return this.processPlainCommand(command);
      }
    } catch (error) {
      Logger.error('❌ [Jarvis] Command processing failed:', error);
      return {
        text: command.fullCommand, // Fallback to plain transcription
        type: 'plain',
        timestamp: new Date()
      };
    }
  }

  /**
   * Process screenshot command
   */
  private static async processScreenshotCommand(command: JarvisCommand): Promise<JarvisOutput> {
    Logger.info('📸 [Jarvis] Processing screenshot command...');
    
    try {
      // Take screenshot and copy to clipboard
      Logger.info('📸 [Jarvis] Taking screenshot...');
      const screenshotPath = await this.captureScreenshotToFile();
      
      // Copy the screenshot IMAGE to clipboard
      const imageBuffer = readFileSync(screenshotPath);
      const image = nativeImage.createFromBuffer(imageBuffer);
      clipboard.writeImage(image);
      Logger.info('📋 [Jarvis] Screenshot copied to clipboard');
      
      // Show screenshot success message using analysis overlay
      const analysisOverlayService = AnalysisOverlayService.getInstance();
      analysisOverlayService.sendAnalysisResult('📸 Screenshot captured and copied to clipboard!', false);
      Logger.info('📸 [Jarvis] Screenshot notification shown');
      
      // Auto-hide after 2 seconds
      setTimeout(() => {
        analysisOverlayService.hideOverlay();
      }, 2000);
      
      return {
        text: `Screenshot taken and copied to clipboard`,
        type: 'screenshot',
        timestamp: new Date()
      };
    } catch (error) {
      Logger.error('❌ [Jarvis] Screenshot failed:', error);
      
      return {
        text: 'Screenshot failed',
        type: 'screenshot',
        timestamp: new Date()
      };
    }
  }

  /**
   * Process regular Jarvis analysis command (no screenshot)
   */
  private static async processAnalysisCommand(command: JarvisCommand): Promise<JarvisOutput> {
    Logger.info('🎯 [Jarvis] Processing analysis command...');
    
    // For non-screenshot Jarvis commands, just copy the transcription
    clipboard.writeText(command.fullCommand);
    Logger.info('📋 [Jarvis] Transcription copied to clipboard');
    
    return {
      text: command.fullCommand,
      type: 'analysis',
      timestamp: new Date()
    };
  }

  /**
   * Process plain transcription (non-Jarvis command)
   */
  private static processPlainCommand(command: JarvisCommand): JarvisOutput {
    Logger.info('💬 [Jarvis] Processing plain transcription...');
    
    // For non-Jarvis commands, just return the plain text
    return {
      text: command.fullCommand,
      type: 'plain',
      timestamp: new Date()
    };
  }

  /**
   * Capture screenshot and analyze it
   */
  private static async captureAndAnalyze(query: string): Promise<string> {
    // Use the imported captureScreen function
    const result = await captureScreen(query);
    return result;
  }

  /**
   * Capture screenshot to a temporary file and return the path
   */
  private static async captureScreenshotToFile(): Promise<string> {
    const timestamp = Date.now();
    const screenshotPath = `/tmp/jarvis_screenshot_${timestamp}.png`;
    
    return new Promise((resolve, reject) => {
      Logger.debug('📸 [Jarvis] Capturing screen...');
      
      // Use macOS screencapture command
      const captureProcess = spawn('screencapture', ['-x', screenshotPath]);
      
      captureProcess.on('close', (code) => {
        if (code === 0) {
          Logger.info(`📸 [Jarvis] Screenshot captured successfully`);
          resolve(screenshotPath);
        } else {
          Logger.error(`❌ [Jarvis] Screenshot failed with code: ${code}`);
          reject(new Error(`Screenshot capture failed with code: ${code}`));
        }
      });
      
      captureProcess.on('error', (error) => {
        Logger.error('❌ [Jarvis] Screenshot process error:', error);
        reject(new Error(`Screenshot process error: ${error.message}`));
      });
    });
  }

  /**
   * Extract relevant keywords from command for context
   */
  private static extractKeywords(command: string): string[] {
    const keywords: string[] = [];
    const lowerCommand = command.toLowerCase();
    
    // Common coding-related keywords
    const codingKeywords = [
      'function', 'class', 'method', 'variable', 'bug', 'error', 'fix',
      'optimize', 'refactor', 'test', 'debug', 'code', 'ui', 'interface',
      'design', 'layout', 'styling', 'css', 'javascript', 'typescript',
      'react', 'vue', 'angular', 'api', 'database', 'performance'
    ];
    
    codingKeywords.forEach(keyword => {
      if (lowerCommand.includes(keyword)) {
        keywords.push(keyword);
      }
    });
    
    return keywords;
  }
}
