import { describe, expect, it } from 'vitest';
import { ms } from './format';
import { boardAt, skillPct, skillScore } from './scores';
import { FIXTURE } from './test-fixture';

describe('boardAt', () => {
  it('gives no board before the first market settles', () => {
    expect(boardAt(FIXTURE.scores, ms('2026-11-02T06:59:59Z'))).toBeNull();
    expect(boardAt(null, ms('2026-11-02T08:00:00Z'))).toBeNull();
  });

  it('gives the totals of the last settled event', () => {
    const b = boardAt(FIXTURE.scores, ms('2026-11-02T07:00:00Z'));
    expect(b?.markets).toBe(3);
    expect(b?.brier.claude).toBe(0.1133);
    expect(b?.duel.claude).toBe(2);
    expect(b?.realizedUsd).toBe(8);
    expect(b?.latest.envelope).toBe('env-0000aaaa');
    expect(b?.history).toHaveLength(1);
  });
});

describe('skillScore', () => {
  it('compares Claude with the Actuary: above 0 is better, below 0 is worse', () => {
    // The YALDAQ dry run of 2026-11-09: 0.080 against 0.121.
    const better = skillScore({ claude: 0.08, strike_rate: 0.121 });
    expect(better).toBeCloseTo(0.339, 3);
    expect(skillPct(better!)).toBe('34%');
    const worse = skillScore({ claude: 0.15, strike_rate: 0.12 });
    expect(worse).toBeCloseTo(-0.25, 6);
    expect(skillPct(worse!)).toBe('25%');
    expect(skillPct(0.004)).toBe('under 1%');
  });

  it('gives no score when a Brier is null or the Actuary has 0', () => {
    expect(skillScore({ claude: null, strike_rate: 0.12 })).toBeNull();
    expect(skillScore({ claude: 0.08, strike_rate: null })).toBeNull();
    expect(skillScore({ claude: 0.08, strike_rate: 0 })).toBeNull();
  });
});
