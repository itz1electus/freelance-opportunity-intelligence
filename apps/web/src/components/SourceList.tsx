import type { SourceDescriptor } from '../api/types.ts';

const STATUS_LABEL: Record<SourceDescriptor['status'], string> = {
  connected: 'Connected',
  needs_attention: 'Needs attention',
  blocked: 'Blocked',
  not_configured: 'Not set up',
  demo: 'Demo data',
};

export function SourceList({ sources }: { sources: SourceDescriptor[] }) {
  return (
    <ul className="sources">
      {sources.map((s) => (
        <li key={s.id} className={`source source--${s.status}`}>
          <div className="source__head">
            <span className="source__name">{s.name}</span>
            <span className="status-pill">{STATUS_LABEL[s.status]}</span>
          </div>
          <p className="source__reason">{s.reason}</p>
        </li>
      ))}
    </ul>
  );
}
