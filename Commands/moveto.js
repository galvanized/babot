/**
 * @file moveto.js
 * @description Slash command that moves a specified message to a target channel. Requires
 * `messageid` and `channel` options. Default permissions are disabled; intended for admin
 * use only. Searches all text channels and threads in the guild for the target message
 * before moving it.
 */

const { movetoChannel } = require('../Functions/HelperFunctions/adminHelpers.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
var babadata = require('../babotdata.json'); //baba configuration file

module.exports = {
  data: new SlashCommandBuilder()
    .setName('moveto')
    .setDescription('Moves a message to the specified channel!')
    .setDefaultPermission(false)
    .addStringOption((option) =>
      option.setName('messageid').setDescription('the message id to move').setRequired(true)
    )
    .addChannelOption((option) =>
      option.setName('channel').setDescription('the channel to move to').setRequired(true)
    ),
  /**
   * Searches all text channels and threads in the guild for the given message ID,
   * then moves it to the specified target channel. Replies ephemerally with the
   * operation status.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply({ ephemeral: true });
    var fnd = false;
    var msgID = interaction.options.getString('messageid');
    var channel = interaction.options.getChannel('channel');

    var chanMap = interaction.guild.channels.fetch().then((channels) => {
      channels.each((chan) => {
        //iterate through all the channels
        if (!fnd && chan.type == 0) //make sure the channel is a text channel
        {
          chan.threads
            .fetch()
            .then((thread) =>
              thread.threads.each((thr) => {
                thr.messages
                  .fetch(msgID)
                  .then((message) => {
                    fnd = true;
                    movetoChannel(message, thr, channel.id);
                    interaction.editReply({ content: 'Message Moved', ephemeral: true });
                  })
                  .catch(function (err) {});
              })
            )
            .catch(function (err) {});

          chan.messages
            .fetch(msgID)
            .then((message) => {
              fnd = true;
              movetoChannel(message, chan, channel.id);
              interaction.editReply({ content: 'Message Moved', ephemeral: true });
            })
            .catch(function (err) {}); //try to get the message, if it exists call setVote, otherwise catch the error
        }
      });
    });
    await interaction.editReply({ content: 'Searching for Message', ephemeral: true });
  },
};
