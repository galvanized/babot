/**
 * @file viewReminders.js
 * @description Slash command that displays all reminders set by the invoking user.
 * Results are paginated and navigable via buttons when more than two reminders exist.
 * The reminder list is fetched from the in-memory reminder store.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { getUserReminder, handleButtonsEmbedReminders } = require('../Functions/HelperFunctions/remindersByBaba');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('viewreminders')
		.setDescription('View all reminders set by you!'),
	/**
	 * Fetches the invoking user's reminders, displays the paginated list, and attaches
	 * navigation buttons when more than two reminders exist.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) 
    {
        await interaction.deferReply();

        var message = await interaction.fetchReply();

        var reminderList = getUserReminder(interaction.user.id, 0);
        var finalComps = reminderList.finalComponents;
        if (finalComps != null)
            delete reminderList.finalComponents;
        
        await interaction.editReply(reminderList);
        if (reminderList.components != null && reminderList.components[0].components.length > 2)
        {
            handleButtonsEmbedReminders(interaction.channel, message, interaction.user.id, finalComps);
        }
 
        // TODO: get files working

        // await interaction.editReply({ content: "Milkers", ephemeral: true });
	},
};