import { ScoreLegend } from '../components/ScoreMark.tsx';
import { Link } from '../components/Shell.tsx';
import { useDocumentTitle } from '../router.ts';

/**
 * The three-column feed (baseline §9). In Phase 1 it shows its structure and
 * explains what will fill it, rather than an empty table.
 */
export function OpportunitiesPage({ fixtureMode, provisioned }: { fixtureMode: boolean; provisioned: boolean }) {
  useDocumentTitle('Opportunities');
  return (
    <div className="feed-layout">
      <aside className="feed-layout__filters" aria-label="Filters">
        <h2 className="panel-title">Filters</h2>
        <p className="muted">
          Filter by source, engagement type, budget and score once listings arrive. Your saved views will appear here.
        </p>
      </aside>

      <section className="feed-layout__list" aria-labelledby="feed-heading">
        <h1 id="feed-heading">Opportunities</h1>
        <div className="empty">
          <p className="empty__lead">No opportunities yet.</p>
          <p>
            FOI only searches when you ask it to. Searching arrives in Phase 3
            {fixtureMode ? ', starting with demo listings you can try safely.' : '.'}{' '}
            {provisioned
              ? 'Meanwhile, keep both partner profiles complete: every score is matched against them.'
              : 'Before that, set up both partner profiles so scores have something to match against.'}
          </p>
          <p className="empty__actions">
            <Link to="/profiles" className="button">
              {provisioned ? 'Review profiles' : 'Set up profiles'}
            </Link>
            <Link to="/search" className="button button--quiet">
              See search sources
            </Link>
          </p>
        </div>
      </section>

      <aside className="feed-layout__detail" aria-labelledby="legend-heading">
        <h2 id="legend-heading" className="panel-title">
          How to read a score
        </h2>
        <p className="muted">
          Each listing gets a capability score, a feasibility score and a priority. The mark shows how far to trust the
          number.
        </p>
        <ScoreLegend />
        <p className="muted small">
          Priority is an ordering aid, not a chance of winning. A strong technical match with weak economics is shown
          as exactly that.
        </p>
      </aside>
    </div>
  );
}
