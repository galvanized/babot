/**
 * @module Tools/overrides
 * @description
 * Utility helpers for date retrieval and per-environment override flags.
 *
 * `getD1` centralizes all "what is today?" queries so that a single
 * hard-coded override (`dateoveride`) can redirect the entire bot to behave
 * as if a different date is active – useful for manual holiday/testing
 * scenarios without changing system time.
 *
 * `getOverides` returns a small configuration object of boolean flags that
 * control runtime behavior such as error suppression and debug mode for
 * Friday-related features.
 */

/**
 * Return the current date, optionally overriding it for testing.
 *
 * Behavior:
 * - `dateoveride[0]` gates the override: when `true` (and `ignoreOveride` is
 *   `false`) the returned `Date` is constructed from the year-of-today combined
 *   with the hard-coded month/day in `dateoveride[1]`/`dateoveride[2]`.
 * - When `getHours` is `false` (default) the time portion is zeroed to
 *   midnight (00:00:00.000 local) so date-only comparisons are stable.
 * - When `getHours` is `true` the full current time is preserved (useful for
 *   computing elapsed time, e.g. uptime).
 *
 * @param {boolean} [getHours=false] - When `true` preserve the time-of-day
 *   component; when `false` set time to midnight.
 * @param {boolean} [ignoreOveride=false] - When `true` always return the real
 *   system date even if `dateoveride[0]` is enabled.
 * @returns {Date}
 */
function getD1(getHours = false, ignoreOveride = false) {
  var dateoveride = [false, 4, 28]; //allows for overiding date manually (testing)
  var d1 = new Date(); //get current date
  if (dateoveride[0] && !ignoreOveride) //if we are overiding the date
  {
    var yr = d1.getFullYear(); //get this year
    var dy = dateoveride[2]; //get this day
    var my = dateoveride[1] - 1; //get this month
    d1 = new Date(yr, my, dy);
  }

  if (!getHours)
    //if we want to get the hours
    d1.setHours(0, 0, 0, 0); //set time to midnight

  return d1;
}

/**
 * Return the current set of runtime override flags.
 *
 * Flags:
 * - `uignoreErrors` {boolean} – When `true`, uncaught exceptions and error
 *   output are silently suppressed in `babot.js`. Defaults to `false`.
 * - `DebugFriday` {boolean} – When `true`, Friday-related logic in the bot
 *   behaves as though it is always Friday. Defaults to `false`.
 *
 * These values are centralized here so they can be toggled for a release or
 * test build without touching consumer code.
 *
 * @returns {{ uignoreErrors: boolean, DebugFriday: boolean }}
 */
function getOverides() {
  var uignoreErrors = false;
  var DebugFriday = false;
  return {
    uignoreErrors: uignoreErrors,
    DebugFriday: DebugFriday,
  };
}

module.exports = {
  getD1,
  getOverides,
};
