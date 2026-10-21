import {
  EVIDENCE_TYPE_LABEL,
  EVIDENCE_TYPES,
  normalizeSkillName,
  VERIFIED_LEVEL_LABEL,
  VERIFIED_LEVELS,
  type EvidenceType,
  type EvidenceView,
  type PartnerView,
  type SkillView,
  type VerifiedLevel,
} from '@foi/domain';
import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api/client.ts';
import { errorMessage } from '../../api/hooks.ts';
import { useToast } from '../../components/Toast.tsx';
import { useDocumentTitle } from '../../router.ts';

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Shows a link only for http(s); everything else is plain text (SEC-08). */
function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function SafeLink({ url }: { url: string }) {
  const parsed = parseUrl(url);
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return <span>{url}</span>;
  return (
    <a href={parsed.href} target="_blank" rel="noopener noreferrer">
      {parsed.hostname}
      {parsed.protocol === 'http:' && <span className="flag">Not encrypted</span>}
    </a>
  );
}

interface Props {
  evidence: EvidenceView[];
  partners: PartnerView[];
  vocabulary: SkillView[];
  onChanged: () => void;
}

export function EvidencePage({ evidence, partners, vocabulary, onChanged }: Props) {
  useDocumentTitle('Evidence');
  const toast = useToast();
  const [editing, setEditing] = useState<string | 'new' | null>(evidence.length === 0 ? 'new' : null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => partners.find((p) => p.id === id)?.displayName ?? 'Former partner';
  const label = (key: string) => vocabulary.find((s) => s.key === key)?.label ?? key;

  const remove = async (item: EvidenceView) => {
    setError(null);
    try {
      await api(`/evidence/${item.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      onChanged();
      toast({ text: `Deleted “${item.title}”.` });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="evidence-page">
      <p className="lead">
        Projects and results that prove a skill. One project can credit both partners; it still counts once.
      </p>
      {editing === 'new' ? (
        <EvidenceForm
          partners={partners}
          vocabulary={vocabulary}
          onCancel={evidence.length === 0 ? null : () => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : (
        <p>
          <button type="button" className="button" onClick={() => setEditing('new')}>
            Add evidence
          </button>
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      <ul className="evidence-list">
        {evidence.map((item) =>
          editing === item.id ? (
            <li key={item.id}>
              <EvidenceForm
                existing={item}
                partners={partners}
                vocabulary={vocabulary}
                onCancel={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  onChanged();
                }}
              />
            </li>
          ) : (
            <li key={item.id} className="evidence">
              <div className="evidence__head">
                <h3>{item.title}</h3>
                <span className="muted small">{EVIDENCE_TYPE_LABEL[item.type]}</span>
              </div>
              <p className="small">
                Credited to {item.credits.map((c) => name(c.partnerId)).join(' and ')}. {VERIFIED_LEVEL_LABEL[item.verifiedLevel]}.
                {item.url && (
                  <>
                    {' '}
                    <SafeLink url={item.url} />
                  </>
                )}
              </p>
              {item.claims.length > 0 && (
                <ul className="claims">
                  {item.claims.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              {item.summary && <p className="muted small">{item.summary}</p>}
              <p className="tags">
                {item.skillKeys.length === 0 ? (
                  <span className="flag">No skills tagged</span>
                ) : (
                  item.skillKeys.map((k) => (
                    <span key={k} className="tag">
                      {label(k)}
                    </span>
                  ))
                )}
              </p>
              {item.credits.some((c) => c.contributionNotes) && (
                <dl className="contributions small">
                  {item.credits
                    .filter((c) => c.contributionNotes)
                    .map((c) => (
                      <div key={c.partnerId}>
                        <dt>{name(c.partnerId)}</dt>
                        <dd>{c.contributionNotes}</dd>
                      </div>
                    ))}
                </dl>
              )}
              <p className="row">
                <button type="button" className="button button--quiet button--small" onClick={() => setEditing(item.id)}>
                  Edit<span className="visually-hidden"> {item.title}</span>
                </button>
                {confirmDelete === item.id ? (
                  <>
                    <span className="small">Delete this evidence?</span>
                    <button type="button" className="button button--danger button--small" onClick={() => void remove(item)}>
                      Delete
                    </button>
                    <button type="button" className="button button--quiet button--small" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="button button--quiet button--small" onClick={() => setConfirmDelete(item.id)}>
                    Delete<span className="visually-hidden"> {item.title}</span>
                  </button>
                )}
              </p>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function EvidenceForm({
  existing,
  partners,
  vocabulary,
  onCancel,
  onSaved,
}: {
  existing?: EvidenceView;
  partners: PartnerView[];
  vocabulary: SkillView[];
  onCancel: (() => void) | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [type, setType] = useState<EvidenceType>(existing?.type ?? 'client_project');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [verified, setVerified] = useState<VerifiedLevel>(existing?.verifiedLevel ?? 'self_reported');
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [claims, setClaims] = useState(existing?.claims.join('\n') ?? '');
  const [skills, setSkills] = useState<string[]>(existing?.skillKeys ?? []);
  const [credits, setCredits] = useState<Record<string, { on: boolean; notes: string }>>(() =>
    Object.fromEntries(
      partners.map((p) => {
        const c = existing?.credits.find((x) => x.partnerId === p.id);
        return [p.id, { on: c !== undefined, notes: c?.contributionNotes ?? '' }];
      }),
    ),
  );
  const [extraSkill, setExtraSkill] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Offer the skills either partner holds first; any other vocabulary skill can be added by name.
  const held = useMemo(() => {
    const keys = new Set(partners.flatMap((p) => p.skills.map((s) => s.skillKey)));
    for (const k of skills) keys.add(k);
    return vocabulary.filter((s) => keys.has(s.key));
  }, [partners, skills, vocabulary]);
  const byName = useMemo(() => {
    const map = new Map<string, SkillView>();
    for (const s of vocabulary) {
      map.set(normalizeSkillName(s.label), s);
      for (const a of s.aliases) map.set(a, s);
    }
    return map;
  }, [vocabulary]);

  const addExtra = () => {
    const match = byName.get(normalizeSkillName(extraSkill));
    if (!match) {
      setError(`“${extraSkill}” is not in the vocabulary. Add it on a partner’s page first.`);
      return;
    }
    setError(null);
    setSkills((s) => (s.includes(match.key) ? s : [...s, match.key]));
    setExtraSkill('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      title: title.trim(),
      type,
      url: url.trim() || null,
      summary: summary.trim() || null,
      claims: lines(claims),
      skillKeys: skills,
      verifiedLevel: verified,
      credits: partners
        .filter((p) => credits[p.id]?.on)
        .map((p) => ({ partnerId: p.id, contributionNotes: credits[p.id]!.notes.trim() || null })),
    };
    try {
      await api(existing ? `/evidence/${existing.id}` : '/evidence', { method: existing ? 'PUT' : 'POST', body });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  const id = existing?.id ?? 'new';
  return (
    <form className="form evidence-form" onSubmit={(e) => void submit(e)} aria-label={existing ? `Edit ${existing.title}` : 'New evidence'}>
      <h3>{existing ? 'Edit evidence' : 'New evidence'}</h3>
      <div className="field">
        <label htmlFor={`ev-title-${id}`}>Title</label>
        <input id={`ev-title-${id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`ev-type-${id}`}>Kind of work</label>
          <select id={`ev-type-${id}`} value={type} onChange={(e) => setType(e.target.value as EvidenceType)}>
            {EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVIDENCE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`ev-verified-${id}`}>How it can be checked</label>
          <select id={`ev-verified-${id}`} value={verified} onChange={(e) => setVerified(e.target.value as VerifiedLevel)}>
            {VERIFIED_LEVELS.map((v) => (
              <option key={v} value={v}>
                {VERIFIED_LEVEL_LABEL[v]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`ev-url-${id}`}>Link {verified === 'public_link' ? '' : '(optional)'}</label>
        <input id={`ev-url-${id}`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required={verified === 'public_link'} />
      </div>
      <div className="field">
        <label htmlFor={`ev-claims-${id}`}>What it shows, one result per line</label>
        <textarea
          id={`ev-claims-${id}`}
          rows={3}
          value={claims}
          onChange={(e) => setClaims(e.target.value)}
          placeholder="For example: Cut monthly reporting from three days to two hours"
        />
      </div>
      <div className="field">
        <label htmlFor={`ev-summary-${id}`}>Description (optional)</label>
        <textarea id={`ev-summary-${id}`} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={4000} />
      </div>
      <fieldset className="field">
        <legend>Skills it proves</legend>
        {held.length === 0 && <p className="help">Neither partner lists a skill yet. You can still tag one by name below.</p>}
        <div className="checks">
          {held.map((s) => (
            <label key={s.key} className="check-label">
              <input
                type="checkbox"
                checked={skills.includes(s.key)}
                onChange={(e) => setSkills((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((k) => k !== s.key)))}
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
        <div className="row">
          <input
            aria-label="Tag another skill by name"
            list="evidence-vocabulary"
            value={extraSkill}
            onChange={(e) => setExtraSkill(e.target.value)}
            placeholder="Another skill"
          />
          <datalist id="evidence-vocabulary">
            {vocabulary.map((s) => (
              <option key={s.key} value={s.label} />
            ))}
          </datalist>
          <button type="button" className="button button--quiet button--small" disabled={!extraSkill.trim()} onClick={addExtra}>
            Tag skill
          </button>
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>Who did this work</legend>
        {partners.map((p) => (
          <div key={p.id} className="credit">
            <label className="check-label">
              <input
                type="checkbox"
                checked={credits[p.id]?.on ?? false}
                onChange={(e) => setCredits((c) => ({ ...c, [p.id]: { ...c[p.id]!, on: e.target.checked } }))}
              />
              <span>{p.displayName}</span>
            </label>
            {credits[p.id]?.on && (
              <input
                aria-label={`What ${p.displayName} did`}
                placeholder="What this partner did (optional)"
                value={credits[p.id]!.notes}
                onChange={(e) => setCredits((c) => ({ ...c, [p.id]: { ...c[p.id]!, notes: e.target.value } }))}
                maxLength={1000}
              />
            )}
          </div>
        ))}
      </fieldset>
      {error && <p className="error-text">{error}</p>}
      <p className="row">
        <button type="submit" className="button" disabled={saving || !title.trim() || !partners.some((p) => credits[p.id]?.on)}>
          {existing ? 'Save evidence' : 'Add evidence'}
        </button>
        {onCancel && (
          <button type="button" className="button button--quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </p>
    </form>
  );
}
