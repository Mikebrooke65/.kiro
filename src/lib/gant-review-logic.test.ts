/**
 * Unit tests for the Progress Notes review-loop pure logic.
 *
 * Spec: .kiro/specs/gant-ai-feedback-assistant/ (Task 3.2)
 * Requirements Section 4 (the review loop).
 *
 * Run: npm test  (vitest --run, never watch mode)
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  appendWorkOnRound,
  needsFreshGantCall,
  resolveReviewActions,
  roundsAsPlainText,
} from './gant-review-logic';
import type { GantRawRound, GantResponse } from '../types/database';

describe('resolveReviewActions — the two visual states (Requirement 4.1-4.3)', () => {
  it('no response yet: no actions available (screen should show a loading state)', () => {
    expect(resolveReviewActions(null)).toEqual({
      canTick: false,
      canCross: false,
      canWorkOn: false,
    });
  });

  it('a refined comment offers Tick, Cross, and Work-on', () => {
    const response: GantResponse = { kind: 'refined', text: 'Great work today.' };
    expect(resolveReviewActions(response)).toEqual({
      canTick: true,
      canCross: true,
      canWorkOn: true,
    });
  });

  it('a clarifying question offers ONLY Cross and Work-on — no Tick', () => {
    const response: GantResponse = { kind: 'question', text: 'Which phase of play was this?' };
    expect(resolveReviewActions(response)).toEqual({
      canTick: false,
      canCross: true,
      canWorkOn: true,
    });
  });

  it('PROPERTY: canTick is true if and only if kind is "refined"', () => {
    fc.assert(
      fc.property(fc.constantFrom('refined', 'question') as fc.Arbitrary<'refined' | 'question'>, (kind) => {
        const response: GantResponse = { kind, text: 'anything' };
        const actions = resolveReviewActions(response);
        expect(actions.canTick).toBe(kind === 'refined');
        // Cross and Work-on are always available once there IS a response.
        expect(actions.canCross).toBe(true);
        expect(actions.canWorkOn).toBe(true);
      })
    );
  });
});

describe('appendWorkOnRound — accumulating "Work on" rounds (Requirement 4.5, 4.6)', () => {
  it('appends a new round without mutating the input array', () => {
    const original: GantRawRound[] = [{ text: 'first observation', at: '2026-09-03T10:00:00Z' }];
    const result = appendWorkOnRound(original, 'second observation', '2026-09-03T10:05:00Z');

    expect(original).toHaveLength(1); // unchanged
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(original[0]);
    expect(result[1]).toEqual({ text: 'second observation', at: '2026-09-03T10:05:00Z' });
  });

  it('starts from an empty array (the very first round, i.e. the original capture)', () => {
    const result = appendWorkOnRound([], 'the original raw capture', '2026-09-03T09:00:00Z');
    expect(result).toEqual([{ text: 'the original raw capture', at: '2026-09-03T09:00:00Z' }]);
  });

  it('PROPERTY: no cap — an arbitrary number of rounds can always be appended (Requirement 4.6)', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 0, maxLength: 50 }), (texts) => {
        let rounds: GantRawRound[] = [];
        texts.forEach((text, i) => {
          rounds = appendWorkOnRound(rounds, text, `2026-09-03T${String(i).padStart(2, '0')}:00:00Z`);
        });
        expect(rounds).toHaveLength(texts.length);
        expect(rounds.map((r) => r.text)).toEqual(texts);
      })
    );
  });
});

describe('needsFreshGantCall — refine-on-open, not refine-on-capture (Requirement 3.1.2, decided 2026-09-03)', () => {
  it('an entry with no cached response yet always needs a fresh call (first open)', () => {
    expect(needsFreshGantCall(null, 0, null)).toBe(true);
    expect(needsFreshGantCall(null, 3, 2)).toBe(true);
  });

  it('a cached response with roundCountAtLastResponse unset (defensive) still forces a fresh call', () => {
    const response: GantResponse = { kind: 'refined', text: 'x' };
    expect(needsFreshGantCall(response, 1, null)).toBe(true);
  });

  it('re-opening an entry with nothing added since the cached response needs NO fresh call', () => {
    const response: GantResponse = { kind: 'refined', text: 'x' };
    // Cached at round_count 1, current round_count still 1 — nothing changed.
    expect(needsFreshGantCall(response, 1, 1)).toBe(false);
  });

  it('adding a new Work-on round (round_count increased since the cached response) needs a fresh call', () => {
    const response: GantResponse = { kind: 'refined', text: 'x' };
    // Cached at round_count 1, a Work-on round pushed it to 2.
    expect(needsFreshGantCall(response, 2, 1)).toBe(true);
  });

  it('PROPERTY: a fresh call is needed iff there is no cached response OR the round count has moved on', () => {
    fc.assert(
      fc.property(
        fc.option(fc.constantFrom('refined', 'question') as fc.Arbitrary<'refined' | 'question'>, {
          nil: null,
        }),
        fc.nat(20),
        fc.option(fc.nat(20), { nil: null }),
        (kind, currentRoundCount, roundCountAtLastResponse) => {
          const response: GantResponse | null = kind ? { kind, text: 'x' } : null;
          const result = needsFreshGantCall(response, currentRoundCount, roundCountAtLastResponse);
          const expected =
            !response ||
            roundCountAtLastResponse === null ||
            currentRoundCount > roundCountAtLastResponse;
          expect(result).toBe(expected);
        }
      )
    );
  });
});

describe('roundsAsPlainText — the full accumulated history sent to Gant (Requirement 4.5)', () => {
  it('extracts text in order, oldest first', () => {
    const rounds: GantRawRound[] = [
      { text: 'original observation', at: '2026-09-03T09:00:00Z' },
      { text: 'first work-on addition', at: '2026-09-03T09:05:00Z' },
      { text: 'second work-on addition', at: '2026-09-03T09:10:00Z' },
    ];
    expect(roundsAsPlainText(rounds)).toEqual([
      'original observation',
      'first work-on addition',
      'second work-on addition',
    ]);
  });

  it('returns an empty array for an empty input (should not happen in practice, but must not throw)', () => {
    expect(roundsAsPlainText([])).toEqual([]);
  });

  it('PROPERTY: output length always matches input length and order is preserved', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ text: fc.string(), at: fc.string() }), { maxLength: 30 }),
        (rounds) => {
          const result = roundsAsPlainText(rounds);
          expect(result).toHaveLength(rounds.length);
          result.forEach((text, i) => expect(text).toBe(rounds[i].text));
        }
      )
    );
  });
});
