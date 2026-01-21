import { AudioProcessor } from '../audio/processor';
import { Logger } from '../core/logger';
import { AppContext } from '../interfaces/transcription';
import { AgentHandler } from './agent-handler';
import { AppState } from '../services/app-state';
import { AnalysisOverlayService } from '../services/analysis-overlay-service';

/**
 * Handles assistant command detection and processing
 * SIMPLIFIED VERSION - Only responds to explicit Jarvis keywords
 */
export class AssistantProcessor {
  private agentHandler: AgentHandler;
  private appState: AppState;
  private analysisOverlayService: AnalysisOverlayService;

  constructor() {
    this.agentHandler = AgentHandler.getInstance();
    this.appState = AppState.getInstance();
    this.analysisOverlayService = AnalysisOverlayService.getInstance();
  }

  /**
   * Process transcription with assistant command detection
   * SIMPLIFIED: Only processes as assistant if explicit "hey jarvis" keywords are present
   * OR when text is selected (>20 chars) with editing command patterns
   */
  async processWithAssistantDetection(
    transcriptText: string,
    appContext: AppContext,
    forceAssistant: boolean = false
  ): Promise<{ text: string; isAssistant: boolean }> {

    // 1. EXPLICIT JARVIS KEYWORD DETECTION (first few words)
    // More robust pattern that handles commas, periods, and various spacings
    const normalizedText = transcriptText.trim().toLowerCase();
    const firstPart = normalizedText.slice(0, 50); // Check first 50 chars for jarvis keyword

    // More flexible patterns to catch various transcription formats
    const hasJarvisKeyword =
      /^(hey|hi|okay|ok)[\s,.\-]*jarvis/i.test(firstPart) ||  // "hey jarvis", "hey, jarvis", "hey. jarvis"
      /^jarvis[\s,.\-]/i.test(firstPart);  // "jarvis, can you..."

    // 2. STRICT DICTATION MODE ENFORCEMENT
    // If detection was forced by upstream transcriber, we skip this check
    if (!forceAssistant && !hasJarvisKeyword) {
      // IMMEDIATE RETURN for pure dictation - NO overlay, NO processing
      Logger.info(`💬 [DICTATION] Pure dictation mode - no assistant triggers: "${transcriptText.substring(0, 50)}..."`);
      console.log(`[DEBUG_STDOUT] AssistantProcessor: Pure dictation mode, returning text. Force=${forceAssistant}`);
      this.appState.setDictationMode(true);
      return { text: transcriptText, isAssistant: false };
    }

    // Only continue if we have explicit Jarvis keyword OR it was forced
    Logger.info(`🤖 [ASSISTANT] Processing as assistant (Forced: ${forceAssistant}, Keyword: ${hasJarvisKeyword}): "${transcriptText.substring(0, 50)}..."`);
    console.log(`[DEBUG_STDOUT] AssistantProcessor: Passed dictation check. Force=${forceAssistant}, Keyword=${hasJarvisKeyword}`);

    this.appState.setDictationMode(false);

    // Process Jarvis command with agent handler
    const selectedTextForJarvis = await AudioProcessor.getSelectedTextReliable();

    // Check if text is selected - if so, assume this is a text editing command
    const hasSelectedText = selectedTextForJarvis && selectedTextForJarvis.length > 20;

    // ANY Jarvis command with selected text should be treated as direct text editing
    if (hasSelectedText) {
      // DIRECT TEXT EDITING - any Jarvis command with selected text bypasses agent tools
      Logger.info('✏️ [Assistant] Direct text editing mode - selected text detected, bypassing agent tools');

      try {
        // Get Gemini API key (same as the original agent system)
        const { SecureAPIService } = await import('../services/secure-api-service');
        const secureAPI = SecureAPIService.getInstance();
        const geminiApiKey = await secureAPI.getGeminiKey();

        if (!geminiApiKey) {
          throw new Error('Gemini API key not available');
        }

        // Create simple, direct prompt for text editing
        const directPrompt = `You are a text editor. When given a command and text, edit the text according to the command.

CRITICAL: Return ONLY the edited text with NO preamble, NO explanations, NO "here's your edited text" phrases, and NO additional commentary.

Command: ${transcriptText}

Selected text to edit:
${selectedTextForJarvis}

Return ONLY the modified text:`;

        // Use Gemini 2.5 Flash Lite (same as original agent system)
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + geminiApiKey, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: directPrompt }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2000
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const editedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (editedText) {
          Logger.info(`✅ [Assistant] Direct editing complete: "${editedText.substring(0, 50)}..."`);
          return { text: editedText, isAssistant: true };
        } else {
          throw new Error('No response from Gemini');
        }
      } catch (error) {
        Logger.error('❌ [Assistant] Direct editing failed:', error);
        // Fallback to original text
        return { text: selectedTextForJarvis, isAssistant: false };
      }
    }

    const userMessage = selectedTextForJarvis
      ? `Voice command: "${transcriptText}"\nSelected text: "${selectedTextForJarvis}"`
      : transcriptText;

