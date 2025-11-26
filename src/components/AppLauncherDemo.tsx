import React, { useState, useEffect } from 'react';
import { contextSuggestionsService, SmartSuggestion } from '../services/context-suggestions-service';
import { appLauncherService } from '../services/app-launcher-service';

interface AppLauncherDemoProps {
  onCommandSubmit?: (command: string) => void;
  className?: string;
}

export const AppLauncherDemo: React.FC<AppLauncherDemoProps> = ({ 
  onCommandSubmit, 
  className = '' 
}) => {
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastExecuted, setLastExecuted] = useState<string>('');

  // Load suggestions on component mount
  useEffect(() => {
    loadSuggestions();
  }, []);

  // Update suggestions when input changes
  useEffect(() => {
    if (currentInput.length > 2) {
      const contextualSuggestions = contextSuggestionsService.getContextualSuggestions(currentInput, 5);
      setSuggestions(contextualSuggestions);
    } else {
      loadSuggestions();
    }
  }, [currentInput]);

  const loadSuggestions = () => {
    const quickSuggestions = contextSuggestionsService.getQuickSuggestions();
    const contextual = contextSuggestionsService.getContextualSuggestions('', 3);
    setSuggestions([...quickSuggestions, ...contextual].slice(0, 6));
  };

  const handleSuggestionClick = async (suggestion: SmartSuggestion) => {
    setIsLoading(true);
    setCurrentInput(suggestion.text);
    
    try {
      // Execute the command
      const intent = await appLauncherService.parseIntent(suggestion.text);
      const success = await appLauncherService.executeIntent(intent);
      
      if (success) {
        setLastExecuted(suggestion.text);
        contextSuggestionsService.recordAction(suggestion.text, suggestion.category);
      }
      
      // Notify parent component
      if (onCommandSubmit) {
        onCommandSubmit(suggestion.text);
      }
    } catch (error) {
      console.error('Failed to execute command:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualCommand = async (command: string) => {
    if (!command.trim()) return;
    
    setIsLoading(true);
    
    try {
      const intent = await appLauncherService.parseIntent(command);
      const success = await appLauncherService.executeIntent(intent);
      
      if (success) {
        setLastExecuted(command);
        contextSuggestionsService.recordAction(command);
      }
      
      if (onCommandSubmit) {
        onCommandSubmit(command);
      }
    } catch (error) {
      console.error('Failed to execute command:', error);
    } finally {
      setIsLoading(false);
      setCurrentInput('');
    }
  };

  const getCategoryIcon = (category: string): string => {
    switch (category) {
      case 'productivity': return '💼';
      case 'entertainment': return '🎵';
      case 'social': return '👥';
      case 'shopping': return '🛒';
      default: return '🔍';
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-blue-600';
    if (confidence >= 0.4) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <div className={`app-launcher-demo p-6 bg-white rounded-lg shadow-lg ${className}`}>
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-gray-800 mb-2">
          🚀 Jarvis Universal App Launcher
        </h3>
        <p className="text-gray-600">
          Say anything like "Open YouTube and search for cats" or "Play music on Spotify"
        </p>
      </div>

      {/* Manual Command Input */}
      <div className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleManualCommand(currentInput)}
            placeholder="Try: 'Open YouTube and search for cats'"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={() => handleManualCommand(currentInput)}
            disabled={isLoading || !currentInput.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '⏳' : '▶️'}
          </button>
        </div>
      </div>

      {/* Last Executed Command */}
      {lastExecuted && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800">
            ✅ Last executed: <span className="font-medium">"{lastExecuted}"</span>
          </p>
        </div>
      )}

      {/* Smart Suggestions */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-700 mb-3">
          💡 Smart Suggestions
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="suggestion-card p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getCategoryIcon(suggestion.category)}</span>
                  <span className="font-medium text-gray-800">{suggestion.text}</span>
                </div>
                <span className={`text-sm font-medium ${getConfidenceColor(suggestion.confidence)}`}>
                  {Math.round(suggestion.confidence * 100)}%
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{suggestion.reason}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Example Commands */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-semibold text-gray-700 mb-2">📋 Example Commands</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <div><strong>Apps:</strong> "Open Spotify", "Launch Visual Studio Code", "Start Terminal"</div>
          <div><strong>Websites:</strong> "Go to YouTube", "Open facebook.com", "Navigate to github.com"</div>
          <div><strong>Searches:</strong> "Search for pizza near me", "YouTube search funny cats", "Amazon buy headphones"</div>
          <div><strong>Complex:</strong> "Open YouTube and search for jazz music", "Play relaxing sounds on Spotify"</div>
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="animate-spin text-4xl mb-2">⚙️</div>
            <p className="text-gray-600">Executing command...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppLauncherDemo;
