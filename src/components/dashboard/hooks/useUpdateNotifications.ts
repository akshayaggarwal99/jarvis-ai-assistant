/**
 * Hook for update notification management
 */
import { useState, useEffect, useCallback } from 'react';

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

// Anonymous update funnel — fires only when Settings.analytics is on AND
// the build has a PostHog key. Coarse signals only: version string,
// download progress milestones, click counts. No URL bodies, no user IDs.
function capture(event: string, props: Record<string, any> = {}) {
  try {
    const api = (window as any).electronAPI;
    api?.posthogCapture?.(event, props);
  } catch {
    /* never let analytics break update flow */
  }
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
      capture('update_dialog_shown', { latest_version: info?.version });
    };

    const handleDownloadProgress = (_event: any, progress: number) => {
      setDownloadProgress(progress);
      setIsDownloading(progress > 0 && progress < 100);
    };

    const handleUpdateDownloaded = () => {
      setIsDownloading(false);
      setUpdateReady(true);
      setDownloadProgress(100);
      capture('update_download_complete');
    };

    // Set up listeners
    electronAPI.onUpdateAvailable?.(handleUpdateAvailable);
    electronAPI.onDownloadProgress?.(handleDownloadProgress);
    electronAPI.onUpdateDownloaded?.(handleUpdateDownloaded);

    // Check for updates on mount
    capture('update_check_initiated', { trigger: 'app_open' });
    electronAPI.checkForUpdates?.();

    return () => {
      electronAPI.removeUpdateListeners?.();
    };
  }, []);

  const downloadUpdate = useCallback(async () => {
    try {
      capture('update_download_clicked', { version: updateInfo?.version });
      setIsDownloading(true);
      await (window as any).electronAPI?.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
      capture('update_download_failed', { version: updateInfo?.version });
      setIsDownloading(false);
    }
  }, [updateInfo]);

  const installUpdate = useCallback(() => {
    capture('update_install_clicked', { version: updateInfo?.version });
    (window as any).electronAPI?.installUpdate();
  }, [updateInfo]);

  const dismissUpdate = useCallback(() => {
    capture('update_dialog_dismissed', { version: updateInfo?.version });
    setUpdateAvailable(false);
    setUpdateInfo(null);
  }, [updateInfo]);

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