    try {
      Logger.info('📞 [Assistant] Processing Jarvis command...');

      // SAFETY CHECK: Never show overlay during dictation mode
      // If forceAssistant is true, we bypass this check
      let isDictationMode = false;
      if (!forceAssistant) {
        isDictationMode = this.appState.getDictationMode();
      }



      if (isDictationMode && !forceAssistant) {
        Logger.warning('⚠️ [Assistant] Dictation mode active - skipping overlay and returning transcription');
        return { text: transcriptText, isAssistant: false };
      }

      // Check if this is a vision query for overlay handling
      const isVisionQuery = this.isVisionQuery(userMessage);

      // For vision queries, show analyzing overlay first
      if (isVisionQuery) {
        Logger.info('🔍 [Assistant] Vision query detected - showing analyzing overlay');
        try {
          this.analysisOverlayService.showOverlay('', true, 'Analyzing screen...');

          // Route all queries (including vision) through main processQuery for tiered agent

          const responseText = await this.agentHandler.processQuery(userMessage);
          Logger.info(`✅ [Assistant] Vision response: "${responseText.substring(0, 50)}..."`);

          // Send results to the already-visible overlay
          this.analysisOverlayService.sendAnalysisResult(responseText, false); // Vision query analysis - not conversation

          return { text: '', isAssistant: true }; // Return empty text so nothing gets pasted
        } catch (overlayError) {
          Logger.warning('⚠️ [Assistant] Failed to show overlay, falling back to paste:', overlayError);
          const responseText = await this.agentHandler.processQuery(userMessage);
          return { text: responseText, isAssistant: true };
        }
      }

      // Process regular assistant query (for non-text-editing commands)
      const responseText = await this.agentHandler.processQuery(userMessage);
      Logger.info(`✅ [Assistant] Response: "${responseText.substring(0, 50)}..."`);

      // SMART OVERLAY vs PASTE DECISION
      // Use FocusDetector to determine if user is actually in a text input field
      const { FocusDetector } = await import('../services/focus-detector');
      const focusDetector = FocusDetector.getInstance();

      // Use detailed focus detection for better debugging and Notes app support
      const focusInfo = await focusDetector.getFocusedElementInfo();
      Logger.debug(`🎯 [Assistant] Focus info: ${JSON.stringify(focusInfo)}`);

      // Enhanced text input detection for Notes app and other applications
      let isActuallyInTextInput = focusInfo.isTextInput ||
        focusInfo.role.includes('AXTextView') ||  // Notes app uses AXTextView
        focusInfo.role.includes('AXTextField') ||
        focusInfo.role.includes('AXTextArea') ||
        focusInfo.role.includes('AXComboBox') ||
        (focusInfo.application.toLowerCase().includes('notes') &&
          (focusInfo.role.includes('AXScrollArea') || focusInfo.role.includes('AXGroup')));

      // Fallbacks when AppleScript fails or returns unknown/error
      if (!isActuallyInTextInput && (focusInfo.role === 'error' || focusInfo.application === 'unknown')) {
        Logger.debug('🎯 [Assistant] Focus detection failed, applying fallbacks...');
        // 1) Fast simple check
        const fastCheck = await focusDetector.isInTextInputFast();
        if (fastCheck) {
          isActuallyInTextInput = true;
        } else {
          // 2) Heuristic by active app
          const activeApp = await AudioProcessor.getActiveApp();
          const likelyTextApps = /notes|textedit|pages|word|slack|messages|mail|gmail|chrome|safari|notion|bear|obsidian|evernote|telegram|whatsapp|teams|discord|vscode|code|electron/i;
          if (activeApp && likelyTextApps.test(activeApp)) {
            Logger.debug(`🎯 [Assistant] Heuristic: active app "${activeApp}" likely supports text input → defaulting to paste.`);
            isActuallyInTextInput = true;
          }
        }
      }

      Logger.debug(`🎯 [Assistant] Enhanced focus detection - In text input: ${isActuallyInTextInput}`);

      // Show overlay if user is NOT in a text input field
      // Paste only if user is actively in a text input field (regardless of selected text)
      const shouldShowOverlay = !isActuallyInTextInput;

      // FINAL SAFETY CHECK: Never show overlay if dictation mode is active
      let isDictationModeActive = this.appState.getDictationMode();



      if (isDictationModeActive && !forceAssistant) {
        Logger.warning('⚠️ [Assistant] Dictation mode detected at overlay decision - forcing paste');
        return { text: responseText, isAssistant: true };
      }

      if (shouldShowOverlay) {
        try {
          Logger.info('📊 [Assistant] Showing response in overlay (user not in text field)');

          // Show overlay with the response
          this.analysisOverlayService.showOverlay('', false); // Don't show loading, just show the result
          this.analysisOverlayService.sendAnalysisResult(responseText, true); // Conversational query - use Jarvis title

          return { text: '', isAssistant: true }; // Return empty so nothing gets pasted
        } catch (overlayError) {
          Logger.warning('⚠️ [Assistant] Failed to show overlay, falling back to paste:', overlayError);
          return { text: responseText, isAssistant: true };
        }
      }

      // User is in a text input field and expects text to be pasted
      Logger.info('📝 [Assistant] Pasting response directly (user in text input field)');
      return { text: responseText, isAssistant: true };
    } catch (error) {
      console.log(`[DEBUG_STDOUT] AssistantProcessor: EXCEPTION reached: ${error}`);
      Logger.error('❌ [Assistant] Processing failed:', error);
      return { text: transcriptText, isAssistant: false }; // Fallback to dictation
    }
  }

  /**
   * Check if a query is asking for vision analysis
   */
  private isVisionQuery(query: string): boolean {
    const visionKeywords = [
      'screen', 'see on my screen', 'what do you see', 'analyze my screen',
      'screenshot', 'what\'s displayed', 'what\'s on screen', 'look at my screen',
      'see this', 'analyze this screen', 'what am i looking at'
    ];

    const lowerQuery = query.toLowerCase();
    return visionKeywords.some(keyword => lowerQuery.includes(keyword));
  }

}
