/**
 * @file moveToContext.js
 * @description Context menu command (message type) that exposes a "Move To" action on
 * messages. Default permissions are disabled; intended for admin use only. This module
 * only defines the command registration data — the interaction handler is managed
 * externally (e.g., in the main interaction event handler).
 */

const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { ApplicationCommandType } = require('discord-api-types/v9');

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName('Move To')
        .setType(ApplicationCommandType.Message)
        .setDefaultPermission(false)
};