import { Logger } from '../core/logger';
import { spawnSync } from 'child_process';

/**
 * Service to detect if the currently focused element is a text input field
 * Uses macOS accessibility APIs to automatically determine text input context
 */
export class FocusDetector {
  private static instance: FocusDetector;

  private constructor() {}

  static getInstance(): FocusDetector {
    if (!FocusDetector.instance) {
      FocusDetector.instance = new FocusDetector();
    }
    return FocusDetector.instance;
  }

  /**
   * Run AppleScript safely via spawnSync to avoid shell quoting issues
   */
  private runAppleScript(script: string, timeoutMs = 100): { ok: boolean; out: string; err?: string } {
    try {
      const res = spawnSync('osascript', ['-e', script], {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 1024 * 64,
      });
      if (res.status === 0) {
        return { ok: true, out: (res.stdout || '').trim() };
      }
      return { ok: false, out: '', err: (res.stderr || '').trim() };
    } catch (e: any) {
      return { ok: false, out: '', err: e?.message || String(e) };
    }
  }

  /**
   * Check if the currently focused element is a text input field
   * This uses macOS accessibility APIs to determine the focused element type
   */
  async isInTextInputField(): Promise<boolean> {
    try {
      const script = `
        tell application "System Events"
          try
            set focusedElement to focused of (first application process whose frontmost is true)
            set elementRole to role of focusedElement
            -- Check if the focused element is a text input
            if elementRole is "AXTextField" or elementRole is "AXTextArea" or elementRole is "AXComboBox" or elementRole is "AXTextView" then
              return "text_input"
            else if elementRole is "AXWebArea" then
              try
                set elementEdit to editable of focusedElement
                if elementEdit is true then
                  return "text_input"
                end if
              end try
              return "web_content"
            else
              return elementRole
            end if
          on error errorMessage
            return "error:" & errorMessage
          end try
        end tell`;

      const { ok, out, err } = this.runAppleScript(script, 500);
      const result = ok ? out : `error:${err || 'unknown'}`;

      Logger.debug(`🎯 [FocusDetector] Focused element result: "${result}"`);

      // Check if the result indicates a text input
      const isTextInput = result === 'text_input' || 
                         result.includes('AXTextField') || 
                         result.includes('AXTextArea') ||
                         result.includes('AXComboBox') ||
                         result.includes('AXTextView');

      Logger.debug(`🎯 [FocusDetector] Is text input: ${isTextInput}`);
      return isTextInput;

    } catch (error) {
      Logger.debug(`🎯 [FocusDetector] Error checking focus: ${error}`);
      // Fallback to false if we can't determine focus
      return false;
    }
  }

  /**
   * Get detailed information about the currently focused element
   * Useful for debugging and understanding focus context
   */
  async getFocusedElementInfo(): Promise<{
    role: string;
    description: string;
    isTextInput: boolean;
    application: string;
  }> {
    try {
      const script = `
        tell application "System Events"
          try
            set frontApp to (first application process whose frontmost is true)
            set appName to name of frontApp
            set focusedElement to focused of frontApp
            set elementRole to role of focusedElement
            set elementDescription to description of focusedElement
            
            -- Check if it's a text input
            set isTextInput to false
            if elementRole is "AXTextField" or elementRole is "AXTextArea" or elementRole is "AXComboBox" or elementRole is "AXTextView" then
              set isTextInput to true
            else if elementRole is "AXWebArea" then
              try
                set elementEdit to editable of focusedElement
                if elementEdit is true then
                  set isTextInput to true
                end if
              end try
            end if
            
            return appName & "|" & elementRole & "|" & elementDescription & "|" & isTextInput
          on error errorMessage
            return "unknown|error|" & errorMessage & "|false"
          end try
        end tell`;

      const { ok, out, err } = this.runAppleScript(script, 1500);
      const raw = ok ? out : `unknown|error|${err || 'unknown'}|false`;

      const parts = raw.split('|');
      return {
        application: parts[0] || 'unknown',
        role: parts[1] || 'unknown',
        description: parts[2] || '',
        isTextInput: parts[3] === 'true'
      };

    } catch (error) {
      Logger.debug(`🎯 [FocusDetector] Error getting focus info: ${error}`);
      return {
        application: 'unknown',
        role: 'error',
        description: String(error),
        isTextInput: false
      };
    }
  }

  /**
   * Fast check using a simpler approach for performance
   * This is less detailed but faster for frequent checks
   */
  async isInTextInputFast(): Promise<boolean> {
    try {
      const script = `
        tell application "System Events"
          try
            set elementRole to role of (focused of (first application process whose frontmost is true))
            if elementRole is "AXTextField" or elementRole is "AXTextArea" or elementRole is "AXComboBox" or elementRole is "AXTextView" then
              return "true"
            else
              return "false"
            end if
          on error
            return "false"
          end try
        end tell`;

      const { ok, out } = this.runAppleScript(script, 900);
      return ok && out.trim() === 'true';

    } catch (error) {
      Logger.debug(`🎯 [FocusDetector] Fast check error: ${error}`);
      return false;
    }
  }
}
