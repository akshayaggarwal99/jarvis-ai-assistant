import { Logger } from '../core/logger';

/**
 * Stub AuthService for open-source build.
 * No authentication is required—all features work without sign-in.
 * Returns a mock user so the app flow works correctly.
 */

export interface AuthState {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  timestamp: number;
  idToken?: string;
}

// Mock user for open-source build
const OPEN_SOURCE_USER: AuthState = {
  uid: 'local-user',
  email: 'user@localhost',
  displayName: 'Local User',
  timestamp: Date.now(),
};

export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  saveAuthState(_authState: AuthState): void {
    Logger.debug('[Auth] saveAuthState is a no-op in open-source build');
  }

  loadAuthState(): AuthState | null {
    Logger.debug('[Auth] loadAuthState returning mock user for open-source build');
    return OPEN_SOURCE_USER;
  }

  clearAuthState(): void {
    Logger.debug('[Auth] clearAuthState is a no-op in open-source build');
  }

  validateAuthState(): { valid: boolean; authState?: AuthState; reason?: string } {
    // Always return valid=true so features aren't gated
    return { valid: true, authState: OPEN_SOURCE_USER, reason: 'open_source_build' };
  }
}
