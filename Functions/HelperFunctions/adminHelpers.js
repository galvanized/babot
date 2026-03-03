/**
 * @module HelperFunctions.adminHelpers
 * @description
 * Small set of administrative helper utilities used by the bot. Functions in
 * this file perform privileged actions such as creating roles from reactions,
 * adding reaction-based vote controls, archiving messages into a log channel,
 * downloading attachments, and registering command role permissions.
 *
 * Important notes:
 * - These helpers assume the caller has already validated permissions (many
 *   callers check `babadata.adminId` before invoking these functions).
 * - Several functions perform asynchronous file/network I/O and use timeouts
 *   to coordinate operations (e.g., re-uploading images before deleting the
 *   original message). They intentionally favor best-effort behavior.
 */
var babadata = require('../../babotdata.json'); //baba configuration file

var request = require('node-fetch');
const fs = require('fs');

const Discord = require('discord.js'); //discord module for interation with discord api

const { RoleAdd } = require('./basicHelpers.js');

/**
 * Create or fetch a role named `rname` and add it to users who reacted to `msg`.
 *
 * Behavior notes:
 * - The function first attempts to fetch existing roles from the guild and
 *   find one that matches `rname` by name. If none exists it creates the
 *   role and refetches the role list to obtain the created role object.
 * - After ensuring the role exists, the function waits 2s and then iterates
 *   reactions on the original `msg`. For each reaction it fetches the users
 *   who reacted and calls `RoleAdd(msg, users, role)` to assign the role.
 * - Timeouts and fetch errors are tolerated: the operation is deliberately
 *   best-effort and logs errors instead of throwing.
 *
 * Edge-cases:
 * - Role lookup is by name and will match the first name-equal role; duplicate
 *   role names may cause ambiguous behavior.
 * - The reaction-to-user fetch uses the Discord API and may not return all
 *   members if the guild is large or the bot lacks intents; in such cases
 *   `RoleAdd` will be called with the returned subset.
 *
 * @async
 * @param {import('discord.js').Message} msg - The original Discord message whose
 *   reactions are used to identify recipients.
 * @param {string} rname - The role name to find or create.
 * @returns {Promise<void>}
 */
async function setGrole(msg, rname) //creates role and sets users
{
	/**
	 * Create or fetch a role named `rname` and add it to users who reacted to `msg`.
	 *
	 * Behavior notes:
	 * - The function first attempts to fetch existing roles from the guild and
	 *   find one that matches `rname` by name. If none exists it creates the
	 *   role and refetches the role list to obtain the created role object.
	 * - After ensuring the role exists, the function waits 2s and then iterates
	 *   reactions on the original `msg`. For each reaction it fetches the users
	 *   who reacted and calls `RoleAdd(msg, users, role)` to assign the role.
	 * - Timeouts and fetch errors are tolerated: the operation is deliberately
	 *   best-effort and logs errors instead of throwing.
	 *
	 * Edge-cases:
	 * - Role lookup is by name and will match the first name-equal role; duplicate
	 *   role names may cause ambiguous behavior.
	 * - The reaction-to-user fetch uses the Discord API and may not return all
	 *   members if the guild is large or the bot lacks intents; in such cases
	 *   `RoleAdd` will be called with the returned subset.
	 */
	console.log(msg);
	try 
	{
		var role = null;
		await msg.guild.roles.fetch().then(roles => {
			roles.each(r => { //iterate through all the channels
				if (r.name === rname) //make sure the channel is a text channel
				{
					role = r;                
				}
			});
		});

		if (role == null) //if null make new role
		{
			console.log("Creating Role: " + rname);

			//create the role
			await msg.guild.roles.create({
				name: rname,
				reason: 'bot do bot thing',
			}).catch(console.error);

			await msg.guild.roles.fetch().then(roles => {
				roles.each(r => { //iterate through all the channels
					if (r.name === rname) //make sure the channel is a text channel
					{
						role = r;                
					}
				});
			});        
		}

		setTimeout(function()
		{ 
			var reactMap = msg.reactions.cache; //get a map of the reactions
			for(let [k, reee] of reactMap) //iterate through all the reactions
			{
				reee.users.fetch().then((users) => {
					RoleAdd(msg, users, role); //call the dumb roll function to do the work (had to be done)
				}).catch(console.error);
			}
		}, 2000); //delayed
		//create role with no permisions, gray color that can be @ by every one
		//get user list from reacations
		//give users role
		
	} 
	catch (error) 
	{
		console.log("nos"); //if error this goes
	}
}

