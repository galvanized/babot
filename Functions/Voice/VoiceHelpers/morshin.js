/**
 * @file morshin.js
 * @description Text preprocessing utilities for the Morshu text-to-speech feature.
 *   Handles sanitising and transforming raw Discord message text before it is sent
 *   to the Morshu TTS API, including:
 *   - Replacing special Unicode characters with readable words
 *   - Converting Discord timestamp tags (`<t:...>`) to human-readable strings
 *   - Resolving Discord mentions, custom emojis, and channel references to names
 *   - Splitting long numeric strings into individual digits for better speech output
 *   - Replacing Unicode emoji with their textual names
 * @module morshin
 */

var babadata = require('../../../babotdata.json'); //baba configuration file

const fs = require('fs');

const Discord = require('discord.js'); //discord module for interation with discord api

const { getD1 } = require('../../../Tools/overrides');
const { PickThePerfectUsername } = require('../../Database/databaseVoiceController.js');
    
var rawdata = fs.readFileSync(babadata.datalocation + 'emojiJSONCache.json');
var emojis = JSON.parse(rawdata).emojis;

/**
 * Preprocesses a message and sends it to the Morshu TTS API, returning the
 * resulting audio or video file as a Discord attachment.
 *
 * Processing steps applied to `text` before the API call:
 * 1. Replaces `...` with a newline-padded pause character.
 * 2. Substitutes known Unicode symbols (e.g. ඞ, 𓀒) with readable words.
 * 3. Converts Discord timestamp tags to human-readable date/time strings.
 * 4. Resolves Discord mentions, custom emojis, and channel references.
 * 5. Splits numeric strings longer than 6 digits into space-separated digits.
 * 6. Replaces Unicode emoji characters with their textual names.
 *
 * @async
 * @param {string} mode  - Response format requested from the API: `"audio"` (mp3)
 *                         or `"video"` (mp4).
 * @param {string} text  - The raw message text to convert to speech.
 * @param {number} index - Positional index of this request (reserved for future use).
 * @returns {Promise<{file: Discord.AttachmentBuilder|null}>} Resolves with an object
 *   containing the generated attachment, or `{ file: null }` on API error.
 */
async function babaMorshu(mode, text, index)
{
    // for pauses
    text = text.replaceAll('...', '\n.\n');

    text = text.replaceAll('ඞ', ' among us ');
    text = text.replaceAll('𓀒', ' man falling ');

    // replace all the time tags with human readable dates
	var chunks = smartSplitTimeTags(text);

	for (var i = 0; i < chunks.length; i++)
	{
		// if chunks[i] is a timestamp, convert to human readable date
		if (chunks[i].includes('<t:'))
		{
			chunks[i] = readableTimeStamp(chunks[i]);
		}
	}

	text = chunks.join('');

    // replace all the discord special tags with their actual names
	text = await parseDiscordStuff(text);

	// replace all the numbers with spaces if the number is greater than 6 characters
	chunks = text.match(/(\d+|[^\d]+)/g);

	for (var i = 0; i < chunks.length; i++)
	{
		// if chunks is a number, and length is greater than 6 characters, split into numbers with spaces ex: 12345678 -> 1 2 3 4 5 6 7 8
		if (!isNaN(chunks[i]) && chunks[i].length > 6)
		{
			var newStrng = '';
			for (var j = 0; j < chunks[i].length; j++)
			{
				newStrng += chunks[i][j] + ' ';
			}
			chunks[i] = newStrng.trim();
		}
	}

	text = chunks.join('');

    // replace all the unicode emojis with their names
    emojis.forEach(e => 
    {
        const emojiRegex = new RegExp(e.emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        text = text.replaceAll(emojiRegex,  ' ' + e.name + ' ');
    });

    var morshuPromise = new Promise((resolve, reject) => {
        fetch('https://morshu.yoinks.org/morsh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(
            {
                message: text,
                response_type: mode
            })
        }).then(res => res.arrayBuffer())
        .then((data) => {
            const nodeBuffer = Buffer.from(data);
            // save the file if success to babadata.temp + "morshu.mp3" or babadata.temp + "morshu.mp4"
            // data will be a buffer of the file in either mp3 or mp4 format

            if (mode == 'audio')
            {
                var newFile = new Discord.AttachmentBuilder(nodeBuffer, { name: 'Morshu.mp3', description : text });

                resolve({file: newFile});
            }
            else if (mode == 'video')
            {
                var newFile = new Discord.AttachmentBuilder(nodeBuffer, { name: 'Morshu.mp4', description : text });

                resolve({file: newFile});
            }
        })
        .catch((error) => {
            console.error(error);
            resolve({file : null});
        });
    });

    return morshuPromise;
}

/**
 * Splits a string into an array of chunks where each Discord timestamp tag
 * (`<t:UNIX[:style]>`) is its own element and all surrounding text is merged
 * into contiguous plain-text chunks.
 *
 * @param {string} text - The input string that may contain Discord timestamp tags.
 * @returns {string[]} Array of chunks alternating between plain-text segments
 *   and individual Discord timestamp tag strings.
 */
