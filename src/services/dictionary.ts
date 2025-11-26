interface DictionaryEntry {
  id: string;
  word: string;
  pronunciation?: string;
  context?: string;
  createdAt: string;
}

class DictionaryService {
  private storageKey = 'jarvis-dictionary';

  async getDictionary(): Promise<DictionaryEntry[]> {
    try {
      // Try to get from main process first (for electron)
      if ((window as any).electronAPI?.getDictionary) {
        return await (window as any).electronAPI.getDictionary();
      }
      
      // Fallback to localStorage (for web testing)
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  async saveDictionary(dictionary: DictionaryEntry[]): Promise<void> {
    try {
      // Save to main process (for electron)
      if ((window as any).electronAPI?.saveDictionary) {
        await (window as any).electronAPI.saveDictionary(dictionary);
      }
      
      // Also save to localStorage (for web testing)
      localStorage.setItem(this.storageKey, JSON.stringify(dictionary));
    } catch (error) {
      console.error('Failed to save dictionary:', error);
    }
  }

  async addWord(word: string, pronunciation?: string, context?: string): Promise<DictionaryEntry> {
    const entry: DictionaryEntry = {
      id: Date.now().toString(),
      word: word.trim(),
      pronunciation: pronunciation?.trim(),
      context: context?.trim(),
      createdAt: new Date().toISOString()
    };

    const dictionary = await this.getDictionary();
    dictionary.push(entry);
    await this.saveDictionary(dictionary);
    return entry;
  }

  async updateWord(id: string, updates: Partial<Pick<DictionaryEntry, 'word' | 'pronunciation' | 'context'>>): Promise<boolean> {
    const dictionary = await this.getDictionary();
    const index = dictionary.findIndex(entry => entry.id === id);
    
    if (index === -1) return false;
    
    dictionary[index] = { ...dictionary[index], ...updates };
    await this.saveDictionary(dictionary);
    return true;
  }

  async removeWord(id: string): Promise<boolean> {
    const dictionary = await this.getDictionary();
    const filtered = dictionary.filter(entry => entry.id !== id);
    
    if (filtered.length === dictionary.length) return false;
    
    await this.saveDictionary(dictionary);
    return true;
  }

  async getTranscriptionContext(): Promise<string> {
    const dictionary = await this.getDictionary();
    if (dictionary.length === 0) return '';

    const words = dictionary.map(entry => {
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
}

export const dictionaryService = new DictionaryService();
export type { DictionaryEntry };
