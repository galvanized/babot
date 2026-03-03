/**
 * @file coinflip.js
 * @description Slash command that flips a coin with an animated GIF. Sends a random
 * coin-flip animation, then after a short delay reveals the result (Heads or Tails) in
 * a follow-up message and deletes the original deferred reply.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require('discord.js'); //discord module for interation with discord api
var babadata = require('../babotdata.json'); //baba configuration file

module.exports = {
  data: new SlashCommandBuilder().setName('coinflip').setDescription('Flips a coin!'),
  /**
   * Sends a random coin-flip GIF animation, then after 2 seconds sends the final
   * result (Heads or Tails) in a new message and deletes the original reply.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply();
    var templocal = babadata.datalocation + 'Extra/';
    var coinimg = Math.floor(Math.random() * 4);

    var coint = Math.floor(Math.random() * 2);

    var newAttch = new Discord.AttachmentBuilder(templocal + `/cf${coinimg}.gif`, {
      name: 'coin.gif',
      description: 'Its gonna be ' + (coint ? 'Heads' : 'Tails') + '!',
    }); //makes a new discord attachment

    await interaction.editReply({ content: 'Flipping Coin!', files: [newAttch] });

    var message = await interaction.fetchReply();

    setTimeout(function () {
      message.channel
        .send({ content: 'The coin flip result is: `' + (coint ? 'Heads' : 'Tails') + '`' })
        .then(interaction.deleteReply());
    }, 2000);
  },
};
