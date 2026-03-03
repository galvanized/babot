/**
 * @file setGame.js
 * @description Slash command that sets the bot's Discord activity (game/status). Requires
 * the `game` option; the `mode` option selects the activity type (Playing, Watching,
 * Competing, Listening, or Streaming). For Streaming mode a Twitch URL is automatically
 * attached. Default permissions are disabled; intended for admin use only.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setgame')
		.setDescription('Sets the game of that baba is interacting with')
        .setDefaultPermission(false)
        .addStringOption(option => 
            option.setName('game')
            .setDescription('the game baba is playing')
            .setRequired(true))
        .addStringOption(option => 
            option.setName('mode')
            .setDescription('how baba is interacting with the game')
            .addChoices(
                { name: 'Playing', value: '0' },
                { name: 'Watching', value: '3' },
                { name: 'Competing', value: '5' },
                { name: 'Listening', value: '2' },
                { name: 'Streaming', value: '1' }                
            )),
	/**
	 * Updates the bot's Discord activity to the specified game using the chosen activity
	 * type. Attaches a Twitch URL for Streaming mode. Replies ephemerally confirming
	 * the new activity.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) 
    {
		await interaction.deferReply({ ephemeral: true });
        var game = interaction.options.getString('game');
        var mode = interaction.options.getString('mode');

        if (mode == null)
            mode = '0';
        
        //convert to int
        var help = { type: parseInt(mode) };

        console.log(help);
        if (mode == '1')
            help.url = 'https://www.twitch.tv/directory/game/Baba%20is%20You';

        mode = mode.replace('0', 'Playing');
        mode = mode.replace('1', 'Streaming');
        mode = mode.replace('2', 'Listening to');
        mode = mode.replace('3', 'Watching');
        mode = mode.replace('5', 'Competing in');

        bot.user.setActivity(game, help);
        await interaction.editReply({ content: `Baba is now ${mode} ${game}`, ephemeral: true });
	},
};