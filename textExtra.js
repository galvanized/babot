var babadata = require('./babotdata.json'); //baba configuration file
const { controlDOW, cacheDOW } = require("./databaseandvoice");
const fs = require('fs');
const https = require('https');
const fetch = require('node-fetch');

const { SetHolidayChan, dailyRandom, fronge, Seperated, enumConverter } = require("./HelperFunctions/basicHelpers.js");
const { reverseDelay } = require("./HelperFunctions/commandHelpers.js");

function generateTabs(num)
{
	var strg = "";
	for (var i = 0; i < num; i++)
		strg += "	";
	return strg;
}

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

function twoObjectParseCompare(old, neww, ind, arraymode = false)
{
	var objs = [];

	var oCt = (old === undefined || old == "undefined") ? 0 : Object.keys(old).length;
	var nCt = (neww === undefined || neww == "undefined") ? 0 : Object.keys(neww).length;

	var picked = old;

	if (oCt < nCt)
		picked = neww;

	if (arraymode)
	{
		if (old.length < neww.length)
			picked = neww;
	}

	for (var key in picked)
	{
		if ((neww === undefined) || old[key] != neww[key] || arraymode)
		{
			if (typeof old[key] === 'object' && old[key] !== null)
			{
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
		strg = old + " -> " + neww
		if (typeof old === 'object' && old !== null)
		{
			var am = Array.isArray(old);
			strg = twoObjectParseCompare(old, neww, 1 - (am ? (neww !== null ? (old.length > 1 || neww.length > 1 ? 0 : 1) : 0) : 0), am);
		}
	}

	return strg;
}


function TextCommandBackup(bot, message, sentvalid, msgContent, g)
{
	if (sentvalid) // put in own file or something eventually
	{
		message.channel.sendTyping();
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
				let rawdata = fs.readFileSync(__dirname + '/babotdata.json');
				babadata = JSON.parse(rawdata);
				message.author.send("```HC: " + babadata.holidaychan + "\nHV: " + babadata.holidayval + "```");
			}, 1000);
		}
		// froggifys the message with all frogs and replys with a frog reaction
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
									responseMessage.author.send("SUCC cess");
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(responseMessage => 
						{
							fnd = true;
							fronge(responseMessage);
							responseMessage.author.send("SUCC cess");
						}).catch(function (err) {}); 
					}
				});
			});
		}
		// moves a message to the banished lands
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
									message.delete();
									mehsage.author.send("SUCC cess");
								}).catch(function (err) {});
							})
						).catch(function (err) {});
	
						chan.messages.fetch(message_id).then(mehsage => 
						{
							fnd = true;
							mehsage.delete();
							mehsage.author.send("SUCC cess");
						}).catch(function (err) {}); 
					}
				});
			});
		}
		// send a message to a channel
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

					reverseDelay(message, hiddenChan, mess, delay);
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
		// react to a message with a custom emoji
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
										console.log(items[i]);
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
								console.log(items[i]);
								mehstagw.react(items[i]).catch(console.error);
							}
							message.author.send("SUCC cess");
						}).catch(function (err) {}); 
					}
				});
			});
		}
		else if (msgContent.includes("refried beans")) //probably would break adams brain
		{
			if (global.dbEnabled)
			{
				cacheDOW();
				message.author.send("DOW cache updated (hopefully)");
			}
			else
			{
				message.author.send("DOW cache not updated (no DB)");
			}
		}
		else if (msgContent.includes("rbcontdow") || msgContent.includes("rbcontfrog")) //probably would break adams brain
		{
			var u_id = message.content.split(' ').slice(1, 2).join(' ').replace(' ',''); //get the name for the role
			
			var mess = message.content.split(' ').slice(2, ).join(' '); //get the name for the role
			u_id = u_id.replace(/\D/g,''); //get message id

			var time = mess.match(/(\d+)/);
			if (time != null) time = time[0];

			if (time < 0) time = 0;
			if (time > 2) time = 2;

			if (global.dbEnabled)
			{
				controlDOW(u_id, time, msgContent.includes("rbcontdow") ? "DOW" : "FROG");
				message.author.send("DOW control for <@" + u_id + "> set to " + time);
			}
			else
			{
				message.author.send("DOW control not updated (no DB)");
			}
		}
		// change babas nickname
		else if (msgContent.includes("saintnick"))
		{
			var name = message.content.split(' ').slice(1, ).join(' '); //get the name for the role

			g.members.fetch(bot.user.id).then(member => {
				member.setNickname(name, "Baba Plase");
			});
		}
		// dm a user via baba
		else if (msgContent.includes("amhours"))
		{
			var u_id = message.content.split(' ').slice(1, 2).join(' ').replace(' ',''); //get the name for the role
			u_id = u_id.replace(/\D/g,''); //get message id
			
			var mess = message.content.split(' ').slice(2, ).join(' '); //get the name for the role
			bot.users.fetch(u_id).then(user => user.send(mess)).catch(console.error);
		}
		// read the audit log
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
