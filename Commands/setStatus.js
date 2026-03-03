/**
 * @file setStatus.js
 * @description Slash command that sets the bot's Discord presence status. The `status`
 * option accepts Online, Idle, Invisible, or Do Not Disturb. Default permissions are
 * disabled; intended for admin use only. Replies ephemerally confirming the new status.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setstatus')
		.setDescription("Sets baba's status")
        .setDefaultPermission(false)
        .addStringOption(option => 
            option.setName('status')
            .setRequired(true)
            .setDescription("baba's status")
            .addChoices(
                { name: 'Online', value: 'online' },
                { name: 'Idle', value: 'idle' },
                { name: 'Invisible', value: 'invisible' },
                { name: 'Do Not Disturb', value: 'dnd' }            
            )),
	/**
	 * Updates the bot's Discord presence status to the specified value and replies
	 * ephemerally confirming the new status.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) 
    {
		await interaction.deferReply({ ephemeral: true });
        var status = interaction.options.getString('status');

        bot.user.setStatus(status);
        await interaction.editReply({ content: `Baba is now ${status}`, ephemeral: true });
	},
};