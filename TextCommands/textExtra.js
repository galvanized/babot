/**
 * TextExtra
 * Extra text-only admin/debug handlers and object-diff helpers used by Babot.
 *
 * The main exported function `TextCommandBackup` performs many side-effecting
 * admin/debug actions based on substring checks of `msgContent`. Helper
 * utilities below generate human-readable representations and diffs of
 * objects for audit-log output.
 */
var babadata = require('../babotdata.json'); //baba configuration file

const fs = require('fs');
const https = require('https');
const fetch = require('node-fetch');

const { SetHolidayChan, dailyRandom, fronge, Seperated, enumConverter, channelStatusChange } = require("../Functions/HelperFunctions/basicHelpers.js");
const { reverseDelay } = require('../Functions/HelperFunctions/remindersByBaba.js');
const { controlDOW, LoadAllTheCache, SaveSlashFridayJson, clearVCCList, DMMePlease } = require("../Functions/Database/databaseVoiceController.js");

// Mapping digits -> letters used by `transpose` command.
const validLetters = "bikusfrday";

/**
 * Return a string of `num` tab characters used for indentation in human-readable output.
 * @param {number} num - Number of tabs to generate.
 * @returns {string}
 */
function generateTabs(num)
{
	var strg = "";
	for (var i = 0; i < num; i++)
		strg += "	";
	return strg;
}

/**
 * Convert a nested object or array into an indented, human-readable string.
 * Numeric keys (array indices) are printed without a `key:` label to keep array
 * output compact. Non-numeric keys increase the indentation level for children.
 *
 * @param {Object|Array} obj - Value to stringify.
 * @param {number} ind - Current indentation depth (tabs).
 * @returns {string}
 */
function objectParse(obj, ind)
{    
	var obje = [];
	for (var key in obj)
	{
		if (obj.hasOwnProperty(key))
		{
			if (typeof obj[key] === 'object' && obj[key] !== null)
			{
				var strg = "";
				if (isNaN(key)) strg += generateTabs(ind);
				var nind = ind;
				if (isNaN(key))
				{
					strg += key + ": \n"
					nind++;
				}
				strg += objectParse(obj[key], nind);
				obje.push(strg);
			}
			else
			{
				var strg = "";
				strg += generateTabs(ind);
				if (!isNaN(key))
					strg += obj[key];
				else
					strg += key + ": " + obj[key];

				obje.push(strg);
			}
		}
	}
	return obje.join("\n");
}

/**
 * Recursively diff two objects or arrays, producing a human-readable string
 * that shows only changed values with arrow notation (`old -> new`).
 *
 * Behavior:
 * - Picks the object with more keys to iterate so newly-added keys appear
 *   in the diff output.
 * - In `arraymode` the longer array is preferred and all elements are
 *   included regardless of equality (to show additions/removals).
 * - Recurses into nested objects and arrays, increasing indentation.
 * - Primitive diffs are shown as `key: oldVal -> newVal`.
 * - Empty-array pairs (same length, both empty) are skipped as trivial.
 *
 * @param {Object|Array} old - The original/old object or array.
 * @param {Object|Array} neww - The updated/new object or array.
 * @param {number} ind - Current indentation depth (number of tabs).
 * @param {boolean} [arraymode=false] - When true, forces inclusion of all
 *   elements (useful for array comparisons).
 * @returns {string} Human-readable diff string.
 */
function twoObjectParseCompare(old, neww, ind, arraymode = false)
{
	var objs = [];

	// Choose which object to iterate. Prefer the object with more keys/elements so
	// newly-added keys show up in the diff. This is a heuristic to keep diffs
	// human-readable rather than attempting a full three-way merge.
	var oCt = (old === undefined || old == "undefined") ? 0 : Object.keys(old).length;
	var nCt = (neww === undefined || neww == "undefined") ? 0 : Object.keys(neww).length;

	var picked = old;
	if (oCt < nCt)
		picked = neww;

	if (arraymode)
	{
		// For arrays prefer the longer array for iteration so added elements are visible.
		if (old.length < neww.length)
			picked = neww;
	}

	for (var key in picked)
	{
		// Include entry if new value is undefined, values differ, or when caller
		// specifically requested array-mode behavior.
		if ((neww === undefined) || old[key] != neww[key] || arraymode)
		{
			if (typeof old[key] === 'object' && old[key] !== null)
			{
				// Skip trivial case: both sides have empty arrays of same length.
				if (Array.isArray(old[key]) && Array.isArray(neww[key]))
				{
					if (old[key].length == neww[key].length && old[key].length == 0)
						continue;
				}
				var strg = "";
				if (isNaN(key)) strg += generateTabs(ind);
				var nind = ind;
				if (isNaN(key))
				{
					strg += key + ": \n"
					nind++;
				}
                
				var nkey = neww !== undefined ? neww[key] : "undefined";

				// Recurse; detect nested arrays to keep arraymode semantics at deeper levels.
				strg += twoObjectParseCompare(old[key], nkey, nind, Array.isArray(old[key]));

				objs.push(strg);
			}
			else
			{
				var strg = "";
				strg += generateTabs(ind);
				if (!isNaN(key))
					strg += old[key] + " -> " + neww[key];
				else
					strg += key + ": " + old[key] + " -> " + (neww === undefined ? "undefined" : neww[key]);

				objs.push(strg);
			}
		}
	}
	return objs.join("\n");
}

