/**
 * @file friday.js
 * @description Slash command that returns the Friday image when called on a Friday.
 * If it is not Friday, there is a 5% chance of a prank (posts the Friday image then
 * reveals the joke after 12 seconds), otherwise posts a day-of-week fun message.
 * On Fridays, also resets the user's count-ruin tracking.
 */

const { babaFriday } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const {
  removeCountRuin,
  functionPostFunnyDOW,
} = require('../Functions/HelperFunctions/slashFridayHelpers.js');
const { getD1 } = require('../Tools/overrides.js');

module.exports = {
  data: new SlashCommandBuilder().setName('friday').setDescription('Friday :)'),
  /**
   * Returns the Friday image when invoked on a Friday and resets the user's count-ruin
   * tracking. If it is not Friday, posts a funny day-of-week message with a 5% chance
   * of a temporary prank that reveals itself after 12 seconds.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply();
    var tod = getD1(); //get today
    if (tod.getDay() != 5) {
      if (Math.random() < 0.05) {
        await interaction.editReply(await babaFriday(true));
        var message = await interaction.fetchReply();

        setTimeout(function () {
          msgs = [
            "Haha, it's not Friday! Gottem!",
            'You thought it was Friday? Silly Buddy',
            'You got Kerpranked, it aint Friday',
          ];
          message.channel
            .send({ content: msgs[Math.floor(Math.random() * msgs.length)] })
            .then((msg) => {
              interaction.deleteReply();
              setTimeout(function () {
                msg.delete();
              }, 5000);
            });
        }, 12000);
      } else {
        await functionPostFunnyDOW('interaction', interaction, 5);
      }
    } else {
      var guild = interaction.guild;
      removeCountRuin(interaction.user.id, guild);
      await interaction.editReply(await babaFriday());
    }
  },
};
