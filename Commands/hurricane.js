/**
 * @file hurricane.js
 * @description Slash command that displays the latest hurricane tracking info from the
 * National Hurricane Center. An optional `name` option can be provided to track a
 * specific hurricane; if omitted the full Atlantic basin overview is returned.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { babaHurricane } = require('../Functions/commandFunctions.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hurricane')
    .setDescription('Displays the latest hurricane info from the National Hurricane Center')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('name of the hurricane to track, blank for whole atlantic')
    ),
  /**
   * Fetches the latest hurricane tracking data from the National Hurricane Center,
   * optionally filtered by the provided hurricane name, and replies with the result.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply();
    var name = interaction.options.getString('name');
    babaHurricane(name, function (val) {
      interaction.editReply(val);
    });
  },
};
