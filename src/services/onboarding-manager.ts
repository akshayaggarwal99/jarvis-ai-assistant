import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';

export class OnboardingManager {
  private static instance: OnboardingManager;
  private readonly ONBOARDING_COMPLETE_FILE = path.join(app.getPath('userData'), 'onboarding-complete.json');
  
  private constructor() {}
  
  static getInstance(): OnboardingManager {
    if (!OnboardingManager.instance) {
      OnboardingManager.instance = new OnboardingManager();
    }
    return OnboardingManager.instance;
  }
  
  markOnboardingCompleted(): void {
    try {
      const onboardingData = {
        completed: true,
        timestamp: Date.now()
      };
      fs.writeFileSync(this.ONBOARDING_COMPLETE_FILE, JSON.stringify(onboardingData, null, 2));
      Logger.info('✅ [Onboarding] Marked as completed');
    } catch (error) {
      Logger.error('❌ [Onboarding] Failed to mark as completed:', error);
    }
  }
  
  hasCompletedOnboarding(): boolean {
    try {
      if (!fs.existsSync(this.ONBOARDING_COMPLETE_FILE)) {
        return false;
      }
      
      const data = fs.readFileSync(this.ONBOARDING_COMPLETE_FILE, 'utf8');
      const onboardingData = JSON.parse(data);
      
      return onboardingData.completed === true;
    } catch (error) {
      Logger.error('❌ [Onboarding] Failed to check completion status:', error);
      return false;
    }
  }
  
  resetOnboarding(): void {
    try {
      if (fs.existsSync(this.ONBOARDING_COMPLETE_FILE)) {
        fs.unlinkSync(this.ONBOARDING_COMPLETE_FILE);
        Logger.info('✅ [Onboarding] Reset successfully');
      }
    } catch (error) {
      Logger.error('❌ [Onboarding] Failed to reset:', error);
    }
  }
}
