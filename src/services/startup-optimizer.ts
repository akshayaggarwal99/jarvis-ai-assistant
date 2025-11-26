import { Logger } from '../core/logger';

export class StartupOptimizer {
  private static instance: StartupOptimizer;
  private isInitialized = false;
  private deferredTasks: Array<() => Promise<void>> = [];
  private isProcessingDeferred = false;

  private constructor() {}

  static getInstance(): StartupOptimizer {
    if (!StartupOptimizer.instance) {
      StartupOptimizer.instance = new StartupOptimizer();
    }
    return StartupOptimizer.instance;
  }

  /**
   * Mark the app as initialized and process any deferred tasks
   */
  markInitialized(): void {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    Logger.info('🚀 [StartupOptimizer] App marked as initialized');
    
    // Process deferred tasks after a short delay
    setTimeout(() => {
      this.processDeferredTasks();
    }, 100);
  }

  /**
   * Add a task to be executed after initialization
   */
  deferTask(task: () => Promise<void>): void {
    this.deferredTasks.push(task);
    Logger.debug('📋 [StartupOptimizer] Task deferred for later execution');
  }

  /**
   * Process all deferred tasks
   */
  private async processDeferredTasks(): Promise<void> {
    if (this.isProcessingDeferred || this.deferredTasks.length === 0) return;
    
    this.isProcessingDeferred = true;
    Logger.info(`🔄 [StartupOptimizer] Processing ${this.deferredTasks.length} deferred tasks`);
    
    try {
      // Process tasks in parallel for better performance
      await Promise.allSettled(
        this.deferredTasks.map(async (task, index) => {
          try {
            await task();
            Logger.debug(`✅ [StartupOptimizer] Deferred task ${index + 1} completed`);
          } catch (error) {
            Logger.error(`❌ [StartupOptimizer] Deferred task ${index + 1} failed:`, error);
          }
        })
      );
      
      Logger.info('✅ [StartupOptimizer] All deferred tasks processed');
    } catch (error) {
      Logger.error('❌ [StartupOptimizer] Error processing deferred tasks:', error);
    } finally {
      this.isProcessingDeferred = false;
      this.deferredTasks = []; // Clear processed tasks
    }
  }

  /**
   * Check if the app is initialized
   */
  isAppInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the number of pending deferred tasks
   */
  getPendingTaskCount(): number {
    return this.deferredTasks.length;
  }
} 