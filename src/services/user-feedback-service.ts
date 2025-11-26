import { Logger } from '../core/logger';

export class UserFeedbackService {
  private static instance: UserFeedbackService;

  static getInstance(): UserFeedbackService {
    if (!UserFeedbackService.instance) {
      UserFeedbackService.instance = new UserFeedbackService();
    }
    return UserFeedbackService.instance;
  }

  /**
   * Show helpful tips based on user actions or errors
   */
  showTip(type: 'first-use' | 'fn-key-guide' | 'permission-needed' | 'slow-network' | 'no-audio'): void {
    const tips = {
      'first-use': {
        title: 'Welcome to Jarvis!',
        message: 'Hold the Fn key and speak to convert your voice to text. Try saying "Hello world" now!',
        duration: 5000
      },
      'fn-key-guide': {
        title: 'How to use voice dictation',
        message: 'Hold down the Fn key (bottom left), speak clearly, then release. Works in any app!',
        duration: 4000
      },
      'permission-needed': {
        title: 'Permissions Required',
        message: 'Please grant microphone and accessibility permissions in System Preferences for Jarvis to work.',
        duration: 6000
      },
      'slow-network': {
        title: 'Slow Connection Detected',
        message: 'Transcription is taking longer than usual. Check your internet connection.',
        duration: 3000
      },
      'no-audio': {
        title: 'No Audio Detected',
        message: 'Make sure your microphone is working and try speaking louder.',
        duration: 3000
      }
    };

    const tip = tips[type];
    this.showNotification(tip.title, tip.message, tip.duration);
  }

  /**
   * Show contextual help based on current state
   */
  showContextualHelp(context: 'recording' | 'transcribing' | 'pasting' | 'error'): void {
    const help = {
      'recording': 'Speak clearly and release Fn when done',
      'transcribing': 'Processing your speech...',
      'pasting': 'Text will appear where your cursor is',
      'error': 'Something went wrong. Try again or check permissions'
    };

    Logger.info(`💡 [Help] ${help[context]}`);
  }

  /**
   * Show quick success feedback
   */
  showSuccess(message: string): void {
    this.showNotification('✅ Success', message, 2000);
  }

  /**
   * Show error with helpful suggestions
   */
  showError(title: string, message: string, suggestion?: string): void {
    const fullMessage = suggestion ? `${message}\n\nSuggestion: ${suggestion}` : message;
    this.showNotification(`❌ ${title}`, fullMessage, 4000);
  }

  /**
   * Show system notification (fallback for when app notifications aren't available)
   */
  private showNotification(title: string, message: string, duration: number): void {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: message,
        icon: '/icon.png',
        silent: true
      });
      
      setTimeout(() => notification.close(), duration);
    } else {
      // Fallback to console for debugging
      Logger.info(`[Notification] ${title}: ${message}`);
    }
  }

  /**
   * Show performance feedback to help users understand speed
   */
  showPerformanceFeedback(transcriptionTimeMs: number, wordCount: number): void {
    const wordsPerSecond = wordCount / (transcriptionTimeMs / 1000);
    
    if (transcriptionTimeMs < 1000) {
      this.showSuccess(`Ultra-fast transcription! (${transcriptionTimeMs}ms)`);
    } else if (transcriptionTimeMs < 3000) {
      this.showSuccess(`Transcribed ${wordCount} words in ${(transcriptionTimeMs/1000).toFixed(1)}s`);
    } else {
      this.showNotification(
        'Transcription Complete', 
        `Took ${(transcriptionTimeMs/1000).toFixed(1)}s. Try speaking closer to your microphone for faster results.`,
        3000
      );
    }
  }

  /**
   * Guide users through fixing common issues
   */
  showTroubleshootingGuide(issue: 'no-text' | 'wrong-text' | 'slow-speed' | 'no-response'): void {
    const guides = {
      'no-text': {
        title: 'No Text Appeared?',
        steps: [
          '1. Check that accessibility permissions are granted',
          '2. Make sure your cursor is in a text field',
          '3. Try holding Fn key longer and speaking louder'
        ]
      },
      'wrong-text': {
        title: 'Incorrect Transcription?',
        steps: [
          '1. Speak more slowly and clearly',
          '2. Add custom words to your dictionary',
          '3. Use push-to-talk in quiet environments'
        ]
      },
      'slow-speed': {
        title: 'Transcription Too Slow?',
        steps: [
          '1. Check your internet connection',
          '2. Speak shorter phrases (under 30 seconds)',
          '3. Restart Jarvis if the issue persists'
        ]
      },
      'no-response': {
        title: 'Assistant Not Responding?',
        steps: [
          '1. Start with "Hey Jarvis" to activate assistant mode',
          '2. Select text before speaking for context',
          '3. Check that you have an active internet connection'
        ]
      }
    };

    const guide = guides[issue];
    const message = guide.steps.join('\n');
    this.showNotification(guide.title, message, 8000);
  }
}

export default UserFeedbackService;