/**
 * Produce a human-readable representation of a value or the diff between
 * two values, routing to the appropriate helper based on which arguments
 * are defined.
 *
 * Branches:
 * - `old == undefined`: return `objectParse(neww)` if neww is an object,
 *   else return neww as-is.
 * - `neww == undefined`: return `objectParse(old)` if old is an object,
 *   else return old as-is.
 * - Both defined: return `old -> neww` for primitives, or call
 *   `twoObjectParseCompare` recursively for objects/arrays.
 *
 * Note: The indentation offset calculation for arrays vs objects is a
 * deliberate heuristic to produce readable top-level output.
 *
 * @param {*} old - Old value (may be undefined to indicate a new entry).
 * @param {*} neww - New value (may be undefined to indicate a deleted entry).
 * @returns {string} Human-readable representation or diff string.
 */
function parseItems(old, neww)
{
	if (old == undefined)
	{
		strg = neww
		if (typeof neww === 'object' && neww !== null)
		{
			strg = objectParse(neww, 1);
		}
	}
	else if (neww == undefined)
	{
		strg = old
		if (typeof old === 'object' && old !== null)
		{
			strg = objectParse(old, 1);
		}
	}
	else
	{
		// Scalar -> Scalar: simple arrow. If the original value is an object or
		// array produce a structured diff so multi-line changes are readable.
		strg = old + " -> " + neww
		if (typeof old === 'object' && old !== null)
		{
			var am = Array.isArray(old);
			// The indentation calculation is tuned to ensure top-level arrays vs
			// objects render with appropriate initial indentation in the diff.
			strg = twoObjectParseCompare(old, neww, 1 - (am ? (neww !== null ? (old.length > 1 || neww.length > 1 ? 0 : 1) : 0) : 0), am);
		}
	}

	return strg;
}


/**
 * Secondary text command handler for admin/debug operations.
 *
 * ALL commands in this function require `sentvalid = true`, which is only set
 * when the message arrives as a DM (`channel.type == 1`) AND the author's ID
 * appears in `frogdata.froghelp.ifrog` (privileged frog-user list). This is
 * an intentional hidden admin interface accessed exclusively through bot DMs.
 *
 * @param {Discord.Client} bot - The running Discord bot client.
 * @param {Discord.Message} message - The received message.
 * @param {boolean} sentvalid - True if the author is a privileged frog-user
 *   (DM-accessible admin); gates the entire frog-debug command set.
 * @param {string} msgContent - Normalized (lowercase) message content.
 * @param {Discord.Guild} g - The main guild resolved from frogdata, used for
 *   channel/member lookups inside the frog-debug handlers.
 *
 * ─── COMMAND REFERENCE (all require `sentvalid`) ─────────────────────────────
 *
 * `🐸 debug`
 *   Holiday channel control. Digit 0–4 selects a preset holiday mode; `5` calls
 *   SetHolidayChan(..., 0) to archive and lock the channel. `-n` suppresses the
 *   rename step. `---<id>` re-enables a channel by ID via SetHolidayChan(..., 3).
 *   Reads babotdata.json back after 1 second and DMs the new HC/HV values.
 *
 * `fronge <messageId>`
 *   Finds the given message ID across all text channels and threads (best-effort,
 *   errors swallowed) and removes all reactions from it.
 *
 * `funny silence <messageId>`
 *   Finds a message by ID across all channels/threads and deletes it. No
 *   confirmation and no permission check beyond being in `ifrog`.
 *
 * `cmes <channelId> <text>`
 *   Sends `text` as the bot to the specified channel.
 *   ⚠️ The permission guard (`if (!canSend || true)`) is ALWAYS true because:
 *     1. `guildUser` is a Promise (never awaited), so `canSend` is `undefined`.
 *     2. The `|| true` short-circuits the entire check unconditionally.
 *   Sub-modes (checked by substring):
 *   - `i-u <userId> <text>` – Creates a temporary webhook impersonating `userId`
 *     (copies their display name and avatar), sends `text`, then deletes the
 *     webhook after 10 seconds. The sent message persists after the webhook is
 *     deleted. Thread targets are handled by fetching the parent channel.
 *   - `d-lay <delayMs> <text>` – Schedules a delayed send via `reverseDelay`.
 *   - `tnt` – Sends a typing indicator to the channel (no message body).
 *   - `s-d` flag – Deletes the sent message after 8 seconds.
 *   - `🐸` flag – Reacts to the sent message with the frog emoji.
 *
 * `rng <userId> <minutes>`
 *   Calls `dailyRandom` (i.e. `maidenTime`) to apply a timeout to the given
 *   user for the parsed minute value (converted to ms). Misleadingly named —
 *   has nothing to do with randomness; it is a manual user-timeout tool.
 *
 * `getthefries`
 *   Lists all files in `babadata.datalocation + "FridayCache"` and DMs them
 *   to the author.
 *
 * `cachethefries`
 *   Saves an attached file to `babadata.datalocation + "FridayCache/<filename>"`
 *   using the original filename from the Discord attachment. No type, name, or
 *   size validation is performed.
 *
 * `reee <messageId> <emojis…>`
 *   Adds one or more emoji reactions to the specified message. Custom emoji in
 *   `<:name:id>` format are reduced to the numeric ID only.
 *
 * `refried beans`
 *   Triggers `LoadAllTheCache()` when DB access is enabled to reload the DOW
 *   cache. DMs the result or an error to the author.
 *
 * `showthefridaydebug`
 *   Toggles `global.DebugFriday`. When true, the RNG seed is appended to all
 *   generated DOW messages (useful for reproducing outputs).
 *
 * `testthedmming`
 *   Sends a test DM via `DMMePlease` to verify DM delivery.
 *
 * `babapleaseitistimetosleepforalittlebit`
 *   Graceful bot restart: calls `global.CleanupEverything()`, then after 2 s
 *   creates a new bot via `global.MakeBot()` and starts it with `global.BotOn`.
 *   No rate limiting or cooldown; successive calls can cycle the bot rapidly.
 *
 * `rbcontdow <userId> <0|1|2>` / `rbcontfrog <userId> <0|1|2>`
 *   Calls `controlDOW(userId, time, "DOW"|"FROG")` to set the DOW/FROG control
 *   level (bounded to 0–2) for the given user. Requires DB access.
 *
 * `saintnick <name>`
 *   Changes the bot's display nickname in the guild to `<name>`.
 *
 * `manuela`
 *   Saves Friday counts via `SaveSlashFridayJson`. The `overide` substring
 *   enables the override mode. DMs the result or error.
 *
 * `amhours <userId> <text>`
 *   Fetches the given user and DMs them `text` directly via the bot client.
 *   No content filtering or rate limiting; can target any Discord user ID.
 *
 * `cvcc`
 *   Calls `clearVCCList()` to wipe the voice-channel-change log. Requires DB.
 *
 * `dbdownadam`
 *   Reads `loggedUsersVCC.csv` and DMs a formatted human-readable summary of
 *   each entry. `-force` flag disables filtering of same-channel events.
 *   Output uses Discord timestamp format.
 *
 * `transpose <digits>`
 *   Strips non-digit characters from the first token and maps each digit to the
 *   character at that index in `validLetters` ("bikusfrday"). Useful for
 *   decoding condensed DOW notation.
 *
 * `dbdownbytheriver`
 *   Sends the raw `loggedUsersVCC.csv` file as a DM attachment.
 *
 * `trees`
 *   Sends the main debug log (`debug.log`) as a DM attachment.
 *
 * `dabees`
 *   Sends the DB debug log (`DBdebug.log`) as a DM attachment.
 *
 * `getthemfries`
 *   Sends both `fridayCounter.json` and `fridaymessages.json` as DM attachments.
 *
 * `emptythefriesbasket`
 *   Resets `fridayCounter.json` to `{}` and `fridaymessages.json` to `[]`.
 *   Destructive; no confirmation prompt.
 *
 * `treecapitator`
 *   Clears `debug.log` to an empty file.
 *
 * `dabeecapitator`
 *   Clears `DBdebug.log` to an empty file.
 *
 * `statefarm <channelId> <status>`
 *   Sets a voice channel's status string via `channelStatusChange`. Validates
 *   that the channel exists in guild cache before calling.
 *
 * `dontbuy [count]`
 *   DMs the last `count` (default 5, max 50) entries from `global.lastDBErrors`.
 *
 * `odd [count]`
 *   Fetches up to `count` (default 50, max 100) guild audit log entries and
 *   sends a formatted human-readable summary as DM pages. Optionally filters
 *   out ChannelUpdate events from a specific hardcoded music-bot user ID
 *   (`887854244567334973`) unless `--music` is present in the message.
 *   Uses `enumConverter` for action type names and `parseItems` for change diffs.
 *
 * `am list [full]`
 *   Fetches auto-moderation rules for the hardcoded guild ID `454457880825823252`
 *   via a raw HTTPS request using `bot.token`. `full` dumps the entire rule
 *   object per `objectParse`; otherwise sends `id - name` per rule.
 *   Note: the guild ID is hardcoded here and differs from `babadata.guildId`.
 *   Substring conflict: `amhours` contains "am" so the `am` branch explicitly
 *   checks `!msgContent.includes("hours")` to avoid shadowing `amhours`.
 */
