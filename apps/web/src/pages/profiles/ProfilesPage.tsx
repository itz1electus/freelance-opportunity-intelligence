import type { EvidenceView, PartnerView, ServiceView, SkillView, StudioView } from '@foi/domain';
import { useCallback } from 'react';
import { errorMessage, useResource } from '../../api/hooks.ts';
import { Link } from '../../components/Shell.tsx';
import { usePath } from '../../router.ts';
import { EvidencePage } from './EvidencePage.tsx';
import { PartnerEditor } from './PartnerEditor.tsx';
import { SetupWizard } from './SetupWizard.tsx';
import { StudioOverview } from './StudioOverview.tsx';

/** /profiles, /profiles/a, /profiles/b and /profiles/evidence. */
export function ProfilesPage({ provisioned, onProvisioned }: { provisioned: boolean; onProvisioned: () => void }) {
  const path = usePath();
  const partners = useResource<{ items: PartnerView[] }>(provisioned ? '/partners' : null);
  const studio = useResource<StudioView>(provisioned ? '/studio-profile' : null);
  const evidence = useResource<{ items: EvidenceView[] }>(provisioned ? '/evidence' : null);
  const skills = useResource<{ items: SkillView[] }>(provisioned ? '/skills' : null);
  const services = useResource<{ items: ServiceView[] }>(provisioned ? '/services' : null);

  const { reload: reloadPartners } = partners;
  const { reload: reloadStudio } = studio;
  const { reload: reloadEvidence } = evidence;
  const { reload: reloadSkills } = skills;
  const refresh = useCallback(() => {
    reloadPartners();
    reloadStudio();
    reloadEvidence();
    reloadSkills();
  }, [reloadPartners, reloadStudio, reloadEvidence, reloadSkills]);

  if (!provisioned) return <SetupWizard onDone={onProvisioned} />;

  const failed = [partners, studio, evidence, skills, services].find((r) => r.error);
  if (failed?.error) {
    return (
      <div className="page">
        <h1>Profiles</h1>
        <p className="error-text">{errorMessage(failed.error)}</p>
      </div>
    );
  }
  if (!partners.data || !studio.data || !evidence.data || !skills.data || !services.data) {
    return <div className="page" aria-busy="true" />;
  }

  const list = partners.data.items;
  const tab = path.replace(/\/+$/, '').split('/')[2] ?? '';
  const tabs = [
    { key: '', label: 'Studio', to: '/profiles' },
    ...list.map((p) => ({ key: p.slot.toLowerCase(), label: p.displayName, to: `/profiles/${p.slot.toLowerCase()}` })),
    { key: 'evidence', label: `Evidence (${evidence.data.items.length})`, to: '/profiles/evidence' },
  ];
  const partner = list.find((p) => p.slot.toLowerCase() === tab);

  let body: React.ReactNode;
  if (tab === '') body = <StudioOverview studio={studio.data} partners={list} />;
  else if (tab === 'evidence') {
    body = <EvidencePage evidence={evidence.data.items} partners={list} vocabulary={skills.data.items} onChanged={refresh} />;
  } else if (partner) {
    body = (
      <PartnerEditor
        key={partner.id}
        partner={partner}
        vocabulary={skills.data.items}
        services={services.data.items}
        studio={studio.data}
        onChanged={refresh}
      />
    );
  } else {
    body = <p>There is no profile at this address.</p>;
  }

  return (
    <div className="page page--wide">
      <h1>{partner ? partner.displayName : 'Profiles'}</h1>
      <nav aria-label="Profiles">
        <ul className="tabs">
          {tabs.map((t) => (
            <li key={t.key}>
              <Link to={t.to} className={t.key === tab ? 'tabs__link is-current' : 'tabs__link'}>
                <span aria-current={t.key === tab ? 'page' : undefined}>{t.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {body}
    </div>
  );
}
