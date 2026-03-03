'use strict';

/**
 * @file basicHelpers.test.js
 * @description Unit tests for the pure computation functions exported from
 * Functions/HelperFunctions/basicHelpers.js: FindDate, GetDate, and
 * dateDiffInDays.
 *
 * Mocking strategy
 * ────────────────
 * basicHelpers.js has these load-time dependencies that need care:
 *
 *  1. babotdata.json – handled globally by the moduleNameMapper in
 *     jest.config.js (redirected to tests/__fixtures__/babotdata.json).
 *
 *  2. Tools/overrides.js (getD1) – mocked below to return a stable date
 *     (June 15, 2025) so tests are not sensitive to when they run.
 *
 *  3. Functions/HelperFunctions/slashFridayHelpers – this module transitively
 *     imports morshin.js, which calls fs.readFileSync at load time to read
 *     emojiJSONCache.json from babadata.datalocation. That file does not exist
 *     in the test environment, so slashFridayHelpers is mocked entirely with
 *     empty stubs. The functions under test (FindDate, GetDate, dateDiffInDays)
 *     do not call anything from slashFridayHelpers.
 *
 * Options for testing Discord-dependent functions in basicHelpers
 * ────────────────────────────────────────────────────────────────
 * Functions like preformEasterEggs, handleButtonsEmbed, SetHolidayChan, etc.
 * all accept and/or call methods on discord.js Guild/Message/Channel objects.
 * Three viable approaches:
 *
 *  Option A – Manual Discord stubs:
 *    Build minimal plain objects that implement only the Discord interface
 *    surface the function touches (e.g. { channels: { resolve: jest.fn() } }).
 *    Low overhead, brittle if the function gains new discord.js calls.
 *
 *  Option B – jest.mock('discord.js'):
 *    Replace the entire discord.js module with auto-mocked or manual stubs.
 *    Captures more of the Discord interaction surface but requires maintaining
 *    a complete fake of every used export.
 *
 *  Option C – Extract pure business logic:
 *    Refactor so that functions accept plain data objects rather than Discord
 *    objects and return plain data (e.g. channel name strings) instead of
 *    making API calls. The caller layer can then be a thin adapter. This is
 *    the most testable long-term architecture but requires the most upfront
 *    refactoring.
 *
 * Architecture issues that make testing hard
 * ──────────────────────────────────────────
 *  • Global state mutations (global.Bot, global.dbAccess, global.fridayCounter,
 *    global.reverseLook, global.BirthdayToday) spread side effects across
 *    modules with no injection point.
 *  • babot.js executes makeBot() and botOn() at require()-time, so it can never
 *    be safely imported in a test without mocking the Discord client and the
 *    babotdata.json file system reads.
 *  • commandFunctions.js has a syntax error (unbalanced braces) documented in
 *    its JSDoc; it cannot be loaded at all until the braces are corrected.
 */

// ── Mocks must be declared BEFORE any require() calls (Jest hoists them). ────

// Stable "today" date used across all tests: June 15, 2025 (Sunday).
// NOTE: mock factory functions are hoisted by Jest and cannot reference
// variables declared with const/let in the outer scope unless they start with
// "mock" (case-insensitive). Inline the literal date here to avoid this.
jest.mock('../Tools/overrides', () => ({
  // June 15, 2025, midnight local time
  getD1: jest.fn(() => new Date(2025, 5, 15, 0, 0, 0, 0)),
}));

// Prevent morshin.js from reading emojiJSONCache.json at load time.
jest.mock('../Functions/HelperFunctions/slashFridayHelpers', () => ({
  resetRNG: jest.fn(),
  functionPostFunnyDOW: jest.fn(),
}));

const {
  FindDate,
  GetDate,
  dateDiffInDays,
} = require('../Functions/HelperFunctions/basicHelpers');

// ─── dateDiffInDays ───────────────────────────────────────────────────────────

