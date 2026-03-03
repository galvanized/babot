/**
 * @module Tools/RNG
 * @description
 * Seeded pseudo-random number generator (PRNG) using a Linear Congruential
 * Generator (LCG) with GCC's canonical constants. Produces a deterministic
 * sequence from a given seed, making it suitable for reproducible randomness
 * (e.g., daily flag selection, test fixtures).
 *
 * LCG recurrence: state = (a * state + c) % m
 *   m = 2^31  (modulus)
 *   a = 1103515245  (multiplier – GCC stdlib constant)
 *   c = 12345  (increment – GCC stdlib constant)
 *
 * Note: LCG lower bits exhibit weak randomness; prefer `nextRange`/`nextFloat`
 * over direct modulo arithmetic on `nextInt` output.
 */

/**
 * Create a new seeded LCG RNG instance.
 *
 * @constructor
 * @param {number} [seed] - Optional integer seed. When omitted a random seed
 *   is chosen via `Math.random()`. Both `seed` and the initial `state` are set
 *   to this value.
 */
function RNG(seed) 
{
    // LCG using GCC's constants
    this.m = 0x80000000; // 2**31;
    this.a = 1103515245;
    this.c = 12345;

    this.seed = seed ? seed : Math.floor(Math.random() * (this.m - 1));
    this.state = this.seed;
}

/**
 * Advance the LCG state and return the next raw integer.
 *
 * @returns {number} Next pseudo-random integer in [0, 2^31 - 1].
 */
RNG.prototype.nextInt = function() 
{
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state;
}

/**
 * Return the next pseudo-random float in the range [0, 1].
 *
 * @returns {number} Float in [0, 1] (both endpoints inclusive).
 */
RNG.prototype.nextFloat = function() 
{
    // returns in range [0,1]
    return this.nextInt() / (this.m - 1);
}

/**
 * Return the next pseudo-random integer in the half-open range [start, end).
 *
 * Uses floating-point scaling instead of modulo to avoid LCG lower-bit bias.
 *
 * @param {number} start - Inclusive lower bound.
 * @param {number} end   - Exclusive upper bound.
 * @returns {number} Integer in [start, end).
 */
RNG.prototype.nextRange = function(start, end)
{
    // returns in range [start, end): including start, excluding end
    // can't modulu nextInt because of weak randomness in lower bits
    var rangeSize = end - start;
    var randomUnder1 = this.nextInt() / this.m;
    return start + Math.floor(randomUnder1 * rangeSize);
}

/**
 * Return a uniformly random element from `array`.
 *
 * @template T
 * @param {T[]} array - Non-empty array to pick from.
 * @returns {T} A randomly selected element.
 */
RNG.prototype.choice = function(array) 
{
    return array[this.nextRange(0, array.length)];
}

/**
 * Return the original seed this instance was created with.
 *
 * @returns {number} The seed value.
 */
RNG.prototype.getSeed = function() 
{
    return this.seed;
}

/**
 * Return the current internal state of the LCG (the most-recently generated
 * raw integer). Can be used to snapshot/restore the generator position.
 *
 * @returns {number} Current LCG state.
 */
RNG.prototype.getState = function() 
{
    return this.state;
}

/**
 * Re-seed the generator. Both `seed` and `state` are set to `seed`, effectively
 * resetting the sequence to its beginning.
 *
 * @param {number} seed - New seed value.
 */
RNG.prototype.setSeed = function(seed)
{
    this.seed = seed;
    this.state = seed;
}

module.exports = {
    RNG
};