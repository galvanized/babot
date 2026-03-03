/**
 * @module TextCommands
 * @description
 * Handlers for text-based commands received by the bot. This module exposes
 * `babaMessage(bot, message)` which inspects incoming messages, normalizes
 * content, and performs many ad-hoc, substring-driven commands and admin
 * operations. The file performs side-effects: reading/writing local JSON files,
 * calling helper modules, sending and deleting Discord messages, and invoking
 * other bot utilities. Many branches use best-effort fetches and intentionally
 * swallow errors for robustness in an admin/debug context.
 *
 * Notes & caveats:
 * - This is not a formal command parser; most handlers use `msgContent.includes(...)`.
 * - Several actions are destructive (log resets, file writes, deletes) and
 *   are intended for admin use only; callers are responsible for permissions.
 * - The code relies on global state (e.g., `babadata`, `global.*`) and helper
 *   functions from other modules in `Functions/`.
 */
var babadata = require('../babotdata.json'); //baba configuration file

const fs = require('fs'); //file stream used for del fuction

//const voice = require('@discordjs/voice')
//var prism = require("prism-media");
//var ffmpeg = require('fluent-ffmpeg');

const Discord = require('discord.js'); //discord module for interation with discord api

const { SetHolidayChan, CheckFrogID, handleButtonsEmbed, preformEasterEggs } = require("../Functions/HelperFunctions/basicHelpers.js");
const { getErrorFlag } = require("../Functions/HelperFunctions/commandHelpers.js");
const { setGrole, setVote, setVBH, movetoChannel, timedOutFrog } = require("../Functions/HelperFunctions/adminHelpers.js");
const { normalizeMSG } = require("../Functions/HelperFunctions/dbHelpers.js");
const { TextCommandBackup } = require("./textExtra.js");
const { functionPostFunnyDOW } = require("../Functions/HelperFunctions/slashFridayHelpers.js");
const { getD1 } = require("../Tools/overrides.js");
const { babaFriday,  babaHelp, babaPlease, babaPizza, babaVibeFlag, babaYugo, babaHaikuEmbed, babaDayNextWed, babaJeremy, babaHurricane, babaRepost, babaWeather, babaProgress, babaAurora, babaGoodberrys, babaHaikuLinks, babaUntilHolidays } = require("../Functions/commandFunctions.js");


//To Do:
/*
	- Stop Calls to Funciton until images posted! - Sami
	- Bruh Mode? - Ryan
	- make if (message.content.includes("847324692288765993")) do somthing more interesting
*/
// const { Console } = require('console');
// const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require('constants');
//const { spawn } = require("child_process");
/* [ 	["christmas", 12, 25, 0, 0], 
	["thanksgiving", 11, 0, 4, 4], 
	["st patrick", 3, 17, 0, 0],
	["halloween", 10, 31, 0, 0],
	["new year", 1, 1, 0, 0],
	["summer solstice", 6, 21, 0, 0],
	["winter solstice", 12, 21, 0, 0],
	["valentine", 2, 14, 0, 0],
	["easter", 2, 14, 0, 0],
	["friday", 2, 14, 0, 0]
]; */ // ["name", month, day of week, week num, weekday] -- day of week for exact date holiday, week num + weekday for holidays that occur on specific week/day of week
// 0 = Sunday, 1 = Monday ... 6 = Saturday for option 5

//const opusDecoder = new prism.opus.Decoder({
//	frameSize: 960,
//	channels: 2,
//	rate: 48000,
//});


/**
 * Main message handler invoked for each received message.
 *
 * Behavior summary:
 * - Loads frog/holiday configuration on each call (synchronous read).
 * - Normalizes incoming content and runs a set of substring-driven handlers
 *   (both lightweight user commands and privileged admin commands).
 * - Calls `TextCommandBackup` early to let it handle out-of-guild DMs and
 *   other admin/debug triggers.
 *
 * Important side-effects:
 * - Reads `frogholidays.json` and `babotdata.json` from the configured
 *   data location on each invocation.
 * - May mutate bot/guild state via helpers such as `SetHolidayChan` and
 *   `movetoChannel` and will write to `babotdata.json` when holiday defaults
 *   need to be initialized.
 *
 * @param {Discord.Client} bot - The running Discord bot client instance.
 * @param {Discord.Message} message - The received message object to handle.
 */