function smartSplitTimeTags(text) 
{
	const regex = /<t:\d+(?::[tTfFdDrR])?>|[\s\S]/g;  // Match either a full time tag or any single character
	const rawMatches = [...text.matchAll(regex)].map(m => m[0]);
  
	// Now merge consecutive text characters into bigger text chunks:
	const chunks = [];
	let buffer = '';
	for (const part of rawMatches) 
	{
	  	if (part.startsWith('<t:') && part.endsWith('>')) 
		{
			// Flush buffer if there's text
			if (buffer) 
			{
				chunks.push(buffer);
				buffer = '';
			}
			chunks.push(part);
	  	} 
		else 
			buffer += part;
	}
	if (buffer) chunks.push(buffer);
  
	return chunks;
}

/**
 * Converts a single Discord timestamp tag (e.g. `<t:1700000000:R>`) into a
 * human-readable date/time string according to its format specifier.
 *
 * Supported format specifiers (second-to-last character of the tag):
 * - `t` – Short time (e.g. "3:30 PM")
 * - `T` – Long time  (e.g. "3:30:00 PM")
 * - `f` – Short date/time (e.g. "November 14, 2023, 3:30 PM")
 * - `F` – Long date/time  (e.g. "Tuesday, November 14, 2023, 3:30:00 PM")
 * - `d` – Short date (locale default, e.g. "11/14/2023")
 * - `D` – Long date  (e.g. "November 14, 2023")
 * - `R` – Relative time (e.g. "3 minutes ago" / "In 2 days" / "Just now")
 *
 * If no specifier is present (`<t:UNIX>`), `:f` is assumed.
 *
 * @param {string} stampString - A Discord timestamp tag string such as
 *   `<t:1700000000:R>` or `<t:1700000000>`.
 * @returns {string} A human-readable representation of the timestamp, or the
 *   original `stampString` if the format specifier is unrecognised.
 */
function readableTimeStamp(stampString)
{
	var timestamp = stampString.match(/\d+/g);
	// make a date with the timestamp and offset by current timezone
	var date = new Date(parseInt(timestamp[0]) * 1000);
	
	// if stampstring is <t:NUMBER> append a :f to it
	stampString = stampString.replace(/<t:(\d+)>/g, '<t:$1:f>');
	
	// change the string based on the type of timestamp (:t, :T, :f, :F, :d, :D, :R)
	switch (stampString[stampString.length - 2])
	{
		case 't':
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' });
		case 'T':
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric' });
		case 'f':
			return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
		case 'F':
			return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
		case 'd':
			return date.toLocaleDateString('en-US');
		case 'D':
			return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
		case 'R':
			// return relative time
			var now = getD1(true);
			var diff = date - now;
			var mins = Math.floor(diff / 60000);
			// if the date is in the past, return x seconds/minutes/hours/days ago
			// if the date is in the future, return in x seconds/minutes/hours/days
			// if the date is now, return just now
			if (mins < 0)
			{
				mins = Math.abs(mins);
				if (mins < 60)
				{
					return mins + ' minutes ago';
				}
				else if (mins < 1440)
				{
					return Math.floor(mins / 60) + ' hours ago';
				}
				else
				{
					return Math.floor(mins / 1440) + ' days ago';
				}
			}
			else if (mins == 0)
			{
				return 'Just now';
			}
			else
			{
				if (mins < 60)
				{
					return 'In ' + mins + ' minutes';
				}
				else if (mins < 1440)
				{
					return 'In ' + Math.floor(mins / 60) + ' hours';
				}
				else
				{
					return 'In ' + Math.floor(mins / 1440) + ' days';
				}
			}
		default:
			return stampString;
	}
}

/**
 * Fetches the display name of a Discord guild member by their user ID.
 * Uses `PickThePerfectUsername` to select the most appropriate name variant.
 *
 * The target guild is determined by whether the bot is running in testing mode
 * (`babadata.testing`).
 *
 * @async
 * @param {string} userID - The Discord snowflake ID of the user.
 * @returns {Promise<string>} Resolves with the member's display name, or
 *   `"User not found"` / `"Guild not found"` on lookup failure.
 */
async function getAUserName(userID)
{
	var userGetPromise = new Promise((resolve, reject) => {
		var guildID = babadata.testing === undefined ? '454457880825823252' : '522136584649310208';
		global.Bot.guilds.fetch(guildID).then(guild => {
			guild.members.fetch(userID).then(member => {
				resolve(PickThePerfectUsername(member));
			}).catch((error) => {
				console.error(error);
				resolve('User not found');
			});
		}).catch((error) => {
			console.error(error);
			resolve('Guild not found');
		});
	});

	return userGetPromise;
}

/**
 * Fetches the name of a Discord guild channel by its channel ID.
 *
 * The target guild is determined by whether the bot is running in testing mode
 * (`babadata.testing`).
 *
 * @async
 * @param {string} channelID - The Discord snowflake ID of the channel.
 * @returns {Promise<string>} Resolves with the channel's name, or
 *   `"Channel not found"` / `"Guild not found"` on lookup failure.
 */
