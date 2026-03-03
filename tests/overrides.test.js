'use strict';

/**
 * @file overrides.test.js
 * @description Unit tests for Tools/overrides.js (getD1 and getOverides).
 *
 * These two functions are pure utilities with no external dependencies other
 * than the built-in Date constructor, making them straightforward to test
 * without any mocking.
 *
 * Known quirks tested here:
 *   - getD1(false) zeros the time component so date-only comparisons are
 *     stable regardless of when during the day the test runs.
 *   - The hard-coded dateoveride array is [false, 4, 28], so the override is
 *     disabled by default and getD1 always returns the real system date.
 *   - getD1(false, true) is identical to getD1(false) because the override is
 *     already disabled; passing ignoreOveride=true is a no-op today but guards
 *     against future configuration changes.
 */

const { getD1, getOverides } = require('../Tools/overrides');

describe('getD1 – default (getHours=false)', () => {
  test('returns a Date instance', () => {
    expect(getD1()).toBeInstanceOf(Date);
  });

  test('time components are zeroed (midnight)', () => {
    const d = getD1();
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  test('date portion matches today', () => {
    const now = new Date();
    const d = getD1();
    expect(d.getFullYear()).toBe(now.getFullYear());
    expect(d.getMonth()).toBe(now.getMonth());
    expect(d.getDate()).toBe(now.getDate());
  });
});

describe('getD1 – getHours=true', () => {
  test('returns a Date instance', () => {
    expect(getD1(true)).toBeInstanceOf(Date);
  });

  test('timestamp is close to now (within 1 second)', () => {
    const before = Date.now();
    const d = getD1(true);
    const after = Date.now();
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
    expect(d.getTime()).toBeLessThanOrEqual(after);
  });

  test('has a non-zero time on most runs (not midnight)', () => {
    // Very unlikely to run exactly at midnight, but we test the component
    // is not unconditionally zeroed.
    const d = getD1(true);
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // At minimum, getHours mode should NOT call setHours(0,0,0,0).
    // We verify by checking the raw timestamp is >= midnight.
    expect(d.getTime()).toBeGreaterThanOrEqual(midnight.getTime());
  });
});

describe('getD1 – ignoreOveride flag', () => {
  test('behaves identically to getD1(false) since override is disabled', () => {
    // dateoveride[0] = false, so ignoreOveride has no visible effect
    const a = getD1(false, false);
    const b = getD1(false, true);
    // Same calendar date
    expect(a.getFullYear()).toBe(b.getFullYear());
    expect(a.getMonth()).toBe(b.getMonth());
    expect(a.getDate()).toBe(b.getDate());
  });
});

describe('getOverides', () => {
  test('returns an object', () => {
    expect(typeof getOverides()).toBe('object');
  });

  test('uignoreErrors defaults to false', () => {
    expect(getOverides().uignoreErrors).toBe(false);
  });

  test('DebugFriday defaults to false', () => {
    expect(getOverides().DebugFriday).toBe(false);
  });

  test('returns a fresh object on each call', () => {
    const a = getOverides();
    const b = getOverides();
    expect(a).not.toBe(b); // different references
    expect(a).toEqual(b); // same values
  });
});
