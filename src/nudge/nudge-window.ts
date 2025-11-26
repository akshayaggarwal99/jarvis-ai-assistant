import { BrowserWindow, screen } from 'electron';
import path from 'path';

interface NudgeConfig {
  enabled: boolean;
  frequency: 'low' | 'medium' | 'high';
  maxNudgesPerDay: number;
  snoozeTime: number;
  smartNudging: boolean;
  minTypingDuration: number;
  dismissedPermanently: boolean;
}

interface UserActivity {
  lastTypingTime: number;
  lastJarvisUsage: number;
  typingStreakCount: number;
  firstTypingTime: number;
  typingSessionDuration: number;
  lastPauseTime: number;
  currentSessionId: string;
  nudgedInCurrentSession: boolean;
  todayNudgeCount: number;
  lastNudgeDate: string;
  totalNudgesShown: number;
  jarvisUsageCount: number;
}

export class NudgeWindow {
  private nudgeWindow: BrowserWindow | null = null;
  private isNudgeShowing = false;

  async createWindow(): Promise<void> {
    if (this.nudgeWindow) {
      console.log('🔔 [Nudge] Window already exists, bringing to front');
      this.nudgeWindow.show();
      this.nudgeWindow.focus();
      return;
    }

    console.log('🔔 [Nudge] Creating nudge window...');
    
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    const windowWidth = 420;
    const windowHeight = 320;
    const x = screenWidth - windowWidth - 20;
    const y = 80;

    this.nudgeWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: x,
      y: y,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: true,
      show: false,
      transparent: true,
      hasShadow: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, '../preload/nudge-preload.js')
      }
    });

    await this.nudgeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.getNudgeHTML())}`);
    
    this.nudgeWindow.once('ready-to-show', () => {
      console.log('🔔 [Nudge] Window ready to show');
      if (this.nudgeWindow) {
        this.nudgeWindow.show();
        this.nudgeWindow.focus();
        this.isNudgeShowing = true;
        
        setTimeout(() => {
          if (this.nudgeWindow && !this.nudgeWindow.isDestroyed()) {
            this.nudgeWindow.focus();
          }
        }, 100);
      }
    });

    this.nudgeWindow.on('closed', () => {
      console.log('🔔 [Nudge] Window closed');
      this.nudgeWindow = null;
      this.isNudgeShowing = false;
    });
  }

  hide(): void {
    if (this.nudgeWindow && !this.nudgeWindow.isDestroyed()) {
      console.log('🔔 [Nudge] Hiding nudge window');
      this.nudgeWindow.hide();
      this.isNudgeShowing = false;
    }
  }

  destroy(): void {
    if (this.nudgeWindow && !this.nudgeWindow.isDestroyed()) {
      console.log('🔔 [Nudge] Destroying nudge window');
      this.nudgeWindow.destroy();
      this.nudgeWindow = null;
      this.isNudgeShowing = false;
    }
  }

  isShowing(): boolean {
    return this.isNudgeShowing && !!this.nudgeWindow && !this.nudgeWindow.isDestroyed();
  }

  private getNudgeHTML(): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Jarvis Nudge</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 16px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                overflow: hidden;
                position: relative;
            }
            
            .nudge-container {
                text-align: center;
                padding: 30px;
                max-width: 360px;
                position: relative;
                z-index: 2;
            }
            
            .sparkle {
                position: absolute;
                color: rgba(255,255,255,0.8);
                font-size: 20px;
                animation: sparkle 2s infinite ease-in-out;
            }
            
            .sparkle:nth-child(1) { top: 20px; left: 30px; animation-delay: 0s; }
            .sparkle:nth-child(2) { top: 60px; right: 40px; animation-delay: 0.5s; }
            .sparkle:nth-child(3) { bottom: 40px; left: 50px; animation-delay: 1s; }
            .sparkle:nth-child(4) { bottom: 60px; right: 30px; animation-delay: 1.5s; }
            
            @keyframes sparkle {
                0%, 100% { opacity: 0.3; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.2); }
            }
            
            .icon {
                font-size: 48px;
                margin-bottom: 15px;
                display: block;
                animation: bounce 2s infinite ease-in-out;
            }
            
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
            
            .title {
                font-size: 24px;
                font-weight: 600;
                margin-bottom: 10px;
                background: linear-gradient(45deg, #fff, #f0f8ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .message {
                font-size: 16px;
                line-height: 1.4;
                margin-bottom: 25px;
                opacity: 0.95;
            }
            
            .buttons {
                display: flex;
                gap: 12px;
                justify-content: center;
                flex-wrap: wrap;
            }
            
            .btn {
                padding: 10px 20px;
                border: none;
                border-radius: 25px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
                min-width: 100px;
            }
            
            .btn-primary {
                background: rgba(255,255,255,0.2);
                color: white;
                border: 2px solid rgba(255,255,255,0.3);
            }
            
            .btn-primary:hover {
                background: rgba(255,255,255,0.3);
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(0,0,0,0.2);
            }
            
            .btn-secondary {
                background: transparent;
                color: rgba(255,255,255,0.8);
                border: 2px solid rgba(255,255,255,0.2);
            }
            
            .btn-secondary:hover {
                background: rgba(255,255,255,0.1);
                color: white;
                transform: translateY(-1px);
            }
            
            .pulse-bg {
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                animation: pulse 4s infinite ease-in-out;
            }
            
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 0.5; }
                50% { transform: scale(1.1); opacity: 0.8; }
            }
        </style>
    </head>
    <body>
        <div class="pulse-bg"></div>
        <div class="sparkle">✨</div>
        <div class="sparkle">⭐</div>
        <div class="sparkle">💫</div>
        <div class="sparkle">✨</div>
        
        <div class="nudge-container">
            <div class="icon">🤖</div>
            <div class="title">Ready for Jarvis?</div>
            <div class="message">You've been coding for a while! Let Jarvis assist you with AI-powered help.</div>
            <div class="buttons">
                <button class="btn btn-primary" onclick="useJarvis()">Use Jarvis</button>
                <button class="btn btn-secondary" onclick="snooze()">Snooze 15m</button>
                <button class="btn btn-secondary" onclick="dismiss()">Dismiss</button>
            </div>
        </div>

        <script>
            function useJarvis() {
                window.electronAPI?.dismissNudge?.();
            }
            
            function snooze() {
                window.electronAPI?.snoozeNudge?.();
            }
            
            function dismiss() {
                window.electronAPI?.dismissNudgeExplicitly?.();
            }
            
            // Auto-dismiss after 30 seconds
            setTimeout(() => {
                if (window.electronAPI?.dismissNudge) {
                    window.electronAPI.dismissNudge();
                }
            }, 30000);
        </script>
    </body>
    </html>
    `;
  }
}
