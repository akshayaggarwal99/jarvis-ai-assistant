import * as fs from 'fs';
import { spawn } from 'child_process';
import { Logger } from '../core/logger';
import * as PasteHelper from './paste-helper';

export class AudioProcessor {
  // Selected text cache for reliability
  private static selectedTextCache = { 
    text: null as string | null, 
    timestamp: 0, 
    isValid: false 
  };
  private static readonly SELECTED_TEXT_CACHE_DURATION = 1000; // 1 second cache
  
  /**
   * Safely deletes an audio file with error handling
   */
  static cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        Logger.debug(`Cleaned up audio file: ${filePath}`);
      }
    } catch (error) {
      Logger.warning(`Failed to cleanup audio file: ${filePath}`, error);
    }
  }

  /**
   * Validates audio file exists and has minimum size
   */
  static validateAudioFile(filePath: string, minSizeBytes = 4000): boolean { // Reduced from 16KB to 4KB
    if (!fs.existsSync(filePath)) {
      Logger.warning(`Audio file not found: ${filePath}`);
      return false;
    }

    const stats = fs.statSync(filePath);
    if (stats.size < minSizeBytes) {
      Logger.warning(`Audio file too small (${stats.size} bytes), likely silence or noise`);
      return false;
    }

    Logger.debug(`Audio file validated: ${stats.size} bytes`);
    return true;
  }

  /**
   * Check if the app has system permissions for accessibility (with caching)
   * Delegates to PasteHelper
   */
  static async checkSystemPermissions(): Promise<boolean> {
    return PasteHelper.checkSystemPermissions();
  }

  /**
   * Force refresh permission status (useful after long uptime)
   */
  static forcePermissionRefresh(): void {
    PasteHelper.forcePermissionRefresh();
  }

  /**
   * Show a notification when paste fails
   */
  static showFailureNotification(message: string): void {
    PasteHelper.showFailureNotification(message);
  }

  /**
   * Show a success notification
   */
  static showSuccessNotification(message: string): void {
    PasteHelper.showSuccessNotification(message);
  }

  /**
   * Auto-pastes text directly using AppleScript with enhanced reliability
   * Preserves formatting and user's clipboard
   */
  static async pasteText(text: string): Promise<void> {
    try {
      console.log('🔧 [Paste] Starting paste operation...');
      console.log('🔧 [Paste] Text length:', text.length);
      console.log('🔧 [Paste] Text preview:', text.substring(0, 100));
      
      // Check system permissions
      const hasPermission = await PasteHelper.checkSystemPermissions();
      
      if (!hasPermission) {
        console.error('🚫 [Paste] System Events permission denied');
        PasteHelper.showFailureNotification('Permission denied - Enable Jarvis in System Preferences > Security & Privacy > Privacy > Accessibility');
        return;
      }
      
      // Validate text
      if (!text || text.trim().length === 0) {
        Logger.warning('Paste attempted with empty text');
        return;
      }
      
      // Use fast paste method first - it's more reliable for atomic pasting
      let success = await PasteHelper.fastPasteMethod(text);
      
      if (success) {
        Logger.success(`Auto-pasted via fast method: ${text.substring(0, 50)}...`);
        return;
      }
      
      // Check if we're in Notes app and try Notes-specific formatting
      const activeApp = await PasteHelper.getActiveApp();
      if (activeApp && activeApp.toLowerCase().includes('notes')) {
        Logger.info('📝 [Notes] Detected Notes app, using enhanced formatting');
        success = await PasteHelper.pasteToNotesApp(text);
        
        if (success) {
          Logger.success(`Auto-pasted to Notes app: ${text.substring(0, 50)}...`);
          return;
        }
      }
      
      // Fallback to direct keystroke method
      success = await PasteHelper.pasteWithDirectKeystroke(text);
      
      if (success) {
        Logger.success(`Auto-pasted with keystroke method: ${text.substring(0, 50)}...`);
        return;
      }
      
      // If both methods fail, show error
      Logger.error('🚫 [Paste] All paste methods failed');
      PasteHelper.showFailureNotification('Failed to paste text - Check app permissions');
      
    } catch (error) {
      Logger.error('Failed to paste text:', error);
      PasteHelper.showFailureNotification('Paste error - Check app permissions');
    }
  }

  /**
   * Try multiple paste methods for better reliability
   */
  static async tryPasteMethods(text: string): Promise<boolean> {
    // Method 1: Fast native paste
    try {
      const method1Success = await PasteHelper.fastPasteMethod(text);
      if (method1Success) return true;
    } catch (error) {
      Logger.warning('Paste method 1 failed:', error);
    }

    // Method 2: Direct keystroke method
    try {
      const method2Success = await PasteHelper.pasteWithDirectKeystroke(text);
      if (method2Success) return true;
    } catch (error) {
      Logger.warning('Paste method 2 failed:', error);
    }

    // Method 3: Focus and paste method
    try {
      const method3Success = await PasteHelper.pasteWithFocusCheck(text);
      if (method3Success) return true;
    } catch (error) {
      Logger.warning('Paste method 3 failed:', error);
    }

    return false;
  }

  /**
   * Simple AppleScript-based paste method - delegates to PasteHelper
   */
  static async pasteWithNativeMethod(text: string): Promise<boolean> {
    return PasteHelper.pasteWithDirectKeystroke(text);
  }

  /**
   * Paste method with direct keystroke - delegates to PasteHelper
   */
  static async pasteWithDirectKeystroke(text: string): Promise<boolean> {
    return PasteHelper.pasteWithDirectKeystroke(text);
  }

  /**
   * Paste method with focus verification - delegates to PasteHelper
   */
  static async pasteWithFocusCheck(text: string): Promise<boolean> {
    return PasteHelper.pasteWithFocusCheck(text);
  }

  /**
   * Get currently selected text from any application with reliability improvements
   */
  static async getSelectedText(): Promise<string | null> {
    // Check cache first for rapid successive calls
    const now = Date.now();
    if (this.selectedTextCache.isValid && 
        (now - this.selectedTextCache.timestamp) < this.SELECTED_TEXT_CACHE_DURATION) {
      Logger.debug(`📋 [SelectedText] Using cached result: ${this.selectedTextCache.text?.substring(0, 30) || 'null'}...`);
      return this.selectedTextCache.text;
    }

    try {
      Logger.debug('📋 [SelectedText] Retrieving selected text...');
      
      const script = `
        tell application "System Events"
          try
            -- Try to save current clipboard safely
            set savedClipboard to ""
            try
              set savedClipboard to the clipboard as string
            on error
              -- If clipboard is empty or contains non-text data, start with empty
              set savedClipboard to ""
            end try
            
            -- Use a unique test marker to detect if copy actually worked
            set testMarker to "JARVIS_TEST_MARKER_" & (random number from 1000 to 9999)
            set the clipboard to testMarker
            delay 0.1
            
            -- Copy selection to clipboard
            keystroke "c" using command down
            delay 0.2
            
            -- Get the new clipboard content
            set newClipboard to ""
            try
              set newClipboard to the clipboard as string
            on error
              set newClipboard to ""
            end try
            
            -- Check if the clipboard changed from our test marker
            set hasSelection to (newClipboard is not equal to testMarker and newClipboard is not equal to "")
            
            -- Restore original clipboard immediately
            try
              set the clipboard to savedClipboard
            on error
              set the clipboard to ""
            end try
            
            -- Return selected text only if something was actually selected
            if hasSelection then
              return newClipboard
            else
              return ""
            end if
            
          on error errMsg
            -- Restore clipboard on error
            try
              set the clipboard to savedClipboard
            on error
              set the clipboard to ""
            end try
            return "ERROR: " & errMsg
          end try
        end tell
      `;
      
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn('osascript', ['-e', script]);
        let output = '';
        let error = '';
        
        proc.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
          error += data.toString();
        });
        
        proc.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error(`AppleScript failed with code ${code}: ${error}`));
          }
        });
        
        // Increased timeout for reliability
        setTimeout(() => {
          proc.kill();
          reject(new Error('Selected text retrieval timeout (4s)'));
        }, 4000);
      });
      
      const selectedText = result.trim();
      
      // Check if we got an error message back
      if (selectedText.startsWith('ERROR:')) {
        Logger.warning(`📋 [SelectedText] AppleScript error: ${selectedText}`);
        this.selectedTextCache = { text: null, timestamp: now, isValid: true };
        return null;
      }
      
      // Cache the result
      const finalText = selectedText.length > 0 ? selectedText : null;
      this.selectedTextCache = { text: finalText, timestamp: now, isValid: true };
      
      Logger.debug(`📋 [SelectedText] Retrieved: ${finalText?.substring(0, 50) || 'null'}${finalText && finalText.length > 50 ? '...' : ''}`);
      
      return finalText;
    } catch (error) {
      Logger.warning('📋 [SelectedText] Failed to get selected text:', error);
      // Cache the failure to avoid immediate retries
      this.selectedTextCache = { text: null, timestamp: now, isValid: true };
      return null;
    }
  }

  /**
   * Clear selected text cache - call this when text selection might have changed
   */
  static clearSelectedTextCache(): void {
    this.selectedTextCache = { text: null, timestamp: 0, isValid: false };
    Logger.debug('📋 [SelectedText] Cache cleared');
  }

  /**
   * Get selected text with fallback handling for different contexts
   * Standardized method that handles all edge cases consistently
   */
  static async getSelectedTextReliable(): Promise<string | null> {
    const maxRetries = 2;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.getSelectedText();
        if (result !== null || attempt === maxRetries) {
          return result;
        }
        // Wait briefly before retry
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        lastError = error as Error;
        Logger.debug(`📋 [SelectedText] Attempt ${attempt} failed:`, error);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    Logger.warning(`📋 [SelectedText] All ${maxRetries} attempts failed:`, lastError);
    return null;
  }

  /**
   * Ultra-fast paste method for streaming transcription
   * Uses fast clipboard method while preserving formatting
   */
  static async instantPasteText(text: string): Promise<void> {
    if (!text || text.trim().length === 0) return;
    
    try {
      Logger.debug(`⚡ [InstantPaste] Using fast clipboard method: "${text.substring(0, 50)}..."`);
      
      // Use fast paste method for streaming scenarios
      const success = await PasteHelper.fastPasteMethod(text);
      
      if (success) {
        Logger.success(`⚡ [InstantPaste] Success: ${text.substring(0, 50)}...`);
      } else {
        // Fallback to regular paste if fast method fails
        Logger.warning('⚡ [InstantPaste] Fast method failed, using fallback');
        await this.pasteText(text);
      }
    } catch (error) {
      Logger.error('⚡ [InstantPaste] Failed:', error);
      await this.pasteText(text);
    }
  }

  /**
   * Ultra-fast paste method for simple text - delegates to PasteHelper
   */
  static async simpleFastPaste(text: string): Promise<boolean> {
    return PasteHelper.simpleFastPaste(text);
  }

  /**
   * Fast paste method using native module - delegates to PasteHelper
   */
  static async fastPasteMethod(text: string): Promise<boolean> {
    return PasteHelper.fastPasteMethod(text);
  }

  /**
   * Direct typing method (no clipboard) - delegates to PasteHelper
   */
  static async directTypeMethod(text: string): Promise<boolean> {
    return PasteHelper.directTypeMethod(text);
  }

  /**
   * Gmail/web app pasting method - delegates to PasteHelper
   */
  static async pasteForWebApps(text: string): Promise<boolean> {
    return PasteHelper.pasteForWebApps(text);
  }

  /**
   * Get the currently active application name - delegates to PasteHelper
   */
  static async getActiveApp(): Promise<string | null> {
    return PasteHelper.getActiveApp();
  }

  /**
   * Paste text to Notes app - delegates to PasteHelper
   */
  static async pasteToNotesApp(text: string): Promise<boolean> {
    return PasteHelper.pasteToNotesApp(text);
  }
}
