import { useState, type FormEvent } from 'react';
import { api } from '../../api/client.ts';
import { errorMessage } from '../../api/hooks.ts';
import { useDocumentTitle } from '../../router.ts';

/** First run (UX-01): name the two partners; everything else is edited afterwards. */
export function SetupWizard({ onDone }: { onDone: () => void }) {
  useDocumentTitle('Set up profiles');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/setup/partners', {
        method: 'POST',
        body: { partnerA: { displayName: a.trim() }, partnerB: { displayName: b.trim() } },
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h1>Set up the two partner profiles</h1>
      <p>
        FOI matches each listing against what the two of you can do together. Start with names; skills, evidence and
        hours come next.
      </p>
      <form className="form setup" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="partner-a">Partner A</label>
          <input id="partner-a" value={a} onChange={(e) => setA(e.target.value)} maxLength={80} required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="partner-b">Partner B</label>
          <input id="partner-b" value={b} onChange={(e) => setB(e.target.value)} maxLength={80} required autoComplete="off" />
        </div>
        <p className="muted small">
          Names stay on this computer and in your team repository. When FOI sends profiles to an AI service, it calls
          you Partner A and Partner B instead.
        </p>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="button" disabled={saving || !a.trim() || !b.trim()}>
          Create profiles
        </button>
      </form>
    </div>
  );
}
