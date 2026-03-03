/**
 * @file archive.js
 * @description Slash command that archives a specific message by replacing it in-place with
 * the bot re-posting its content. Requires the `messageid` option and optionally the
 * `display_user` flag to show the original sender. This command has default permissions
 * disabled and is intended for admin use only.
 */

const { movetoChannel } = require('../Functions/HelperFunctions/adminHelpers.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
var babadata = require('../babotdata.json'); //baba configuration file

module.exports = {
	data: new SlashCommandBuilder()
		.setName('archive')
		.setDescription('Archives a specific message by replacing it with baba saying it!')
        .setDefaultPermission(false)
        .addStringOption(option => option.setName('messageid').setDescription('the message id to move').setRequired(true))
        .addBooleanOption(option => option.setName('display_user').setDescription('set to true if want to show original sender')),
	/**
	 * Searches all text channels and threads in the guild for the given message ID,
	 * then archives it in-place by re-posting its content via the bot, optionally
	 * showing the original sender. Replies ephemerally with the operation status.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) 
    {
		await interaction.deferReply({ ephemeral: true });
        var fnd = false;
        var msgID = interaction.options.getString('messageid');
        var display_user = interaction.options.getBoolean('display_user');

        var chanMap = interaction.guild.channels.fetch().then(channels => {
            channels.each(chan => { //iterate through all the channels
                if (!fnd && chan.type == 0) //make sure the channel is a text channel
                {
                    chan.threads.fetch().then(thread => 
                        thread.threads.each(thr =>
                        {
                            thr.messages.fetch(msgID).then(message => 
                            {
                                fnd = true;
                                movetoChannel(message, thr, thr.id, true + display_user);
                                interaction.editReply({ content: 'Message Archived', ephemeral: true });
                            }).catch(function (err) {});
                        })
                    ).catch(function (err) {});

                    chan.messages.fetch(msgID).then(message => 
                    {
                        fnd = true;
                        movetoChannel(message, chan, chan.id, true + display_user);
                        interaction.editReply({ content: 'Message Archived', ephemeral: true });
                    }).catch(function (err) {}); //try to get the message, if it exists call setVote, otherwise catch the error
                }
            });
        });
        await interaction.editReply({ content: 'Searching for Message', ephemeral: true });
	},
};