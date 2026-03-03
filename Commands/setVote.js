/**
 * @file setVote.js
 * @description Slash command that adds 👍 and 👎 vote reactions to a specified message.
 * Requires the `messageid` option. Default permissions are disabled; intended for admin
 * use only. Searches all text channels and threads in the guild for the target message.
 */

const { setVote } = require('../Functions/HelperFunctions/adminHelpers.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setvote')
    .setDescription('Adds a 👍 and 👎 reaction to a message')
    .setDefaultPermission(false)
    .addStringOption((option) =>
      option
        .setName('messageid')
        .setDescription('the message id to append the vote to')
        .setRequired(true)
    ),
  /**
   * Searches all text channels and threads in the guild for the given message ID,
   * then adds 👍 and 👎 vote reactions to it. Replies ephemerally with the operation
   * status.
   *
   * @async
   * @param {Discord.Interaction} interaction - The slash command interaction object.
   * @param {Discord.Client} bot - The Discord client instance.
   * @returns {Promise<void>}
   */
  async execute(interaction, bot) {
    await interaction.deferReply({ ephemeral: true });
    var msgID = interaction.options.getString('messageid');
    var fnd = false;

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
                    setVote(message);
                    interaction.editReply({
                      content: 'Vote Added to Message: `' + message.content + '`',
                      ephemeral: true,
                    });
                  })
                  .catch(function (err) {});
              })
            )
            .catch(function (err) {});

          chan.messages
            .fetch(msgID)
            .then((message) => {
              fnd = true;
              setVote(message);
              interaction.editReply({
                content: 'Vote Added to Message: `' + message.content + '`',
                ephemeral: true,
              });
            })
            .catch(function (err) {}); //try to get the message, if it exists call setVote, otherwise catch the error
        }
      });
    });
    await interaction.editReply({ content: 'Searching for Message', ephemeral: true });
  },
};
