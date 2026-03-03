/**
 * @file deleteContext.js
 * @description Context menu command (message type) that exposes a "Delete" action on
 * messages. Default permissions are disabled; intended for admin use only. This module
 * only defines the command registration data — the interaction handler is managed
 * externally (e.g., in the main interaction event handler).
 */

const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { ApplicationCommandType } = require('discord-api-types/v9');
var babadata = require('../babotdata.json'); //baba configuration file

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Delete')
    .setType(ApplicationCommandType.Message)
    .setDefaultPermission(false),
};
