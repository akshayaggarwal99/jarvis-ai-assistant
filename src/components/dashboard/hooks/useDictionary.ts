/**
 * Hook for dictionary management
 */
import { useState, useCallback } from 'react';

export interface DictionaryEntry {
  id: string;
  word: string;
  pronunciation?: string;
  context?: string;
  createdAt: string;
  isAutoSuggested?: boolean;
  confidence?: number;
  originalWord?: string;
  usageCount?: number;
}

export function useDictionary() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [showAddWord, setShowAddWord] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newPronunciation, setNewPronunciation] = useState('');

  const loadEntries = useCallback(async () => {
    try {
      const response = await (window as any).electronAPI?.getDictionary();
      if (response) {
        setEntries(response);
      }
    } catch (error) {
      console.error('Failed to load dictionary:', error);
    }
  }, []);

  const addEntry = useCallback(async () => {
    if (!newWord.trim()) return;
    
    try {
      await (window as any).electronAPI?.addDictionaryEntry(newWord, newPronunciation || undefined);
      setNewWord('');
      setNewPronunciation('');
      setShowAddWord(false);
      await loadEntries();
    } catch (error) {
      console.error('Failed to add dictionary entry:', error);
    }
  }, [newWord, newPronunciation, loadEntries]);

  const removeEntry = useCallback(async (id: string) => {
    try {
      await (window as any).electronAPI?.removeDictionaryEntry(id);
      await loadEntries();
    } catch (error) {
      console.error('Failed to remove dictionary entry:', error);
    }
  }, [loadEntries]);

  return {
    entries,
    showAddWord,
    setShowAddWord,
    newWord,
    setNewWord,
    newPronunciation,
    setNewPronunciation,
    loadEntries,
    addEntry,
    removeEntry,
  };
}
