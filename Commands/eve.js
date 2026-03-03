/**
 * @file eve.js
 * @description Slash command that displays how many "eves" (days before) until or since
 * a specified holiday or event. If multiple results are returned they are presented with
 * navigation buttons via FrogButtons. If the result is "FUNNYDOW" a day-of-week fun
 * message is posted instead.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { babaUntilHolidays } = require('../Functions/commandFunctions.js');
const { FrogButtons } = require("../Functions/HelperFunctions/basicHelpers.js");
const { functionPostFunnyDOW } = require("../Functions/HelperFunctions/slashFridayHelpers.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('eve')
		.setDescription('Gives the date in eves until or since!')
		.addStringOption(opt => 
			opt.setName("event")
			.setDescription("The event that will get used.")
			.setRequired(true)),
	/**
	 * Fetches holiday/event data for the given event string as "eves" (days before the
	 * event), then posts the result with optional FrogButtons pagination or falls back
	 * to a funny day-of-week message when signalled.
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
        
        var texts = await babaUntilHolidays(`${event} eves`, interaction.user, "04");

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