/**
 * OPEN SOURCE BUILD - Update Manager Stubs
 * For open-source builds, updates are handled via GitHub releases.
 * This file is kept for backwards compatibility but doesn't use cloud storage.
 */

import { Logger } from '../core/logger';

export class UpdateManager {
  constructor() {
    Logger.info('[UpdateManager] Open-source build - using GitHub releases for updates');
  }

  /**
   * @deprecated - Not used in open-source build
   * For releasing new versions, use GitHub releases instead
   */
  async uploadRelease(_version: string, _dmgPath: string, _releaseNotes: string): Promise<string> {
    throw new Error('Upload not available in open-source build. Use GitHub releases instead.');
  }

  /**
   * @deprecated - Not used in open-source build
   * Auto-updates should be configured via electron-updater with GitHub releases
   */
  async getLatestRelease(): Promise<any> {
    throw new Error('Not available in open-source build. Configure electron-updater with GitHub releases.');
  }
}
