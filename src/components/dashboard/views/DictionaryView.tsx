/**
 * Dictionary view component
 */
import React from 'react';
import { theme, themeComponents } from '../../../styles/theme';

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

interface DictionaryViewProps {
  entries: DictionaryEntry[];
  showAddWord: boolean;
  newWord: string;
  newPronunciation: string;
  onShowAddWord: (show: boolean) => void;
  onNewWordChange: (value: string) => void;
  onNewPronunciationChange: (value: string) => void;
  onAddEntry: () => void;
  onRemoveEntry: (id: string) => void;
}

export const DictionaryView: React.FC<DictionaryViewProps> = ({
  entries,
  showAddWord,
  newWord,
  newPronunciation,
  onShowAddWord,
  onNewWordChange,
  onNewPronunciationChange,
  onAddEntry,
  onRemoveEntry,
}) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className={`${theme.text.primary} mb-2`}>Dictionary</h2>
          <p className={`${theme.text.secondary}`}>Manage custom words for better transcription</p>
        </div>
        <button
          onClick={() => onShowAddWord(true)}
          className={`${theme.glass.secondary} ${theme.text.primary} px-4 py-2 ${theme.radius.xl} font-medium hover:bg-white/[0.06] transition-all duration-200 flex items-center space-x-2 ${theme.shadow}`}
        >
          <span className="material-icons-outlined text-lg">add</span>
          <span>Add Word</span>
        </button>
      </div>

      {/* Add Word Modal */}
      {showAddWord && (
        <div className={`fixed inset-0 ${theme.background.modal} flex items-center justify-center z-50`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 w-full max-w-md ${theme.shadow}`}>
            <h3 className={`text-lg font-medium ${theme.text.primary} mb-4`}>Add Custom Word</h3>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${theme.text.secondary} mb-1`}>Word</label>
                <input
                  type="text"
                  value={newWord}
                  onChange={(e) => onNewWordChange(e.target.value)}
                  className={`w-full ${themeComponents.input}`}
                  placeholder="e.g., Kubernetes"
                  autoFocus
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${theme.text.secondary} mb-1`}>Pronunciation (optional)</label>
                <input
                  type="text"
                  value={newPronunciation}
                  onChange={(e) => onNewPronunciationChange(e.target.value)}
                  className={`w-full ${themeComponents.input}`}
                  placeholder="e.g., koo-ber-NET-eez"
                />
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={onAddEntry}
                className={`${theme.glass.secondary} ${theme.text.primary} px-4 py-2 ${theme.radius.lg} font-medium hover:bg-white/[0.06] transition-all duration-200 ${theme.shadow}`}
              >
                Add Word
              </button>
              <button
                onClick={() => {
                  onShowAddWord(false);
                  onNewWordChange('');
                  onNewPronunciationChange('');
                }}
                className={`${theme.text.tertiary} px-4 py-2 ${theme.radius.lg} hover:bg-white/[0.03] transition-all duration-200`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dictionary Entries */}
      <div className="space-y-3">
        {entries.length === 0 ? (
          <div className="text-center py-12">
            <div className={`${theme.text.quaternary} mb-4`}>
              <span className="material-icons-outlined text-4xl">book</span>
            </div>
            <h3 className={`text-lg font-medium ${theme.text.secondary} mb-2`}>No words in dictionary</h3>
            <p className={`${theme.text.tertiary} text-sm mb-4`}>Add custom words to improve transcription accuracy</p>
            <button
              onClick={() => onShowAddWord(true)}
              className={`${theme.glass.secondary} ${theme.text.primary} px-4 py-2 ${theme.radius.lg} font-medium hover:bg-white/[0.06] transition-all duration-200 ${theme.shadow}`}
            >
              Add Your First Word
            </button>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={`${theme.glass.primary} ${theme.radius.xl} p-4 flex items-center justify-between ${theme.shadow}`}>
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <div className={`font-medium ${theme.text.primary}`}>{entry.word}</div>
                  {entry.isAutoSuggested && (
                    <span className={`${theme.glass.secondary} ${theme.text.primary} text-xs px-2 py-1 rounded-full`}>Auto-added</span>
                  )}
                </div>
                {entry.pronunciation && (
                  <div className={`text-sm ${theme.text.tertiary} mt-1`}>Pronounced: {entry.pronunciation}</div>
                )}
                {entry.context && (
                  <div className={`text-xs ${theme.text.quaternary} mt-1`}>Context: {entry.context}</div>
                )}
                {entry.usageCount && entry.usageCount > 1 && (
                  <div className={`text-xs ${theme.text.quaternary} mt-1`}>Used {entry.usageCount} times</div>
                )}
              </div>
              <button
                onClick={() => onRemoveEntry(entry.id)}
                className={`${theme.text.tertiary} hover:text-red-400 transition-colors`}
                title="Remove word"
              >
                <span className="material-icons-outlined text-lg">delete</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
