import React, { useState } from 'react';

interface PermissionDialogProps {
  isOpen: boolean;
  onOpenSettings: () => void;
  onSkip: () => void;
  onTryAgain: () => void;
}

export const PermissionDialog: React.FC<PermissionDialogProps> = ({
  isOpen,
  onOpenSettings,
  onSkip,
  onTryAgain
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md mx-4">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl mb-6">
          <span className="material-icons-outlined text-blue-600 text-2xl">security</span>
        </div>
        
        {/* Content */}
        <h2 className="text-xl font-medium text-slate-900 mb-3">
          Accessibility Permissions Required
        </h2>
        <p className="text-slate-500 mb-8">
          Jarvis needs accessibility permissions to monitor the Fn key for push-to-talk. 
          This enables hands-free voice dictation.
        </p>
        
        {/* Actions */}
        <div className="space-y-3">
          <button 
            onClick={onOpenSettings}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
          >
            <span className="material-icons-outlined text-lg">settings</span>
            <span>Open System Settings</span>
          </button>
          
          <div className="flex space-x-3">
            <button 
              onClick={onTryAgain}
              className="flex-1 text-slate-600 hover:text-slate-900 transition-colors px-4 py-2 rounded-lg hover:bg-slate-50"
            >
              Try Again
            </button>
            <button 
              onClick={onSkip}
              className="flex-1 text-slate-600 hover:text-slate-900 transition-colors px-4 py-2 rounded-lg hover:bg-slate-50"
            >
              Skip for Now
            </button>
          </div>
        </div>
        
        {/* Helper text */}
        <p className="text-xs text-slate-400 mt-4 text-center">
          Go to System Settings → Privacy & Security → Accessibility and add Jarvis
        </p>
      </div>
    </div>
  );
};