async function getAChannelName(channelID)
{
    var channelGetPromise = new Promise((resolve, reject) => {
        var guildID = babadata.testing === undefined ? '454457880825823252' : '522136584649310208';
        global.Bot.guilds.fetch(guildID).then(guild => {
            var channel = guild.channels.cache.get(channelID);
            if (channel != null)
                resolve(channel.name);
            else
                resolve('Channel not found');
        }).catch((error) => {
            console.error(error);
            resolve('Guild not found');
        });
    });

    return channelGetPromise;
}

/**
 * Fetches the name of a Discord guild role by its role ID.
 *
 * The target guild is determined by whether the bot is running in testing mode
 * (`babadata.testing`).
 *
 * @async
 * @param {string} roleID - The Discord snowflake ID of the role.
 * @returns {Promise<string>} Resolves with the role's name, or
 *   `"Role not found"` / `"Guild not found"` on lookup failure.
 */
async function getARoleName(roleID)
{
    var roleGetPromise = new Promise((resolve, reject) => {
        var guildID = babadata.testing === undefined ? '454457880825823252' : '522136584649310208';
        global.Bot.guilds.fetch(guildID).then(guild => {
            var role = guild.roles.cache.get(roleID);
            if (role != null)
                resolve(role.name);
            else
                resolve('Role not found');
        }).catch((error) => {
            console.error(error);
            resolve('Guild not found');
        });
    });

    return roleGetPromise;
}

/**
 * Resolves all Discord special tokens in a string — user mentions (`<@ID>`),
 * channel mentions (`<#ID>`), role mentions (`<@&ID>`), and custom/animated
 * emojis (`<a:name:ID>` / `<:name:ID>`) — into their human-readable equivalents
 * by making async lookups where necessary.
 *
 * Relies on {@link parseDiscordSpecial} to tokenise the input, then resolves
 * each token using {@link getAUserName}, {@link getAChannelName}, or
 * {@link getARoleName} as appropriate.
 *
 * @async
 * @param {string} text - Raw message text that may contain Discord mention/emoji syntax.
 * @returns {Promise<string>} The processed string with all Discord tokens replaced
 *   by their resolved text equivalents.
 */
async function parseDiscordStuff(text)
{
	var listOfItems = parseDiscordSpecial(text);

	var newText = '';
	for (var i = 0; i < listOfItems.length; i++)
	{
		var item = listOfItems[i];
		switch (item.type)
		{
			case 'channel':
                var channel = await getAChannelName(item.id);
                newText += channel;
				break;
			case 'role':
                var role = await getARoleName(item.id);
                newText += role;
				break;
			case 'user':
				var user = await getAUserName(item.id);
				newText += user;
				break;
			case 'emoji':
			case 'animated_emoji':
				newText += item.name;
				break;
			case 'text':
				newText += item.text;
				break;
			default:
				newText += item.text;
				break;
		}
	}

	return newText;
}

/**
 * Tokenises a string containing Discord mention/emoji syntax into a flat array
 * of typed token objects. Recognised token types are:
 *
 * - `"channel"`        – `<#channelId>`   → `{ type, text, id }`
 * - `"role"`           – `<@&roleId>`     → `{ type, text, id }`
 * - `"user"`           – `<@userId>`      → `{ type, text, id }`
 * - `"emoji"`          – `<:name:id>`     → `{ type, text, name, id }`
 * - `"animated_emoji"` – `<a:name:id>`    → `{ type, text, name, id }`
 * - `"text"`           – plain text runs  → `{ type, text }`
 *
 * Null results (unmatched groups) are filtered out before returning.
 *
 * @param {string} text - The input string to tokenise.
 * @returns {Array<{type: string, text: string, id?: string, name?: string}>}
 *   Ordered array of token objects representing each segment of the input.
 */
function parseDiscordSpecial(text) 
{
	const regex = /(<#(\d+)>|<@&(\d+)>|<@(\d+)>|<(a?):(\w+):(\d+)>|([^<]+))/g;
  
	const matches = [...text.matchAll(regex)];
  
	return matches.map(match => 
	{
		const [fullMatch, , channelId, roleId, userId, animatedFlag, emojiName, emojiId, plainText] = match;
  
		if (channelId) 
		{
		  	return { type: 'channel', text: fullMatch, id: channelId };
		}
		if (roleId) 
		{
		  	return { type: 'role', text: fullMatch, id: roleId };
		}
		if (userId) 
		{
		  	return { type: 'user', text: fullMatch, id: userId };
		}
		if (emojiId) 
		{
			return {
				type: animatedFlag ? 'animated_emoji' : 'emoji',
				text: fullMatch,
				name: emojiName,
				id: emojiId
			};
		}
		if (plainText)
		{
		  	return { type: 'text', text: plainText };
		}
  
		return null;
	})
	.filter(Boolean);
}

module.exports = {
	babaMorshu
};