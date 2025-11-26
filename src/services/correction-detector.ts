import { clipboard } from 'electron';
import { Logger } from '../core/logger';
import { DictionaryEntry } from './node-dictionary';

interface PasteEvent {
  text: string;
  timestamp: number;
  sessionId?: string;
}

interface CorrectionSuggestion {
  original: string;
  suggested: string;
  confidence: number;
  context: string;
}

export class CorrectionDetector {
  private lastPastedText: string | null = null;
  private lastPasteTime: number = 0;
  private monitoringWindow = 10000; // 10 seconds
  private clipboardMonitorInterval: NodeJS.Timeout | null = null;
  private onCorrectionDetected?: (suggestions: CorrectionSuggestion[]) => void;
  
  constructor(onCorrectionDetected?: (suggestions: CorrectionSuggestion[]) => void) {
    this.onCorrectionDetected = onCorrectionDetected;
  }

  /**
   * Start monitoring for corrections after Jarvis pastes text
   * Modified to be less intrusive and respect user clipboard
   */
  startMonitoring(pastedText: string, sessionId?: string): void {
    this.lastPastedText = pastedText;
    this.lastPasteTime = Date.now();
    
    Logger.debug(`[CorrectionDetector] Started monitoring for corrections: "${pastedText.substring(0, 50)}..."`);
    
    // Clear any existing monitoring
    this.stopMonitoring();
    
    // DISABLED: Clipboard monitoring to avoid interfering with user's clipboard
    // this.startClipboardMonitoring();
    
    // Auto-stop monitoring after the window expires
    setTimeout(() => {
      this.stopMonitoring();
    }, this.monitoringWindow);
  }

  /**
   * Stop monitoring for corrections
   */
  stopMonitoring(): void {
    if (this.clipboardMonitorInterval) {
      clearInterval(this.clipboardMonitorInterval);
      this.clipboardMonitorInterval = null;
      Logger.debug('[CorrectionDetector] Stopped monitoring');
    }
  }

  /**
   * Monitor clipboard for changes that might indicate corrections
   */
  private startClipboardMonitoring(): void {
    let lastClipboardContent = clipboard.readText();
    
    this.clipboardMonitorInterval = setInterval(() => {
      try {
        const currentClipboard = clipboard.readText();
        
        // If clipboard changed and it's different from what we pasted
        if (currentClipboard !== lastClipboardContent && 
            currentClipboard !== this.lastPastedText &&
            this.lastPastedText) {
          
          // Check if the new clipboard content looks like a correction
          const suggestions = this.detectCorrections(this.lastPastedText, currentClipboard);
          
          if (suggestions.length > 0) {
            Logger.info(`[CorrectionDetector] Detected ${suggestions.length} potential corrections`);
            this.onCorrectionDetected?.(suggestions);
            this.stopMonitoring(); // Stop after first detection
          }
        }
        
        lastClipboardContent = currentClipboard;
      } catch (error) {
        Logger.warning('[CorrectionDetector] Clipboard monitoring error:', error);
      }
    }, 3000); // Check every 3 seconds - less intrusive
  }

  /**
   * Analyze two texts to detect potential corrections
   */
  private detectCorrections(original: string, corrected: string): CorrectionSuggestion[] {
    const suggestions: CorrectionSuggestion[] = [];
    
    // Simple word-level comparison
    const originalWords = original.toLowerCase().split(/\s+/);
    const correctedWords = corrected.toLowerCase().split(/\s+/);
    
    // If the texts are very different, likely not a correction
    if (Math.abs(originalWords.length - correctedWords.length) > originalWords.length * 0.5) {
      return suggestions;
    }
    
    // Use a simple edit distance algorithm to find word replacements
    const wordMapping = this.findWordReplacements(originalWords, correctedWords);
    
    for (const [originalWord, correctedWord] of wordMapping) {
      // Filter out common words and very short words
      if (originalWord.length < 3 || this.isCommonWord(originalWord)) {
        continue;
      }
      
      // Calculate confidence based on edit distance and context
      const confidence = this.calculateConfidence(originalWord, correctedWord, original);
      
      if (confidence > 0.6) { // Only suggest high-confidence corrections
        suggestions.push({
          original: originalWord,
          suggested: correctedWord,
          confidence,
          context: this.extractContext(originalWord, original)
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Find word replacements between two text arrays
   */
  private findWordReplacements(original: string[], corrected: string[]): Map<string, string> {
    const replacements = new Map<string, string>();
    const minLength = Math.min(original.length, corrected.length);
    
    // Simple alignment - compare words at same positions
    for (let i = 0; i < minLength; i++) {
      if (original[i] !== corrected[i] && 
          this.isLikelyReplacement(original[i], corrected[i])) {
        replacements.set(original[i], corrected[i]);
      }
    }
    
    return replacements;
  }

  /**
   * Check if two words are likely replacements (similar but different)
   */
  private isLikelyReplacement(word1: string, word2: string): boolean {
    // Skip if same word
    if (word1 === word2) return false;
    
    // Skip if very different lengths
    if (Math.abs(word1.length - word2.length) > Math.max(word1.length, word2.length) * 0.5) {
      return false;
    }
    
    // Calculate edit distance
    const editDistance = this.calculateEditDistance(word1, word2);
    const maxLength = Math.max(word1.length, word2.length);
    
    // Words are likely replacements if they're similar but not identical
    return editDistance > 0 && editDistance / maxLength < 0.6;
  }

  /**
   * Calculate edit distance between two strings
   */
  private calculateEditDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate confidence score for a word replacement
   */
  private calculateConfidence(original: string, corrected: string, context: string): number {
    const editDistance = this.calculateEditDistance(original, corrected);
    const maxLength = Math.max(original.length, corrected.length);
    const similarity = 1 - (editDistance / maxLength);
    
    // Boost confidence for proper nouns or technical terms
    let contextBoost = 0;
    if (this.isProperNoun(corrected) || this.isTechnicalTerm(corrected)) {
      contextBoost = 0.2;
    }
    
    return Math.min(similarity + contextBoost, 1.0);
  }

  /**
   * Extract context around a word
   */
  private extractContext(word: string, text: string): string {
    const words = text.split(/\s+/);
    const index = words.findIndex(w => w.toLowerCase().includes(word.toLowerCase()));
    
    if (index === -1) return text.substring(0, 50);
    
    const start = Math.max(0, index - 2);
    const end = Math.min(words.length, index + 3);
    
    return words.slice(start, end).join(' ');
  }

  /**
   * Check if word is a common word that shouldn't be suggested
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
    ]);
    
    return commonWords.has(word.toLowerCase());
  }

  /**
   * Check if word is likely a proper noun
   */
  private isProperNoun(word: string): boolean {
    return word.length > 1 && word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase();
  }

  /**
   * Check if word is likely a technical term
   */
  private isTechnicalTerm(word: string): boolean {
    // Simple heuristics for technical terms
    return word.length > 4 && 
           (word.includes('_') || 
            word.includes('-') || 
            /[A-Z]{2,}/.test(word) || // Acronyms
            /\d/.test(word)); // Contains numbers
  }

  /**
   * Manual correction trigger - can be called from UI
   */
  manualCorrectionTrigger(originalText: string, correctedText: string): CorrectionSuggestion[] {
    Logger.info('[CorrectionDetector] Manual correction triggered');
    return this.detectCorrections(originalText, correctedText);
  }
}

export type { CorrectionSuggestion };
