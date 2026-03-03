/**
 * @file pin.js
 * @description Slash command that pins a specified message in its channel. Requires the
 * `messageid` option. Default permissions are disabled; intended for admin use only.
 * Searches all text channels and threads in the guild for the target message.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
var babadata = require('../babotdata.json'); //baba configuration file

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pin')
    .setDescription('Pins a message.')
    .setDefaultPermission(false)
    .addStringOption((option) =>
      option.setName('messageid').setDescription('the message id to pin').setRequired(true)
    ),
  /**
   * Searches all text channels and threads in the guild for the given message ID and
   * pins it in its channel. Replies ephemerally with the operation status.
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
                    message.pin();
                    interaction.editReply({ content: 'Message Pinned', ephemeral: true });
                  })
                  .catch(function (err) {});
              })
            )
            .catch(function (err) {});

          chan.messages
            .fetch(msgID)
            .then((message) => {
              fnd = true;
              message.pin();
              interaction.editReply({ content: 'Message Pinned', ephemeral: true });
            })
            .catch(function (err) {}); //try to get the message, if it exists call setVote, otherwise catch the error
        }
      });
    });
    await interaction.editReply({ content: 'Searching for Message', ephemeral: true });
  },
};
