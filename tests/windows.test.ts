import { describe, expect, it } from 'vitest';
import { RECENT_MAX, pickWindow, pushRecent } from '../src/adapter/windows';

const normal = (id: number, extra = {}) => ({ id, type: 'normal', state: 'normal', focused: false, ...extra });
const popup = { id: 99, type: 'popup', state: 'normal', focused: true };

describe('pickWindow', () => {
  const [w1, w2, w3] = [normal(1), normal(2), normal(3)];
  const all = [w1, w2, w3, popup];

  it('trusts getLastFocused when it returns a normal window (Chrome)', () => {
    expect(pickWindow(w3, all, [2])).toBe(w3);
  });

  it("uses the most recently focused normal window when getLastFocused returns romeli's popup (Firefox)", () => {
    expect(pickWindow(popup, all, [2, 3, 1])).toBe(w2);
    expect(pickWindow(undefined, all, [3, 2])).toBe(w3);
  });

  it('skips tracked windows that were closed', () => {
    expect(pickWindow(popup, [w1, w3, popup], [2, 3])).toBe(w3);
  });

  it('skips minimized windows, unless every tracked window is minimized', () => {
    const min1 = normal(1, { state: 'minimized' });
    expect(pickWindow(popup, [min1, w2, popup], [1, 2])).toBe(w2);
    const min2 = normal(2, { state: 'minimized' });
    expect(pickWindow(popup, [min1, min2, popup], [2, 1])).toBe(min2);
  });

  it('falls back to a visible normal window when nothing is tracked', () => {
    expect(pickWindow(popup, [normal(1, { state: 'minimized' }), w2, popup], [])).toBe(w2);
    expect(pickWindow(popup, [w1, normal(2, { focused: true }), popup], [])).toEqual(normal(2, { focused: true }));
    expect(pickWindow(popup, [popup], [99])).toBeUndefined();
  });
});

describe('pushRecent', () => {
  it('moves the id to the front without duplicates, capped', () => {
    expect(pushRecent([1, 2, 3], 3)).toEqual([3, 1, 2]);
    expect(pushRecent([], 5)).toEqual([5]);
    const full = Array.from({ length: RECENT_MAX }, (_, i) => i);
    expect(pushRecent(full, 100)).toHaveLength(RECENT_MAX);
    expect(pushRecent(full, 100)[0]).toBe(100);
  });
});
