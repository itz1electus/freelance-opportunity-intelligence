import type { PartnerView, StudioGap, StudioView } from '@foi/domain';
import { ProficiencyMeter } from '../../components/ProficiencyMeter.tsx';
import { Link } from '../../components/Shell.tsx';
import { useDocumentTitle } from '../../router.ts';

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

function gapSentence(gap: StudioGap, name: (id: string) => string, skill: (key: string) => string, evidence: (id: string) => string) {
  switch (gap.kind) {
    case 'skill_without_evidence':
      return `${name(gap.partnerId)} lists ${skill(gap.skillKey)}, but no evidence backs it yet.`;
    case 'evidence_skill_unclaimed':
      return `“${evidence(gap.evidenceId)}” credits ${name(gap.partnerId)} and is tagged ${skill(gap.skillKey)}, a skill ${name(gap.partnerId)} has not listed.`;
    case 'evidence_without_skills':
      return `“${evidence(gap.evidenceId)}” is not tagged with any skill, so it supports nothing yet.`;
    case 'hours_unknown':
      return `${name(gap.partnerId)}’s weekly hours are not set, so studio capacity is provisional.`;
  }
}

function gapLink(gap: StudioGap, slotOf: (id: string) => string): string {
  if (gap.kind === 'evidence_without_skills' || gap.kind === 'evidence_skill_unclaimed') return '/profiles/evidence';
  return `/profiles/${slotOf(gap.partnerId).toLowerCase()}`;
}

export function StudioOverview({ studio, partners }: { studio: StudioView; partners: PartnerView[] }) {
  useDocumentTitle('Studio profile');
  const { snapshot, revision } = studio;
  const name = (id: string) => partners.find((p) => p.id === id)?.displayName ?? 'A former partner';
  const slotOf = (id: string) => partners.find((p) => p.id === id)?.slot ?? 'A';
  const skillLabel = (key: string) => snapshot.skills.find((s) => s.key === key)?.label ?? key;
  const evidenceTitle = (id: string) => snapshot.evidence.find((e) => e.id === id)?.title ?? 'Evidence';
  const cap = snapshot.capacity;
  const [a, b] = snapshot.partners;

  return (
    <div className="studio">
      <p className="lead">
        This is what FOI matches listings against: the two profiles combined, with each skill traced to the partner who
        holds it.
      </p>
      <p className="muted small">
        Studio profile version {revision.revision}, saved {dateTime(revision.createdAt)}.{' '}
        {studio.materialSince === revision.createdAt
          ? 'This save changed skills, evidence, services or hours, so older scores are out of date where they relied on them.'
          : `Skills, evidence, services and hours last changed ${dateTime(studio.materialSince)}; later edits only touched names or notes, which never change scores.`}
      </p>

      <section aria-labelledby="capacity-heading">
        <h2 id="capacity-heading">Capacity</h2>
        <p>
          {cap.perPartner
            .map((p) => `${name(p.partnerId)}: ${p.weeklyHours === null ? 'not set' : `${p.weeklyHours} h a week`}`)
            .join('. ')}
          .{' '}
          {cap.provisional
            ? `FOI plans with the ${cap.knownHours} known hours and treats capacity as provisional.`
            : cap.knownHours > cap.capHours
              ? `FOI plans with at most ${cap.capHours} hours a week, the studio cap.`
              : `FOI plans with ${cap.plannedWeeklyHours} hours a week.`}{' '}
          A skill only one partner holds is limited to that partner’s hours.
        </p>
      </section>

      <section aria-labelledby="readiness-heading">
        <h2 id="readiness-heading">Profile checklist</h2>
        <div className="checklists">
          {snapshot.partners.map((p) => {
            const c = studio.completeness[p.id]!;
            return (
              <div key={p.id} className="checklist">
                <h3>
                  <Link to={`/profiles/${p.slot.toLowerCase()}`}>{name(p.id)}</Link>
                </h3>
                <ul>
                  {c.items.map((item) => (
                    <li key={item.key} className={item.done ? 'is-done' : 'is-open'}>
                      <span aria-hidden="true" className="check" />
                      <span>
                        {item.label}
                        {item.key === 'evidence' && c.skillCount > 0 && (
                          <span className="muted">
                            {' '}
                            ({c.skillsWithEvidence} of {c.skillCount})
                          </span>
                        )}
                        <span className="visually-hidden">{item.done ? ', done' : ', to do'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="skills-heading">
        <h2 id="skills-heading">Combined skills</h2>
        {snapshot.skills.length === 0 ? (
          <p className="muted">No skills yet. Add them on each partner’s page.</p>
        ) : (
          <div className="table-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th scope="col">Skill</th>
                  <th scope="col">{a ? name(a.id) : 'Partner A'}</th>
                  <th scope="col">{b ? name(b.id) : 'Partner B'}</th>
                  <th scope="col" className="num">
                    Evidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.skills.map((s) => (
                  <tr key={s.key}>
                    <th scope="row">{s.label}</th>
                    {[a, b].map((p, i) => {
                      const support = p ? s.supportedBy.find((x) => x.partnerId === p.id) : undefined;
                      return (
                        <td key={p?.id ?? i}>
                          {support ? (
                            <>
                              <ProficiencyMeter level={support.proficiency} />
                              {support.evidenceIds.length === 0 && <span className="flag">No evidence</span>}
                            </>
                          ) : (
                            <span className="muted" aria-label="Not listed">
                              –
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="num">{s.evidenceIds.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="services-heading">
        <h2 id="services-heading">Services offered</h2>
        {snapshot.services.length === 0 ? (
          <p className="muted">No services yet. Choose them on each partner’s page.</p>
        ) : (
          <ul className="plain-list">
            {snapshot.services.map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong>: {s.offeredBy.map((o) => name(o.partnerId)).join(' and ')}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="gaps-heading">
        <h2 id="gaps-heading">Worth checking</h2>
        {snapshot.gaps.length === 0 ? (
          <p className="muted">Nothing to check. Every listed skill has evidence and both partners’ hours are set.</p>
        ) : (
          <ul className="gaps">
            {snapshot.gaps.map((g, i) => (
              <li key={i}>
                <Link to={gapLink(g, slotOf)}>{gapSentence(g, name, skillLabel, evidenceTitle)}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
