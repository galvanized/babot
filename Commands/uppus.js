/**
 * @file uppus.js
 * @description Slash command that reports how long the bot has been running since its
 * start time (stored in `global.starttime`). Displays the uptime broken down into days,
 * hours, minutes, seconds, and milliseconds.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { getD1 } = require('../Tools/overrides');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('uppus')
		.setDescription('How long baba has been awoken to the mortal realm for the rot consumes.'), 
	/**
	 * Calculates the bot's uptime from `global.starttime` to now and replies with the
	 * duration broken down into days, hours, minutes, seconds, and milliseconds.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) 
        {
                var start = global.starttime;
                var now = getD1(true);
                var diff = now - start;
                var diffDays = Math.floor(diff / 86400000); // days
                var diffHrs = Math.floor((diff % 86400000) / 3600000); // hours
                var diffMins = Math.floor(((diff % 86400000) % 3600000) / 60000); // minutes
                var diffSecs = Math.floor((((diff % 86400000) % 3600000) % 60000) / 1000); // seconds
                var diffMs = Math.floor((((diff % 86400000) % 3600000) % 60000) % 1000); // milliseconds
                var diffString = diffDays + " days, " + diffHrs + " hours, " + diffMins + " minutes, " + diffSecs + " seconds, " + diffMs + " milliseconds";
                await interaction.reply("`" + diffString + "`");
	},
};