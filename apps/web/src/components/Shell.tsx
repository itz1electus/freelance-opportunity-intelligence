import { formatMoney } from '@foi/domain';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { api } from '../api/client.ts';
import { errorMessage } from '../api/hooks.ts';
import type { SystemInfo } from '../api/types.ts';
import { navigate, usePath } from '../router.ts';

export const NAV = [
  { path: '/opportunities', label: 'Opportunities' },
  { path: '/search', label: 'Search' },
  { path: '/assessments', label: 'Assessments' },
  { path: '/profiles', label: 'Profiles' },
  { path: '/pipeline', label: 'Pipeline' },
  { path: '/settings', label: 'Settings' },
] as const;

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

function BudgetMeter({ budget }: { budget: SystemInfo['budget'] }) {
  const cap = Number(budget.monthlyHardCap.minorUnits);
  const spent = Number(budget.spentThisMonth.minorUnits);
  const ratio = cap > 0 ? Math.min(1, spent / cap) : 0;
  const level = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'high' : ratio >= 0.5 ? 'mid' : 'low';
  return (
    <div className={`budget budget--${level}`} title="Paid search and AI spend this calendar month (UTC)">
      <span className="budget__text">
        {formatMoney(budget.spentThisMonth)} of {formatMoney(budget.monthlyHardCap)} this month
      </span>
      <span className="budget__track" aria-hidden="true">
        <span className="budget__fill" style={{ inlineSize: `${ratio * 100}%` }} />
      </span>
    </div>
  );
}

export function Shell({
  system,
  onSignOut,
  children,
}: {
  system: SystemInfo | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const path = usePath();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {system?.fixtureMode && (
        <div className="demo-band" role="status">
          Demo mode: everything you see comes from made-up listings, not real opportunities.
        </div>
      )}
      <header className="topbar">
        <Link to="/opportunities" className="wordmark">
          FOI
        </Link>
        <nav aria-label="Main">
          <ul className="nav">
            {NAV.map((item) => (
              <li key={item.path}>
                <Link to={item.path} className={path.startsWith(item.path) ? 'nav__link is-current' : 'nav__link'}>
                  <span aria-current={path.startsWith(item.path) ? 'page' : undefined}>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="topbar__end">
          {system && <BudgetMeter budget={system.budget} />}
          <button type="button" className="button button--quiet" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      {system && <SharedBanner shared={system.shared} />}
      {system && system.warnings.length > 0 && (
        <div className="warning-band" role="alert">
          {system.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}

function SharedBanner({ shared }: { shared: SystemInfo['shared'] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const reload = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/shared/reload', { method: 'POST' });
      window.location.reload();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (shared.state === 'changed_externally') {
    return (
      <div className="notice-band notice-band--action" role="alert">
        <p>
          Team data in <code>data/shared</code> changed outside FOI, for example after <code>git pull</code>. Load it
          before editing profiles; your edits are paused until then.
        </p>
        <button type="button" className="button button--small" disabled={busy} onClick={() => void reload()}>
          Load team changes
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }
  if (shared.state === 'invalid' && shared.problem) {
    return (
      <div className="notice-band notice-band--problem" role="alert">
        <p>
          FOI cannot read <code>{shared.problem.file}</code>: {shared.problem.message} Profile edits are paused so the
          file is not overwritten. Fix it, then try again.
        </p>
        <button type="button" className="button button--small" disabled={busy} onClick={() => void reload()}>
          Try again
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }
  if (shared.exportError) {
    return (
      <div className="notice-band notice-band--problem" role="alert">
        <p>{shared.exportError} FOI keeps your changes and will try again on the next edit.</p>
      </div>
    );
  }
  if (shared.notice && dismissed !== shared.notice) {
    return (
      <div className="notice-band" role="status">
        <p>{shared.notice}</p>
        <button type="button" className="button button--quiet button--small" onClick={() => setDismissed(shared.notice)}>
          Dismiss
        </button>
      </div>
    );
  }
  return null;
}
