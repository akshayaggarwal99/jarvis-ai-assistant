/**
 * Paste Helper Module
 * 
 * Handles text pasting operations using AppleScript and native methods.
 * Extracted from processor.ts to improve modularity.
 */

import * as fs from 'fs';
import { spawn } from 'child_process';
import { Logger } from '../core/logger';

// Permission caching
let lastPermissionCheck = 0;
const permissionCheckInterval = 5 * 60 * 1000; // 5 minutes
let cachedPermissionStatus = true;

// Fast permission cache for paste operations
const fastPermissionCache = { valid: false, timestamp: 0 };
const FAST_CACHE_DURATION = 30000; // 30 seconds

/**
 * Check if the app has system permissions for accessibility (with caching)
 */
export async function checkSystemPermissions(): Promise<boolean> {
  const now = Date.now();
  
  // Use cached result if check was recent
  if (now - lastPermissionCheck < permissionCheckInterval) {
    return cachedPermissionStatus;
  }
  
  try {
    const testScript = `
      tell application "System Events"
        return true
      end tell
    `;
    
    const result = await new Promise<boolean>((resolve) => {
      const proc = spawn('osascript', ['-e', testScript]);
      let output = '';
      let error = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      proc.on('close', (code) => {
        if (code === 0 && output.trim() === 'true') {
          resolve(true);
        } else {
          Logger.warning('System Events permission check failed:', error);
          resolve(false);
        }
      });
      
      // Timeout after 3 seconds
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 3000);
    });
    
    // Update cache
    lastPermissionCheck = now;
    cachedPermissionStatus = result;
    
    if (result) {
      Logger.debug('System permissions verified');
    } else {
      Logger.warning('System permissions check failed - may need to re-enable accessibility permissions');
    }
    
    return result;
    
  } catch (error) {
    Logger.error('Permission check failed:', error);
    cachedPermissionStatus = false;
    return false;
  }
}

/**
 * Force refresh permission status (useful after long uptime)
 */
export function forcePermissionRefresh(): void {
  lastPermissionCheck = 0;
  cachedPermissionStatus = false;
  Logger.info('Permission cache cleared - will re-check on next paste operation');
}

/**
 * Show a notification when paste fails
 */
export function showFailureNotification(message: string): void {
  try {
    const notificationScript = `
      display notification "${message}" with title "Jarvis - Paste Failed" sound name "Glass"
    `;
    spawn('osascript', ['-e', notificationScript]);
    Logger.warning('Paste failure notification shown:', message);
  } catch (error) {
    Logger.error('Failed to show notification:', error);
  }
}

/**
 * Show a success notification
 */
export function showSuccessNotification(message: string): void {
  try {
    const notificationScript = `
      display notification "${message}" with title "Jarvis" sound name "Hero"
    `;
    spawn('osascript', ['-e', notificationScript]);
    Logger.info('Success notification shown:', message);
  } catch (error) {
    Logger.error('Failed to show notification:', error);
  }
}

/**
 * Get the currently active application name
 */
export async function getActiveApp(): Promise<string | null> {
  return new Promise((resolve) => {
    const applescript = `
      tell application "System Events"
        try
          set frontApp to name of first application process whose frontmost is true
          return frontApp
        on error errMsg
          return "error: " & errMsg
        end try
      end tell
    `;
    
    const result = spawn('osascript', ['-e', applescript]);
    let output = '';
    
    result.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    result.on('close', (code) => {
      const appName = output.trim();
      if (code === 0 && !appName.startsWith('error:')) {
        resolve(appName);
      } else {
        resolve(null);
      }
    });
    
    setTimeout(() => {
      result.kill();
      resolve(null);
    }, 2000);
  });
}

/**
 * Fast native paste method using typing_monitor module
 */
