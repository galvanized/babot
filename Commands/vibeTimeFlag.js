/**
 * @file vibeTimeFlag.js
 * @description Slash command that returns the current vibe time / night shift flag image
 * by calling babaVibeFlag(). Used to celebrate or indicate the current vibe time period.
 */

const { babaVibeFlag } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vibe-time-flag')
    .setDescription('Gives the Vibe Time Flag for the current vibe time'),
  /**
   * Calls babaVibeFlag() and replies with the current vibe time / night shift flag
   * image.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply();
    await interaction.editReply(babaVibeFlag());
  },
};