describe('dateDiffInDays', () => {
  test('same day returns 0', () => {
    const a = new Date(2025, 0, 1);
    expect(dateDiffInDays(a, a)).toBe(0);
  });

  test('one day apart returns 1', () => {
    const a = new Date(2025, 0, 1);
    const b = new Date(2025, 0, 2);
    expect(dateDiffInDays(a, b)).toBe(1);
  });

  test('negative when b is before a', () => {
    const a = new Date(2025, 0, 10);
    const b = new Date(2025, 0, 1);
    expect(dateDiffInDays(a, b)).toBe(-9);
  });

  test('spans a month boundary correctly', () => {
    const a = new Date(2025, 0, 31); // Jan 31
    const b = new Date(2025, 1, 1); // Feb 1
    expect(dateDiffInDays(a, b)).toBe(1);
  });

  test('spans a year boundary correctly', () => {
    const a = new Date(2024, 11, 31); // Dec 31, 2024
    const b = new Date(2025, 0, 1); // Jan 1, 2025
    expect(dateDiffInDays(a, b)).toBe(1);
  });

  test('handles a leap year correctly (2024 has 366 days)', () => {
    const a = new Date(2024, 0, 1);
    const b = new Date(2025, 0, 1);
    expect(dateDiffInDays(a, b)).toBe(366);
  });

  test('handles a non-leap year correctly (2025 has 365 days)', () => {
    const a = new Date(2025, 0, 1);
    const b = new Date(2026, 0, 1);
    expect(dateDiffInDays(a, b)).toBe(365);
  });

  test('uses UTC to avoid DST anomalies', () => {
    // DST transitions can shift wall-clock hours; dateDiffInDays should return
    // exact integer day counts regardless. Test across a typical DST transition.
    const a = new Date(2025, 2, 8); // Mar 8 (US DST "spring forward" day)
    const b = new Date(2025, 2, 9); // Mar 9
    expect(dateDiffInDays(a, b)).toBe(1);
  });
});

// ─── FindDate ─────────────────────────────────────────────────────────────────

describe('FindDate – basic parsing', () => {
  test('parses a full month name with day and year', () => {
    const r = FindDate('december 25 2026');
    expect(r).not.toBeNull();
    expect(r.month).toBe(12);
    expect(r.day).toBe(25);
    expect(r.year).toBe(2026);
  });

  test('defaults year to current year when omitted (mocked as 2025)', () => {
    const r = FindDate('july 4');
    expect(r).not.toBeNull();
    expect(r.month).toBe(7);
    expect(r.day).toBe(4);
    expect(r.year).toBe(2025);
  });

  test('returns object with name="date" and mode=5', () => {
    const r = FindDate('march 15 2025');
    expect(r.name).toBe('date');
    expect(r.mode).toBe(5);
  });

  test('handles month before day token order', () => {
    const r = FindDate('november 11 2025');
    expect(r.month).toBe(11);
    expect(r.day).toBe(11);
  });

  test('handles day before month token order', () => {
    const r = FindDate('25 december 2026');
    expect(r.month).toBe(12);
    expect(r.day).toBe(25);
  });

  test('ignores !baba prefix', () => {
    const r = FindDate('!baba july 4 2025');
    expect(r.month).toBe(7);
    expect(r.day).toBe(4);
  });

  test('ignores "wednesday" noise word', () => {
    const r = FindDate('wednesday july 4 2025');
    expect(r.month).toBe(7);
    expect(r.day).toBe(4);
  });

  test('ignores "days until next" noise words', () => {
    const r = FindDate('days until next july 4 2025');
    expect(r.month).toBe(7);
    expect(r.day).toBe(4);
  });
});

