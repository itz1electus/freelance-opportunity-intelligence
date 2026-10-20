import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.ts';
import { navigate, useDocumentTitle } from '../router.ts';

class MissingTokenError extends Error {}

// Runs once per page load. React's development double-render would otherwise
// read the already-cleared fragment, or spend the single-use token twice.
let launchAttempt: Promise<void> | null = null;

function startLaunch(): Promise<void> {
  if (launchAttempt) return launchAttempt;
  const token = new URLSearchParams(window.location.hash.slice(1)).get('t');
  // Remove the token from the address bar and history before using it.
  window.history.replaceState(null, '', '/launch');
  launchAttempt = token
    ? api('/auth/launch', { method: 'POST', body: { token } }).then(() => undefined)
    : Promise.reject(new MissingTokenError());
  return launchAttempt;
}

/**
 * Exchanges the one-time token in the URL fragment for a session cookie
 * (ADR-012). A fragment is never sent in request lines, logs or Referer headers.
 */
export function LaunchPage({ onSignedIn }: { onSignedIn: () => void }) {
  useDocumentTitle('Signing in');
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    startLaunch()
      .then(() => {
        onSignedIn();
        navigate('/opportunities', { replace: true });
      })
      .catch((error: unknown) => {
        if (error instanceof MissingTokenError) setFailed('This page needs a sign-in link from the terminal.');
        else if (error instanceof ApiError) setFailed(error.message);
        else setFailed('FOI did not respond. Check that it is still running in the terminal.');
      });
  }, [onSignedIn]);

  if (!failed) {
    return (
      <div className="gate">
        <p className="gate__status">Signing you in</p>
      </div>
    );
  }
  return <SignedOutPage reason={failed} />;
}

export function SignedOutPage({ reason }: { reason?: string }) {
  useDocumentTitle('Signed out');
  return (
    <div className="gate">
      <h1>You are signed out</h1>
      {reason && <p>{reason}</p>}
      <p>
        To sign in, run <kbd>npm run open</kbd> in the FOI folder. It opens a one-time link in this browser.
      </p>
    </div>
  );
}
