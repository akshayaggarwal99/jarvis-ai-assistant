/**
 * Hook for update notification management
 */
import { useState, useEffect, useCallback } from 'react';

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export function useUpdateNotifications() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) return;

    const handleUpdateAvailable = (_event: any, info: UpdateInfo) => {
      setUpdateAvailable(true);
      setUpdateInfo(info);
    };

    const handleDownloadProgress = (_event: any, progress: number) => {
      setDownloadProgress(progress);
      setIsDownloading(progress > 0 && progress < 100);
    };

    const handleUpdateDownloaded = () => {
      setIsDownloading(false);
      setUpdateReady(true);
      setDownloadProgress(100);
    };

    // Set up listeners
    electronAPI.onUpdateAvailable?.(handleUpdateAvailable);
    electronAPI.onDownloadProgress?.(handleDownloadProgress);
    electronAPI.onUpdateDownloaded?.(handleUpdateDownloaded);

    // Check for updates on mount
    electronAPI.checkForUpdates?.();

    return () => {
      electronAPI.removeUpdateListeners?.();
    };
  }, []);

  const downloadUpdate = useCallback(async () => {
    try {
      setIsDownloading(true);
      await (window as any).electronAPI?.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
      setIsDownloading(false);
    }
  }, []);

  const installUpdate = useCallback(() => {
    (window as any).electronAPI?.installUpdate();
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
    setUpdateInfo(null);
  }, []);

  return {
    updateAvailable,
    updateInfo,
    downloadProgress,
    isDownloading,
    updateReady,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
  };
}