export async function fastPasteMethod(text: string): Promise<boolean> {
  try {
    const startTime = Date.now();
    
    // Try to load the native module using webpack externals
    let typingMonitor;
    try {
      typingMonitor = require('typing_monitor');
    } catch (webpackError) {
      return false; // Fall back to AppleScript
    }
    
    if (typeof typingMonitor.fastPasteText !== 'function') {
      return false;
    }
    
    const success = typingMonitor.fastPasteText(text);
    const pasteTime = Date.now() - startTime;
    
    if (success) {
      Logger.info(`🔧 [Native Paste] Ultra-fast paste completed in ${pasteTime}ms`);
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Paste method with direct keystroke
 */
export async function pasteWithDirectKeystroke(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tempFile = `/tmp/jarvis_paste_direct_${Date.now()}.txt`;
    
    try {
      fs.writeFileSync(tempFile, text, 'utf8');
      
      const applescript = `
        tell application "System Events"
          try
            set textFile to POSIX file "${tempFile}"
            set fileRef to open for access textFile
            set fileContent to read fileRef as «class utf8»
            close access fileRef
            
            set the clipboard to fileContent
            delay 1.0
            keystroke "v" using command down
            return "success"
          on error errMsg
            return "error: " & errMsg
          end try
        end tell
      `;
      
      const result = spawn('osascript', ['-e', applescript]);
      let output = '';
      
      result.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      result.on('close', (code) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        
        const success = code === 0 && output.includes('success');
        resolve(success);
      });
      
      setTimeout(() => {
        result.kill();
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        resolve(false);
      }, 10000);
      
    } catch (error) {
      Logger.error('Failed to create temp file for direct paste:', error);
      resolve(false);
    }
  });
}

/**
 * Paste method with focus verification
 */
export async function pasteWithFocusCheck(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tempFile = `/tmp/jarvis_paste_focus_${Date.now()}.txt`;
    
    try {
      fs.writeFileSync(tempFile, text, 'utf8');
      
      const applescript = `
        tell application "System Events"
          try
            -- Get the frontmost application
            set frontApp to name of first application process whose frontmost is true
            
            -- Read text from file
            set textFile to POSIX file "${tempFile}"
            set fileRef to open for access textFile
            set fileContent to read fileRef as «class utf8»
            close access fileRef
            
            -- Set clipboard and paste
            set the clipboard to fileContent
            delay 1.0
            
            -- Make sure we're still in the same app
            tell application process frontApp
              keystroke "v" using command down
            end tell
            
            return "success"
          on error errMsg
            return "error: " & errMsg
          end try
        end tell
      `;
      
      const result = spawn('osascript', ['-e', applescript]);
      let output = '';
      
      result.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      result.on('close', (code) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        
        const success = code === 0 && output.includes('success');
        resolve(success);
      });
      
      setTimeout(() => {
        result.kill();
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        resolve(false);
      }, 10000);
      
    } catch (error) {
      Logger.error('Failed to create temp file for focus paste:', error);
      resolve(false);
    }
  });
}

/**
 * Paste text to Notes app with enhanced timing
 */
export async function pasteToNotesApp(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tempFile = `/tmp/jarvis_notes_paste_${Date.now()}.txt`;
    
    try {
      fs.writeFileSync(tempFile, text, 'utf8');
      
      const applescript = `
        tell application "System Events"
          try
            -- Save current clipboard
            set savedClipboard to ""
            try
              set savedClipboard to the clipboard as string
            end try
            
            -- Read text from file
            set textFile to POSIX file "${tempFile}"
            set fileRef to open for access textFile
            set fileContent to read fileRef as «class utf8»
            close access fileRef
            
            -- Set clipboard and paste
            set the clipboard to fileContent
            delay 0.5
            keystroke "v" using command down
            delay 0.5
            
            -- Restore original clipboard
            try
              set the clipboard to savedClipboard
            end try
            
            return "success"
          on error errMsg
            try
              set the clipboard to savedClipboard
            end try
            return "error: " & errMsg
          end try
        end tell
      `;
      
      const result = spawn('osascript', ['-e', applescript]);
      let output = '';
      let errorOutput = '';
      
      result.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      result.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      result.on('close', (code) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        
        const success = code === 0 && output.includes('success');
        if (!success && errorOutput) {
          Logger.warning(`📝 [NotesApp] AppleScript error: ${errorOutput.trim()}`);
        }
        if (success) {
          Logger.info(`✅ [NotesApp] Successfully pasted to Notes app`);
        }
        resolve(success);
      });
      
      setTimeout(() => {
        result.kill();
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        Logger.warning('⏱️ [NotesApp] Timeout - operation took too long');
        resolve(false);
      }, 8000);
      
    } catch (error) {
      Logger.error('❌ [NotesApp] Paste error:', error);
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {}
      resolve(false);
    }
  });
}

