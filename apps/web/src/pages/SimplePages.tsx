import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { SourceDescriptor } from '../api/types.ts';
import { SourceList } from '../components/SourceList.tsx';
import { Link } from '../components/Shell.tsx';
import { useDocumentTitle } from '../router.ts';

function Planned({ title, phase, children }: { title: string; phase: number; children: React.ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="page">
      <h1>{title}</h1>
      <div className="planned">
        <p className="planned__phase">Arrives in Phase {phase}</p>
        {children}
      </div>
    </div>
  );
}

export function SearchPage() {
  useDocumentTitle('Search');
  const [sources, setSources] = useState<SourceDescriptor[] | null>(null);
  useEffect(() => {
    void api<{ items: SourceDescriptor[] }>('/sources').then((r) => setSources(r.items));
  }, []);
  return (
    <div className="page">
      <h1>Search</h1>
      <div className="planned">
        <p className="planned__phase">Arrives in Phase 3</p>
        <p>
          You will start each search yourself; FOI never searches on a schedule. Before a search starts you will see
          which sources are ready and what it may cost.
        </p>
      </div>
      <h2>Sources</h2>
      {sources ? <SourceList sources={sources} /> : <p className="muted">Loading sources</p>}
    </div>
  );
}

export function AssessmentsPage() {
  return (
    <Planned title="Assessments" phase={5}>
      <p>
        Technical assessments for your strongest leads: deliverables, a proposed approach, effort ranges per partner,
        risks and questions to ask the client. Each one cites the evidence it relies on and shows when its inputs changed.
      </p>
    </Planned>
  );
}

export function PipelinePage() {
  return (
    <Planned title="Pipeline" phase={6}>
      <p>
        Your shortlist and what happened next, from reviewed to won or lost. These are your own records: moving a card
        never contacts a marketplace or a client.
      </p>
    </Planned>
  );
}

export function NotFoundPage() {
  useDocumentTitle('Not found');
  return (
    <div className="page">
      <h1>There is nothing at this address</h1>
      <p>
        <Link to="/opportunities">Go to opportunities</Link>
      </p>
    </div>
  );
}
