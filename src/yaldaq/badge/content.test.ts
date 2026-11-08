import { describe, expect, it } from 'vitest';
import { SUBJECTS, factsFor, indexByActor, type Subject } from '../data/facts';
import { ms } from '../data/format';
import { buildModel, stateAt } from '../data/model';
import { FIXTURE } from '../data/test-fixture';
import { badgeSections } from './content';

const model = buildModel(FIXTURE);
const by = indexByActor(model);
const STRIKES = ['below 5', '5 to 9', '10 or more'];
const ui = { notes: true, logMore: true, bumped: new Set<string>() };

/** The text of all sections of one badge, with the tags removed. */
function badgeText(subject: Subject, iso: string): string {
  const t = ms(iso);
  const state = stateAt(model, t);
  const f = factsFor(subject, model, t, { by, state });
  return Object.values(badgeSections(subject, f, { t, state, model }, ui))
    .join(' ')
    .replace(/<[^>]*>/g, ' ');
}

describe('badgeSections', () => {
  it('uses a model that has the reveal file of the open envelope', () => {
    expect(model.envelopes.find((e) => e.id === 'env-0000aaaa')?.reveal).not.toBeNull();
  });

  it('shows no percent and no strike label on any badge before the envelope opens', () => {
    for (const subject of SUBJECTS) {
      const text = badgeText(subject, '2026-11-02T04:58:00Z');
      expect(text, subject).not.toContain('%');
      for (const s of STRIKES) expect(text, `${subject}: ${s}`).not.toContain(s);
    }
  });

  it('shows the forecasts on the vault and Claude badges when the envelope opens', () => {
    for (const subject of ['vault', 'claude'] as const) {
      const text = badgeText(subject, '2026-11-02T05:00:00Z');
      expect(text, subject).toContain('5 to 9');
      expect(text, subject).toContain('%');
    }
  });

  it('shows the scores on the wall screen badge only when a market settles', () => {
    expect(badgeText('board', '2026-11-02T06:59:00Z')).toContain('No settled markets yet');
    expect(badgeText('board', '2026-11-02T07:00:00Z')).toContain('0.113');
  });
});
