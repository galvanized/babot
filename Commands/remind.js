/**
 * @file remind.js
 * @description Slash command that sets a reminder for the invoking user. Requires a
 * `message` and a `time` option; an optional `date` can be specified (defaults to the
 * next occurrence within 24 hours). Replies ephemerally with a Discord timestamp showing
 * when the reminder will fire. Note: reminders are lost if the bot restarts.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { babaRemind } = require('../Functions/commandFunctions.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('remind')
		.setDescription('Reminds a user of something at a specific time')
        .addStringOption(option => option.setName('message').setDescription('The message to me reminded of!').setRequired(true))
        .addStringOption(option => option.setName('time').setDescription('The time to be reminded at!').setRequired(true))
        .addStringOption(option => option.setName('date').setDescription('The date of the reminder, optional defaults within next 24 hours!')),
	/**
	 * Parses the provided message, time, and optional date to schedule a reminder for
	 * the invoking user. Replies ephemerally with a Discord timestamp indicating when
	 * the reminder will fire. Reminders are lost if the bot restarts.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) 
    {
        await interaction.deferReply({ ephemeral: true });
        
        var message = interaction.options.getString('message');
        var time = interaction.options.getString('time');
        var date = interaction.options.getString('date');

        var actualtime = await babaRemind(message, time, date, interaction);
        var milisec = actualtime.getTime() / 1000;
        // add timezone offset
        // milisec += actualtime.getTimezoneOffset() * 60;
        
        // round to nearest second
        milisec = Math.round(milisec);

        await interaction.editReply({ content: 'Reminder Set: <t:' + milisec + ':R> which is <t:' + milisec + ':F>, if baba crashes, tough luck no reminder!', ephemeral: true });
	},
};