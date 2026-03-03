/**
 * @file morshu.js
 * @description Slash command that converts provided text into Morshu speech as an audio
 * or video file. Text is split into 900-character chunks and processed sequentially.
 * Supports optional subtitles and a personalized text/mention suffix. Defaults to video
 * output mode when no mode is specified.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { babaMorshu } = require('../Functions/Voice/VoiceHelpers/morshin.js');
const { splitStringInto900CharChunksonSpace } = require('../Functions/HelperFunctions/slashFridayHelpers');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('morshu')
		.setDescription('Morshu will speak your text you give him!')
        .addStringOption(opt => 
            opt.setName('text')
            .setDescription('The text for morshu to transcribe.')
            .setRequired(true))
        .addBooleanOption(opt => 
            opt.setName('subtitles')
            .setDescription('Show subtitles for morshus transcription (off by default).'))
        .addStringOption(opt => 
            opt.setName('personalizedtext')
            .setDescription('Add some extra text or @ someone, Isaac Please!'))
		.addStringOption(option =>
			option.setName('mode')
				.setDescription('The mode of the morshu transcription (defaults to audio)!')
				.addChoices(
					{ name: 'Audio', value: 'audio' },
					{ name: 'Video', value: 'video' }            
				)),
	/**
	 * Converts the provided text into Morshu speech by splitting it into chunks and
	 * generating audio or video files for each. Replies with the resulting media files
	 * and optional subtitle/personalized text content. Reports an error if transcription
	 * fails.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		await interaction.deferReply();
		var mode = interaction.options.getString('mode');
        var text = interaction.options.getString('text');
        var subtitles = interaction.options.getBoolean('subtitles');
        var personaltext = interaction.options.getString('personalizedtext');

        if (mode == null)
            mode = 'video';

        var textSplit = splitStringInto900CharChunksonSpace(text);

        var filesOfMorsh = [];
        for (var i = 0; i < textSplit.length; i++)
        {
            var tsplit = textSplit[i];
            var morshuFile = await babaMorshu(mode, tsplit, i);
            if (morshuFile.file != null)
                filesOfMorsh.push(morshuFile.file);
        }

        if (filesOfMorsh.length == 0)
            await interaction.editReply("Morshu couldn't transcribe the text, it may have been too long or there was an error!");
        else
        {
            var objectSend = {
                content: 'Morshu has spoken!',
                files: filesOfMorsh
            };

            if (personaltext != null && personaltext != '')
                objectSend.content += '\n' + personaltext;

            if (subtitles)
                objectSend.content += '\n```' + text + '```';

            await interaction.editReply(objectSend);
        }

	},
};