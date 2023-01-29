const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('oven')
		.setDescription('Oven the food!'),
	async execute(interaction, bot) {
		// to cause adam to deal with this conflict 
		await interaction.reply('https://media.discordapp.net/attachments/561209488724459531/1062888125073989742/091.png');
	},
};