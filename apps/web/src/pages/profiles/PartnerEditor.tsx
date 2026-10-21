import {
  normalizeSkillName,
  PROFICIENCIES,
  PROFICIENCY_HELP,
  PROFICIENCY_LABEL,
  SKILL_CATEGORIES,
  type PartnerSkillView,
  type PartnerView,
  type Proficiency,
  type Qualification,
  type ServiceView,
  type SkillCategory,
  type SkillView,
  type StudioView,
} from '@foi/domain';
import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api/client.ts';
import { errorMessage } from '../../api/hooks.ts';
import { ProficiencyMeter } from '../../components/ProficiencyMeter.tsx';
import { useToast } from '../../components/Toast.tsx';
import { useDocumentTitle } from '../../router.ts';

const THIS_YEAR = new Date().getFullYear();
const dateOnly = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

interface Props {
  partner: PartnerView;
  vocabulary: SkillView[];
  services: ServiceView[];
  studio: StudioView | null;
  onChanged: () => void;
}

export function PartnerEditor({ partner, vocabulary, services, studio, onChanged }: Props) {
  useDocumentTitle(partner.displayName);
  const completeness = studio?.completeness[partner.id];
  return (
    <div className="editor">
      <p className="muted small">
        Profile version {partner.profileVersion}, last changed {dateOnly(partner.updatedAt)}.
        {completeness && !completeness.items.every((i) => i.done) && (
          <> Still to do: {completeness.items.filter((i) => !i.done).map((i) => i.label.toLowerCase()).join(', ')}.</>
        )}
      </p>
      <Basics key={`basics-${partner.id}-${partner.profileVersion}`} partner={partner} onChanged={onChanged} />
      <Skills partner={partner} vocabulary={vocabulary} onChanged={onChanged} />
      <Services key={`services-${partner.id}-${partner.profileVersion}`} partner={partner} services={services} onChanged={onChanged} />
      <Qualifications partner={partner} onChanged={onChanged} />
      <Exclusions partner={partner} onChanged={onChanged} />
    </div>
  );
}

function usePatch(partner: PartnerView, onChanged: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await api(`/partners/${partner.id}`, { method: 'PATCH', body: { ...body, expectedProfileVersion: partner.profileVersion } });
      onChanged();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { patch, error, saving };
}

function Basics({ partner, onChanged }: { partner: PartnerView; onChanged: () => void }) {
  const [displayName, setDisplayName] = useState(partner.displayName);
  const [hours, setHours] = useState(partner.weeklyHours === null ? '' : String(partner.weeklyHours));
  const [notes, setNotes] = useState(partner.notes ?? '');
  const { patch, error, saving } = usePatch(partner, onChanged);
  const toast = useToast();
  const dirty =
    displayName !== partner.displayName ||
    hours !== (partner.weeklyHours === null ? '' : String(partner.weeklyHours)) ||
    notes !== (partner.notes ?? '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await patch({
      displayName: displayName.trim(),
      weeklyHours: hours.trim() === '' ? null : Number(hours),
      notes: notes.trim() === '' ? null : notes,
    });
    if (ok) toast({ text: 'Saved.' });
  };

  return (
    <section aria-labelledby="basics-heading">
      <h2 id="basics-heading">Basics</h2>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="display-name">Name</label>
          <input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} required />
        </div>
        <div className="field field--narrow">
          <label htmlFor="weekly-hours">Hours a week for studio work</label>
          <input
            id="weekly-hours"
            type="number"
            inputMode="numeric"
            min={0}
            max={80}
            step={1}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-describedby="weekly-hours-help"
          />
          <p id="weekly-hours-help" className="help">
            Leave blank if you are not sure. FOI then treats capacity as provisional instead of guessing.
          </p>
        </div>
        <div className="field">
          <label htmlFor="partner-notes">Private notes</label>
          <textarea id="partner-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} aria-describedby="notes-help" />
          <p id="notes-help" className="help">
            Notes never change scores.
          </p>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="button" disabled={!dirty || saving}>
          Save changes
        </button>
      </form>
    </section>
  );
}

