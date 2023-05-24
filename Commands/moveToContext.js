const { movetoChannel } = require('../HelperFunctions/adminHelpers.js');
const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { ApplicationCommandType } = require('discord-api-types/v9');
var babadata = require('../babotdata.json'); //baba configuration file

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName('Move To')
        .setType(ApplicationCommandType.Message)
        .setDefaultPermission(false)
};