/**
 * Add thumbs-up and thumbs-down reactions to a message to enable voting.
 *
 * This is intentionally lightweight: callers simply invoke `setVote(msg)` and
 * the function applies two reactions. No permission checks are performed
 * here — callers should ensure only authorized users call this on behalf of
 * others when appropriate.
 *
 * Note: `usr` is fetched but never used.
 *
 * @async
 * @param {import('discord.js').Message} msg - The message to react to.
 * @returns {Promise<void>}
 */
async function setVote(msg) //reacts to message with 👍 and 👎 for votes
{
	/**
	 * Add thumbs-up and thumbs-down reactions to a message to enable voting.
	 *
	 * This is intentionally lightweight: callers simply invoke `setVote(msg)` and
	 * the function applies two reactions. No permission checks are performed
	 * here — callers should ensure only authorized users call this on behalf of
	 * others when appropriate.
	 */
	var usr = msg.author; //gets the user that sent the message

	msg.react('👍');
	msg.react('👎');
}

/**
 * React to a message with the configured moderation emoji (ban hammer).
 *
 * The emoji identifier is read from `babadata.emoji`. This helper performs
 * a single reaction call; permission errors are logged by the Discord
 * client and not rethrown.
 *
 * Note: `usr` is fetched but never used.
 *
 * @async
 * @param {import('discord.js').Message} msg - The message to react to.
 * @returns {Promise<void>}
 */
async function setVBH(msg) //reacts to message with emoji defined by babadata.emoji (in json file) for our implimentation that is the ban hammer emoji
{
	/**
	 * React to a message with the configured moderation emoji (ban hammer).
	 *
	 * The emoji identifier is read from `babadata.emoji`. This helper performs
	 * a single reaction call; permission errors are logged by the Discord
	 * client and not rethrown.
	 */
	var usr = msg.author; //gets the user that sent the message

	msg.react(babadata.emoji); //reply with ban hammer emoji
}

/**
 * Archive `msg` into the configured `logchan` and delete the original.
 *
 * @param {import('discord.js').Message} msg - Original Discord message object to archive.
 * @param {import('discord.js').TextChannel} channel - Channel where the original message lived.
 * @param {string} logchan - Snowflake ID of the archive channel where content will be re-posted.
 * @param {boolean|number} [silent] - Controls header/footer behavior:
 *   - Falsy (undefined/false): include `"This message sent by: @user in #channel"` header and
 *     post a reactions summary code block.
 *   - `2`: append a `"Sent by: @user"` footer instead of the header; no reactions summary.
 *
 * Behavior notes:
 * - The function composes a textual `savemsg` which contains the original
 *   message content and optional header/footer depending on `silent`.
 * - It then posts the composed text to the archive channel. If `silent` is
 *   falsy it also builds a reactions summary from `msg.reactions.cache` and
 *   posts it as a code block to the archive.
 * - Attachments from the original message are re-uploaded to the archive by
 *   calling `DelayedDeletion` with staggered timeouts (4s per attachment)
 *   to avoid overwhelming the upload process and to ensure the file is
 *   available locally before upload. Finally the original message is
 *   deleted after a calculated wait time that accounts for attachment uploads.
 *
 * Edge-cases & permissions:
 * - If the configured archive channel cannot be found the function returns
 *   early and does not delete the original message.
 * - The function assumes the bot has permission to read the source channel,
 *   send messages to the archive channel, and delete the original message.
 *
 * @async
 * @returns {Promise<void>}
 */
