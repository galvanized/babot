'use strict';

/**
 * @file rng.test.js
 * @description Unit tests for the seeded LCG pseudo-random number generator
 * in Tools/RNG.js.
 *
 * RNG is one of the few modules in the codebase that has zero external
 * dependencies (no Discord, no file I/O, no babotdata.json), making it an
 * ideal starting point for unit testing.
 *
 * Architecture note – what makes testing other modules hard:
 *   Almost every other module does `require('../../babotdata.json')` at the
 *   top of the file, which causes immediate failures in an environment without
 *   the real config file. The jest.config.js moduleNameMapper redirects all
 *   babotdata.json requires to a safe fixture, but many modules also import
 *   discord.js objects, perform file-system reads at load-time (e.g.
 *   morshin.js reads emojiJSONCache.json), or reference globals that are only
 *   set up by babot.js. Those modules require additional mocking. See the
 *   comments in basicHelpers.test.js and dbHelpers.test.js for how that is
 *   handled.
 */

const { RNG } = require('../Tools/RNG');

describe('RNG – constructor', () => {
  test('uses provided seed', () => {
    const rng = new RNG(42);
    expect(rng.getSeed()).toBe(42);
    expect(rng.getState()).toBe(42);
  });

  test('generates a random seed when none is provided', () => {
    const rng = new RNG();
    // seed must be in [0, 2^31 - 1)
    expect(rng.getSeed()).toBeGreaterThanOrEqual(0);
    expect(rng.getSeed()).toBeLessThan(0x80000000);
  });
});

describe('RNG – nextInt determinism', () => {
  test('produces the same sequence for the same seed', () => {
    const a = new RNG(1);
    const b = new RNG(1);
    for (let i = 0; i < 20; i++) {
      expect(a.nextInt()).toBe(b.nextInt());
    }
  });

  test('produces different sequences for different seeds', () => {
    const a = new RNG(1);
    const b = new RNG(2);
    const seqA = Array.from({ length: 5 }, () => a.nextInt());
    const seqB = Array.from({ length: 5 }, () => b.nextInt());
    expect(seqA).not.toEqual(seqB);
  });

  test('first output for seed 1 matches LCG formula: (a*1 + c) % m = 1103527590', () => {
    const rng = new RNG(1);
    // (1103515245 * 1 + 12345) % 2147483648 = 1103527590
    // This intermediate value is small enough to be exact in JS floating-point.
    expect(rng.nextInt()).toBe(1103527590);
  });

  test('second output is deterministic – both sides use the same JS float arithmetic', () => {
    // After seed 1 the first state is 1103527590.
    // The next state = (1103515245 * 1103527590 + 12345) % 2^31.
    // The intermediate product exceeds Number.MAX_SAFE_INTEGER (~9e15) so it
    // is subject to IEEE-754 rounding – but BOTH this expression and the RNG
    // use JavaScript arithmetic, so they round identically and the assertion holds.
    const rng = new RNG(1);
    rng.nextInt(); // advance to state 1103527590
    const expected = (1103515245 * 1103527590 + 12345) % 0x80000000;
    expect(rng.nextInt()).toBe(expected);
  });

  test('seed=0 is treated as "no seed" due to falsy check – documents known quirk', () => {
    // The constructor uses `seed ? seed : Math.floor(Math.random() * (m - 1))`.
    // Because 0 is falsy in JavaScript, new RNG(0) ignores the provided 0
    // and generates a random seed instead. This means seed 0 cannot be used
    // for reproducible sequences; callers expecting a deterministic sequence
    // seeded at 0 will silently get a random one.
    const rng = new RNG(0);
    expect(rng.getSeed()).not.toBe(0);
  });

  test('nextInt output is always in [0, 2^31 - 1]', () => {
    const rng = new RNG(999);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextInt();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0x7fffffff);
    }
  });
});

describe('RNG – nextFloat', () => {
  test('output is always in [0, 1]', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 100; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('is deterministic with same seed', () => {
    const a = new RNG(123);
    const b = new RNG(123);
    for (let i = 0; i < 20; i++) {
      expect(a.nextFloat()).toBe(b.nextFloat());
    }
  });
});

describe('RNG – nextRange', () => {
  test('output is always within [start, end)', () => {
    const rng = new RNG(55);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextRange(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });

  test('returns only the single possible value when start === end - 1', () => {
    const rng = new RNG(1);
    for (let i = 0; i < 10; i++) {
      expect(rng.nextRange(7, 8)).toBe(7);
    }
  });

  test('is deterministic with same seed', () => {
    const a = new RNG(42);
    const b = new RNG(42);
    for (let i = 0; i < 20; i++) {
      expect(a.nextRange(0, 100)).toBe(b.nextRange(0, 100));
    }
  });

  test('covers the full range over many samples', () => {
    const rng = new RNG(0);
    const seen = new Set();
    for (let i = 0; i < 5000; i++) {
      seen.add(rng.nextRange(0, 10));
    }
    for (let v = 0; v < 10; v++) {
      expect(seen.has(v)).toBe(true);
    }
  });
});

describe('RNG – choice', () => {
  test('always returns an element from the array', () => {
    const rng = new RNG(12);
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.choice(arr));
    }
  });

  test('returns the only element for a single-element array', () => {
    const rng = new RNG(0);
    expect(rng.choice(['only'])).toBe('only');
  });

  test('is deterministic with same seed', () => {
    const arr = [10, 20, 30, 40, 50];
    const a = new RNG(7);
    const b = new RNG(7);
    for (let i = 0; i < 20; i++) {
      expect(a.choice(arr)).toBe(b.choice(arr));
    }
  });
});

describe('RNG – setSeed', () => {
  test('resets the sequence to the beginning', () => {
    const rng = new RNG(100);
    const first = Array.from({ length: 5 }, () => rng.nextInt());
    rng.setSeed(100);
    const second = Array.from({ length: 5 }, () => rng.nextInt());
    expect(first).toEqual(second);
  });

  test('updates both seed and state', () => {
    const rng = new RNG(1);
    rng.nextInt(); // advance state
    rng.setSeed(999);
    expect(rng.getSeed()).toBe(999);
    expect(rng.getState()).toBe(999);
  });
});
