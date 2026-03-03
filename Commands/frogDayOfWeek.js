/**
 * @file frogDayOfWeek.js
 * @description Slash command (`/day_of_week`) that returns the day of the week on which
 * a specified holiday or event falls. Supports paginated results via FrogButtons and
 * falls back to a funny day-of-week message when the result is "FUNNYDOW".
 */

const { babaUntilHolidays } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { FrogButtons } = require("../Functions/HelperFunctions/basicHelpers.js");
const { functionPostFunnyDOW } = require("../Functions/HelperFunctions/slashFridayHelpers.js");

module.exports = {
	data: new SlashCommandBuilder()
    .setName('day_of_week')
    .setDescription('The day of week for the specified event!')
    .addStringOption(opt => 
        opt.setName("event")
        .setDescription("The event that will get used.")
        .setRequired(true)),
	/**
	 * Fetches the day-of-week information for the given event string and replies with
	 * the result, using FrogButtons pagination for multiple results or a funny
	 * day-of-week message when signalled.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		await interaction.deferReply();
        var event = interaction.options.getString("event");
        var message = await interaction.fetchReply();
        
        var texts = await babaUntilHolidays(`${event} day of week`, interaction.user, "04");

        if (texts.length > 1)
        {
            FrogButtons(texts, interaction, message);
            await interaction.editReply(texts[0]);
        }
        else 
        {
            if (texts[0].files == null)
            {
                var text = texts[0].content;

                if (text == "FUNNYDOW")
                    await functionPostFunnyDOW("interaction", interaction, 3);
                else
                    await interaction.editReply(text);
            }
            else 
            {
                await interaction.editReply(texts[0]);
            }
        }
	},
};