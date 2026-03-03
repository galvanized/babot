/**
 * @file frogWhenIs.js
 * @description Slash command (`/when`) with `is` and `isnt` subcommands that returns the
 * date when a specified holiday or event occurs (or does not occur). Supports paginated
 * results via FrogButtons and falls back to a funny day-of-week message when the result
 * is "FUNNYDOW".
 */

const { babaUntilHolidays } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { FrogButtons } = require('../Functions/HelperFunctions/basicHelpers.js');
const { functionPostFunnyDOW } = require('../Functions/HelperFunctions/slashFridayHelpers.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('when')
    .setDescription('Frog!')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('is')
        .setDescription('When is the specified event!')
        .addStringOption((opt) =>
          opt.setName('event').setDescription('The event that will get used.').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('isnt')
        .setDescription('When is the specified event not occuring!')
        .addStringOption((opt) =>
          opt.setName('event').setDescription('The event that will get used.').setRequired(true)
        )
    ),
  /**
   * Fetches the date when the given event occurs (or does not occur) using the chosen
   * subcommand (`is`/`isnt`). Replies with FrogButtons pagination for multiple results
   * or a funny day-of-week message when signalled.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply();
    var event = interaction.options.getString('event');
    var message = await interaction.fetchReply();

    var subCommand = interaction.options.getSubcommand();
    var nt = '';
    if (subCommand === 'isnt') nt = 'nt';

    var texts = await babaUntilHolidays(`${event} when is${nt}`, interaction.user, '04');

    if (texts.length > 1) {
      FrogButtons(texts, interaction, message);
      await interaction.editReply(texts[0]);
    } else {
      if (texts[0].files == null) {
        var text = texts[0].content;

        if (text == 'FUNNYDOW') await functionPostFunnyDOW('interaction', interaction, 3);
        else await interaction.editReply(text);
      } else {
        await interaction.editReply(texts[0]);
      }
    }
  },
};
