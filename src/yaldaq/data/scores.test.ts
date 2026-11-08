import { describe, expect, it } from 'vitest';
import { ms } from './format';
import { boardAt } from './scores';
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
