export type ScoreState = 'full' | 'provisional' | 'stale';

const STATE_LABEL: Record<ScoreState, string> = {
  full: 'full evidence',
  provisional: 'provisional, some factors unknown',
  stale: 'stale, inputs changed since scoring',
};

/**
 * The score mark (UX-03): the fill encodes how far to trust the number, so
 * confidence is never carried by colour alone.
 */
export function ScoreMark({ value, state }: { value: number | null; state: ScoreState }) {
  const text = value === null ? '–' : String(Math.round(value));
  return (
    <span className={`score-mark score-mark--${state}`} aria-label={`Priority ${text}, ${STATE_LABEL[state]}`}>
      {text}
    </span>
  );
}

export function ScoreLegend() {
  return (
    <dl className="legend">
      <div>
        <dt>
          <ScoreMark value={82} state="full" />
        </dt>
        <dd>Every factor is backed by evidence from the listing or your profiles.</dd>
      </div>
      <div>
        <dt>
          <ScoreMark value={82} state="provisional" />
        </dt>
        <dd>Some factors are unknown, such as competition. FOI shows the range instead of guessing.</dd>
      </div>
      <div>
        <dt>
          <ScoreMark value={82} state="stale" />
        </dt>
        <dd>The listing, a partner profile or the scoring changed after this score was made.</dd>
      </div>
    </dl>
  );
}