describe('FindDate – month prefix-matching quirk', () => {
  // The implementation uses 'january'.includes(token) rather than
  // token === 'january', so ANY prefix of the month name matches.
  // Months are checked in calendar order so the FIRST matching month wins.

  test('"jan" matches january (month 1)', () => {
    expect(FindDate('jan 1 2025').month).toBe(1);
  });

  test('"feb" matches february (month 2)', () => {
    expect(FindDate('feb 14 2025').month).toBe(2);
  });

  test('"ma" matches MARCH (month 3), not may – because march is checked first', () => {
    // FindDate returns 1-based month numbers (January = 1, December = 12).
    // 'march'.includes('ma') → true (checked before may in calendar order)
    expect(FindDate('ma 1 2025').month).toBe(3); // 3 = March
  });

  test('"may" correctly matches may (month 5)', () => {
    // 'march'.includes('may') → false; 'may'.includes('may') → true
    expect(FindDate('may 1 2025').month).toBe(5);
  });

  test('"j" matches january (month 1), not june or july', () => {
    // 'january'.includes('j') → true (checked first)
    expect(FindDate('j 1 2025').month).toBe(1);
  });

  test('"ju" matches june (month 6)', () => {
    // 'january'.includes('ju') → false; ... 'june'.includes('ju') → true
    expect(FindDate('ju 1 2025').month).toBe(6);
  });

  test('"jul" matches july (month 7)', () => {
    expect(FindDate('jul 4 2025').month).toBe(7);
  });

  test('"au" matches august (month 8)', () => {
    expect(FindDate('au 10 2025').month).toBe(8);
  });

  test('"sep" matches september (month 9)', () => {
    expect(FindDate('sep 1 2025').month).toBe(9);
  });

  test('"oct" matches october (month 10)', () => {
    expect(FindDate('oct 31 2025').month).toBe(10);
  });

  test('"nov" matches november (month 11)', () => {
    expect(FindDate('nov 28 2025').month).toBe(11);
  });

  test('"dec" matches december (month 12)', () => {
    expect(FindDate('dec 25 2025').month).toBe(12);
  });
});

describe('FindDate – validation (null returns)', () => {
  test('returns null when no month is provided', () => {
    expect(FindDate('15 2025')).toBeNull();
  });

  test('returns null when no day is provided', () => {
    expect(FindDate('december 2025')).toBeNull();
  });

  test('returns null for an empty string', () => {
    expect(FindDate('')).toBeNull();
  });

  test('returns null for February 30 (> 29-day limit)', () => {
    expect(FindDate('february 30 2025')).toBeNull();
  });

  test('accepts February 29 (no leap-year check)', () => {
    // The code accepts day ≤ 29 for February regardless of whether the year
    // is actually a leap year; this is a known limitation.
    expect(FindDate('february 29 2025')).not.toBeNull();
  });

  test('returns null for April 31 (> 30-day limit)', () => {
    expect(FindDate('april 31 2025')).toBeNull();
  });

  test('returns null for June 31 (> 30-day limit)', () => {
    expect(FindDate('june 31 2025')).toBeNull();
  });

  test('returns null for September 31 (> 30-day limit)', () => {
    expect(FindDate('september 31 2025')).toBeNull();
  });

  test('returns null for November 31 (> 30-day limit)', () => {
    expect(FindDate('november 31 2025')).toBeNull();
  });

  test('accepts January 31 (31 days allowed)', () => {
    expect(FindDate('january 31 2025')).not.toBeNull();
  });
});

describe('FindDate – haiku mode (relaxed validation)', () => {
  test('does not return null for missing month when haiku=true', () => {
    const r = FindDate('25 2025', true);
    expect(r).not.toBeNull();
    expect(r.month).toBe(0);
  });

  test('does not return null for missing day when haiku=true', () => {
    const r = FindDate('december 2025', true);
    expect(r).not.toBeNull();
    expect(r.day).toBe(0);
  });

  test('year stays 0 when missing in haiku mode', () => {
    // With haiku=true the year is NOT defaulted to current year; it stays 0.
    const r = FindDate('december 25', true);
    expect(r.year).toBe(0);
  });
});

describe('FindDate – year parsing edge cases', () => {
  test('two-digit year (< 100) gets 2000 added', () => {
    const r = FindDate('july 4 25');
    expect(r.year).toBe(2025);
  });

  test('three/four-digit year stored as-is', () => {
    expect(FindDate('july 4 2030').year).toBe(2030);
  });

  test('second number (> 31) is used as year if day is already set', () => {
    // "december 25 25": day=25 (first token ≤31), second 25 → year=2025
    const r = FindDate('december 25 25');
    expect(r.day).toBe(25);
    expect(r.year).toBe(2025);
  });
});

// ─── GetDate ──────────────────────────────────────────────────────────────────