function TextCommandBackup(bot, message, sentvalid, msgContent, g)
{
	// Main collection of ad-hoc, substring-triggered admin/debug commands.
	// This function performs many side effects (file I/O, network calls,
	// message sends, Discord object mutation). It is intentionally permissive
	// and swallows many errors because it is used as a manual debugging tool.
	if (sentvalid) // put in own file or something eventually
	{
		message.channel.sendTyping();
		// Handler: "🐸 debug"
		// - Controls holiday/channel modes used by the bot.
		// - Special forms:
		//   * If message contains '---' the remainder is passed to SetHolidayChan
		//     to re-enable an "old" channel and the author is notified.
		//   * Passing digits 0-4 selects pre-defined holiday modes; '-n' appends a
		//     rename flag to the mode name. '5' calls SetHolidayChan(...,0) and
		//     sends a reset notification.
		// - Side effects: updates babotdata.json indirectly (read back after 1s).
		if (msgContent.includes("🐸 debug")) //0 null, 1 spook, 2 thanks, 3 crimbo, 4 defeat
		{
			if (msgContent.includes("---"))
			{
				var i = msgContent.indexOf("---");
				var sub = msgContent.substring(i + 3);
				SetHolidayChan(g, sub, 3);
				message.author.send("`Re-enabling Old Channel`");
			}
			else
			{
				var rename = "";
				if (msgContent.includes("-n")) rename = "-n"; else rename = "";

				if (msgContent.includes("0"))
					SetHolidayChan(g, "null");
				else if (msgContent.includes("1"))
					SetHolidayChan(g, "spook" + rename);
				else if (msgContent.includes("2"))
					SetHolidayChan(g, "thanks" + rename);
				else if (msgContent.includes("3"))
					SetHolidayChan(g, "crimbo" + rename);
				else if (msgContent.includes("4"))
					SetHolidayChan(g, "defeat" + rename);
				else if (msgContent.includes("5"))
				{
					SetHolidayChan(g, "null", 0);
					message.author.send("`Resetting Holiday Values`");
				}
			}

			setTimeout(function()
			{
				let rawdata = fs.readFileSync(__dirname.replace("TextCommands", "") + '/babotdata.json');
				babadata = JSON.parse(rawdata);
				message.author.send("```HC: " + babadata.holidaychan + "\nHV: " + babadata.holidayval + "```");
			}, 1000);
		}
		// froggifys the message with all frogs and replys with a frog reaction
		// Handler: "fronge"
		// - Purpose: find a message by numeric ID across all text channels and threads
		//   and apply the `fronge` transformation + react to indicate success.
		// - Behavior: best-effort search; fetch errors are swallowed so the command
		//   never throws for missing messages. This is a manual debug helper.
		else if (msgContent.includes("fronge"))
		{
			var fnd = false;
			var message_id = message.content.replace(/\D/g,''); //get message id
			var chanMap = g.channels.fetch().then(channels => {
				channels.each(chan => { //iterate through all the channels
					if (!fnd && chan.type == 0) //make sure the channel is a text channel
					{
						chan.threads.fetch().then(thread => 
							thread.threads.each(thr =>
							{
								thr.messages.fetch(message_id).then(responseMessage => 
								{
									fnd = true;
									fronge(responseMessage);
									message.author.send("SUCC cess");
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(responseMessage => 
						{
							fnd = true;
							fronge(responseMessage);
							message.author.send("SUCC cess");
						}).catch(function (err) {}); 
					}
				});
			});
		}
		// moves a message to the banished lands
		// Handler: "funny silence"
		// - Purpose: locate a message by numeric ID and delete it (moves message
		//   to the "banished lands"). Works across channels and threads.
		// - Behavior: best-effort; swallow fetch errors. Not permission-checked here.
		else if (msgContent.includes("funny silence"))
		{
			var fnd = false;
			var message_id = message.content.replace(/\D/g,''); //get message id
			var chanMap = g.channels.fetch().then(channels => {
				channels.each(chan => { //iterate through all the channels
					if (!fnd && chan.type == 0) //make sure the channel is a text channel
					{
						chan.threads.fetch().then(thread => 
							thread.threads.each(thr =>
							{
								thr.messages.fetch(message_id).then(mehsage => 
								{
									fnd = true;
									mehsage.delete();
									message.author.send("SUCC cess");
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(mehsage => 
						{
							fnd = true;
							mehsage.delete();
							message.author.send("SUCC cess");
						}).catch(function (err) {}); 
					}
				});
			});
		}
		// send a message to a channel
		// Handler: "cmes" (send message via bot to a channel)
		// - Usage variants supported by string checks:
		//   * default: send the provided content to the target channel id.
		//   * "i-u": impersonate a user by creating a temporary webhook using
		//     the fetched user's display name and avatar; deletes webhook after use.
		//   * "d-lay": schedule a delayed send using `reverseDelay` (parses delay).
		//   * "tnt": sendTyping to the channel.
		//   * flags: "s-d" deletes the sent message after 8s; "🐸" reacts with frog.
		// - Note: permission checks attempt to fetch the guild member's state but
		//   the code currently allows sending regardless (permissive behavior).
		else if (msgContent.includes("cmes"))
		{
			var message_id = message.content.split(' ')[1];
			var mess = message.content.split(' ').slice(2, ).join(' '); //get the name for the role

			var hiddenChan = g.channels.cache.get(message_id); //gets the special archive channel
			const guildUser = g.members.fetch(message.author);
			const canSend = guildUser.communicationDisabledUntilTimestamp;

			if(!canSend || true)
			{
				if (msgContent.includes("i-u"))
				{
					var user_id = message.content.split(' ')[2];
					var mess = message.content.split(' ').slice(3, ).join(' '); //get the name for the role

					if (user_id == null || user_id.trim() == "") 
					{
						message.author.send("`Invalid User ID`");
						return;
					}

					g.members.fetch(user_id).then(user => {
						var nname = user.nickname;
						if (nname == null) nname = user.user.username;

						var avatarimg = user.user.avatarURL();

						thread = false;
						if (hiddenChan.type >= 10 && hiddenChan.type < 13)
						{
							hiddenChan = g.channels.cache.get(hiddenChan.parentId);
							thread = true;
						}

						hiddenChan.createWebhook(nname,
						{
							avatar: avatarimg,
							reason: 'Baba Plase'
						})
						.then(webhook =>
						{
							var messageobj = { content: mess }
							
							if (thread) messageobj.threadId = message_id;

							webhook.send(messageobj).then(msg=>
							{
								if (msgContent.includes("s-d"))
								{
									setTimeout(function(){msg.delete();}, 8000);
								}
							});

							setTimeout(() => {
								webhook.delete('Baba Plase');
							}, 10000);
						}).catch((error) => {
							console.error(error);
							message.author.send("Error: " + error);
						});
					}).catch(console.error);
				}
				else if (msgContent.includes("d-lay"))
				{
					var delay = message.content.split(' ')[2];
					var mess = message.content.split(' ').slice(3, ).join(' '); //get the name for the role
					
					if (delay == null || delay.trim() == "") 
					{
						message.author.send("`Invalid Delay`");
						return;
					}

					reverseDelay(message, message.author.id, hiddenChan, mess, parseInt(delay), false);
				}
				else if (msgContent.includes("tnt"))
				{
					hiddenChan.sendTyping();
				}
				else
				{
					hiddenChan.send(mess).then(msg=>
					{
						if (msgContent.includes("🐸"))
						{
							msg.react("🐸");
						}
						if (msgContent.includes("s-d"))
						{
							setTimeout(function(){msg.delete();}, 8000);
						}
					});
				}
			}
		}
		//sends a message at a delayed time to a random channel (same as daily call list)
		// Handler: "rng"
		// - Schedules a daily/random delayed message using `dailyRandom`.
		// - Parses a numeric minute value from the message content and converts
		//   it into milliseconds for the counter parameter.
		else if (msgContent.includes("rng"))
		{
			var u_id = message.content.split(' ').slice(1, 2).join(' ').replace(' ',''); //get the name for the role
			var mess = message.content.split(' ').slice(2, ).join(' '); //get the name for the role
			u_id = u_id.replace(/\D/g,''); //get message id
			var counter = mess.match(/(\d+)/);
			if (counter != null) counter = counter[0] * 60 * 1000;

			dailyRandom(u_id, bot, counter, g);
			message.author.send("SUCC cess");
		}
		// Handler: "getthefries"
		// - Lists files inside the configured `FridayCache` directory and DMs them
		//   to the command author. Uses `babadata.datalocation` for the path.
		else if (msgContent.includes("getthefries"))
		{
			// list all items in the directory of babadata.datalocation + "FridayCache"
			fs.readdir(babadata.datalocation + "FridayCache", (err, files) => {
				if (err) {
					message.author.send("An error occurred while reading the directory");
					return;
				}
				message.author.send("Files in the directory are:\n```" + files.join("\n") + "```");
			});
		}
		// Handler: "cachethefries"
		// - Expects an attachment on the incoming message. Fetches the attachment
		//   and saves it into `babadata.datalocation + 'FridayCache/'` keeping the
		//   original filename. Not safe for large files/no validation — intended
		//   for admin usage only.
		else if (msgContent.includes("cachethefries"))
		{
			var file = message.attachments.first();

			if (file == null)
			{
				message.author.send("No file attached");
				return;
			}

			fetch(file.url).then(res => 
			{
				// save file to babadata  babadata.datalocation + "FridayCache"
				const local = babadata.datalocation + "FridayCache/" + file.name;
				
				const dest = fs.createWriteStream(local);
 
 				res.body.pipe(dest).on('finish', () => {
					message.author.send("File saved");
				});
			})
		}
		// react to a message with a custom emoji
		// Handler: "reee"
		// - Adds one or more reactions (custom or unicode) to a target message.
		// - The second token is the target message id; following tokens are emoji
		//   identifiers. Custom emoji syntax with angle brackets is supported by
		//   extracting the numeric id.
		// - Searches channels and threads similar to `fronge` and swallows fetch
		//   errors when messages are not found.
		else if (msgContent.includes("reee"))
		{
			var fnd = false;
			var message_id = message.content.split(' ')[1]; //get the name for the role
			
			var mess = message.content.split(' ').slice(2, ).join(' '); //get the name for the role
			message_id = message_id.replace(/\D/g,''); //get message id

			var items = mess.split(" ");

			var chanMap = g.channels.fetch().then(channels => {
				channels.each(chan => { //iterate through all the channels
					if (!fnd && chan.type == 0) //make sure the channel is a text channel
					{
						chan.threads.fetch().then(thread => 
							thread.threads.each(thr =>
							{
								thr.messages.fetch(message_id).then(mehstagw => 
								{
									fnd = true;
									for (var i = 0; i < items.length; i++)
									{
										if (items[i].includes("<"))
										{
											items[i] = items[i].match(/(\d+)/)[0];
										}
										
										mehstagw.react(items[i]).catch(console.error);
									}
									message.author.send("SUCC cess");
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(mehstagw => 
						{
							fnd = true;
							for (var i = 0; i < items.length; i++)
							{
								if (items[i].includes("<"))
								{
									items[i] = items[i].match(/(\d+)/)[0];
								}
								
								mehstagw.react(items[i]).catch(console.error);
							}
							message.author.send("SUCC cess");
						}).catch(function (err) {}); 
					}
				});
			});
		}
		// Handler: "refried beans"
		// - Triggers a load of internal DOW cache via `LoadAllTheCache` when DB
		//   access is enabled. Sends result or an error message to the author.
		else if (msgContent.includes("refried beans")) //probably would break adams brain
		{
			if ((global.dbAccess[1] && global.dbAccess[0]))
			{
				LoadAllTheCache().then((result) => 
				{
					message.author.send("DOW cache updated (hopefully)");
					message.author.send("```" + result + "```");
				}).catch(() => 
				{
					console.log("Error loading cache")
					message.author.send("Error loading cache");
				});
			}
			else
			{
				message.author.send("DOW cache not updated");
			}
		}
		// Handler: "showthefridaydebug"
		// - Toggles a global debug flag `global.DebugFriday` and notifies the author.
		else if (msgContent.includes("showthefridaydebug"))
		{
			global.DebugFriday = !global.DebugFriday;

			message.author.send("Debug Friday set to " + global.DebugFriday);
		}
		// Handler: "testthedmming"
		// - Sends a test DM via the `DMMePlease` helper (used for verifying DM
		//   delivery functionality).
		else if (msgContent.includes("testthedmming"))
		{
			DMMePlease("Test DM");
		}
		// Handler: "babapleaseitistimetosleepforalittlebit"
		// - Triggers `global.CleanupEverything()` and then re-initializes the
		//   bot by calling `global.MakeBot()` and `global.BotOn`. Used as a
		//   manual restart mechanism; not safe to call without care.
		else if (msgContent.includes("babapleaseitistimetosleepforalittlebit"))
		{
			DMMePlease("Baba is going to sleep for a little bit");
			message.author.send("Baba is going to sleep for a little bit");
			global.CleanupEverything();
			setTimeout(function()
			{
				// Initialize Discord Bot
				var bot = global.MakeBot();
				global.BotOn(bot);
				setTimeout(function()
				{
					DMMePlease("Baba is back");
				}, 2000);
			}, 2000);
		}
		// Handler: "rbcontdow" / "rbcontfrog"
		// - Controls DOW/FROG behavior for a user by calling `controlDOW` with
		//   parsed time value (0-2). Bounds the value and checks DB access.
		else if (msgContent.includes("rbcontdow") || msgContent.includes("rbcontfrog")) //probably would break adams brain
		{
			var u_id = message.content.split(' ').slice(1, 2).join(' ').replace(' ',''); //get the name for the role
			
			var mess = message.content.split(' ').slice(2, ).join(' '); //get the name for the role
			u_id = u_id.replace(/\D/g,''); //get message id

			var time = mess.match(/(\d+)/);
			if (time != null) time = time[0];

			if (time < 0) time = 0;
			if (time > 2) time = 2;

			if ((global.dbAccess[1] && global.dbAccess[0]))
			{
				controlDOW(u_id, time, msgContent.includes("rbcontdow") ? "DOW" : "FROG");
				message.author.send("DOW control for <@" + u_id + "> set to " + time);
			}
			else
			{
				message.author.send("DOW control not updated");
			}
		}
		// change babas nickname
		// Handler: "saintnick"
		// - Changes the bot's nickname in the guild to the provided name.
		else if (msgContent.includes("saintnick"))
		{
			var name = message.content.split(' ').slice(1, ).join(' '); //get the name for the role

			g.members.fetch(bot.user.id).then(member => {
				member.setNickname(name, "Baba Plase");
			});
		}
		// manuela save the fridaycounts
		// Handler: "manuela"
		// - Saves the Friday counts via `SaveSlashFridayJson`. The 'overide'
		//   flag toggles override behavior. Replies to the author with result.
		else if (msgContent.includes("manuela"))
		{
			var toveride = msgContent.includes("overide");
			SaveSlashFridayJson(toveride).then((result) => 
			{
				message.author.send(result);
			}).catch((error) => {
				console.error(error);
				message.author.send("Error: " + error);
			});
		}
		// dm a user via baba
		// Handler: "amhours"
		// - Directly DMs a user with the provided message using `bot.users.fetch`.
		// - Expects the first token after the command to be a user id.
		else if (msgContent.includes("amhours"))
		{
			var u_id = message.content.split(' ').slice(1, 2).join(' ').replace(' ',''); //get the name for the role
			u_id = u_id.replace(/\D/g,''); //get message id
			
			var mess = message.content.split(' ').slice(2, ).join(' '); //get the name for the role
			bot.users.fetch(u_id).then(user => user.send(mess)).catch(console.error);
		}
		// Handler: "cvcc"
		// - Clears the VCC list by calling `clearVCCList` when DB access is enabled.
		else if (msgContent.includes("cvcc"))
		{
			if (global.dbAccess[1] && global.dbAccess[0])
			{
				clearVCCList();
				
				message.author.send("VCC List Cleared");
			}
			else
			{
				message.author.send("VCC List Not Cleared, DB Disabled");
			}
		}
		// Handler: "dbdownadam"
		// - Reads a CSV (`loggedUsersVCC.csv`) and sends a summary of each line
		//   to the author. The '-force' flag disables filtering identical
		//   channel joins/leaves. Output is human-friendly text using Discord
		//   timestamp formatting. Assumes CSV format of specific columns.
		else if (msgContent.includes("dbdownadam"))
		{
			var forceall = msgContent.includes("-force");
			var loggedUsersVCC = fs.readFileSync(babadata.datalocation + "loggedUsersVCC.csv");

			loggedUsersVCC = loggedUsersVCC.toString();
			var lines = loggedUsersVCC.split("\n");

			message.author.send("Current Lines of Data: " + (lines.length - 1));
			for (var i = 0; i < lines.length; i++)
			{
				if (lines[i].trim() == "") continue;

				var line = lines[i].split(",");
				var newMemberID = line[0];
				var newChannelID = line[1] == "null" ? null : line[1];
				var oldMemberID = line[2];
				var oldChannelID = line[3] == "null" ? null : line[3];
				var time = line[4];
				// convert time to Date object
				var time2 = new Date(parseInt(time));

				if (!forceall && newChannelID == oldChannelID) continue;

				var startstriiin = "<@" + newMemberID + "> joined <#" + newChannelID + ">";
				var endstriin = "and ";
				if (oldMemberID != newMemberID || newChannelID == null)
					endstriin += "<@" + oldMemberID + "> left <#" + oldChannelID + ">";
				else
					endstriin += "left <#" + oldChannelID + ">";
				var timeint = parseInt(time/1000);
				var timestriin = "at <t:" + timeint + ":D> <t:" + timeint + ":T>";

				var resStrung = (newChannelID != null ? startstriiin + " " : "") + (oldChannelID != null ? endstriin + " " : "") + timestriin;

				// if starts with and remove it
				if (resStrung.startsWith("and "))
					resStrung = resStrung.substring(4);

				message.author.send(resStrung);
			}

			if ((lines.length == 1 && lines[0].trim() == "") || lines.length == 0)
				message.author.send("No VCC List to Display");
		}
		// Handler: "transpose"
		// - Converts digits in a token into letters using the `validLetters`
		//   mapping. Non-digit characters are removed before translation.
		else if (msgContent.includes("transpose"))
		{
			// get message
			var message_id = message.content.split(' ')[1];

			// trim to only munbers
			message_id = message_id.replace(/\D/g,'');

			// transpose numbers to string of text based on validLetters
			var strg = "";
			for (var i = 0; i < message_id.length; i++)
			{
				var num = parseInt(message_id[i]);
				if (num < validLetters.length)
					strg += validLetters[num];
				else
					strg += message_id[i];
			}

			// send the transposed message
			if (strg != "")
				message.author.send(strg);
		}
		// Handler: "dbdownbytheriver"
		// - Sends the raw `loggedUsersVCC.csv` file back to the author as an attachment.
		else if (msgContent.includes("dbdownbytheriver"))
		{
			var csv = fs.readFileSync(babadata.datalocation + "loggedUsersVCC.csv");

			// send attachment
			message.author.send({ files: [{ attachment: Buffer.from(csv), name: 'loggedUsersVCC.csv' }] });
		}
		// Handler: "trees"
		// - Reads and sends the debug log file (`debug.log`) from `babadata.temp`.
		else if (msgContent.includes("trees"))
		{
			var logFile = fs.readFileSync(babadata.temp + "debug.log");

			// send attachment
			message.author.send({ files: [{ attachment: Buffer.from(logFile), name: 'debug.log' }] });
		}
		// Handler: "dabees"
		// - Reads and sends the DB debug log file (`DBdebug.log`) from `babadata.temp`.
		else if (msgContent.includes("dabees"))
		{
			var logFile = fs.readFileSync(babadata.temp + "DBdebug.log");

			// send attachment
			message.author.send({ files: [{ attachment: Buffer.from(logFile), name: 'DBdebug.log' }] });
		}
		// Handler: "getthemfries"
		// - Sends both `fridayCounter.json` and `fridaymessages.json` as attachments.
		else if (msgContent.includes("getthemfries"))
		{
			var fridayFile = fs.readFileSync(babadata.datalocation + "fridayCounter.json");
			// send attachment
			message.author.send({ files: [{ attachment: Buffer.from(fridayFile), name: 'fridayCounter.json' }] });
			var fridayMessagesFile = fs.readFileSync(babadata.datalocation + "fridaymessages.json");
			// send attachment
			message.author.send({ files: [{ attachment: Buffer.from(fridayMessagesFile), name: 'fridaymessages.json' }] });
		}
		// Handler: "emptythefriesbasket"
		// - Resets the Friday tracking files to empty JSON defaults. Destructive
		//   admin action; no confirmation prompt.
		else if (msgContent.includes("emptythefriesbasket"))
		{
			// reset the fridaycounter.json and fridaymessages.json to empty
			fs.writeFileSync(babadata.datalocation + "fridayCounter.json", "{}");
			fs.writeFileSync(babadata.datalocation + "fridaymessages.json", "[]");
		}
		// Handler: "treecapitator"
		// - Clears the main debug log file. Sends a confirmation message.
		else if (msgContent.includes("treecapitator"))
		{
			// reset the debug log to empty
			fs.writeFileSync(babadata.temp + "debug.log", "");
			message.author.send("Debug Log Cleared");
		}
		// Handler: "dabeecapitator"
		// - Clears the DB debug log file. Sends a confirmation message.
		else if (msgContent.includes("dabeecapitator"))
		{
			// reset the debug log to empty
			fs.writeFileSync(babadata.temp + "DBdebug.log", "");
			message.author.send("DB Debug Log Cleared");
		}
		// Handler: "statefarm"
		// - Sets a channel's status using `channelStatusChange`. Expects two
		//   parameters: channel id and a free-form status string. Validates
		//   that the channel exists before calling the helper.
		else if (msgContent.includes("statefarm"))
		{
			// 3 values: statefarm, channelid, status
			var channelid = message.content.split(' ')[1];
			// everything after the first space
			var status = message.content.split(' ').slice(2, ).join(' '); //get the name for the role

			var channel = g.channels.cache.get(channelid); //gets the special archive channel

			if (channel == null)
			{
				message.author.send("Invalid Channel ID");
				return;
			}

			channelStatusChange(channelid, status);

			message.author.send("Channel <#" + channelid + "> status set to " + status);
		}
		// add new one to download a csv of all the vcc logs and one to upload a csv of all the vcc logs
		// add a thing to convert a datetime to utc
		// Handler: "dontbuy"
		// - Dumps recent database errors stored in `global.lastDBErrors` to the
		//   author. Optionally accepts a numeric count (bounded to 50).
		else if (msgContent.includes("dontbuy"))
		{
			var name = message.content.split(' ').slice(1, ).join(' '); //get the name for the role
			var count = name.match(/(\d+)/);
			if (count == null) count = 5;
			else count = count[0];
			if (count > 50) count = 50;

			var mesg = global.lastDBErrors;

			// if blank message
			if (mesg === undefined)
				message.author.send("No DB Error Message");
			else
			{
				// loop through the first COUNT messages in lastDBError
				for (var i = 0; i < count; i++)
				{
					if (mesg[i] === undefined)
						break;
					var timestamp = mesg[i][1];
					var messageo = mesg[i][0];

					message.author.send("`" + timestamp + "`\n`" + messageo + "`");
				}
			}
		}
		// read the audit log
		// Handler: "odd" (audit log reader)
		// - Fetches audit log entries from the guild, formats each entry into
		//   a human-readable block and sends paginated messages to the author.
		// - For each audit entry the code:
		//   1) Converts `action` to text via `enumConverter`.
		//   2) Resolves target types to readable mentions/ids.
		//   3) Formats a timestamp and skips noisy music ChannelUpdate events
		//      from a particular user id unless `--music` is present.
		//   4) For `changes`, calls `parseItems` to produce inline diffs or
		//      structured multi-line diffs and then wraps those in quoted lines.
		// - Uses `Seperated` to split long output into messages that fit Discord
		//   and sends them to the author. Errors and stacks are DM'd on failure.
		else if (msgContent.includes("odd"))
		{
			var showmusic = msgContent.includes("--music");

			var name = message.content.split(' ').slice(1, ).join(' '); //get the name for the role
			var count = name.match(/(\d+)/);
			if (count == null) count = 50;
			else count = count[0];
			if (count > 100) count = 100;

			odd = ["`Logs:`"];

			g.fetchAuditLogs({limit: count})
			.then(audit => 
			{
				var entries = audit.entries.toJSON();
				for (var i = 0; i < entries.length; i++)
				{
					var k = entries[i];
					var act = k.action;
					var actTxt = enumConverter(act);
					var user = k.executor ? k.executor.id : 0;
					var reason = k.reason;
					var target = k.target;
					var chaib = k.changes;

					var outpiut = "`" + actTxt + (user != 0 ? "` by <@" + user + ">" : "`");

					if (reason != null) outpiut += " for `" + reason + "`:";
					else outpiut += ":";

					// if (k.targetType == "USER") outpiut += " <@" + target + ">";
					// else if (k.targetType == "GUILD_MEMBER") outpiut += " <@" + target.user.id + ">";
					// else if (k.targetType == "MEMBER") outpiut += " <@" + target.user.id + ">";
					// else if (k.targetType == "CHANNEL") outpiut += " <#" + target.id + ">";
					// else if (k.targetType == "ROLE") outpiut += " <@&" + target.id + ">";
					// else if (k.targetType == "INVITE") outpiut += " " + target.code;
					// else if (k.targetType == "WEBHOOK") outpiut += " " + target.name;
					// else if (k.targetType == "EMOJI") outpiut += " " + target.name;
					// else if (k.targetType == "MESSAGE") outpiut += " " + target.id;
					// else if (k.targetType == "THREAD") outpiut += " <#" + target.id + ">";
					// else if (k.targetType == "INTEGRATION") outpiut += " " + target.name;
					// else if (k.targetType == "STAGE_INSTANCE") outpiut += " " + target.id;
					// else if (k.targetType == "STICKER") outpiut += " " + target.name;
					// else if (k.targetType == "GUILD") outpiut += " " + target.id;
					switch (k.targetType.toUpperCase()) {
						case "USER":
							outpiut += " <@" + target + ">";
							break;
						case "GUILD_MEMBER":
						case "MEMBER":
							outpiut += " <@" + target.user.id + ">";
							break;
						case "THREAD":
						case "CHANNEL":
							outpiut += " <#" + target.id + ">";
							break;
						case "ROLE":
							outpiut += " <@&" + target.id + ">";
							break;
						case "INVITE":
							outpiut += " " + target.code;
							break;
						case "WEBHOOK":
						case "INTEGRATION":
						case "STICKER":
						case "EMOJI":
							outpiut += " " + target.name;
							break;
						case "MESSAGE":
						case "STAGE_INSTANCE":
						case "GUILD":
							outpiut += " " + target.id;
							break;
						case "UNKNOWN":
							if (actTxt == "GuildVoiceStatusUpdate")
								outpiut += " <#" + target.id + ">";
							break;
					}
					// future == add more things here + voicestatusupdate

					outpiut += " at `" + k.createdAt + "`";
					
					if (!showmusic && actTxt == "ChannelUpdate" && user == "887854244567334973")
					{
						odd.push(outpiut);
						continue;
					}
					
					outpiut += "\n";

					var op2 = "> `(No Changes)`";

					if (chaib != null)
					{
						var op3 = "";
						var putter = [];
						for (var j = 0; j < chaib.length; j++)
						{
							var c = chaib[j];
							var key = c.key;
							var old = c.old;
							var neww = c.new;
							
							var strg = parseItems(old, neww);
							
							var ct = strg.toString().split(/\r\n|\r|\n/);
							if (ct.length > 1)
							{
								putter.push("> `" + key + ":`");
								for (var k = 0; k < ct.length; k++)
								{
									if (ct[k] == "")
										continue;
									putter.push("> `" + ct[k] + "`");
								}
							}
							else
							{
								putter.push("> `" + key + ": " + strg + "`");
							}
						}

						op3 += putter.join("\n");
						
						if (op3.trim() != "")
							op2 = op3;
					}

					outpiut += op2;

					odd.push(outpiut);
				}
				var vle = odd.join("\n");
				var msgs = Seperated(vle)
				
				for (var i = 0; i < msgs.length; i++)
				{
					message.author.send(msgs[i]);
				}
			}).catch((error) => {
				console.error(error);
				message.author.send("Error: `" + error + "`");
				message.author.send("Stack:\n```" + error.stack + "```");
			});
		}
		// Handler: "am" (auto-moderation rules)
		// - If used with the token "list" this issues an HTTP GET to the
		//   Discord API to fetch auto-moderation rules for the configured
		//   guild id and returns either a compact list or full objects.
		// - Requires the bot token and performs a raw HTTPS request instead of
		//   using a higher-level library — intended for quick admin use.
		else if (msgContent.includes("am") && !msgContent.includes("hours"))
		{
			if (msgContent.includes("list"))
			{
				const options = {
					hostname: 'discord.com',
					path: '/api/v10/guilds/454457880825823252/auto-moderation/rules',
					headers: {
						"Authorization": "Bot " + bot.token,
					}
				}
				
				var getto = https.get(options, (resp) => {
					let data = '';
					resp.on('data', (chunk) => {
						data += chunk;
					});
					resp.on('end', () => {
						var dataparse = JSON.parse(data);
						if (msgContent.includes("full"))
						{
							for (var i = 0; i < dataparse.length; i++)
							{
								var send = "```";
								send += objectParse(dataparse[i], 0);
								send += "\n";
								send += "```";
								message.author.send(send);
							}
						}
						else
						{
							var send = "";
							for (var i = 0; i < dataparse.length; i++)
							{
								send += dataparse[i].id + " - " + dataparse[i].name + "\n";
							}
							message.author.send(send);
						}
					});
				});
			}
		}
	}
}

module.exports = {
	TextCommandBackup
}

// add function: "are you gonna" that will check if the day call command has happened and what channel if it already occured, else post "perchance"
// call command after successful call -> say channel name and time
// call command after time end -> say channel name/time or "nothing"
// call command before end of time -> say "perchance"
