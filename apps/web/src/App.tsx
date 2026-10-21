import { useCallback, useEffect, useState } from 'react';
import { api, onDataChanged, onUnauthorized } from './api/client.ts';
import type { SystemInfo } from './api/types.ts';
import { Shell } from './components/Shell.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { LaunchPage, SignedOutPage } from './pages/AuthPages.tsx';
import { OpportunitiesPage } from './pages/OpportunitiesPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { ProfilesPage } from './pages/profiles/ProfilesPage.tsx';
import { AssessmentsPage, NotFoundPage, PipelinePage, SearchPage } from './pages/SimplePages.tsx';
import { navigate, usePath } from './router.ts';

type AuthState = 'checking' | 'signed-in' | 'signed-out';

export function App() {
  const path = usePath();
  const [auth, setAuth] = useState<AuthState>(path === '/launch' ? 'signed-out' : 'checking');
  const [system, setSystem] = useState<SystemInfo | null>(null);

  const loadSystem = useCallback(() => {
    void api<SystemInfo>('/system').then(setSystem);
  }, []);

  const handleSignedIn = useCallback(() => {
    setAuth('signed-in');
    loadSystem();
  }, [loadSystem]);

  useEffect(() => onUnauthorized(() => setAuth('signed-out')), []);
  useEffect(() => onDataChanged(loadSystem), [loadSystem]);

  useEffect(() => {
    if (path === '/launch' || auth !== 'checking') return;
    api('/auth/session')
      .then(handleSignedIn)
      .catch(() => setAuth('signed-out'));
  }, [path, auth, handleSignedIn]);

  useEffect(() => {
    if (auth === 'signed-in' && path === '/') navigate('/opportunities', { replace: true });
  }, [auth, path]);

  if (path === '/launch') return <LaunchPage onSignedIn={handleSignedIn} />;
  if (auth === 'checking') return <div className="gate" aria-busy="true" />;
  if (auth === 'signed-out') return <SignedOutPage />;

  const signOut = async () => {
    await api('/auth/session', { method: 'DELETE' });
    setAuth('signed-out');
  };

  let page: React.ReactNode;
  if (path === '/' || path.startsWith('/opportunities')) {
    page = <OpportunitiesPage fixtureMode={system?.fixtureMode ?? true} provisioned={system?.partnersProvisioned ?? false} />;
  }
  else if (path.startsWith('/search')) page = <SearchPage />;
  else if (path.startsWith('/assessments')) page = <AssessmentsPage />;
  else if (path.startsWith('/profiles')) {
    page = system ? <ProfilesPage provisioned={system.partnersProvisioned} onProvisioned={loadSystem} /> : null;
  }
  else if (path.startsWith('/pipeline')) page = <PipelinePage />;
  else if (path.startsWith('/settings')) page = <SettingsPage system={system} onSignedOut={() => setAuth('signed-out')} />;
  else page = <NotFoundPage />;

  return (
    <ToastProvider>
      <Shell system={system} onSignOut={() => void signOut()}>
        {page}
      </Shell>
    </ToastProvider>
  );
}
