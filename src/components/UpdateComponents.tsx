import React, { useState, useEffect } from 'react';

interface UpdateNotificationProps {
  isVisible: boolean;
  version: string;
  releaseNotes: string;
  isMajor?: boolean; // New prop for major updates
  onDownload: () => void;
  onDismiss: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  isVisible,
  version,
  releaseNotes,
  isMajor = false, // Default to false for minor updates
  onDownload,
  onDismiss
}) => {
  if (!isVisible) return null;

  // Major update gets center modal treatment
  if (isMajor) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div 
          className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8 max-w-md mx-4"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)'
          }}
        >
          {/* Modern update icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-white/10 to-white/5 rounded-2xl mb-6 backdrop-blur-sm border border-white/10">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          
          {/* Content */}
          <h2 className="text-xl font-semibold text-white mb-3 tracking-tight">
            Major Update Available
          </h2>
          <h3 className="text-lg font-medium text-white mb-4">
            Jarvis {version}
          </h3>
          <p className="text-white/70 mb-8 leading-relaxed text-sm">
            {releaseNotes}
          </p>
          
          {/* Modern actions for major updates */}
          <div className="flex flex-col space-y-3">
            <button 
              onClick={onDownload}
              className="w-full bg-gradient-to-r from-white/20 to-white/10 text-white px-6 py-3 rounded-xl font-medium hover:from-white/30 hover:to-white/20 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl border border-white/20"
            >
              Download & Install
            </button>
            <button 
              onClick={onDismiss}
              className="w-full text-white/70 hover:text-white transition-colors px-4 py-2 rounded-xl hover:bg-white/10 backdrop-blur-sm"
            >
              Remind me later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Regular update notification (top-right corner) with glass-morphism
  return (
    <div 
      className="fixed top-4 right-4 rounded-2xl shadow-2xl p-6 max-w-sm z-50 backdrop-blur-xl border border-white/20"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(255, 255, 255, 0.1)'
      }}
    >
      {/* Close button */}
      <button 
        onClick={onDismiss}
        className="absolute top-3 right-3 text-white/50 hover:text-white/80 transition-colors p-1 hover:bg-white/10 rounded-lg"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Icon */}
      <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-white/10 to-white/5 rounded-xl mb-4 backdrop-blur-sm border border-white/10">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </div>
      
      {/* Content */}
      <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">
        Update Available
      </h3>
      <p className="text-sm text-white/80 mb-1">
        Jarvis {version} is ready to download
      </p>
      <p className="text-xs text-white/60 mb-4 leading-relaxed">
        {releaseNotes}
      </p>
      
      {/* Action button */}
      <button 
        onClick={onDownload}
        className="w-full bg-gradient-to-r from-white/20 to-white/10 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:from-white/30 hover:to-white/20 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl border border-white/20"
      >
        Install
      </button>
    </div>
  );
};

interface UpdateProgressProps {
  isVisible: boolean;
  progress: number;
}

export const UpdateProgress: React.FC<UpdateProgressProps> = ({
  isVisible,
  progress
}) => {
  if (!isVisible) return null;

  return (
    <div 
      className="fixed top-4 right-4 rounded-2xl shadow-2xl p-6 max-w-sm z-50 backdrop-blur-xl border border-white/20"
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(255, 255, 255, 0.1)'
      }}
    >
      {/* Icon */}
      <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-white/10 to-white/5 rounded-xl mb-4 backdrop-blur-sm border border-white/10">
        <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
        </svg>
      </div>
      
      {/* Content */}
      <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">
        {progress < 100 ? 'Downloading Update' : 'Installing Update'}
      </h3>
      <p className="text-sm text-white/70 mb-4">
        {progress < 100 ? `${Math.round(progress)}% complete` : 'Installing new version...'}
      </p>
      
      {/* Modern progress bar */}
      <div className="w-full bg-white/10 rounded-full h-2 backdrop-blur-sm border border-white/10">
        <div 
          className="bg-gradient-to-r from-white/20 to-white/10 h-2 rounded-full transition-all duration-300 shadow-sm"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

interface UpdateReadyProps {
  isVisible: boolean;
  onRestart: () => void;
  onLater: () => void;
}

export const UpdateReady: React.FC<UpdateReadyProps> = ({
  isVisible,
  onRestart,
  onLater
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div 
        className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8 max-w-md mx-4"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Success icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-2xl mb-6 backdrop-blur-sm border border-white/10">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        {/* Content */}
        <h2 className="text-xl font-semibold text-white mb-3 tracking-tight">
          Update Ready
        </h2>
        <p className="text-white/70 mb-8 leading-relaxed text-sm">
          The update has been installed successfully! 
          Jarvis will restart automatically in a few seconds.
        </p>
        
        {/* Modern actions */}
        <div className="flex space-x-3">
          <button 
            onClick={onRestart}
            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-3 rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            Restart Now
          </button>
          <button 
            onClick={onLater}
            className="flex-1 text-white/70 hover:text-white transition-colors px-4 py-3 rounded-xl hover:bg-white/10 backdrop-blur-sm"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};
