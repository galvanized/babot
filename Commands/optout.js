/**
 * @file optout.js
 * @description Slash command that opts the invoking user out of a baba data analysis
 * feature. Currently supports opting out of Voice Activity tracking. Reports success or
 * error via an ephemeral reply.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { optOut } = require('../Functions/Database/databaseVoiceController.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('optout')
		.setDescription('Opt-out of the baba data analysis!')
        .addStringOption(option =>
            option.setName('choices')
                .setDescription('What to opt out to!')
                .setRequired(true)
                .addChoices({ name: 'Voice Activity', value: 'voice' })),
	/**
	 * Opts the invoking guild member out of the specified data analysis feature (e.g.,
	 * Voice Activity tracking) and replies ephemerally with success or an error message.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
        await interaction.deferReply();
        var opts = interaction.options.getString('choices');
        optOut(interaction.member, opts, function(err)
        {
            if(err)
            {
                interaction.editReply({ content: "Error: " + err, ephemeral: true });
            }
            else
            {
                interaction.editReply({ content: "Opted out of " + opts, ephemeral: true });
            }
        });
	},
};