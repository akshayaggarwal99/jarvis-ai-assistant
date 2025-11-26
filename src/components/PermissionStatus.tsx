import React, { useState, useEffect } from 'react';

interface PermissionState {
  microphone: 'granted' | 'denied' | 'not-determined';
  accessibility: 'granted' | 'denied';
  notifications: 'granted' | 'denied' | 'default';
}

const PermissionStatus: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionState>({
    microphone: 'not-determined',
    accessibility: 'denied',
    notifications: 'default'
  });
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        if (!electronAPI) return;

        // Check initial status
        const micStatus = await electronAPI.checkPermissionStatus('microphone');
        const accessibilityStatus = await electronAPI.checkPermissionStatus('accessibility');
        
        setPermissions({
          microphone: micStatus.status,
          accessibility: accessibilityStatus.status === true || accessibilityStatus.status === 'granted' ? 'granted' : 'denied',
          notifications: Notification.permission as any
        });

        // Start monitoring for changes
        electronAPI.startPermissionMonitoring();
        
        electronAPI.onPermissionStatusChange((permission: string, status: string | boolean) => {
          const statusValue = status === true || status === 'granted' ? 'granted' : 
                            status === false || status === 'denied' ? 'denied' : 
                            status;
          
          setPermissions(prev => ({
            ...prev,
            [permission]: statusValue
          }));
        });

      } catch (error) {
        console.error('Failed to check permissions:', error);
      }
    };

    checkPermissions();

    return () => {
      try {
        const electronAPI = (window as any).electronAPI;
        electronAPI?.stopPermissionMonitoring();
      } catch (error) {
        console.error('Failed to stop permission monitoring:', error);
      }
    };
  }, []);

  const hasAllCorePermissions = permissions.microphone === 'granted' && permissions.accessibility === 'granted';
  const missingPermissions = [];
  
  if (permissions.microphone !== 'granted') missingPermissions.push('Microphone');
  if (permissions.accessibility !== 'granted') missingPermissions.push('Accessibility');

  const handleFixPermissions = async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) return;

      if (permissions.microphone !== 'granted') {
        await electronAPI.requestMicrophonePermission();
      }
      if (permissions.accessibility !== 'granted') {
        await electronAPI.requestAccessibilityPermission();
      }
    } catch (error) {
      console.error('Failed to request permissions:', error);
    }
  };

  if (hasAllCorePermissions) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm font-medium text-green-800">All Permissions Granted</span>
          </div>
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-green-600 hover:text-green-800"
          >
            {showDetails ? 'Hide' : 'Details'}
          </button>
        </div>
        
        {showDetails && (
          <div className="mt-3 pt-3 border-t border-green-200">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-green-700">Microphone</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-green-700">Accessibility</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  permissions.notifications === 'granted' ? 'bg-green-500' : 'bg-gray-300'
                }`}></span>
                <span className="text-green-700">Notifications</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start space-x-3">
        <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center mt-0.5">
          <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800 mb-1">
            Jarvis won't work - Missing {missingPermissions.join(' & ')}
          </h3>
          <p className="text-xs text-red-600 mb-3">
            {permissions.accessibility !== 'granted' && 'Fn key monitoring requires Accessibility permission. '}
            {permissions.microphone !== 'granted' && 'Voice dictation requires Microphone access.'}
          </p>
          
          <div className="flex items-center space-x-3">
            <button 
              onClick={handleFixPermissions}
              className="bg-red-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-red-700"
            >
              Fix Permissions
            </button>
            <button 
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          </div>
          
          {showDetails && (
            <div className="mt-3 pt-3 border-t border-red-200">
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-red-700">Microphone</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    permissions.microphone === 'granted' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {permissions.microphone}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-red-700">Accessibility</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    permissions.accessibility === 'granted' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {permissions.accessibility}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-red-700">Notifications</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    permissions.notifications === 'granted' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {permissions.notifications} (optional)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PermissionStatus;
