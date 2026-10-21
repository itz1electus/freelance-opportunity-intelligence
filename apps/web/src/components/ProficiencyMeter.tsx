import { PROFICIENCIES, PROFICIENCY_LABEL, type Proficiency } from '@foi/domain';

/** Four steps, filled up to the level; the label carries the meaning, the fill is a glance aid. */
export function ProficiencyMeter({ level, showLabel = true }: { level: Proficiency; showLabel?: boolean }) {
  const steps = PROFICIENCIES.indexOf(level) + 1;
  return (
    <span className="meter" title={PROFICIENCY_LABEL[level]}>
      <span className="meter__steps" aria-hidden="true">
        {PROFICIENCIES.map((p, i) => (
          <span key={p} className={i < steps ? 'meter__step is-on' : 'meter__step'} />
        ))}
      </span>
      <span className={showLabel ? 'meter__label' : 'visually-hidden'}>{PROFICIENCY_LABEL[level]}</span>
    </span>
  );
}