async function movetoChannel(msg, channel, logchan, silent) //archive the message and delete it
{
	/**
	 * Archive `msg` into the configured `logchan` and delete the original.
	 *
	 * Parameters:
	 * - `msg`: original Discord message object to archive.
	 * - `channel`: the channel object where the original message lived.
	 * - `logchan`: id of the archive channel where content will be re-posted.
	 * - `silent`: controls messaging behavior:
	 *     * falsy (undefined/false): include a header mentioning the original
	 *       author and channel and post a reactions summary.
	 *     * `2`: appends an alternate "Sent by" footer instead of the header.
	 *
	 * Behavior notes:
	 * - The function composes a textual `savemsg` which contains the original
	 *   message content and optional header/footer depending on `silent`.
	 * - It then posts the composed text to the archive channel. If `silent` is
	 *   falsy it also builds a reactions summary from `msg.reactions.cache` and
	 *   posts it as a code block to the archive.
	 * - Attachments from the original message are re-uploaded to the archive by
	 *   calling `DelayedDeletion` with staggered timeouts (4s per attachment)
	 *   to avoid overwhelming the upload process and to ensure the file is
	 *   available locally before upload. Finally the original message is
	 *   deleted after a calculated wait time that accounts for attachment uploads.
	 *
	 * Edge-cases & permissions:
	 * - If the configured archive channel cannot be found the function returns
	 *   early and does not delete the original message.
	 * - The function assumes the bot has permission to read the source channel,
	 *   send messages to the archive channel, and delete the original message.
	 */
	var hiddenChan = msg.guild.channels.cache.get(logchan); //gets the special archive channel
	var usr = msg.author; //gets the user that sent the message
	var savemsg = "";
	if (!silent) savemsg = "This message sent by: <@" + usr + "> in <#" + channel.id + ">\n> "; //sets the header of the message to mention the original poster
	savemsg += msg.content; //insert the actual message below

	if (silent == 2) savemsg += "\n\n> Sent by: <@" + usr + ">";

	var attch = msg.attachments; //get the attacments from the original message

	if (hiddenChan == null) //if the channel does not exist
		return;    

	hiddenChan.send(savemsg); //send the text

	if (!silent)
	{
		// Build a compact reactions summary (emoji : count) and post it if present.
		var reactMap = msg.reactions.cache; //get a map of the reactions
		var memgage = "";
		for(let [k, reee] of reactMap) //iterate through all the reactions
		{
			memgage += k + ": " + reee.count + " reactions\n";
		}
		
		if (memgage != "")
		{
			hiddenChan.send("```" + memgage + "```",); //send the text
		}
	}
	var icount = 0;
	for(let [k, img] of attch)
	{
		setTimeout(function()
		{ 
			DelayedDeletion(hiddenChan, img); //download the image and reupload it
		}, 4000 * icount); //delayed so all images can get loaded

		icount ++;
	}

	var waittime = icount == 0 ? 0 : 3000 + (4000 * icount);

	setTimeout(function(){ msg.delete(); }, waittime); //deletes the og message (delayed for the file transfer)
}

/**
 * Download an attachment to a temporary path and re-upload it into the
 * provided `hiddenChan`.
 *
 * - The suffix extraction strips any query string (e.g. `?size=...`) so
 *   the uploaded file retains a sensible extension when re-uploaded.
 * - After scheduling the upload the local tempfile is removed after a
 *   short delay. These timings are tuned for best-effort reliability,
 *   but they are not atomic — network or disk errors can still leave
 *   temporary files behind in rare failure cases.
 *
 * Note: `var newAttch = tempFilePath` on the first assignment is immediately
 * shadowed by the second `var newAttch = new Discord.AttachmentBuilder(...)`.
 * The first assignment is dead code.
 *
 * @async
 * @param {import('discord.js').TextChannel} hiddenChan - The archive channel to
 *   upload the file into.
 * @param {import('discord.js').Attachment} img - The Discord attachment object
 *   whose `.url` is downloaded.
 * @returns {Promise<void>}
 */
async function DelayedDeletion(hiddenChan, img) //download function used when the delay call is ran
{
	/**
	 * Download an attachment to a temporary path and re-upload it into the
	 * provided `hiddenChan`. The function uses the `download` helper which
	 * streams the remote body to a file.
	 *
	 * Notes:
	 * - The suffix extraction strips any query string (e.g. `?size=...`) so
	 *   the uploaded file retains a sensible extension when re-uploaded.
	 * - After scheduling the upload the local tempfile is removed after a
	 *   short delay. These timings are tuned for best-effort reliability,
	 *   but they are not atomic — network or disk errors can still leave
	 *   temporary files behind in rare failure cases.
	 */
	var suffix = img.url.substring(img.url.lastIndexOf('.')); //gets the file extension
	// remove anything ? and after
	suffix = suffix.split("?")[0];
	var tempFilePath = babadata.temp + "tempfile" + suffix; // temp file location 
	var url = img.url;

	download(url, tempFilePath, () => { //downloads the file to the system at tempfile location
		console.log('Done!')
	})

	var newAttch = tempFilePath; //makes a new discord attachment

	var newAttch = new Discord.AttachmentBuilder(tempFilePath, 
		{ name: 'file' + suffix, description : "Twas deleted from a place in time, ADAM PLEASE!"}); //makes a new discord attachment

	setTimeout(function(){ hiddenChan.send({files: [newAttch] }); }, 2000); //sends the attachment (delayed by 1 sec to allow for download)

	setTimeout(function(){ fs.unlinkSync(tempFilePath); }, 3000); //deletes file from local system (delayed by 3 sec to allow for download and upload)
}

