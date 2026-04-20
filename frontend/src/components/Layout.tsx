import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { QrCode, LogOut, LayoutDashboard, Link2, BarChart3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-1.5 text-sm transition-colors duration-150 ${
    isActive ? 'text-foreground' : 'text-text-muted hover:text-foreground'
  }`;

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-accent" strokeWidth={2} />
              <span className="font-semibold text-foreground">QR Codes</span>
            </div>
            <nav className="hidden sm:flex items-center gap-4">
              <NavLink to="/" end className={navItem}>
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </NavLink>
              <NavLink to="/qrs" className={navItem}>
                <QrCode className="w-4 h-4" />
                <span>QR Codes</span>
              </NavLink>
              <NavLink to="/pages" className={navItem}>
                <Link2 className="w-4 h-4" />
                <span>Pages</span>
              </NavLink>
              <NavLink to="/analytics" className={navItem}>
                <BarChart3 className="w-4 h-4" />
                <span>Analytics</span>
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-text-muted hidden sm:block">{user?.email}</span>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-sm text-text-muted hover:text-foreground transition-colors duration-150 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
