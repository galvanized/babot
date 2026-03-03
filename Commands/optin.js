/**
 * @file optin.js
 * @description Slash command that opts the invoking user into a baba data analysis
 * feature. Currently supports opting in to Voice Activity tracking. Reports success or
 * error via an ephemeral reply.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { optIn } = require('../Functions/Database/databaseVoiceController.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('optin')
    .setDescription('Opt-into the baba data analysis!')
    .addStringOption((option) =>
      option
        .setName('choices')
        .setDescription('What to opt in to!')
        .setRequired(true)
        .addChoices({ name: 'Voice Activity', value: 'voice' })
    ),
  /**
   * Opts the invoking guild member into the specified data analysis feature (e.g.,
   * Voice Activity tracking) and replies ephemerally with success or an error message.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply();
    var opts = interaction.options.getString('choices');
    optIn(interaction.member, opts, function (err) {
      if (err) {
        interaction.editReply({ content: 'Error: ' + err, ephemeral: true });
      } else {
        interaction.editReply({ content: 'Opted in to ' + opts, ephemeral: true });
      }
    });
  },
};