/**
 * Gmail/web app pasting method with aggressive clipboard handling
 */
export async function pasteForWebApps(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tempFile = `/tmp/jarvis_webapp_paste_${Date.now()}.txt`;
    
    try {
      fs.writeFileSync(tempFile, text, 'utf8');
      
      const applescript = `
        tell application "System Events"
          try
            -- Get current app for targeting
            set frontApp to name of first application process whose frontmost is true
            
            -- Save clipboard
            set savedClipboard to the clipboard as string
            
            -- Read from temp file
            set textFile to POSIX file "${tempFile}"
            set fileRef to open for access textFile
            set fileContent to read fileRef as «class utf8»
            close access fileRef
            
            -- Set clipboard
            set the clipboard to fileContent
            delay 0.5
            
            -- For web apps like Gmail, try multiple paste approaches
            tell application process frontApp
              -- First try: Standard Cmd+V
              keystroke "v" using command down
              delay 0.2
              
              -- Second try: Focus and paste (for stubborn text areas)
              key code 48 using command down -- Tab to ensure focus
              delay 0.1
              keystroke "v" using command down
            end tell
            
            delay 0.5
            
            -- Restore clipboard
            set the clipboard to savedClipboard
            return "success"
          on error errMsg
            try
              set the clipboard to savedClipboard
            end try
            return "error: " & errMsg
          end try
        end tell
      `;
      
      const result = spawn('osascript', ['-e', applescript]);
      let output = '';
      let errorOutput = '';
      
      result.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      result.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      result.on('close', (code) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        
        const success = code === 0 && output.includes('success');
        if (!success && errorOutput) {
          Logger.warning(`📧 [WebAppPaste] AppleScript error: ${errorOutput.trim()}`);
        }
        if (success) {
          Logger.info(`📧 [WebAppPaste] Successfully pasted text for web app: ${text.substring(0, 50)}...`);
        }
        resolve(success);
      });
      
      setTimeout(() => {
        result.kill();
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        Logger.warning('📧 [WebAppPaste] Timeout - operation took too long');
        resolve(false);
      }, 15000);
      
    } catch (error) {
      Logger.error('WebAppPaste file error:', error);
      resolve(false);
    }
  });
}

/**
 * Direct typing method (no clipboard) - only for simple unformatted text
 */
export async function directTypeMethod(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Skip direct typing for formatted text to avoid destroying newlines
    if (text.includes('\n') || text.includes('\t')) {
      Logger.info('📝 [DirectType] Skipping direct typing for formatted text');
      resolve(false);
      return;
    }
    
    const tempFile = `/tmp/jarvis_type_${Date.now()}.txt`;
    
    try {
      fs.writeFileSync(tempFile, text, 'utf8');
      
      const applescript = `
        tell application "System Events"
          try
            -- Read text from file
            set textFile to POSIX file "${tempFile}"
            set fileRef to open for access textFile
            set fileContent to read fileRef as «class utf8»
            close access fileRef
            
            -- Type the content directly (for simple text only)
            keystroke fileContent
            return "success"
          on error errMsg
            return "error: " & errMsg
          end try
        end tell
      `;
      
      const result = spawn('osascript', ['-e', applescript]);
      let output = '';
      
      result.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      result.on('close', (code) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        
        const success = code === 0 && output.includes('success');
        resolve(success);
      });
      
      setTimeout(() => {
        result.kill();
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        resolve(false);
      }, 6000);
      
    } catch (error) {
      Logger.error('DirectTypeMethod file error:', error);
      resolve(false);
    }
  });
}

/**
 * Ultra-fast paste method for simple text - no file I/O, minimal delays
 */
export async function simpleFastPaste(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const applescript = `
      tell application "System Events"
        try
          set the clipboard to "${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
          delay 0.1
          keystroke "v" using command down
          return "success"
        on error errMsg
          return "error: " & errMsg
        end try
      end tell
    `;
    
    const result = spawn('osascript', ['-e', applescript]);
    let output = '';
    
    result.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    result.on('close', (code) => {
      const success = code === 0 && output.includes('success');
      resolve(success);
    });
    
    // Quick timeout - fail fast if it doesn't work
    setTimeout(() => {
      result.kill();
      resolve(false);
    }, 500);
  });
}
