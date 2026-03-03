/**
 * @file yugo.js
 * @description Slash command that returns a Yugo car image via babaYugo(). Used as a
 * fun/novelty command.
 */

const { babaYugo } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder().setName('make-yugo').setDescription('Makes you a Yugo'),
  /**
   * Calls babaYugo() and replies with a Yugo car image as a fun response.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply();
    await interaction.editReply(babaYugo());
  },
};