function Skills({ partner, vocabulary, onChanged }: { partner: PartnerView; vocabulary: SkillView[]; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (key: string, body: { proficiency: Proficiency; lastUsedYear: number | null; notes: string | null }) => {
    setError(null);
    try {
      await api(`/partners/${partner.id}/skills/${key}`, { method: 'PUT', body });
      onChanged();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };

  const remove = async (skill: PartnerSkillView) => {
    setError(null);
    try {
      await api(`/partners/${partner.id}/skills/${skill.skillKey}`, { method: 'DELETE' });
      onChanged();
      toast({
        text: `Removed ${skill.label}.`,
        action: {
          label: 'Undo',
          run: () =>
            void save(skill.skillKey, { proficiency: skill.proficiency, lastUsedYear: skill.lastUsedYear, notes: skill.notes }),
        },
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section aria-labelledby="skills-heading">
      <h2 id="skills-heading">Skills</h2>
      <details className="proficiency-help">
        <summary>What the levels mean</summary>
        <dl>
          {PROFICIENCIES.map((p) => (
            <div key={p}>
              <dt>{PROFICIENCY_LABEL[p]}</dt>
              <dd>{PROFICIENCY_HELP[p]}</dd>
            </div>
          ))}
        </dl>
      </details>
      {partner.skills.length === 0 ? (
        <p className="muted">No skills yet. List only what this partner can deliver for a client today.</p>
      ) : (
        <div className="table-scroll">
          <table className="skills-table">
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Level</th>
                <th scope="col">Last used</th>
                <th scope="col">Evidence</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {partner.skills.map((s) =>
                editing === s.skillKey ? (
                  <SkillEditRow
                    key={s.skillKey}
                    skill={s}
                    onCancel={() => setEditing(null)}
                    onSave={async (body) => {
                      if (await save(s.skillKey, body)) setEditing(null);
                    }}
                  />
                ) : (
                  <tr key={s.skillKey}>
                    <th scope="row">
                      {s.label}
                      {s.notes && <span className="cell-note">{s.notes}</span>}
                    </th>
                    <td>
                      <ProficiencyMeter level={s.proficiency} />
                    </td>
                    <td>{s.lastUsedYear ?? <span className="muted">Not set</span>}</td>
                    <td>{s.evidenceCount === 0 ? <span className="flag">None yet</span> : s.evidenceCount}</td>
                    <td className="row-actions">
                      <button type="button" className="button button--quiet button--small" onClick={() => setEditing(s.skillKey)}>
                        Edit<span className="visually-hidden"> {s.label}</span>
                      </button>
                      <button type="button" className="button button--quiet button--small" onClick={() => void remove(s)}>
                        Remove<span className="visually-hidden"> {s.label}</span>
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <AddSkill partner={partner} vocabulary={vocabulary} onAdded={onChanged} />
    </section>
  );
}

function SkillEditRow({
  skill,
  onCancel,
  onSave,
}: {
  skill: PartnerSkillView;
  onCancel: () => void;
  onSave: (body: { proficiency: Proficiency; lastUsedYear: number | null; notes: string | null }) => Promise<void>;
}) {
  const [proficiency, setProficiency] = useState<Proficiency>(skill.proficiency);
  const [year, setYear] = useState(skill.lastUsedYear === null ? '' : String(skill.lastUsedYear));
  const [notes, setNotes] = useState(skill.notes ?? '');
  return (
    <tr className="is-editing">
      <th scope="row">
        {skill.label}
        <input
          className="cell-input"
          aria-label={`Notes for ${skill.label}`}
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
      </th>
      <td>
        <select aria-label={`Level for ${skill.label}`} value={proficiency} onChange={(e) => setProficiency(e.target.value as Proficiency)}>
          {PROFICIENCIES.map((p) => (
            <option key={p} value={p}>
              {PROFICIENCY_LABEL[p]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          className="year-input"
          aria-label={`Year ${skill.label} was last used`}
          type="number"
          min={1980}
          max={THIS_YEAR}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </td>
      <td>{skill.evidenceCount}</td>
      <td className="row-actions">
        <button
          type="button"
          className="button button--small"
          onClick={() => void onSave({ proficiency, lastUsedYear: year === '' ? null : Number(year), notes: notes.trim() || null })}
        >
          Save
        </button>
        <button type="button" className="button button--quiet button--small" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

function AddSkill({ partner, vocabulary, onAdded }: { partner: PartnerView; vocabulary: SkillView[]; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [proficiency, setProficiency] = useState<Proficiency>('working');
  const [year, setYear] = useState(String(THIS_YEAR));
  const [category, setCategory] = useState<SkillCategory>('other');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byName = useMemo(() => {
    const map = new Map<string, SkillView>();
    for (const s of vocabulary) {
      map.set(normalizeSkillName(s.label), s);
      for (const alias of s.aliases) map.set(alias, s);
    }
    return map;
  }, [vocabulary]);
  const held = new Set(partner.skills.map((s) => s.skillKey));
  const match = name.trim() ? byName.get(normalizeSkillName(name)) : undefined;
  const isNew = name.trim().length > 0 && !match;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let key = match?.key;
      if (!key) {
        const created = await api<SkillView>('/skills', { method: 'POST', body: { label: name.trim(), category, aliases: [] } });
        key = created.key;
      }
      await api(`/partners/${partner.id}/skills/${key}`, {
        method: 'PUT',
        body: { proficiency, lastUsedYear: year === '' ? null : Number(year), notes: null },
      });
      setName('');
      onAdded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form add-row" onSubmit={(e) => void submit(e)} aria-label="Add a skill">
      <div className="field">
        <label htmlFor="new-skill">Add a skill</label>
        <input id="new-skill" list="skill-vocabulary" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
        <datalist id="skill-vocabulary">
          {vocabulary
            .filter((s) => !held.has(s.key))
            .map((s) => (
              <option key={s.key} value={s.label} />
            ))}
        </datalist>
        {match && match.label.toLowerCase() !== name.trim().toLowerCase() && <p className="help">Matches {match.label}.</p>}
        {match && held.has(match.key) && <p className="help">Already listed; saving updates its level.</p>}
      </div>
      <div className="field field--narrow">
        <label htmlFor="new-skill-level">Level</label>
        <select id="new-skill-level" value={proficiency} onChange={(e) => setProficiency(e.target.value as Proficiency)}>
          {PROFICIENCIES.map((p) => (
            <option key={p} value={p}>
              {PROFICIENCY_LABEL[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="field field--narrow">
        <label htmlFor="new-skill-year">Last used</label>
        <input id="new-skill-year" type="number" min={1980} max={THIS_YEAR} value={year} onChange={(e) => setYear(e.target.value)} />
      </div>
      {isNew && (
        <div className="field field--narrow">
          <label htmlFor="new-skill-category">Group</label>
          <select id="new-skill-category" value={category} onChange={(e) => setCategory(e.target.value as SkillCategory)}>
            {Object.entries(SKILL_CATEGORIES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field field--action">
        <button type="submit" className="button" disabled={busy || !name.trim()}>
          {isNew ? 'Add new skill' : 'Add skill'}
        </button>
      </div>
      {isNew && <p className="help add-row__note">“{name.trim()}” is not in the vocabulary yet. Adding it makes it available to both partners.</p>}
      {error && <p className="error-text add-row__note">{error}</p>}
    </form>
  );
}

function Services({ partner, services, onChanged }: { partner: PartnerView; services: ServiceView[]; onChanged: () => void }) {
  const toast = useToast();
  const offered = new Map(partner.services.map((s) => [s.serviceId, s]));
  const [drafts, setDrafts] = useState<Record<string, { deliverables: string; limitations: string }>>(() =>
    Object.fromEntries(
      partner.services.map((s) => [s.serviceId, { deliverables: s.deliverables.join('\n'), limitations: s.limitations ?? '' }]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  // Reflect a click at once; the section remounts with server data after the save.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const put = async (serviceId: string, deliverables: string, limitations: string) => {
    setError(null);
    try {
      await api(`/partners/${partner.id}/services/${serviceId}`, {
        method: 'PUT',
        body: { deliverables: lines(deliverables), limitations: limitations.trim() || null },
      });
      onChanged();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };

  const toggle = async (service: ServiceView, on: boolean) => {
    setOptimistic((o) => ({ ...o, [service.id]: on }));
    if (on) {
      setDrafts((d) => ({ ...d, [service.id]: d[service.id] ?? { deliverables: '', limitations: '' } }));
      if (!(await put(service.id, '', ''))) setOptimistic((o) => ({ ...o, [service.id]: false }));
      return;
    }
    const previous = offered.get(service.id);
    try {
      await api(`/partners/${partner.id}/services/${service.id}`, { method: 'DELETE' });
      onChanged();
      if (previous) {
        toast({
          text: `${partner.displayName} no longer offers ${service.name}.`,
          action: { label: 'Undo', run: () => void put(service.id, previous.deliverables.join('\n'), previous.limitations ?? '') },
        });
      }
    } catch (e) {
      setOptimistic((o) => ({ ...o, [service.id]: true }));
      setError(errorMessage(e));
    }
  };

  return (
    <section aria-labelledby="services-heading">
      <h2 id="services-heading">Services</h2>
      <ul className="services">
        {services.map((service) => {
          const isOn = optimistic[service.id] ?? offered.has(service.id);
          const draft = drafts[service.id] ?? { deliverables: '', limitations: '' };
          const current = offered.get(service.id);
          const dirty =
            current !== undefined &&
            (draft.deliverables !== current.deliverables.join('\n') || draft.limitations !== (current.limitations ?? ''));
          return (
            <li key={service.id} className={isOn ? 'service is-on' : 'service'}>
              <label className="check-label">
                <input type="checkbox" checked={isOn} onChange={(e) => void toggle(service, e.target.checked)} />
                <span>
                  <strong>{service.name}</strong>
                  <span className="help">{service.description}</span>
                </span>
              </label>
              {isOn && (
                <div className="service__detail">
                  <div className="field">
                    <label htmlFor={`deliv-${service.id}`}>Typical deliverables, one per line</label>
                    <textarea
                      id={`deliv-${service.id}`}
                      rows={3}
                      value={draft.deliverables}
                      onChange={(e) => setDrafts((d) => ({ ...d, [service.id]: { ...draft, deliverables: e.target.value } }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`limit-${service.id}`}>Limitations (optional)</label>
                    <input
                      id={`limit-${service.id}`}
                      value={draft.limitations}
                      placeholder="For example: no on-premises SQL Server"
                      onChange={(e) => setDrafts((d) => ({ ...d, [service.id]: { ...draft, limitations: e.target.value } }))}
                    />
                  </div>
                  <button
                    type="button"
                    className="button button--small"
                    disabled={!dirty}
                    onClick={() => void put(service.id, draft.deliverables, draft.limitations).then((ok) => ok && toast({ text: 'Saved.' }))}
                  >
                    Save<span className="visually-hidden"> {service.name}</span>
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function Qualifications({ partner, onChanged }: { partner: PartnerView; onChanged: () => void }) {
  const { patch, error, saving } = usePatch(partner, onChanged);
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [year, setYear] = useState('');
  const [url, setUrl] = useState('');

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const next: Qualification = { name: name.trim(), issuer: issuer.trim() || null, year: year ? Number(year) : null, url: url.trim() || null };
    if (await patch({ qualifications: [...partner.qualifications, next] })) {
      setName('');
      setIssuer('');
      setYear('');
      setUrl('');
    }
  };

  return (
    <section aria-labelledby="quals-heading">
      <h2 id="quals-heading">Certifications and qualifications</h2>
      <p className="help">Some clients require a certification. FOI only counts what is listed here.</p>
      {partner.qualifications.length > 0 && (
        <ul className="plain-list removable">
          {partner.qualifications.map((q, i) => (
            <li key={`${q.name}-${i}`}>
              <span>
                <strong>{q.name}</strong>
                {q.issuer && <>, {q.issuer}</>}
                {q.year && <>, {q.year}</>}
              </span>
              <button
                type="button"
                className="button button--quiet button--small"
                disabled={saving}
                onClick={() => void patch({ qualifications: partner.qualifications.filter((_, j) => j !== i) })}
              >
                Remove<span className="visually-hidden"> {q.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="form add-row" onSubmit={(e) => void add(e)} aria-label="Add a qualification">
        <div className="field">
          <label htmlFor="qual-name">Name</label>
          <input id="qual-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </div>
        <div className="field">
          <label htmlFor="qual-issuer">Issued by</label>
          <input id="qual-issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} maxLength={200} />
        </div>
        <div className="field field--narrow">
          <label htmlFor="qual-year">Year</label>
          <input id="qual-year" type="number" min={1970} max={THIS_YEAR} value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="qual-url">Verification link</label>
          <input id="qual-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </div>
        <div className="field field--action">
          <button type="submit" className="button" disabled={saving || !name.trim()}>
            Add
          </button>
        </div>
        {error && <p className="error-text add-row__note">{error}</p>}
      </form>
    </section>
  );
}

function Exclusions({ partner, onChanged }: { partner: PartnerView; onChanged: () => void }) {
  const { patch, error, saving } = usePatch(partner, onChanged);
  const [text, setText] = useState('');
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (await patch({ exclusions: [...partner.exclusions, text.trim()] })) setText('');
  };
  return (
    <section aria-labelledby="exclusions-heading">
      <h2 id="exclusions-heading">Work this partner will not take on</h2>
      <p className="help">For example “No on-site work” or “No SAP projects”. Listings that need these count against the studio.</p>
      {partner.exclusions.length > 0 && (
        <ul className="plain-list removable">
          {partner.exclusions.map((x, i) => (
            <li key={`${x}-${i}`}>
              <span>{x}</span>
              <button
                type="button"
                className="button button--quiet button--small"
                disabled={saving}
                onClick={() => void patch({ exclusions: partner.exclusions.filter((_, j) => j !== i) })}
              >
                Remove<span className="visually-hidden"> {x}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="form add-row" onSubmit={(e) => void add(e)} aria-label="Add an exclusion">
        <div className="field">
          <label htmlFor="exclusion">Add an exclusion</label>
          <input id="exclusion" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} />
        </div>
        <div className="field field--action">
          <button type="submit" className="button" disabled={saving || !text.trim()}>
            Add
          </button>
        </div>
        {error && <p className="error-text add-row__note">{error}</p>}
      </form>
    </section>
  );
}
