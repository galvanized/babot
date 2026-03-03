/**
 * @file whomst.js
 * @description Slash command that translates between Discord users and their server names.
 * Requires the `discord_user` option and returns information about the specified user via
 * babaWhomst().
 */

const { babaWhomst } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whomst')
        .setDescription('Translate between users and names')
        .addUserOption(option =>
            option.setName('discord_user')
            .setDescription('user to look up').setRequired(true)),
    /**
	 * Looks up the specified Discord user via babaWhomst() and replies with their
	 * server information.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
    async execute(interaction, bot) {
        await interaction.deferReply();
        var user = interaction.options.getUser('discord_user');

        var val = await babaWhomst(user);
        await interaction.editReply(val);
    }
}