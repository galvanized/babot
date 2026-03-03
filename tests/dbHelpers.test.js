'use strict';

/**
 * @file dbHelpers.test.js
 * @description Unit tests for Functions/HelperFunctions/dbHelpers.js.
 *
 * Testable without mocking:
 *   - sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise – pure string
 *     transformation, no external state.
 *   - normalizeMSG – pure character substitution over module-level `lookuptable`.
 *     When loadInDBFSV has not been called (fresh module load), lookuptable is
 *     empty and normalizeMSG acts as a passthrough.
 *
 * Architecture note – loadInDBFSV:
 *   loadInDBFSV reads babadata.datalocation + 'comparisions.fsv' from disk.
 *   Testing it directly requires either:
 *     Option A: A real .fsv fixture file at the configured data location.
 *     Option B: Mock the `fs` module so readFileSync returns synthetic data.
 *     Option C: Parameterise the file path (requires a small refactor).
 *   The empty-lookuptable passthrough tests below work without any of these.
 *   Integration-level tests for loadInDBFSV + normalizeMSG are deferred until
 *   Option A or B is implemented (see the skipped placeholder test below).
 */

const {
  sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise: sqlEscape,
  normalizeMSG,
} = require('../Functions/HelperFunctions/dbHelpers');

// ─── SQL escape ──────────────────────────────────────────────────────────────

describe('sqlEscape – clean strings', () => {
  test('leaves a plain ASCII string unchanged', () => {
    expect(sqlEscape('hello world')).toBe('hello world');
  });

  test('leaves digits unchanged', () => {
    expect(sqlEscape('12345')).toBe('12345');
  });

  test('leaves an empty string unchanged', () => {
    expect(sqlEscape('')).toBe('');
  });
});

describe('sqlEscape – special characters', () => {
  test("escapes single quotes", () => {
    expect(sqlEscape("it's")).toBe("it\\'s");
  });

  test('escapes double quotes', () => {
    expect(sqlEscape('say "hi"')).toBe('say \\"hi\\"');
  });

  test('escapes backslash', () => {
    expect(sqlEscape('a\\b')).toBe('a\\\\b');
  });

  test('escapes percent sign', () => {
    expect(sqlEscape('100%')).toBe('100\\%');
  });

  test('escapes newline', () => {
    expect(sqlEscape('line1\nline2')).toBe('line1\\nline2');
  });

  test('escapes carriage return', () => {
    expect(sqlEscape('line1\rline2')).toBe('line1\\rline2');
  });

  test('escapes tab', () => {
    expect(sqlEscape('col1\tcol2')).toBe('col1\\tcol2');
  });

  test('escapes NUL byte', () => {
    expect(sqlEscape('a\0b')).toBe('a\\0b');
  });

  test('escapes backspace (\\x08)', () => {
    expect(sqlEscape('a\x08b')).toBe('a\\bb');
  });

  test('escapes SUB/EOF (\\x1a)', () => {
    expect(sqlEscape('a\x1ab')).toBe('a\\zb');
  });
});

describe('sqlEscape – SQL injection payloads', () => {
  test("neutralises classic ' OR '1'='1", () => {
    const payload = "' OR '1'='1";
    const escaped = sqlEscape(payload);
    expect(escaped).not.toContain("' OR '");
    expect(escaped).toBe("\\' OR \\'1\\'=\\'1");
  });

  test('neutralises DROP TABLE attempt', () => {
    const payload = "'; DROP TABLE users; --";
    const escaped = sqlEscape(payload);
    // all quotes should be escaped
    expect(escaped).not.toMatch(/(?<!\\)'/);
  });

  test('escapes multiple special chars in one string', () => {
    // Both single-quote and percent appear
    expect(sqlEscape("100% 'safe'")).toBe("100\\% \\'safe\\'");
  });
});

// ─── normalizeMSG – empty lookup table (passthrough) ─────────────────────────

describe('normalizeMSG – passthrough (empty lookuptable)', () => {
  // When loadInDBFSV has not been called the internal lookuptable is empty and
  // every character is passed through unchanged.

  test('returns plain ASCII unchanged', () => {
    expect(normalizeMSG('hello world')).toBe('hello world');
  });

  test('returns an empty string unchanged', () => {
    expect(normalizeMSG('')).toBe('');
  });

  test('handles multi-byte Unicode without modification', () => {
    const emoji = '😀🐸✅';
    expect(normalizeMSG(emoji)).toBe(emoji);
  });

  test('handles a string with spaces unchanged', () => {
    expect(normalizeMSG('foo bar baz')).toBe('foo bar baz');
  });
});

// ─── normalizeMSG – with substitutions (deferred) ────────────────────────────

describe('normalizeMSG – with loaded substitution table', () => {
  /**
   * Options for testing normalizeMSG with actual substitutions:
   *
   * Option A – fixture .fsv file:
   *   Create tests/__fixtures__/Data/comparisions.fsv and call loadInDBFSV()
   *   in beforeAll. Requires a Data directory and a valid FSV file.
   *
   * Option B – mock fs.readFileSync:
   *   jest.spyOn(fs, 'readFileSync').mockReturnValue(syntheticFSVData).
   *   Avoids on-disk fixtures but requires careful module isolation.
   *
   * Option C – expose lookuptable for tests:
   *   Add a setLookupTableForTesting(obj) export. Minimal change to the
   *   module that avoids touching the production code path.
   *
   * These are NOT implemented yet; the skip marker is a placeholder.
   */
  test.todo('substitutes homoglyph characters after loadInDBFSV (Option A/B/C above)');
  test.todo('two-character space lookahead skips space when canonical+space maps');
});