/**
 * Send a single entry from `texts` to the message's channel after a short
 * delay, falling back to a local error image if the send fails.
 *
 * @async
 * @param {number} i - Index into the `texts` array to send.
 * @param {Array} texts - Array of content objects/strings to send.
 * @param {import('discord.js').Message} message - The originating Discord message,
 *   used to obtain the target channel.
 * @param {string} templocal - Path to the local temp directory containing
 *   `error.png`, used as a fallback image when sending fails.
 */
function timedOutFrog(i, texts, message, templocal)
{
	// Delay sending a single item from `texts` by 1s. Used by the callers that
	// generate content and want to post images / embeds shortly after creation.
	// If sending fails we fallback to uploading a local `error.png` image to
	// ensure the user still receives a visible failure indicator.
	setTimeout(function()
	{ 
		var ti = texts[i];
		message.channel.send(ti).catch(error => {
			var newAttch = new Discord.AttachmentBuilder(templocal + "error.png", 
				{ name: 'error.png', description : "Error Fronge!"}); //makes a new discord attachment

			message.channel.send({ content: "It is Wednesday, My BABAs", files: [newAttch] }); // send file
		})
	}, 1000);
}

/**
 * Stream a URL to a local file path.
 *
 * Note: the function signature accepts a `callback` argument for compatibility
 * with callers that expect a completion callback, however the current
 * implementation does not invoke the callback after the stream finishes. The
 * caller in this file provides a callback but it is not executed — callers
 * should rely on subsequent timeouts/timers in this module to coordinate work.
 */
const download = (url, path, callback) => 
{ //download function to replace the old one.
	request(url)
		.then(res => {
			const dest = fs.createWriteStream(path);
			res.body.pipe(dest);
	});
}

/**
 * Ensure slash command permissions are set so that only the configured admin
 * role can use commands that are not default-permitted.
 *
 * Behavior:
 * - Fetches all guild application commands and for any command where
 *   `defaultPermission` is false, adds an explicit permission entry granting
 *   the configured admin role access.
 * - This is intended to be run once (or whenever the command set changes)
 *   to sync command-level permissions with the server's admin role.
 *
 * Note: The `guild.commands.permissions.add` API was deprecated by Discord in
 * their permissions v2 rollout. This function may no longer work as expected
 * on current Discord API versions.
 *
 * @async
 * @param {import('discord.js').Guild} guild - The Discord guild whose command
 *   permissions should be configured.
 * @returns {Promise<void>}
 */
async function setCommandRoles(guild)
{
	/**
	 * Ensure slash command permissions are set so that only the configured admin
	 * role can use commands that are not default-permitted.
	 *
	 * Behavior:
	 * - Fetches all guild application commands and for any command where
	 *   `defaultPermission` is false, adds an explicit permission entry granting
	 *   the configured admin role access.
	 * - This is intended to be run once (or whenever the command set changes)
	 *   to sync command-level permissions with the server's admin role.
	 */
	const permissions = 
	{
		id: babadata.adminId,
		type: 'ROLE',
		permission: true,
	};

    let commandsList = await guild.commands.fetch();
    await commandsList.forEach(slashCommand => {
        console.log(`Changing command ${slashCommand.name}`);
		
		if (!slashCommand.defaultPermission)
		{
			guild.commands.permissions.add({
				command: slashCommand.id,
				permissions: [permissions]
			});
		}
    });
}

module.exports = {
	setGrole,
	setVote,
	setVBH,
	movetoChannel,
    timedOutFrog,
    setCommandRoles
};