describe('GetDate – mode 0 (fixed date)', () => {
  const d1 = new Date(2025, 0, 1); // Jan 1, 2025

  test('returns the specified month and day', () => {
    const info = { mode: 0, month: 7, day: 4, name: 'independence day' };
    const r = GetDate(d1, 2025, info);
    expect(r.getMonth()).toBe(6); // July is month index 6
    expect(r.getDate()).toBe(4);
  });

  test('rolls to next year when the date has already passed', () => {
    // July 4 is after Jan 1 so for d1 = July 5 it should roll to 2026
    const past = new Date(2025, 6, 5); // Jul 5, 2025
    const info = { mode: 0, month: 7, day: 4, name: 'independence day' };
    const r = GetDate(past, 2025, info);
    expect(r.getFullYear()).toBe(2026);
    expect(r.getMonth()).toBe(6);
    expect(r.getDate()).toBe(4);
  });

  test('same day (today) is NOT rolled to next year', () => {
    const today = new Date(2025, 6, 4); // Jul 4, 2025
    const info = { mode: 0, month: 7, day: 4, name: 'holiday' };
    const r = GetDate(today, 2025, info);
    expect(r.getFullYear()).toBe(2025);
  });

  test('defaults month to 1 when month is 0', () => {
    const info = { mode: 0, month: 0, day: 15, name: 'test' };
    const r = GetDate(d1, 2025, info);
    expect(r.getMonth()).toBe(0); // January
  });

  test('defaults day to 1 when day is 0', () => {
    const info = { mode: 0, month: 3, day: 0, name: 'test' };
    const r = GetDate(d1, 2025, info);
    expect(r.getDate()).toBe(1);
  });
});

describe('GetDate – mode 1 (Nth weekday of month)', () => {
  test('Thanksgiving 2025 is November 27 (4th Thursday)', () => {
    const d1 = new Date(2025, 0, 1);
    // week: 4, dayofweek: 4 (Thursday), month: 11 (November)
    const info = { mode: 1, week: 4, dayofweek: 4, month: 11, name: 'thanksgiving' };
    const r = GetDate(d1, 2025, info);
    expect(r.getFullYear()).toBe(2025);
    expect(r.getMonth()).toBe(10); // November is index 10
    expect(r.getDate()).toBe(27);
    expect(r.getDay()).toBe(4); // Thursday
  });

  test('Labor Day 2025 is September 1 (1st Monday)', () => {
    const d1 = new Date(2025, 0, 1);
    const info = { mode: 1, week: 1, dayofweek: 1, month: 9, name: 'labor day' };
    const r = GetDate(d1, 2025, info);
    expect(r.getFullYear()).toBe(2025);
    expect(r.getMonth()).toBe(8); // September is index 8
    expect(r.getDay()).toBe(1); // Monday
  });
});

describe('GetDate – mode 3 (Easter)', () => {
  // Easter dates are pre-computed against known correct values.

  test('Easter 2023 is April 9', () => {
    const d1 = new Date(2023, 0, 1);
    const info = { mode: 3, name: 'easter' };
    const r = GetDate(d1, 2023, info);
    expect(r.getFullYear()).toBe(2023);
    expect(r.getMonth()).toBe(3); // April is index 3
    expect(r.getDate()).toBe(9);
  });

  test('Easter 2024 is March 31', () => {
    const d1 = new Date(2024, 0, 1);
    const info = { mode: 3, name: 'easter' };
    const r = GetDate(d1, 2024, info);
    expect(r.getFullYear()).toBe(2024);
    expect(r.getMonth()).toBe(2); // March is index 2
    expect(r.getDate()).toBe(31);
  });

  test('Easter 2025 is April 20', () => {
    const d1 = new Date(2025, 0, 1);
    const info = { mode: 3, name: 'easter' };
    const r = GetDate(d1, 2025, info);
    expect(r.getFullYear()).toBe(2025);
    expect(r.getMonth()).toBe(3); // April
    expect(r.getDate()).toBe(20);
  });

  test('rolls to next year when Easter has already passed', () => {
    // If today is after Easter 2025, GetDate should return Easter 2026.
    const afterEaster2025 = new Date(2025, 3, 21); // April 21, 2025
    const info = { mode: 3, name: 'easter' };
    const r = GetDate(afterEaster2025, 2025, info);
    expect(r.getFullYear()).toBe(2026);
  });
});
