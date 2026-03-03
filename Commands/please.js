/**
 * @file please.js
 * @description Slash command that responds with a "BABA IS ADMIN" header followed by the
 * result of babaPlease(). Used as a fun/administrative acknowledgment command.
 */

const { babaPlease } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder().setName('please').setDescription('>:('),
  /**
   * Prepends "BABA IS ADMIN\n" to the result of babaPlease() and replies immediately.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    var admin = 'BABA IS ADMIN\n';
    await interaction.reply(admin + babaPlease().content);
  },
};
