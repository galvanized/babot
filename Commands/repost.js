/**
 * @file repost.js
 * @description Slash command that returns a repost-detection image as a fun response.
 * Acts as a manual repost-detection placeholder while an AI update is in development.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { babaRepost } = require('../Functions/commandFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('repost')
    .setDescription('Manual repost detection while Jeremy is working on the AI update.'),
  /**
   * Calls babaRepost() and replies with the repost-detection image as a fun response.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply();
    await interaction.editReply(babaRepost());
  },
};
