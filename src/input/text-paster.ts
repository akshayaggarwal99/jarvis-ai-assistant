import { AudioProcessor } from '../audio/processor';
import { Logger } from '../core/logger';

/**
 * Handles text pasting with multiple fallback methods and smart spacing
 */
export class TextPaster {
  private static lastPasteTime: number = 0;
  private static lastPastedText: string = '';
  private static SPACE_TIMEOUT = 10000; // 10 seconds - add space if pasting within this window
  /**
   * Paste text with automatic fallback methods and smart spacing
   */
  async pasteText(text: string): Promise<void> {
    // Check if auto-paste is enabled (default: true, disabled if AUTO_PASTE=false)
    const autoPasteEnabled = process.env.AUTO_PASTE !== 'false';
    
    if (!autoPasteEnabled) {
      const keyReleaseTime = (global as any).keyReleaseTime || 0;
      const totalEndToEndTime = Date.now() - keyReleaseTime;
      Logger.performance('END-TO-END COMPLETE (no paste)', totalEndToEndTime);
      Logger.info(`📋 [No Paste] Transcription saved but not pasted (AUTO_PASTE=false): "${text.substring(0, 50)}..."`);
      return;
    }

    if (!text?.trim()) {
      Logger.warning('📋 [Paste] No text to paste');
      return;
    }

    // Add smart spacing for hands-free experience using simple time-based logic
    const smartText = this.addSimpleSmartSpacing(text);

    // Store globally for menu access (use original text for storage)
    (global as any).lastTranscription = text;

    // Check if we're in voice tutorial mode - if so, send to tutorial instead of pasting
    const isVoiceTutorialMode = (global as any).isVoiceTutorialMode;
    Logger.debug(`🎯 [Tutorial] Voice tutorial mode check: ${isVoiceTutorialMode}`);
    // Add explicit logging for tutorial mode check
    Logger.info(`🎯 [Tutorial] Checking tutorial mode: isVoiceTutorialMode = ${isVoiceTutorialMode}`);
    Logger.info(`🎯 [Tutorial] About to paste transcription: "${smartText}"`);
    
    if (isVoiceTutorialMode) {
      Logger.info('🎯 [Tutorial] Voice tutorial mode active - sending transcription to tutorial screen instead of pasting');
      
      // Send transcription to tutorial screen
      const { BrowserWindow } = require('electron');
      const windows = BrowserWindow.getAllWindows();
      Logger.info(`🎯 [Tutorial] Found ${windows.length} browser windows to send to`);
      
      windows.forEach((window, index) => {
        if (window && !window.isDestroyed()) {
          Logger.info(`🎯 [Tutorial] Sending tutorial-transcription to window ${index}: "${smartText}"`);
          window.webContents.send('tutorial-transcription', smartText);
        } else {
          Logger.info(`🎯 [Tutorial] Skipping destroyed window ${index}`);
        }
      });
      
      // Track timing for tutorial
      const pasteTime = 0; // No actual paste
      const keyReleaseTime = (global as any).keyReleaseTime || 0;
      const totalEndToEndTime = Date.now() - keyReleaseTime;
      
      Logger.performance('END-TO-END COMPLETE (tutorial)', totalEndToEndTime);
      Logger.info(`✅ [Tutorial] Transcription sent to tutorial screen in 0ms: "${smartText.substring(0, 50)}..."`);
      return;
    }

    // Use fast paste method for speed optimization
    try {
      const pasteStartTime = Date.now();
      await AudioProcessor.pasteText(smartText);
      TextPaster.lastPasteTime = Date.now(); // Track successful paste
      TextPaster.lastPastedText = smartText;
      const pasteTime = Date.now() - pasteStartTime;
      const keyReleaseTime = (global as any).keyReleaseTime || 0;
      const totalEndToEndTime = Date.now() - keyReleaseTime;
      
      Logger.performance('END-TO-END COMPLETE (pasted)', totalEndToEndTime);
      Logger.performance('Paste operation', pasteTime);
      Logger.info(`✅ [Paste] Successfully pasted in ${pasteTime}ms: "${smartText.substring(0, 50)}..."`);
    } catch (pasteError) {
      Logger.error('🚫 [Paste] Fast paste failed:', pasteError);
      
      // Fallback to direct typing only if fast paste fails
      try {
        const typeStartTime = Date.now();
        await this.pasteTextDirectly(smartText);
        TextPaster.lastPasteTime = Date.now(); // Track successful paste
        TextPaster.lastPastedText = smartText;
        const typeTime = Date.now() - typeStartTime;
        const keyReleaseTime = (global as any).keyReleaseTime || 0;
        const totalEndToEndTime = Date.now() - keyReleaseTime;
        
        Logger.performance('END-TO-END COMPLETE (typed)', totalEndToEndTime);
        Logger.performance('Type operation', typeTime);
        Logger.info(`✅ [Type] Fallback typing successful: "${smartText.substring(0, 50)}..."`);
      } catch (fallbackError) {
        Logger.error('🚫 [Type] All paste methods failed:', fallbackError);
        
        // Show user notification for complete paste failure
        AudioProcessor.showFailureNotification('Failed to paste transcription - Text copied to clipboard as backup');
        
        // Copy to clipboard as last resort
        await this.copyToClipboard(smartText);
      }
    }
  }

