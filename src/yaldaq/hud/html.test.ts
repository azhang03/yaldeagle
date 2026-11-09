import { describe, expect, it } from 'vitest';
import { ms } from '../data/format';
import { buildModel } from '../data/model';
import { boardAt } from '../data/scores';
import { FIXTURE } from '../data/test-fixture';
import { boardHTML, revealHTML } from './html';

const model = buildModel(FIXTURE);
const envA = model.envelopes.find((x) => x.id === 'env-0000aaaa')!;
const STRIKES = ['below 5', '5 to 9', '10 or more'];

describe('revealHTML', () => {
  it('shows no number and no strike before the envelope opens', () => {
    expect(envA.reveal).not.toBeNull();
    const html = revealHTML(envA, ms('2026-11-02T04:58:59Z'));
    expect(html).not.toContain('%');
    for (const s of STRIKES) expect(html).not.toContain(s);
  });

  it('shows the forecasts when the envelope opens', () => {
    const html = revealHTML(envA, ms('2026-11-02T04:59:00Z'));
    expect(html).toContain('5 to 9');
    expect(html).toContain('%');
  });
});

describe('boardHTML', () => {
  it('says that no market settled when there is no board', () => {
    expect(boardHTML(null)).toContain('No settled markets yet');
  });

  it('shows the scores and the paper P&L after a settlement', () => {
    const html = boardHTML(boardAt(model.scores, ms('2026-11-02T07:00:00Z')));
    expect(html).toContain('0.113');
    expect(html).toContain('Paper P&amp;L of settled markets: $8.00');
  });

  it('shows how much better or worse Claude is than the Actuary', () => {
    const board = boardAt(model.scores, ms('2026-11-02T07:00:00Z'))!;
    const text = (brier: Partial<typeof board.brier>): string =>
      boardHTML({ ...board, brier: { ...board.brier, ...brier } }).replace(/<[^>]*>/g, '');
    // 1 - 0.1133 / 0.1633 = 0.306.
    expect(text({})).toContain('Claude leads, 31% better than the Actuary.');
    expect(text({ claude: 0.15, strike_rate: 0.12 })).toContain(
      'Actuary leads. Claude is 25% worse than the Actuary.',
    );
    expect(text({ strike_rate: null })).not.toContain('%');
    const zero = text({ strike_rate: 0 });
    expect(zero).toContain('Actuary leads.');
    expect(zero).not.toContain('%');
  });
});
