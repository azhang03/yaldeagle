import { describe, expect, it } from 'vitest';
import type { FeedEvent } from './contract';
import { ms } from './format';
import type { TimedEvent } from './model';
import { eventText } from './text';

const fill: FeedEvent = {
  t: '2026-11-01T09:30:40Z',
  actor: 'shadow',
  kind: 'fill',
  venue: 'shadow',
};
const repair: FeedEvent = {
  t: '2026-11-01T15:20:15Z',
  actor: 'ladder',
  kind: 'repair',
  sum_raw: 1,
};

const timed = (e: FeedEvent): TimedEvent => ({
  ...e,
  at: ms(e.t),
  ...(e.t_exchange ? { exAt: ms(e.t_exchange) } : {}),
});

describe('eventText', () => {
  it('gives a fill its print time only after the envelope opens', () => {
    expect(eventText(timed({ ...fill, t_exchange: '2026-11-01T09:30:00Z' }))).toBe(
      'Shadow: a paper fill, sealed. The trade printed at 09:30.',
    );
    expect(eventText(timed(fill))).toBe('Shadow: a paper fill, sealed.');
  });

  it('says that the largest fix is sealed while the envelope is sealed', () => {
    expect(eventText(timed({ ...repair, repair_max: 0.02 }))).toContain('largest fix 0.02');
    expect(eventText(timed({ ...repair, repair_max: null }))).toBe(
      'Ladder: the buckets add up to 1.00, largest fix sealed',
    );
  });
});
