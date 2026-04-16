import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode } from 'lucide-react';
import { CognitoUser } from 'amazon-cognito-identity-js';
import { authService } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';

type Step = 'login' | 'new-password';

export function LoginPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingUser, setPendingUser] = useState<CognitoUser | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.signIn(email, password);
      await refreshUser();
      navigate('/');
    } catch (err: unknown) {
      const cognitoErr = err as { code?: string; message?: string; cognitoUser?: CognitoUser };
      if (cognitoErr.code === 'NewPasswordRequired') {
        setPendingUser(cognitoErr.cognitoUser ?? null);
        setStep('new-password');
      } else if (cognitoErr.code === 'NotAuthorizedException') {
        setError('Incorrect email or password');
      } else if (cognitoErr.code === 'UserNotFoundException') {
        setError('No account found with this email');
      } else {
        setError(cognitoErr.message ?? 'Sign in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!pendingUser) return;
    setLoading(true);
    try {
      await authService.completeNewPassword(pendingUser, newPassword);
      await refreshUser();
      navigate('/');
    } catch (err: unknown) {
      const cognitoErr = err as { message?: string };
      setError(cognitoErr.message ?? 'Failed to set new password');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'new-password') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8 gap-3">
            <div className="w-12 h-12 bg-surface border border-border rounded-xl flex items-center justify-center">
              <QrCode className="w-6 h-6 text-accent" strokeWidth={2} />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold text-foreground">Set a new password</h1>
              <p className="text-sm text-text-muted mt-1">Your account requires a new password to continue</p>
            </div>
          </div>

          <form onSubmit={handleNewPassword} className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="block text-sm font-medium text-foreground">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 text-sm transition-colors duration-150 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {loading ? 'Saving…' : 'Set password & sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-12 h-12 bg-surface border border-border rounded-xl flex items-center justify-center">
            <QrCode className="w-6 h-6 text-accent" strokeWidth={2} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">QR Generator</h1>
            <p className="text-sm text-text-muted mt-1">Sign in to your account</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 text-sm transition-colors duration-150 cursor-pointer flex items-center justify-center gap-2"
          >
            {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
