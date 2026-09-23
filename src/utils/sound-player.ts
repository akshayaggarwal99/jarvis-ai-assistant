import { execFile } from 'child_process';
import { platform } from 'os';
import { Logger } from '../core/logger';
import * as path from 'path';
import * as fs from 'fs';

const playFile = (executable: string, args: string[], callback?: (error: Error | null) => void): void => {
  execFile(executable, args, { timeout: 10000 }, error => callback?.(error));
};

/**
 * Simple sound player for immediate audio feedback
 * Uses native system commands for minimal latency
 */
export class SoundPlayer {
  private static instance: SoundPlayer;
  private isPlaying: boolean = false;

  private constructor() {}

  static getInstance(): SoundPlayer {
    if (!SoundPlayer.instance) {
      SoundPlayer.instance = new SoundPlayer();
    }
    return SoundPlayer.instance;
  }

  /**
   * Play a simple beep sound immediately
   * Uses system commands for fastest possible playback
   */
  async playStartSound(): Promise<void> {
    if (this.isPlaying) return; // Prevent overlapping sounds
    
    this.isPlaying = true;
    
    // Don't await - fire and forget for minimal latency
    this.playStartSoundAsync().catch(error => {
      Logger.debug('Failed to play start sound:', error);
    });
  }

  private async playStartSoundAsync(): Promise<void> {
    try {
      if (platform() === 'darwin') {
        // macOS: Use afplay with system sound for minimal latency
        // Using Hero - the original notification sound
        playFile('/usr/bin/afplay', ['/System/Library/Sounds/Hero.aiff', '-v', '0.3'], (error) => {
          if (error) {
            // Fallback to Tink if Hero doesn't exist
            playFile('/usr/bin/afplay', ['/System/Library/Sounds/Tink.aiff', '-v', '0.3']);
          }
        });
      } else if (platform() === 'win32') {
        // Windows: Use PowerShell beep (non-blocking)
        playFile('powershell.exe', ['-NoProfile', '-Command', '[console]::beep(350,80); [console]::beep(500,80)']);
      } else {
        // Linux: Try paplay or beep command
        playFile('paplay', ['/usr/share/sounds/freedesktop/stereo/message.oga']);
      }
    } finally {
      // Reset playing flag after a short delay
      setTimeout(() => {
        this.isPlaying = false;
      }, 100);
    }
  }

  /**
   * Play a simple stop sound
   */
  async playStopSound(): Promise<void> {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    
    // Don't await - fire and forget for minimal latency
    this.playStopSoundAsync().catch(error => {
      Logger.debug('Failed to play stop sound:', error);
    });
  }

  private async playStopSoundAsync(): Promise<void> {
    try {
      if (platform() === 'darwin') {
        // macOS: Use Pop sound for stop - matches the original downward "poop" tone
        playFile('/usr/bin/afplay', ['/System/Library/Sounds/Pop.aiff', '-v', '0.4']);
      } else if (platform() === 'win32') {
        // Windows: Lower pitched beep
        playFile('powershell.exe', ['-NoProfile', '-Command', '[console]::beep(250,100)']);
      } else {
        // Linux: Try different sound or beep
        playFile('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga']);
      }
    } finally {
      // Reset playing flag after a short delay
      setTimeout(() => {
        this.isPlaying = false;
      }, 100);
    }
  }

  /**
   * Play a celebration/success sound for special events like Pro upgrade
   */
  async playCelebrationSound(): Promise<void> {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    
    // Don't await - fire and forget for minimal latency
    this.playCelebrationSoundAsync().catch(error => {
      Logger.debug('Failed to play celebration sound:', error);
    });
  }

  private async playCelebrationSoundAsync(): Promise<void> {
    try {
      if (platform() === 'darwin') {
        // Try to use the custom confetti-pop.mp3 file first
        // Check multiple possible paths for development and production
        const possiblePaths = [
          // NEW: Packaged app resources path (from extraResources)
          path.join(process.resourcesPath || '', 'assets', 'sounds', 'confetti-pop.mp3'),
          // Production path (in the built app)
          path.join(__dirname, '..', 'assets', 'sounds', 'confetti-pop.mp3'),
          // Development path
          path.join(__dirname, '..', '..', 'src', 'assets', 'sounds', 'confetti-pop.mp3'),
          // Alternative production path
          path.join(process.cwd(), 'dist', 'assets', 'sounds', 'confetti-pop.mp3'),
          // App bundle resources path (legacy)
          path.join(process.resourcesPath || __dirname, 'assets', 'sounds', 'confetti-pop.mp3'),
          // Direct path relative to src
          path.join(__dirname, '..', '..', 'assets', 'sounds', 'confetti-pop.mp3'),
          // Packaged app path (legacy)
          path.join(process.resourcesPath || '', 'app', 'assets', 'sounds', 'confetti-pop.mp3'),
          // Current directory fallback
          path.join(process.cwd(), 'assets', 'sounds', 'confetti-pop.mp3')
        ];
        
        let soundPath = null;
        for (const testPath of possiblePaths) {
          Logger.debug(`🎵 Checking sound path: ${testPath}`);
          if (fs.existsSync(testPath)) {
            soundPath = testPath;
            Logger.info(`🎵 Found confetti-pop.mp3 at: ${soundPath}`);
            break;
          }
        }
        
        if (soundPath) {
          Logger.info('🎵 Playing custom confetti-pop.mp3 sound from:', soundPath);
          playFile('/usr/bin/afplay', [soundPath, '-v', '0.8'], (error) => {
            if (error) {
              Logger.warning('Failed to play custom sound, falling back to system sound:', error);
              // Fallback to system sound
              playFile('/usr/bin/afplay', ['/System/Library/Sounds/Glass.aiff', '-v', '0.6'], (fallbackError) => {
                if (fallbackError) {
                  Logger.warning('Glass.aiff also failed, trying Ping.aiff:', fallbackError);
                  playFile('/usr/bin/afplay', ['/System/Library/Sounds/Ping.aiff', '-v', '0.6']);
                }
              });
            } else {
              Logger.info('🎊 Successfully played confetti-pop.mp3!');
            }
          });
        } else {
          Logger.warning('🎵 Custom sound not found in any path, using Glass.aiff system sound');
          Logger.debug('🎵 Searched paths:', possiblePaths);
          // Fallback to Glass sound if custom file doesn't exist
          playFile('/usr/bin/afplay', ['/System/Library/Sounds/Glass.aiff', '-v', '0.6'], (error) => {
            if (error) {
              Logger.warning('Glass.aiff failed, trying Ping.aiff:', error);
              // Final fallback to Ping
              playFile('/usr/bin/afplay', ['/System/Library/Sounds/Ping.aiff', '-v', '0.6'], (pingError) => {
                if (pingError) {
                  Logger.error('All celebration sounds failed:', pingError);
                }
              });
            } else {
              Logger.info('🎊 Played Glass.aiff celebration sound');
            }
          });
        }
      } else if (platform() === 'win32') {
        // Windows: Ascending beep sequence for celebration
        playFile('powershell.exe', ['-NoProfile', '-Command', '[console]::beep(330,150); [console]::beep(440,150); [console]::beep(550,300)']);
      } else {
        // Linux: Try celebration sound or multiple beeps
        playFile('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga']);
      }
    } finally {
      // Reset playing flag after a longer delay for celebration sound
      setTimeout(() => {
        this.isPlaying = false;
      }, 500);
    }
  }
}
