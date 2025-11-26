import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { AppSettingsService } from './app-settings-service';
import { Logger } from '../core/logger';

export class PrivacyConsentService {
  private static instance: PrivacyConsentService;
  private consentWindow: BrowserWindow | null = null;
  private appSettings = AppSettingsService.getInstance();

  private constructor() {
    this.setupIpcHandlers();
  }

  public static getInstance(): PrivacyConsentService {
    if (!PrivacyConsentService.instance) {
      PrivacyConsentService.instance = new PrivacyConsentService();
    }
    return PrivacyConsentService.instance;
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('privacy:get-consent-status', () => {
      return {
        hasConsent: this.appSettings.hasPrivacyConsent(),
        consentDate: this.appSettings.getPrivacyConsentDate()
      };
    });

    ipcMain.handle('privacy:give-consent', () => {
      this.appSettings.givePrivacyConsent();
      Logger.info('[Privacy] User gave privacy consent for third-party data processing');
      this.closeConsentWindow();
      return true;
    });

    ipcMain.handle('privacy:decline-consent', () => {
      Logger.info('[Privacy] User declined privacy consent - core functionality will be limited');
      this.closeConsentWindow();
      return false;
    });

    ipcMain.handle('privacy:revoke-consent', () => {
      this.appSettings.revokePrivacyConsent();
      Logger.info('[Privacy] User revoked privacy consent');
      return true;
    });
  }

  /**
   * Check if privacy consent is required and show consent dialog if needed
   */
  public async checkAndRequestConsent(): Promise<boolean> {
    if (this.appSettings.hasPrivacyConsent()) {
      Logger.info('[Privacy] User has already given privacy consent');
      return true;
    }

    Logger.info('[Privacy] Privacy consent required - showing consent dialog');
    return this.showConsentDialog();
  }

