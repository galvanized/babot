/**
 * @module HelperFunctions.dbHelpers
 * @description
 * Low-level database and message-normalization utilities used across the bot.
 *
 * Responsibilities:
 * - SQL injection prevention via a hand-rolled escape function.
 * - Loading a character-substitution lookup table from a frog-delimited (🐸)
 *   `.fsv` file on disk, which maps look-alike / alternate-script characters
 *   back to their canonical ASCII equivalents.
 * - Normalizing incoming Discord message content using that lookup table so
 *   that subsequent `includes()` checks work reliably regardless of homoglyph
 *   substitution or special-character tricks.
 *
 * Global side effects:
 * - `loadInDBFSV` populates the module-level `lookuptable` and mutates
 *   `global.reverseLook` (used by other modules to map canonical characters
 *   back to their known alternates).
 */
var babadata = require('../../babotdata.json'); //baba configuration file

const fs = require('fs');

// Module-level forward-lookup table: maps alternative/homoglyph character
// strings to their canonical lowercase equivalents. Populated by `loadInDBFSV`.
var lookuptable = {};
// Reverse-lookup table exposed globally: maps canonical names to arrays of
// all known alternative spellings/characters. Populated by `loadInDBFSV`.
global.reverseLook = {};

/**
 * Escape a string for safe use in a raw MySQL query string.
 *
 * Handles the following special characters by prefixing them with a backslash
 * or replacing them with their escape sequences:
 *   NUL (\\0), backspace (\\b), tab (\\t), SUB/EOF (\\z),
 *   newline (\\n), carriage return (\\r), double-quote (\"),
 *   single-quote (\'), backslash (\\), percent (\\%).
 *
 * Note: This is a manual escaper kept as a named helper for documentation
 * clarity. Prefer parameterized queries (`mysql2` placeholders) whenever
 * possible; use this only when a raw string must be embedded.
 *
 * @param {string} str - The raw user-supplied string to escape.
 * @returns {string} The escaped string safe for embedding in a SQL query.
 */
function sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise(str) {
  return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
    switch (char) {
      case '\0':
        return '\\0';
      case '\x08':
        return '\\b';
      case '\x09':
        return '\\t';
      case '\x1a':
        return '\\z';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '"':
      case "'":
      case '\\':
      case '%':
        return '\\' + char;
      default:
        return char;
    }
  });
}

/**
 * Load the character-substitution lookup table from the `.fsv` data file.
 *
 * File format (`comparisions.fsv`):
 * - Lines are delimited by `🐸` (frog emoji).
 * - Column 1 (index 0): row label (skipped).
 * - Column 2 (index 1): canonical lowercase form (the "actual" value).
 * - Columns 3+ (index 2..n-2): alternative representations that should be
 *   mapped TO the canonical form.
 * - The last two columns are trailing delimiters and are skipped.
 *
 * Side effects:
 * - Populates the module-level `lookuptable` mapping alternatives → canonical.
 * - Populates `global.reverseLook` mapping canonical names → arrays of
 *   alternative characters/strings.
 *
 * This function must be called once at startup (via `dailycall.js`) before
 * `normalizeMSG` can perform substitutions.
 */
function loadInDBFSV() {
  var rawdata = fs.readFileSync(babadata.datalocation + 'comparisions.fsv', {
    encoding: 'utf8',
    flag: 'r',
  });
  //console.log(rawdata);
  var result = rawdata.split(/\r?\n/);
  for (var i = 1; i < result.length; i++) {
    var lnez = result[i].split('🐸');
    var actual = '';
    var atchually = '';
    for (var j = 1; j < lnez.length - 2; j++) {
      iteml = lnez[j].toLowerCase();

      if (j == 1) {
        actual = iteml;
        atchually = lnez[j];
        if (global.reverseLook[lnez[j]] == undefined) global.reverseLook[lnez[j]] = [];
      } else {
        if (typeof lookuptable[iteml] == 'undefined' && iteml != actual) {
          lookuptable[iteml] = actual;
        }

        if (global.reverseLook[atchually] == undefined) global.reverseLook[atchually] = [];
        global.reverseLook[atchually].push(lnez[j]);
      }
    }
  }
}

/**
 * Normalize a Discord message string by replacing known homoglyph / alternate
 * characters with their canonical equivalents using `lookuptable`.
 *
 * Behavior:
 * - Iterates over the Unicode code-point array of `msgContent` (spread via
 *   `[...str]` to handle multi-byte characters correctly).
 * - For each character: if it has a mapping in `lookuptable`, the canonical
 *   form is appended to the output and the next character is consumed too if
 *   the two-character sequence (char + space) also has a mapping.
 * - Characters with no mapping are passed through unchanged.
 *
 * Precondition: `loadInDBFSV()` must have been called to populate `lookuptable`.
 *
 * @param {string} msgContent - Raw (lowercase) message content to normalize.
 * @returns {string} Normalized message with homoglyphs replaced.
 */
function normalizeMSG(msgContent) {
  var newmesg = '';

  var msCNT = [...msgContent];

  for (var i = 0; i < msCNT.length; i++) {
    var c = msCNT[i];

    if (lookuptable[c] != undefined) {
      newmesg += lookuptable[c];
      if (lookuptable[c + ' '] != undefined && msCNT[i + 1] == ' ') {
        i++;
      }
    } else {
      newmesg += c;
    }
  }

  return newmesg;
}

module.exports = {
  sqlEscapeStringThingforAdamBecauseHeWillDoanSQLInjectionOtherwise,
  loadInDBFSV,
  normalizeMSG,
};
