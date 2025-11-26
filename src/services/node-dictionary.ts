import fs from 'fs';
import path from 'path';
import { app } from 'electron';

interface DictionaryEntry {
  id: string;
  word: string;
  pronunciation?: string;
  context?: string;
  createdAt: string;
  // New fields for auto-suggestions
  isAutoSuggested?: boolean;
  confidence?: number;
  originalWord?: string;
  usageCount?: number;
}

interface DictionarySuggestion {
  originalWord: string;
  suggestedWord: string;
  context: string;
  confidence: number;
}

class NodeDictionaryService {
  private dictionaryPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dictionaryPath = path.join(userDataPath, 'jarvis-dictionary.json');
  }

  getDictionary(): DictionaryEntry[] {
    try {
      if (!fs.existsSync(this.dictionaryPath)) {
        return [];
      }
      const data = fs.readFileSync(this.dictionaryPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  saveDictionary(dictionary: DictionaryEntry[]): void {
    try {
      fs.writeFileSync(this.dictionaryPath, JSON.stringify(dictionary, null, 2));
    } catch (error) {
      console.error('Failed to save dictionary:', error);
    }
  }

  /**
   * Add a new dictionary entry
   */
  addEntry(word: string, pronunciation?: string, context?: string, isAutoSuggested = false, originalWord?: string, confidence?: number): DictionaryEntry {
    const dictionary = this.getDictionary();
    
    // Check if entry already exists
    const existingEntry = dictionary.find(entry => entry.word.toLowerCase() === word.toLowerCase());
    if (existingEntry) {
      // Update usage count and return existing entry
      existingEntry.usageCount = (existingEntry.usageCount || 0) + 1;
      this.saveDictionary(dictionary);
      return existingEntry;
    }
    
    const newEntry: DictionaryEntry = {
      id: Date.now().toString(),
      word,
      pronunciation,
      context,
      createdAt: new Date().toISOString(),
      isAutoSuggested,
      originalWord,
      confidence,
      usageCount: 1
    };
    
    dictionary.push(newEntry);
    this.saveDictionary(dictionary);
    
    return newEntry;
  }

  /**
   * Remove a dictionary entry
   */
  removeEntry(id: string): boolean {
    const dictionary = this.getDictionary();
    const index = dictionary.findIndex(entry => entry.id === id);
    
    if (index !== -1) {
      dictionary.splice(index, 1);
      this.saveDictionary(dictionary);
      return true;
    }
    
    return false;
  }

  /**
   * Update an existing dictionary entry
   */
  updateEntry(id: string, updates: Partial<DictionaryEntry>): boolean {
    const dictionary = this.getDictionary();
    const entry = dictionary.find(e => e.id === id);
    
    if (entry) {
      Object.assign(entry, updates);
      this.saveDictionary(dictionary);
      return true;
    }
    
    return false;
  }

  /**
   * Process auto-suggestions from correction detector
   */
  processSuggestions(suggestions: DictionarySuggestion[]): DictionaryEntry[] {
    const newEntries: DictionaryEntry[] = [];
    
    for (const suggestion of suggestions) {
      // Only add high-confidence suggestions automatically
      if (suggestion.confidence > 0.8) {
        const entry = this.addEntry(
          suggestion.suggestedWord,
          undefined, // No pronunciation provided
          suggestion.context,
          true, // Mark as auto-suggested
          suggestion.originalWord,
          suggestion.confidence
        );
        newEntries.push(entry);
      }
    }
    
    return newEntries;
  }

  /**
   * Get pending auto-suggestions that need user approval
   */
  getPendingSuggestions(): DictionaryEntry[] {
    const dictionary = this.getDictionary();
    return dictionary.filter(entry => entry.isAutoSuggested && entry.confidence && entry.confidence <= 0.8);
  }

  /**
   * Approve a pending auto-suggestion
   */
  approveSuggestion(id: string): boolean {
    return this.updateEntry(id, { isAutoSuggested: false });
  }

  /**
   * Get dictionary entries that might apply to given text
   */
  getRelevantEntries(text: string): DictionaryEntry[] {
    const dictionary = this.getDictionary();
    const textLower = text.toLowerCase();
    
    return dictionary.filter(entry => {
      // Check if the original word (that was corrected) appears in the text
      if (entry.originalWord && textLower.includes(entry.originalWord.toLowerCase())) {
        return true;
      }
      
      // Check if the context is relevant
      if (entry.context && this.hasContextOverlap(entry.context, text)) {
        return true;
      }
      
      return false;
    });
  }

  /**
   * Check if two contexts have overlapping keywords
   */
  private hasContextOverlap(context1: string, context2: string): boolean {
    const words1 = context1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const words2 = context2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    const overlap = words1.filter(word => words2.includes(word));
    return overlap.length > 0;
  }

  /**
   * Apply dictionary replacements to text (post-processing approach)
   * This is more reliable than relying on prompts alone
   */
  applyDictionary(text: string): string {
    const dictionary = this.getDictionary();
    if (dictionary.length === 0) {
      return text;
    }
    
    let result = text;
    
    // Sort by usage count (most used first) and word length (longer first)
    const sortedEntries = dictionary
      .filter(entry => !entry.isAutoSuggested || entry.confidence && entry.confidence > 0.8)
      .sort((a, b) => {
        const usageA = a.usageCount || 0;
        const usageB = b.usageCount || 0;
        if (usageA !== usageB) return usageB - usageA;
        return b.word.length - a.word.length;
      });
    
    // Apply dictionary corrections
    for (const entry of sortedEntries) {
      const targetWord = entry.word;
      const originalText = result;
      
      // 1. Replace exact originalWord if specified (e.g., "kislev" -> "Kisslove")
      if (entry.originalWord) {
        const regex = new RegExp(`\\b${this.escapeRegex(entry.originalWord)}\\b`, 'gi');
        result = result.replace(regex, targetWord);
        if (result !== originalText) {
          console.log(`📖 [Dictionary] Applied originalWord correction: "${entry.originalWord}" -> "${targetWord}"`);
        }
      }
      
      // 2. Apply phonetic variations (e.g., "Kislev" -> "Kisslove")
      const phoneticVariations = this.generatePhoneticVariations(targetWord);
      for (const variation of phoneticVariations) {
        const beforeText = result;
        const regex = new RegExp(`\\b${this.escapeRegex(variation)}\\b`, 'gi');
        result = result.replace(regex, targetWord);
        if (result !== beforeText) {
          console.log(`📖 [Dictionary] Applied phonetic correction: "${variation}" -> "${targetWord}"`);
        }
      }
      
      // 3. Common misspellings for the target word itself
      const commonMisspellings = this.generateCommonMisspellings(targetWord);
      for (const misspelling of commonMisspellings) {
        const beforeText = result;
        const regex = new RegExp(`\\b${this.escapeRegex(misspelling)}\\b`, 'gi');
        result = result.replace(regex, targetWord);
        if (result !== beforeText) {
          console.log(`📖 [Dictionary] Applied misspelling correction: "${misspelling}" -> "${targetWord}"`);
        }
      }
    }
    
    if (result !== text) {
      console.log(`📖 [Dictionary] Final correction: "${text}" -> "${result}"`);
    }
    
    return result;
  }

  /**
   * Generate common misspellings for a word
   */
  private generateCommonMisspellings(word: string): string[] {
    const misspellings: string[] = [];
    const lowerWord = word.toLowerCase();
    
    // Remove one character at a time (common typing errors)
    for (let i = 0; i < word.length; i++) {
      const variant = word.slice(0, i) + word.slice(i + 1);
      if (variant.length > 2) misspellings.push(variant);
    }
    
    // Replace last few characters (common speech recognition errors)
    if (word.length > 4) {
      const base = word.slice(0, -2);
      misspellings.push(base + 'ev', base + 'ev', base + 'ov', base + 'ove');
    }
    
    return misspellings;
  }

  /**
   * Generate common phonetic variations for a word
   */
  private generatePhoneticVariations(word: string): string[] {
    const variations: string[] = [];
    
    // General patterns for proper names
    // Replace double letters with single
    if (word.match(/(.)\1/)) {
      variations.push(word.replace(/(.)\1/g, '$1'));
    }
    
    // Add space between likely syllable breaks for longer words
    if (word.length > 6) {
      const midPoint = Math.floor(word.length / 2);
      variations.push(`${word.substring(0, midPoint)} ${word.substring(midPoint)}`);
    }
    
    // Common phonetic patterns
    const lowerWord = word.toLowerCase();
    
    // Replace 'oo' with 'u' and vice versa
    if (lowerWord.includes('oo')) {
      variations.push(word.replace(/oo/gi, 'u'));
    }
    if (lowerWord.includes('u')) {
      variations.push(word.replace(/u/gi, 'oo'));
    }
    
    // Replace 'ph' with 'f' and vice versa
    if (lowerWord.includes('ph')) {
      variations.push(word.replace(/ph/gi, 'f'));
    }
    if (lowerWord.includes('f') && !lowerWord.includes('ph')) {
      variations.push(word.replace(/f/gi, 'ph'));
    }
    
    return variations;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getTranscriptionContext(): string {
    const dictionary = this.getDictionary();
    if (dictionary.length === 0) return '';

    // Filter to only active entries (not pending auto-suggestions)
    const activeEntries = dictionary.filter(entry => 
      !entry.isAutoSuggested || (entry.confidence && entry.confidence > 0.8)
    );

    if (activeEntries.length === 0) return '';

    const words = activeEntries.map(entry => {
      let context = `"${entry.word}"`;
      if (entry.pronunciation) {
        context += ` (pronounced: ${entry.pronunciation})`;
      }
      if (entry.context) {
        context += ` - ${entry.context}`;
      }
      return context;
    }).join(', ');

    return `Custom dictionary words to consider: ${words}`;
  }

  /**
   * Get dictionary words for transcription context
   * Returns keywords for transcription boosting (without context wrapper to avoid prompt leakage)
   */
  getWordsForTranscription(): string {
    const dictionary = this.getDictionary();
    if (dictionary.length === 0) {
      return '';
    }
    
    // Get top frequently used words as simple keywords
    const keywords = dictionary
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 15) // Limit to top 15 words
      .map(entry => entry.word);
    
    if (keywords.length === 0) return '';
    
    // Return just the keywords without any context wrapper to prevent prompt leakage
    return keywords.join(', ');
  }

  /**
   * Clear all dictionary entries (called on sign out)
   */
  clearDictionary(): void {
    try {
      if (fs.existsSync(this.dictionaryPath)) {
        fs.unlinkSync(this.dictionaryPath);
        console.log('Dictionary cleared on sign out');
      }
    } catch (error) {
      console.error('Failed to clear dictionary:', error);
    }
  }
}

export const nodeDictionaryService = new NodeDictionaryService();
export type { DictionaryEntry, DictionarySuggestion };