  /**
   * Show the privacy consent dialog
   */
  private async showConsentDialog(): Promise<boolean> {
    return new Promise((resolve) => {
      this.consentWindow = new BrowserWindow({
        width: 800,
        height: 600,
        resizable: false,
        minimizable: false,
        maximizable: false,
        center: true,
        title: 'Privacy Consent - Jarvis AI',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '../preload.js')
        }
      });

      // Create privacy consent HTML
      const consentHTML = this.generateConsentHTML();
      this.consentWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(consentHTML)}`);

      // Handle window events
      this.consentWindow.on('closed', () => {
        this.consentWindow = null;
        // If window is closed without consent, resolve with false
        resolve(false);
      });

      // Listen for consent decision
      const consentHandler = (approved: boolean) => {
        resolve(approved);
        this.closeConsentWindow();
      };

      ipcMain.once('privacy:consent-decision', (_, approved: boolean) => {
        consentHandler(approved);
      });
    });
  }

  private closeConsentWindow(): void {
    if (this.consentWindow && !this.consentWindow.isDestroyed()) {
      this.consentWindow.close();
      this.consentWindow = null;
    }
  }

  private generateConsentHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Consent</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            color: #e2e8f0;
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 700px;
            margin: 0 auto;
            background: #334155;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
        }
        
        .header {
            text-align: center;
            margin-bottom: 25px;
        }
        
        .logo {
            width: 48px;
            height: 48px;
            background: #3b82f6;
            border-radius: 12px;
            margin: 0 auto 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: white;
        }
        
        h1 {
            color: #f1f5f9;
            margin-bottom: 8px;
            font-size: 24px;
        }
        
        .subtitle {
            color: #94a3b8;
            font-size: 16px;
        }
        
        .content {
            margin-bottom: 30px;
        }
        
        .section {
            margin-bottom: 20px;
            padding: 20px;
            background: #475569;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
        }
        
        .section h3 {
            color: #3b82f6;
            margin-bottom: 10px;
            font-size: 18px;
        }
        
        .third-party {
            background: #dc2626;
            border-left-color: #dc2626;
        }
        
        .third-party h3 {
            color: #fca5a5;
        }
        
        .protection {
            background: #059669;
            border-left-color: #059669;
        }
        
        .protection h3 {
            color: #86efac;
        }
        
        ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        
        li {
            margin-bottom: 8px;
        }
        
        .highlight {
            background: #1e40af;
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
            color: #dbeafe;
        }
        
        .buttons {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        button {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            min-width: 140px;
        }
        
        .accept {
            background: #059669;
            color: white;
        }
        
        .accept:hover {
            background: #047857;
        }
        
        .decline {
            background: #6b7280;
            color: white;
        }
        
        .decline:hover {
            background: #4b5563;
        }
        
        .privacy-links {
            text-align: center;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #475569;
        }
        
        .privacy-links a {
            color: #3b82f6;
            text-decoration: none;
            margin: 0 10px;
        }
        
        .privacy-links a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🤖</div>
            <h1>Privacy & Data Processing Consent</h1>
            <p class="subtitle">Complete transparency about how Jarvis handles your data</p>
        </div>
        
        <div class="content">
            <div class="section third-party">
                <h3>🔍 Third-Party Data Processing Required</h3>
                <p>To provide voice transcription and AI enhancements, Jarvis must send your data to these services:</p>
                <ul>
                    <li><strong>Deepgram:</strong> Converts your voice recordings to text</li>
                    <li><strong>OpenAI:</strong> Enhances transcribed text with AI suggestions</li>
                    <li><strong>Google Gemini:</strong> Provides alternative AI processing</li>
                </ul>
                <div class="highlight">
                    ⚠️ <strong>Important:</strong> Your voice and text data will be sent to these external services for processing. This is essential for Jarvis to function.
                </div>
            </div>
            
            <div class="section protection">
                <h3>🛡️ Your Data Protection</h3>
                <ul>
                    <li><strong>No permanent storage:</strong> Audio recordings are deleted immediately after transcription</li>
                    <li><strong>Anonymous analytics:</strong> Usage statistics are collected anonymously, not linked to your identity</li>
                    <li><strong>No data selling:</strong> We never sell your personal information to third parties</li>
                    <li><strong>Secure transmission:</strong> All data is encrypted during transmission</li>
                </ul>
            </div>
            
            <div class="section">
                <h3>📋 What This Means</h3>
                <p>By giving consent, you acknowledge that:</p>
                <ul>
                    <li>Your voice recordings will be processed by Deepgram for transcription</li>
                    <li>Transcribed text may be processed by OpenAI and Google Gemini for enhancement</li>
                    <li>These companies have their own privacy policies that also apply</li>
                    <li>This processing is necessary for Jarvis to provide its core functionality</li>
                </ul>
            </div>
        </div>
        
        <div class="buttons">
            <button class="accept" onclick="giveConsent()">
                ✅ I Accept & Understand
            </button>
            <button class="decline" onclick="declineConsent()">
                ❌ I Decline
            </button>
        </div>
        
        <div class="privacy-links">
            <a href="#" onclick="openPrivacyPolicy()">Privacy Policy</a>
            <a href="#" onclick="openTermsOfService()">Terms of Service</a>
        </div>
    </div>
    
    <script>
        function giveConsent() {
            if (window.electronAPI && window.electronAPI.sendMessage) {
                window.electronAPI.sendMessage('privacy:consent-decision', true);
            }
        }
        
        function declineConsent() {
            if (window.electronAPI && window.electronAPI.sendMessage) {
                window.electronAPI.sendMessage('privacy:consent-decision', false);
            }
        }
        
        function openPrivacyPolicy() {
            if (window.electronAPI && window.electronAPI.shell) {
                window.electronAPI.shell.openExternal('https://jarvis.ceo/privacy-policy');
            }
        }
        
        function openTermsOfService() {
            if (window.electronAPI && window.electronAPI.shell) {
                window.electronAPI.shell.openExternal('https://jarvis.ceo/terms-of-service');
            }
        }
    </script>
</body>
</html>`;
  }
}
