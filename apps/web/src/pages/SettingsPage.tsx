import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.ts';
import type { AuditEvent, JobView, SourceDescriptor, SystemInfo } from '../api/types.ts';
import { SourceList } from '../components/SourceList.tsx';
import { useDocumentTitle } from '../router.ts';

const ACTION_LABEL: Record<string, string> = {
  'session.started': 'Signed in',
  'session.ended': 'Signed out',
  'session.signed_out_all': 'Signed out everywhere',
  'session.launch_rejected': 'Rejected an expired or reused sign-in link',
  'job.enqueued': 'Started a demo job',
  'job.cancel_requested': 'Cancelled a job',
};

const JOB_STATUS_LABEL: Record<JobView['status'], string> = {
  queued: 'Waiting',
  running: 'Running',
  succeeded: 'Finished',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function WorkerCheck() {
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll while the job is waiting or running; stop as soon as it finishes.
  const [polls, setPolls] = useState(0);
  const activeId = job && (job.status === 'queued' || job.status === 'running') ? job.id : null;
  useEffect(() => {
    if (!activeId) return;
    const timer = window.setTimeout(() => {
      void api<{ job: JobView }>(`/jobs/${activeId}`).then(({ job: next }) => {
        setJob(next);
        setPolls((n) => n + 1);
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeId, polls]);

  const start = async () => {
    setError(null);
    try {
      const { job: created } = await api<{ job: JobView }>('/fixture/jobs', {
        method: 'POST',
        body: { message: 'Worker check', delayMs: 1500 },
      });
      setJob(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The demo job could not start.');
    }
  };

  const busy = job?.status === 'queued' || job?.status === 'running';
  return (
    <div className="worker-check">
      <p className="muted">Runs a short demo job through the background worker, the same path searches will use.</p>
      <p className="row">
        <button type="button" className="button" onClick={() => void start()} disabled={busy}>
          Run demo job
        </button>
        {busy && job && (
          <button type="button" className="button button--quiet" onClick={() => void api(`/jobs/${job.id}/cancel`, { method: 'POST' })}>
            Cancel job
          </button>
        )}
        {job && (
          <span className={`job-status job-status--${job.status}`} role="status">
            {JOB_STATUS_LABEL[job.status]}
          </span>
        )}
      </p>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function SettingsPage({ system, onSignedOut }: { system: SystemInfo | null; onSignedOut: () => void }) {
  useDocumentTitle('Settings');
  const [sources, setSources] = useState<SourceDescriptor[] | null>(null);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);

  useEffect(() => {
    void api<{ items: SourceDescriptor[] }>('/sources').then((r) => setSources(r.items));
    void api<{ items: AuditEvent[] }>('/audit-events?limit=20').then((r) => setAudit(r.items));
  }, []);

  const signOutEverywhere = async () => {
    await api('/auth/sessions', { method: 'DELETE' });
    onSignedOut();
  };

  return (
    <div className="page settings">
      <h1>Settings</h1>

      <section aria-labelledby="system-heading">
        <h2 id="system-heading">This installation</h2>
        {system ? (
          <dl className="facts">
            <div>
              <dt>Version</dt>
              <dd>{system.version}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{system.fixtureMode ? 'Demo: made-up listings only' : 'Live sources when connected'}</dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>{system.dataLocation}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Loading</p>
        )}
      </section>

      <section aria-labelledby="sources-heading">
        <h2 id="sources-heading">Sources</h2>
        {sources ? <SourceList sources={sources} /> : <p className="muted">Loading sources</p>}
      </section>

      <section aria-labelledby="worker-heading">
        <h2 id="worker-heading">Background worker</h2>
        {system?.fixtureMode ? <WorkerCheck /> : <p className="muted">The worker check is available in demo mode.</p>}
      </section>

      <section aria-labelledby="sessions-heading">
        <h2 id="sessions-heading">Sign-in</h2>
        <p className="muted">
          Signing out everywhere ends every browser session. You will need a new link from <kbd>npm run open</kbd>.
        </p>
        <button type="button" className="button button--danger" onClick={() => void signOutEverywhere()}>
          Sign out everywhere
        </button>
      </section>

      <section aria-labelledby="audit-heading">
        <h2 id="audit-heading">Recent activity</h2>
        {audit === null ? (
          <p className="muted">Loading</p>
        ) : audit.length === 0 ? (
          <p className="muted">Nothing recorded yet.</p>
        ) : (
          <table className="audit">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What happened</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.id}>
                  <td>
                    <time dateTime={e.at}>{formatTime(e.at)}</time>
                  </td>
                  <td>{ACTION_LABEL[e.action] ?? e.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
