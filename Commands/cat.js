/**
 * @file cat.js
 * @description Slash command that replies with a random cat emoji or the text "CAT!".
 * Picks randomly from a list of cat-themed emoji and strings.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { babaCat } = require('../Functions/commandFunctions.js');

module.exports = {
  data: new SlashCommandBuilder().setName('cat').setDescription('Gives Cat!'),
  /**
   * Replies immediately with a random cat emoji or the text "CAT!".
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    var cats = ['😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🐈', '🐱', 'CAT!'];
    await interaction.reply(cats[Math.floor(Math.random() * cats.length)]);
    // babaCat(function(val)
    // {
    // 	interaction.editReply("CAT!");
    // });
  },
};
