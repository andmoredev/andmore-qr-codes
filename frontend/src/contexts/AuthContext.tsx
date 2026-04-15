import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { isAuthenticated, getUserEmail, signOut as cognitoSignOut } from '../services/auth';

interface AuthState {
  authenticated: boolean;
  email: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ authenticated: false, email: null, loading: true });

  const refresh = async () => {
    try {
      const auth = await isAuthenticated();
      const email = auth ? await getUserEmail() : null;
      setState({ authenticated: auth, email, loading: false });
    } catch {
      setState({ authenticated: false, email: null, loading: false });
    }
  };

  useEffect(() => { refresh(); }, []);

  const signOut = () => {
    cognitoSignOut();
    setState({ authenticated: false, email: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
