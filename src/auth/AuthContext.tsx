import React, { useState, useEffect } from 'react';

/**
 * Local Authentication Context for Open Source Build
 * Simple local user management - no cloud dependencies
 */

type AppUser = { 
  uid: string; 
  email: string | null; 
  displayName: string | null; 
};

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | null>(null);

const DEFAULT_USER: AppUser = {
  uid: 'local-user',
  email: 'user@localhost',
  displayName: 'Local User',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize with local user
    const savedUser = localStorage.getItem('jarvis_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        setUser(DEFAULT_USER);
        localStorage.setItem('jarvis_user', JSON.stringify(DEFAULT_USER));
      }
    } else {
      setUser(DEFAULT_USER);
      localStorage.setItem('jarvis_user', JSON.stringify(DEFAULT_USER));
    }
    setLoading(false);
  }, []);

  const handleSignInWithGoogle = async () => {
    setUser(DEFAULT_USER);
    localStorage.setItem('jarvis_user', JSON.stringify(DEFAULT_USER));
  };

  const handleSignOut = async () => {
    localStorage.removeItem('jarvis_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signInWithGoogle: handleSignInWithGoogle, 
      signOut: handleSignOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
