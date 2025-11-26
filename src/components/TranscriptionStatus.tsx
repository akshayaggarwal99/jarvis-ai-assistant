import React, { useState, useEffect } from 'react';

interface TranscriptionStatusProps {
  isTranscribing: boolean;
  transcriptionTime?: number;
  model?: string;
  onDismiss?: () => void;
}

const TranscriptionStatus: React.FC<TranscriptionStatusProps> = ({ 
  isTranscribing, 
  transcriptionTime = 0,
  model,
  onDismiss 
}) => {
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTranscribing) {
      setTimeElapsed(0);
      interval = setInterval(() => {
        setTimeElapsed(prev => prev + 100);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isTranscribing]);

  if (!isTranscribing && !transcriptionTime) return null;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const decimal = Math.floor((ms % 1000) / 100);
    return `${seconds}.${decimal}s`;
  };

  const getStatusColor = () => {
    if (isTranscribing) {
      if (timeElapsed < 1000) return 'bg-blue-500';
      if (timeElapsed < 3000) return 'bg-yellow-500';
      return 'bg-red-500';
    }
    return transcriptionTime < 2000 ? 'bg-green-500' : 'bg-yellow-500';
  };

  const getStatusText = () => {
    if (isTranscribing) {
      if (timeElapsed < 1000) return 'Processing...';
      if (timeElapsed < 3000) return 'Still working...';
      return 'This is taking longer than usual...';
    }
    return `Completed in ${formatTime(transcriptionTime)}`;
  };

  return (
    <div className="fixed top-20 right-6 bg-white border border-slate-200 rounded-xl shadow-lg p-4 max-w-sm z-50 transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${isTranscribing ? 'animate-pulse' : ''}`}></div>
          <span className="text-sm font-medium text-slate-900">
            {isTranscribing ? 'Transcribing' : 'Complete'}
          </span>
        </div>
        {!isTranscribing && onDismiss && (
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span className="material-icons-outlined text-sm">close</span>
          </button>
        )}
      </div>
      
      <p className="text-sm text-slate-600 mb-2">{getStatusText()}</p>
      
      {model && !isTranscribing && (
        <div className="text-xs text-slate-400">
          Using {model}
        </div>
      )}
      
      {isTranscribing && timeElapsed > 2000 && (
        <div className="text-xs text-slate-500 mt-2">
          Tip: Check your internet connection if this continues
        </div>
      )}
    </div>
  );
};

export default TranscriptionStatus;