  /**
   * Add smart spacing and capitalization using simple time-based logic for hands-free experience
   * Much faster than cursor inspection - adds space if pasting within 10 seconds of last paste
   */
  private addSimpleSmartSpacing(text: string): string {
    const now = Date.now();
    const timeSinceLastPaste = now - TextPaster.lastPasteTime;
    
    // If we pasted something recently (within 10 seconds), add a space before new text
    if (TextPaster.lastPasteTime > 0 && timeSinceLastPaste < TextPaster.SPACE_TIMEOUT) {
      // Check if last text ended with sentence-ending punctuation
      const lastTextEndsWithSentence = TextPaster.lastPastedText && /[.!?]"?\s*$/.test(TextPaster.lastPastedText.trim());
      
      // Add space
      const spacedText = ` ${text}`;
      
      // Only adjust capitalization if the previous text didn't end a sentence
      const adjustedText = lastTextEndsWithSentence ? spacedText : this.adjustContinuationCapitalization(spacedText);
      
      Logger.info(`🔤 [Smart Spacing] Adding space${lastTextEndsWithSentence ? ' (new sentence)' : ' and adjusting caps'} (${timeSinceLastPaste}ms since last paste): "${adjustedText}"`);
      return adjustedText;
    }
    
    Logger.debug(`🔤 [Smart Spacing] No space needed (${timeSinceLastPaste}ms since last paste): "${text}"`);
    return text;
  }

  /**
   * Adjust capitalization for text that continues a previous sentence
   * Converts first letter to lowercase unless it's a proper noun or should remain capitalized
   */
  private adjustContinuationCapitalization(text: string): string {
    if (!text || text.length < 2) return text;
    
    // Skip if text doesn't start with space + capital letter
    if (text[0] !== ' ' || !/[A-Z]/.test(text[1])) return text;
    
    const firstWord = text.substring(1).split(/[\s,.!?;:]+/)[0];
    
    // Don't lowercase if it's likely a proper noun (keep common proper nouns capitalized)
    const properNouns = new Set([
      'I', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December', 'Google', 'Apple', 'Microsoft',
      'Amazon', 'Facebook', 'Twitter', 'LinkedIn', 'GitHub', 'OpenAI', 'ChatGPT',
      'Jarvis', 'CEO', 'API', 'AI', 'ML', 'USA', 'UK', 'EU'
    ]);
    
    // Keep capitalized if it's a known proper noun
    if (properNouns.has(firstWord)) {
      Logger.debug(`🔤 [Capitalization] Keeping capitalized (proper noun): "${firstWord}"`);
      return text;
    }
    
    // Check if this might be the start of a quoted sentence
    if (text.trim().startsWith('"') || text.trim().startsWith("'")) {
      Logger.debug(`🔤 [Capitalization] Keeping capitalized (quoted text): "${firstWord}"`);
      return text;
    }
    
    // If the word is all caps (like "VERY"), keep it as is
    if (firstWord === firstWord.toUpperCase() && firstWord.length > 1) {
      Logger.debug(`🔤 [Capitalization] Keeping all caps: "${firstWord}"`);
      return text;
    }
    
    // Convert first letter to lowercase for natural continuation
    const adjustedText = ` ${text[1].toLowerCase()}${text.substring(2)}`;
    Logger.debug(`🔤 [Capitalization] Adjusted for continuation: "${firstWord}" -> "${adjustedText.substring(1).split(' ')[0]}"`);
    return adjustedText;
  }

  /**
   * Ultra-fast paste using clipboard (optimized for speed)
   */
  private async pasteTextDirectly(text: string): Promise<void> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const pasteStartTime = Date.now();
      Logger.debug('Starting direct paste operation');
      Logger.debug(`Text length: ${text.length}`);
      Logger.debug(`Text preview: ${text.substring(0, 80)}`);
      
      // Use clipboard + Cmd+V for instant paste (much faster than keystroke)
      const copyProcess = spawn('pbcopy');
      
      copyProcess.stdin.write(text);
      copyProcess.stdin.end();
      
      copyProcess.on('close', (copyCode) => {
        if (copyCode === 0) {
          // Immediate paste with Cmd+V (fastest method)
          const pasteScript = 'tell application "System Events" to keystroke "v" using command down';
          const pasteProcess = spawn('osascript', ['-e', pasteScript]);
          
          pasteProcess.on('close', (pasteCode) => {
            const pasteTime = Date.now() - pasteStartTime;
            if (pasteCode === 0) {
              Logger.success(`Auto-pasted with clipboard preservation: ${text.substring(0, 50)}...`);
              Logger.performance('Direct paste operation', pasteTime);
              resolve();
            } else {
              reject(new Error(`Paste failed with code: ${pasteCode}`));
            }
          });
          
          // Shorter timeout for faster operations
          setTimeout(() => {
            pasteProcess.kill();
            reject(new Error('Paste timeout'));
          }, 1000);
          
        } else {
          reject(new Error(`Copy failed with code: ${copyCode}`));
        }
      });
      
      // Short timeout for copy operation
      setTimeout(() => {
        copyProcess.kill();
        reject(new Error('Copy timeout'));
      }, 500);
    });
  }

  /**
   * Copy text to clipboard as fallback
   */
  private async copyToClipboard(text: string): Promise<void> {
    try {
      const { spawn } = await import('child_process');
      const setClipboardScript = `
        tell application "System Events"
          set the clipboard to "${text.replace(/"/g, '\\"')}"
        end tell
      `;
      spawn('osascript', ['-e', setClipboardScript]);
      Logger.info('📋 [Clipboard] Text copied to clipboard as backup');
    } catch (clipboardError) {
      Logger.error('🚫 [Clipboard] Even clipboard backup failed:', clipboardError);
    }
  }
}
