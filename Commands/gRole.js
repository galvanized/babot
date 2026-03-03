/**
 * @file gRole.js
 * @description Slash command that creates a new role with the specified name and assigns
 * it to all users who reacted to a given message. Requires `messageid` and `rolename`
 * options. Default permissions are disabled; intended for admin use only. Searches all
 * text channels and threads in the guild for the target message.
 */

const { setGrole } = require('../Functions/HelperFunctions/adminHelpers.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('grole')
		.setDescription('Adds a new game role!')
        .setDefaultPermission(false)
        .addStringOption(option => option.setName('messageid').setDescription('the message id to pull reactions from').setRequired(true))
        .addStringOption(option => option.setName('rolename').setDescription('the name of the role').setRequired(true)),
	/**
	 * Searches all text channels and threads in the guild for the given message ID,
	 * then creates a new role with the specified name and assigns it to all users who
	 * reacted to that message. Replies ephemerally with the operation status.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) 
    {
		await interaction.deferReply({ ephemeral: true });
        var msgID = interaction.options.getString('messageid');
        var roleName = interaction.options.getString('rolename');
        var fnd = false;

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
                                setGrole(message, roleName);
                                interaction.editReply({ content: 'Role created: `' + roleName + '`', ephemeral: true });
                            }).catch(function (err) {});
                        })
                    ).catch(function (err) {});

                    chan.messages.fetch(msgID).then(message => 
                    {
                        fnd = true;
                        setGrole(message, roleName);
                        interaction.editReply({ content: 'Role created: `' + roleName + '`', ephemeral: true });
                    }).catch(function (err) {}); //try to get the message, if it exists call setVote, otherwise catch the error
                }
            });
        });
        await interaction.editReply({ content: 'Searching for Message', ephemeral: true });
	},
};