import { desktopCapturer, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../core/logger';
import { compressImage, getOptimalCompressionSettings } from '../utils/image-compression';

export class ScreenVision {
  private isActive = false;
  private autoDisableTimer: NodeJS.Timeout | null = null;
  private lastCaptureTime = 0;
  private readonly RATE_LIMIT_MS = 1000; // Minimum 1 second between captures

  constructor() {
    Logger.info('🔍 [ScreenVision] Service initialized');
  }

  /**
   * Capture the primary screen and return as compressed base64
   */
  async captureScreen(): Promise<{ base64: string; mimeType: string } | null> {
    try {
      const now = Date.now();
      
      // Rate limiting
      if (now - this.lastCaptureTime < this.RATE_LIMIT_MS) {
        Logger.warning('🔍 [ScreenVision] Rate limited - too frequent captures');
        return null;
      }
      
      this.lastCaptureTime = now;
      
      Logger.info('🔍 [ScreenVision] Capturing screen...');
      const startTime = Date.now();

      // Get available sources
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });

      if (!sources || sources.length === 0) {
        Logger.error('🔍 [ScreenVision] No screen sources available');
        return null;
      }

      // Use primary screen (first source)
      const primarySource = sources[0];
      const thumbnail = primarySource.thumbnail;

      if (thumbnail.isEmpty()) {
        Logger.error('🔍 [ScreenVision] Screen capture is empty');
        return null;
      }

      // Convert to PNG buffer
      const imageBuffer = thumbnail.toPNG();
      
      // Save to temp file for compression
      const tempDir = os.tmpdir();
      const tempFileName = `screen-capture-${Date.now()}.png`;
      const tempFilePath = path.join(tempDir, tempFileName);
      
      await fs.promises.writeFile(tempFilePath, imageBuffer);
      
      // Compress for Gemini Vision
      const originalSize = imageBuffer.length;
      const compressionOptions = getOptimalCompressionSettings(originalSize);
      
      const compressedResult = await compressImage(tempFilePath, compressionOptions);
      
      // Cleanup temp file
      try {
        await fs.promises.unlink(tempFilePath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      if (!compressedResult) {
        Logger.error('🔍 [ScreenVision] Failed to compress screen capture');
        return null;
      }

      const captureTime = Date.now() - startTime;
      Logger.info(`🔍 [ScreenVision] Screen captured in ${captureTime}ms (${(compressedResult.compressedSize / 1024).toFixed(2)} KB)`);

      return {
        base64: compressedResult.data,
        mimeType: compressedResult.mimeType
      };

    } catch (error) {
      Logger.error('🔍 [ScreenVision] Failed to capture screen:', error);
      return null;
    }
  }

  /**
   * Analyze screen content with Gemini Vision
   */
  async analyzeScreen(prompt: string, geminiKey?: string): Promise<string | null> {
    if (!geminiKey) {
      Logger.error('🔍 [ScreenVision] No Gemini API key available');
      return null;
    }

    try {
      const screenCapture = await this.captureScreen();
      if (!screenCapture) {
        return null;
      }

      Logger.info('🔍 [ScreenVision] Analyzing screen with Gemini Vision...');
      
      // Call Gemini Vision API
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: prompt
              },
              {
                inline_data: {
                  mime_type: screenCapture.mimeType,
                  data: screenCapture.base64
                }
              }
            ]
          }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error('🔍 [ScreenVision] Gemini API error:', errorText);
        return null;
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
        const analysisText = result.candidates[0].content.parts[0].text;
        Logger.info('🔍 [ScreenVision] Analysis completed');
        return analysisText;
      } else {
        Logger.error('🔍 [ScreenVision] Invalid response format from Gemini');
        return null;
      }

    } catch (error) {
      Logger.error('🔍 [ScreenVision] Failed to analyze screen:', error);
      return null;
    }
  }

  /**
   * Enable screen vision with auto-disable timer
   */
  enable(autoDisableMs: number = 300000): void { // 5 minutes default
    if (this.isActive) return;
    
    this.isActive = true;
    Logger.info('🔍 [ScreenVision] Enabled');
    
    // Set auto-disable timer
    if (this.autoDisableTimer) {
      clearTimeout(this.autoDisableTimer);
    }
    
    this.autoDisableTimer = setTimeout(() => {
      this.disable();
      Logger.info('🔍 [ScreenVision] Auto-disabled after inactivity');
    }, autoDisableMs);
  }

  /**
   * Disable screen vision
   */
  disable(): void {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    if (this.autoDisableTimer) {
      clearTimeout(this.autoDisableTimer);
      this.autoDisableTimer = null;
    }
    
    Logger.info('🔍 [ScreenVision] Disabled');
  }

  /**
   * Check if screen vision is currently active
   */
  isScreenVisionActive(): boolean {
    return this.isActive;
  }

  /**
   * Reset the auto-disable timer (call when screen vision is used)
   */
  resetTimer(autoDisableMs: number = 300000): void {
    if (!this.isActive) return;
    
    if (this.autoDisableTimer) {
      clearTimeout(this.autoDisableTimer);
    }
    
    this.autoDisableTimer = setTimeout(() => {
      this.disable();
      Logger.info('🔍 [ScreenVision] Auto-disabled after inactivity');
    }, autoDisableMs);
  }
}
