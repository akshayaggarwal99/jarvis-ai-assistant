import { CorrectionSuggestion } from './correction-detector';

interface NotificationOptions {
  duration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  onAccept?: () => void;
  onDismiss?: () => void;
}

interface SuggestionNotification {
  id: string;
  suggestions: CorrectionSuggestion[];
  timestamp: number;
  options: NotificationOptions;
}

export class NotificationService {
  private static instance: NotificationService;
  private notifications: SuggestionNotification[] = [];
  private notificationContainer: HTMLElement | null = null;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private constructor() {
    this.initializeContainer();
  }

  private initializeContainer(): void {
    // Create notification container if it doesn't exist
    this.notificationContainer = document.getElementById('jarvis-notifications');
    
    if (!this.notificationContainer) {
      this.notificationContainer = document.createElement('div');
      this.notificationContainer.id = 'jarvis-notifications';
      this.notificationContainer.className = 'fixed top-4 right-4 z-50 space-y-2 pointer-events-none';
      document.body.appendChild(this.notificationContainer);
    }
  }

  /**
   * Show correction suggestions to the user
   */
  showCorrectionSuggestions(
    suggestions: CorrectionSuggestion[], 
    options: NotificationOptions = {}
  ): string {
    const notificationId = Date.now().toString();
    const defaultOptions: NotificationOptions = {
      duration: 10000, // 10 seconds
      position: 'top-right',
      ...options
    };

    const notification: SuggestionNotification = {
      id: notificationId,
      suggestions,
      timestamp: Date.now(),
      options: defaultOptions
    };

    this.notifications.push(notification);
    this.renderNotification(notification);

    // Auto-dismiss after duration
    if (defaultOptions.duration && defaultOptions.duration > 0) {
      setTimeout(() => {
        this.dismissNotification(notificationId);
      }, defaultOptions.duration);
    }

    return notificationId;
  }

  /**
   * Render a notification in the UI
   */
  private renderNotification(notification: SuggestionNotification): void {
    if (!this.notificationContainer) return;

    const notificationElement = document.createElement('div');
    notificationElement.id = `notification-${notification.id}`;
    notificationElement.className = `
      bg-white rounded-xl shadow-lg border border-slate-200 p-4 max-w-sm
      pointer-events-auto transform transition-all duration-300 ease-out
      animate-slide-in-from-right
    `;

    const html = `
      <div class="flex items-start space-x-3">
        <div class="flex-shrink-0 w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm border border-white/20">
          <svg class="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-medium text-white mb-1">Dictionary Suggestions</h4>
          <div class="space-y-2">
            ${notification.suggestions.map(suggestion => `
              <div class="bg-white/5 border border-white/10 rounded-lg p-2 text-xs backdrop-blur-sm">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-medium text-white/80">"${suggestion.original}"</span>
                  <span class="text-white/50">→</span>
                  <span class="font-medium text-white">"${suggestion.suggested}"</span>
                </div>
                <div class="text-white/60 text-xs">${suggestion.context}</div>
              </div>
            `).join('')}
          </div>
          <div class="flex space-x-2 mt-3">
            <button 
              onclick="window.jarvisNotifications.acceptSuggestions('${notification.id}')"
              class="text-xs bg-white/10 text-white px-3 py-1 rounded-md hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/20"
            >
            >
              Add to Dictionary
            </button>
            <button 
              onclick="window.jarvisNotifications.dismissNotification('${notification.id}')"
              class="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    `;

    notificationElement.innerHTML = html;
    this.notificationContainer.appendChild(notificationElement);

    // Make methods globally available
    (window as any).jarvisNotifications = {
      acceptSuggestions: (id: string) => this.acceptSuggestions(id),
      dismissNotification: (id: string) => this.dismissNotification(id)
    };
  }

  /**
   * Accept suggestions and add them to dictionary
   */
  private acceptSuggestions(notificationId: string): void {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (!notification) return;

    // Trigger the accept callback
    notification.options.onAccept?.();

    // Dismiss the notification
    this.dismissNotification(notificationId);

    // Show success feedback
    this.showSuccessMessage('Words added to dictionary!');
  }

  /**
   * Dismiss a notification
   */
  dismissNotification(notificationId: string): void {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.options.onDismiss?.();
    }

    // Remove from array
    this.notifications = this.notifications.filter(n => n.id !== notificationId);

    // Remove from DOM
    const element = document.getElementById(`notification-${notificationId}`);
    if (element) {
      element.classList.add('animate-slide-out-to-right');
      setTimeout(() => {
        element.remove();
      }, 300);
    }
  }

  /**
   * Show a simple success message
   */
  private showSuccessMessage(message: string): void {
    if (!this.notificationContainer) return;

    const successElement = document.createElement('div');
    successElement.className = `
      bg-green-50 border border-green-200 rounded-xl p-3 max-w-sm
      pointer-events-auto transform transition-all duration-300 ease-out
      animate-slide-in-from-right
    `;

    successElement.innerHTML = `
      <div class="flex items-center space-x-2">
        <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span class="text-sm text-green-800">${message}</span>
      </div>
    `;

    this.notificationContainer.appendChild(successElement);

    // Auto-remove success message
    setTimeout(() => {
      successElement.classList.add('animate-slide-out-to-right');
      setTimeout(() => {
        successElement.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notifications = [];
    if (this.notificationContainer) {
      this.notificationContainer.innerHTML = '';
    }
  }
}

// CSS animations (should be added to global styles)
const styles = `
  @keyframes slide-in-from-right {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slide-out-to-right {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }

  .animate-slide-in-from-right {
    animation: slide-in-from-right 0.3s ease-out;
  }

  .animate-slide-out-to-right {
    animation: slide-out-to-right 0.3s ease-out;
  }
`;

// Inject styles if not already present
if (!document.getElementById('jarvis-notification-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'jarvis-notification-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default NotificationService;
