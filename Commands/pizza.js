/**
 * @file pizza.js
 * @description Slash command stub that "orders" a pizza by calling babaPizza() and
 * replying with the result. Intended as a fun/novelty command.
 */

const { babaPizza } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder().setName('pizza').setDescription('Orders you pizza ;)'),
  /**
   * Calls babaPizza() and replies immediately with the result as a fun pizza-ordering
   * stub response.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.reply(babaPizza());
  },
};
