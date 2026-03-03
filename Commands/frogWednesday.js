/**
 * @file frogWednesday.js
 * @description Slash command (`/wednesday`) that generates a frog image with the number
 * of Wednesdays remaining until a specified holiday or event. Supports paginated results
 * via FrogButtons with a short delay, and falls back to a funny day-of-week message when
 * the result is "FUNNYDOW".
 */

const { babaUntilHolidays } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { FrogButtons } = require("../Functions/HelperFunctions/basicHelpers.js");
const { functionPostFunnyDOW } = require("../Functions/HelperFunctions/slashFridayHelpers.js");

module.exports = {
	data: new SlashCommandBuilder()
    .setName('wednesday')
    .setDescription('Generates a frog with how many wednesday until an event!')
    .addStringOption(opt => 
        opt.setName("event")
        .setDescription("The event that will get used.")
        .setRequired(true)),
	/**
	 * Fetches the number of Wednesdays remaining until the given event and replies with
	 * a frog image. Uses FrogButtons pagination for multiple results with a 1-second
	 * delay before attaching navigation controls.
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
        
        var texts = await babaUntilHolidays(`${event} wednesday`, interaction.user, "04");
        
        if (texts.length > 1)
        {
            setTimeout(async function()
            {
                FrogButtons(texts, interaction, message);
                await interaction.editReply(texts[0]);
            }, 1000);
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
                setTimeout(async function()
                {
                    await interaction.editReply(texts[0]);
                }, 1000);
            }
        }
	},
};