// stuff when message is recived.
async function babaMessage(bot, message)
{
	let rawdata = fs.readFileSync(babadata.datalocation + "FrogHolidays/" + 'frogholidays.json'); //load file each time of calling wednesday
	let frogdata = JSON.parse(rawdata);
	var g, rl = null;
	var sentvalid = false;
	var idint = CheckFrogID(frogdata, message.author.id);
	var rid = frogdata.froghelp.rfrog[0];
	var msgContent = normalizeMSG(message.content.toLowerCase());

	if (message.channel.type == 1 && idint >= 0)
	{
		rid = frogdata.froghelp.rfrog[idint];
		g = bot.guilds.resolve(frogdata.froghelp.mainfrog);
		rl = g.roles.cache.find(r => r.id === rid);
		sentvalid = true;
	}
	
	TextCommandBackup(bot, message, sentvalid, msgContent, g)
	
	if (babadata.holidaychan == null)
	{
		let rawdata = fs.readFileSync(__dirname.replace("TextCommands", "") + '/babotdata.json');
		let baadata = JSON.parse(rawdata);
		baadata.holidaychan = "0";
		baadata.holidayval = "null";
		let n = JSON.stringify(baadata)
		fs.writeFileSync(__dirname.replace("TextCommands", "") + '/babotdata.json', n);

		babadata = baadata;
	}

	var yr = getD1().getFullYear(); //get this year

	if(msgContent.includes(yr - 1) && msgContent.includes("560231259842805770") && msgContent.includes("563063109422415872") && !message.author.bot && message.author.id == "360228104997961740") //if message contains baba and is not from bot
	{
		let rawdata = fs.readFileSync(__dirname.replace("TextCommands", "") + '/babotdata.json');
		let baadata = JSON.parse(rawdata);

		babadata = baadata;
		if (babadata.holidayval == "defeat")
		{
			//560231259842805770  563063109422415872
			SetHolidayChan(message.guild, "null", 0);
		}
	}
	

	/*
	var streamies = {};
	if (msgContent.includes("voice time"))
	{
		connection = voice.joinVoiceChannel({
            channelId: message.guild.members.cache.get(message.author.id).voice.channel.id, //the id of the channel to join (we're using the author voice channel)
            guildId: message.guild.id, //guild id (using the guild where the message has been sent)
            adapterCreator: message.guild.voiceAdapterCreator //voice adapter creator
        });


		connection.receiver.speaking.on('start', (userId) => {
			console.log("start" + userId);
			console.log(streamies[userId]);
            if (streamies[userId] == null || Number.isInteger(streamies[userId]))
			{
				if (streamies[userId] == null) streamies[userId] = 0;
				var ct = streamies[userId];

				var dest = fs.createWriteStream('output' + userId + " - " + ct + '.pcm');
				streamies[userId] = {"id": ct, "sub": connection.receiver.subscribe(userId), "stream": dest};
				streamies[userId].sub.pipe(opusDecoder).pipe(streamies[userId].stream);
			}
        })
		
		connection.receiver.speaking.on('end', (userId) => {
			console.log("end" + userId);
			if (streamies[userId] != null)
			{
				var ct = streamies[userId].id;
				var proc = new ffmpeg();

				proc.addInput("output" + userId + " - " + ct + ".pcm")
				.on('end', function() {
					
				})
				.addInputOptions(['-y', '-f s16le', '-ar 44.1k', '-ac 2'])
				.output("output" + userId + " - " + ct + ".wav")
				.run()
				
				//exec("ffmpeg -y -f s16le -ar 44.1k -ac 2 -i output" + userId + ".pcm output" + userId + ".mp3")
				//var writeStream = fs.createWriteStream('samples/output'+ ct + '.pcm')
				streamies[userId].sub.unpipe();
				streamies[userId].sub.destroy();
				streamies[userId].stream.end();
				streamies[userId] = ct + 1;
				//fs.unlinkSync('output' + userId + " - " + (streamies[userId] - 1) + '.pcm');
			}
		})

	}
	*/

	await preformEasterEggs(message, msgContent, bot)

	if(msgContent.includes('!baba')) //if message contains baba and is not from bot
	{
		// Public command namespace: '!baba' prefix
		// Many lightweight user-facing commands live here; these are intended
		// for general use (not admin-only). Each branch below checks for a
		// keyword and sends a response or triggers a helper. Handlers should
		// generally be fast and non-blocking; heavy operations use callbacks.
		message.channel.sendTyping();
		if (msgContent.includes("baba is help") && message.author.bot)
			return
		
		var exampleEmbed = null;
		var text = 'BABA IS ADMIN'; //start of reply string for responce message.
		
		if(msgContent.includes('password')) //reply with password file string if baba password
		{
			text += '\n' + babadata.pass;
		}

		message.channel.send({ content: text });

		// Branch: friday
		// - If today is not Friday, call `functionPostFunnyDOW` to post a DOW
		//   (day-of-week) message; otherwise call `babaFriday()` to return the
		//   regular Friday response.
		if (msgContent.includes("friday"))
		{
			message.channel.sendTyping();
			var tod = getD1();
			if (tod.getDay() != 5)
			{
				await functionPostFunnyDOW("message", message, 5);
			}
			else
			{
				message.channel.send(await babaFriday());
			}
		}

		// Branch: please
		// - Minimal polite helper: returns `babaPlease()` content when present.
		if (msgContent.includes("please")) //this could do something better but its ok for now
		{
			message.channel.sendTyping();
			var cont = babaPlease()
			if (cont != null)
			{
				message.channel.send(cont);
			}
		}

		// Branch: progress
		// - Return a short progress/status string using `babaProgress`.
		if (msgContent.includes("progress"))
		{
			message.channel.sendTyping();
			var progress = babaProgress(20);
			message.channel.send(progress);
		}

		// Branch: goodberries / goodberry
		// - Fetches calendar events via `babaGoodberrys` and formats them into
		//   a human-readable list. The callback receives an object with `events`.
		if (msgContent.includes("goodberries") || msgContent.includes("goodberry"))
		{
			message.channel.sendTyping();
			babaGoodberrys(function(val)
			{
				var evnts = val.events;
				
				// sort events by date
				evnts.sort(function(a, b)
				{
					return a.start - b.start;
				});

				var resp = "";
				for (var i = 0; i < evnts.length; i++)
				{
					var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
					
					resp += evnts[i].summary + " on " + evnts[i].start.toLocaleDateString("en-US", options) + "\n";
				}

				if (resp == "")
					resp = "No events found";

				message.channel.send(resp);
			});
		}

		// Branch: uppus
		// - Returns uptime since `global.starttime` formatted in days/hours/etc.
		if (msgContent.includes("uppus"))
		{
			message.channel.sendTyping();
			var start = global.starttime;
			var now = getD1(true);
			var diff = now - start;
			var diffDays = Math.floor(diff / 86400000); // days
			var diffHrs = Math.floor((diff % 86400000) / 3600000); // hours
			var diffMins = Math.floor(((diff % 86400000) % 3600000) / 60000); // minutes
			var diffSecs = Math.floor((((diff % 86400000) % 3600000) % 60000) / 1000); // seconds
			var diffMs = Math.floor((((diff % 86400000) % 3600000) % 60000) % 1000); // milliseconds
			var diffString = diffDays + " days, " + diffHrs + " hours, " + diffMins + " minutes, " + diffSecs + " seconds, " + diffMs + " milliseconds";
			message.channel.send("`" + diffString + "`");
		}

		// Branch: aurora
		// - Calls `babaAurora` which uses a callback; replies with the returned
		//   text when the callback fires.
		if (msgContent.includes("aurora"))
		{
			message.channel.sendTyping();
			var time = "tonights";
			babaAurora(time, function(val)
			{
				message.channel.send(val);
			});
		}

		// Branch: order pizza
		// - Returns a short pizza-ordering string from `babaPizza`.
		if (msgContent.includes("order pizza"))
		{
			message.channel.sendTyping();
			message.channel.send(babaPizza());
		}

		// Branch: hurricane
		// - Calls `babaHurricane` with a callback and forwards the output.
		if (msgContent.includes("hurricane"))
		{
			message.channel.sendTyping();
			babaHurricane("", function(val)
			{
				message.channel.send(val);
			});
		}

		// Branch: repost
		// - Returns the output of `babaRepost()` directly to the channel.
		if (msgContent.includes("repost"))
		{
			message.channel.sendTyping();
			message.channel.send(babaRepost());
		}

		// Branch: jeremy
		// - Synchronous helper returning a string from `babaJeremy()`.
		if (msgContent.includes("jeremy"))
		{
			message.channel.send(babaJeremy());
		}

		// if (msgContent.includes("cat"))
		// {
		// 	message.channel.send(babaCat());
		// }

		// Branch: weather
		// - Calls `babaWeather` with a callback and forwards the result. This
		//   branch currently hardcodes the location parameter; consider
		//   externalizing if multi-location support is required.
		if (msgContent.includes("weather"))
		{
			message.channel.sendTyping();
			babaWeather("deets", "Apex NC", function(val)
			{
				message.channel.send(val);
			});
		}

		// Branch: help
		// - Prints the general help text returned by `babaHelp()`.
		if(msgContent.includes('help')) //reply with help text is baba help
		{
			message.channel.sendTyping();
			message.channel.send(babaHelp());
		}

		// Branch: flag (night shift / vibe time)
		// - Returns an image/flag for the vibe-time feature. If sending the
		//   image directly fails, a fallback attachment using `getErrorFlag()` is
		//   created and sent to ensure the user receives a response.
		if (msgContent.includes('flag') && (msgContent.includes('night shift') || msgContent.includes('vibe time')))
		{
			message.channel.sendTyping();
			var flagcontent = babaVibeFlag();
			message.channel.send(flagcontent).catch(error => {

				var newAttch = new Discord.AttachmentBuilder(getErrorFlag(), 
					{ name: 'errrrrr.png', description : "No flag for you bud hee!"}); //makes a new discord attachment

				message.channel.send({content: flagcontent.content, files: [newAttch] }); // send file
			});
		}
/*
		if (msgContent.includes("music"))
		{
			if (msgContent.includes("play"))
				message.channel.send("!play " + babadata.vibe);
			if (msgContent.includes("shuffle"))
				message.channel.send("!shuffle");
		}
*/
		// Branch: make yugo
		// - Returns content created by `babaYugo()`. Lightweight and synchronous.
		if(msgContent.includes('make yugo'))
		{
			message.channel.sendTyping();
			message.channel.send(babaYugo());
		}

		// Branch: haiku
		// - Produces one or more embedded haiku messages. If multiple pages are
		//   returned, `handleButtonsEmbed` is used to add interactive navigation
		//   buttons. `purity` and `by` modifiers are parsed from the message.
		if (msgContent.includes('haiku')) // add custom haiku search term?
		{
			message.channel.sendTyping();
			var purity = msgContent.includes("purity");
			var buy = msgContent.includes("by");
			var info = {"ipp": 5, "page": 0};

			var cont = babaHaikuEmbed(purity, buy, msgContent, info);
			var deadData = purity || cont[0].components == null ? null : babaHaikuLinks(cont);
			
			message.channel.send(cont[info.page]).then(m2 => 
			{
				if (cont[info.page].components != null && cont.length > 1)
				{
					handleButtonsEmbed(message.channel, m2, message.author.id, cont, deadData);
				}
			})
			.catch(console.error);;
		}

		// Branch: wednesday / days-until / when-is / day-of-week
		// - Returns holiday/wednesday related text and optionally posts
		//   an image by calling `babaUntilHolidays`. Uses `timedOutFrog` to
		//   push generated images into a channel when a file is present.
		if (msgContent.includes('wednesday') || msgContent.includes('days until') || msgContent.includes('when is') || msgContent.includes('day of week'))
		{
			message.channel.sendTyping();
			if (msgContent.includes('days until next wednesday'))
				message.channel.send(babaDayNextWed());

			var texts = await babaUntilHolidays(msgContent, message.author, "04");
			
			var templocal = babadata.datalocation + "FrogHolidays/"; //creates the output frog image

			for ( var i = 0; i < texts.length; i++)
			{
				if (texts[i].files == null)
				{
					var text = texts[i].content;

					if (text == "FUNNYDOW")
						await functionPostFunnyDOW("message", message, 3);
					else
						await message.channel.send(text);	
				}
				else
					timedOutFrog(i, texts, message, templocal);
			}
		}
	}
	if(msgContent.includes('!bdelete')) //code to del and move to log
	{
		// Admin branch: !bdelete
		// - Privileged command: requires the caller to have the configured
		//   admin role (`babadata.adminId`). Searches channels and threads for
		//   the target message id and calls `movetoChannel` to move it to the
		//   configured log channel. Best-effort fetches are used and fetch
		//   errors are swallowed to avoid throwing on not-found.
		message.channel.sendTyping();
		if(message.channel.type != 1 && message.member.roles.cache.has(babadata.adminId)) //check if admin
		{
			var message_id = message.content.replace(/\D/g,''); //get message id
			var fnd = false;
			
			var chanMap = message.guild.channels.fetch().then(channels => {
				channels.each(chan => { //iterate through all the channels
					if (!fnd && chan.type == 0) //make sure the channel is a text channel
					{
						chan.threads.fetch().then(thread => 
							thread.threads.each(thr =>
							{
								thr.messages.fetch(message_id).then(message => 
								{
									fnd = true;
									movetoChannel(message, thr, babadata.logchan)
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(message => 
						{
							fnd = true;
							movetoChannel(message, chan, babadata.logchan)
						}).catch(function (err) {}); 
					}
				});
			});
		}
	}
	// move messsage to politics channel
	if(msgContent.includes('!political'))
	{
		// Admin branch: !political
		// - Same pattern as !bdelete but moves the message to the `politicschan`.
		message.channel.sendTyping();
		if(message.channel.type != 1 && message.member.roles.cache.has(babadata.adminId)) //check if admin
		{
			var message_id = message.content.replace(/\D/g,''); //get message id
			var fnd = false;
			
			var chanMap = message.guild.channels.fetch().then(channels => {
				channels.each(chan => { //iterate through all the channels
					if (!fnd && chan.type == 0) //make sure the channel is a text channel
					{
						chan.threads.fetch().then(thread => 
							thread.threads.each(thr =>
							{
								thr.messages.fetch(message_id).then(message => 
								{
									fnd = true;
									movetoChannel(message, thr, babadata.politicschan)
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(message => 
						{
							fnd = true;
							movetoChannel(message, chan, babadata.politicschan)
						}).catch(function (err) {}); 
					}
				});
			});
		}
	}
	if(msgContent.includes('!setvote')) //code to set vote
	{
		// Admin branch: !setvote
		// - Finds a message by id and calls `setVote` on it to initialize a
		//   voting widget. Requires admin role.
		message.channel.sendTyping();
		if(message.channel.type != 1 && message.member.roles.cache.has(babadata.adminId)) //check if admin
		{
			var message_id = message.content.replace(/\D/g,''); //get message id
			var fnd = false;

			var chanMap = message.guild.channels.fetch().then(channels => {
				channels.each(chan => { //iterate through all the channels
					if (!fnd && chan.type == 0) //make sure the channel is a text channel
					{
						chan.threads.fetch().then(thread => 
							thread.threads.each(thr =>
							{
								thr.messages.fetch(message_id).then(message => 
								{
									fnd = true;
									setVote(message)
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(message => 
						{
							fnd = true;
							setVote(message)
						}).catch(function (err) {}); 
					}
				});
			});
		}
	}
	if(msgContent.includes('!bsetstatus')) //code to set game
	{
		// Admin branch: !bsetstatus
		// - Sets the bot's presence status (online/idle/dnd/invisible) determined
		//   by keywords in the admin message. Falls back to 'online' for unknown
		//   types. This controls `bot.user.setStatus`.
		message.channel.sendTyping();
		if(message.channel.type != 1 && message.member.roles.cache.has(babadata.adminId)) //check if admin
		{
			var text = msgContent;
			var tyepe = -1;
			if (text.includes("idle"))
				tyepe = "idle";
			if (text.includes("afk"))
				tyepe = "idle";
			else if (text.includes("online"))
				tyepe = "online";
			else if (text.includes("woke"))
				tyepe = "online";
			else if (text.includes("invisible"))
				tyepe = "invisible";
			else if (text.includes("offline"))
				tyepe = "invisible";
			else if (text.includes("dnd"))
				tyepe = "dnd";
			else if (text.includes("do not disturb"))
				tyepe = "dnd";

			if (tyepe == -1)
				tyepe = "online";
			
			bot.user.setStatus(tyepe);
		}
	}
	if(msgContent.includes('!bsetgame')) //code to set game
	{
		// Admin branch: !bsetgame
		// - Sets the bot's activity via `bot.user.setActivity`. Supports types
		//   such as watching, playing, listening, streaming and includes a
		//   fallback default when no type keyword is matched.
		message.channel.sendTyping();
		if(message.channel.type != 1 && message.member.roles.cache.has(babadata.adminId)) //check if admin
		{
			var text = msgContent;
			var tyepe = -1;
			var lc = 2;
			if (text.includes("watching"))
				tyepe = 3;
			else if (text.includes("playing"))
				tyepe = 0;
			else if (text.includes("listening"))
				tyepe = 2;
			else if (text.includes("competing"))
				tyepe = 5;
			else if (text.includes("streaming"))
				tyepe = 1;

			if (tyepe == -1)
			{
				tyepe = 0;
				lc = 1;
			}
			
			var mess = message.content.split(' ').slice(lc, ).join(' '); //get the name for the role

			var help = { type: tyepe };
			if (tyepe == 1)
				help.url = "https://www.twitch.tv/directory/game/Baba%20is%20You";
			
			bot.user.setActivity(mess, help);
		}
	}
	if(msgContent.includes('!banhammer')) //code to set ban hammer
	{
		// Admin branch: !banhammer
		// - Finds a message and calls `setVBH` which appears to configure a
		//   'very big hammer' moderation action on the message. Requires admin.
		message.channel.sendTyping();
		if(message.channel.type != 1 && message.member.roles.cache.has(babadata.adminId)) //check if admin
		{
			var message_id = message.content.replace(/\D/g,''); //get message id
			var fnd = false;
			
			var chanMap = message.guild.channels.fetch().then(channels => {
				channels.each(chan => { //iterate through all the channels
					if (!fnd && chan.type == 0) //make sure the channel is a text channel
					{
						chan.threads.fetch().then(thread => 
							thread.threads.each(thr =>
							{
								thr.messages.fetch(message_id).then(message => 
								{
									fnd = true;
									setVBH(message)
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(message => 
						{
							fnd = true;
							setVBH(message)
						}).catch(function (err) {}); 
					}
				});
			});
		}
	}
	if(msgContent.includes('!grole')) //code to set game role
	{
		// Admin branch: !grole
		// - Parses a role name and a message id from the command tokens and then
		//   calls `setGrole` to attach the role to reactions or otherwise tie the
		//   role to the target message. This is a moderation/utility helper.
		message.channel.sendTyping();
		if(message.channel.type != 1 && message.member.roles.cache.has(babadata.adminId)) //check if admin
		{
			role_name = message.content.split(' ').slice(0, 2).join(' ').substring(6).replace(' ',''); //get the name for the role
			var message_id = message.content.replace(role_name,''); //remove role name from string
			message_id = message_id.replace(/\D/g,''); //get message id
			var fnd = false;
			
			var chanMap = message.guild.channels.fetch().then(channels => {
				channels.each(chan => { //iterate through all the channels
					if (!fnd && chan.type == 0) //make sure the channel is a text channel
					{
						chan.threads.fetch().then(thread => 
							thread.threads.each(thr =>
							{
								thr.messages.fetch(message_id).then(message => 
								{
									fnd = true;
									setGrole(message, role_name);
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(message => 
						{
							fnd = true;
							setGrole(message, role_name);
						}).catch(function (err) {}); 
					}
				});
			});
		}
	}

	// Small utility branch: reset a daily flag when 'robot' is mentioned.
	// This toggles `global.ResetDaily` off when present; used by internal
	// automation to avoid repeated daily resets.
	if (msgContent.includes("robot") && global.ResetDaily)
	{
		message.channel.sendTyping();
		global.ResetDaily = false;
	}
};

//async function tempoutput(msg, lp)  //temporary output function for testing
//{
//	var t = "";
//
//	for ( var i = 0; i < lp.length; i++) 
//	{
//		t += lp[i] + "\n";
//	}
//
//	msg.channel.send(t);
//}

module.exports = {
	babaMessage
}
