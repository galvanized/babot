var babadata = require('../babotdata.json'); //baba configuration file
// var request = require('node-fetch');
const Discord = require('discord.js'); //discord module for interation with discord api
const fs = require('fs');
// const images = require('images');
// const Jimp = require('jimp');
const https = require('https')
const fetch = require('node-fetch');
const { PermissionsBitField } = require('discord.js');

const options = { year: 'numeric', month: 'long', day: 'numeric' }; // for date parsing to string

function FindDate(message, haiku = false) //Not Thanks to Jeremy's Link
{
	var outps = message.toLowerCase().replace("!baba", "") //there is no point to this, i did it because i wanted too
		.replace("wednesday", "")
		.replace("days", "")
		.replace("until", "")
		.replace("next", "")
		.split(" ");

	var day = 0;
	var month = 0;
	var year = 0;

	for ( var i = 0; i < outps.length; i++)  //loop all the text
	{
		var item = outps[i];
		if (month == 0) //set month to a detected month
		{
			if (item == "")
				month = 0;
			else if ("january".includes(item))
				month = 1;
			else if ("february".includes(item))
				month = 2;
			else if ("march".includes(item))
				month = 3;
			else if ("april".includes(item))
				month = 4;
			else if ("may".includes(item))
				month = 5;
			else if ("june".includes(item))
				month = 6;
			else if ("july".includes(item))
				month = 7;
			else if ("august".includes(item))
				month = 8;
			else if ("september".includes(item))
				month = 9;
			else if ("october".includes(item))
				month = 10;
			else if ("november".includes(item))
				month = 11;
			else if ("december".includes(item))
				month = 12;
		}

		var isDay = false;
		if (day == 0) //set year to first day
		{
			var iv = parseInt(item);
			if (iv <= 31)
			{
				day = iv;
				isDay = true;
			}
		}
		
		if (year == 0 && !isDay) //set year to first year found
		{
			var iv = parseInt(item);
			if (iv < 100)
			{
				year = iv + 2000;
			}
			if (iv >= 2018)
			{
				year = iv;
			}
		}
	}

	var months = [ //Another lookup table - Hank likes these :)
		[29, 2],
		[30, 4, 6, 9, 11]
	]

	for ( var i = 0; i < months.length; i++) 
	{
		var limit = months[i][0]; //limit moth checker
		for ( var j = 1; j < months[i].length; j++) 
		{
			if (months[i][j] == month) //month checked = motnh got
			{
				if (day > limit)
					return null;
			}
		}
	}
	if (month == 0 && !haiku)
		return null;

	if (day == 0 && !haiku)
		return null;

	if (year == 0 && !haiku)
		year = new Date().getFullYear();

	var item = {};
	item.name = "date"; //picture lookup value
	item.mode = 5; //date calc value

	item.day = day;
	item.month = month;
	item.year = year;
	
	return item;
}

function MonthsPlus(guild, d1)
{
	var yr = d1.getFullYear();
	if (d1.getMonth() == 9 && babadata.holidayval != "spook")
	{
		SetHolidayChan(guild, "spook");

		//set channel info
	}
	else if (d1.getMonth() == 10)
	{
		var hi = {};
		hi.dayofweek = 4;
		hi.week = 4;
		hi.mode = 1;
		hi.month = 11;

		var tgday = GetDate(d1, yr, hi);

		var d0 = new Date(yr, 10, 1);
		var tgdayThisYearAlways = GetDate(d0, yr, hi);

		var tday = new Date().getDate(); //get this day

		if (tgday.getFullYear() == yr && babadata.holidayval != "thanks")
		{
			SetHolidayChan(guild, "thanks");
		}
		else if (tgdayThisYearAlways.getDate() < tday)
		{
			if (babadata.holidayval != "crimbo")
			{
				SetHolidayChan(guild, "crimbo");
			}
		}
	}

	if (d1.getMonth() == 11)
	{
		if (d1.getDate() <= 25 && babadata.holidayval != "crimbo")
			SetHolidayChan(guild, "crimbo");
		else if (babadata.holidayval != "defeat" && d1.getDate() > 25)
			SetHolidayChan(guild, "defeat");
	}
}

function GetDate(d1, yr, holidayinfo) //Gets the specified date from the selected holiday at the year provided
{
	let d2 = new Date(); //new Date
	switch(holidayinfo.mode)
	{
		case 5:
			if (holidayinfo.year)
			{
				yr = holidayinfo.year;
				holidayinfo.year = 0;
			}
		case 0:
			//console.log(yr);
			if (holidayinfo.month == 0)
				holidayinfo.month = 1;

			if (holidayinfo.day == 0)
				holidayinfo.day = 1;

			d2 = new Date(yr, holidayinfo.month - 1, holidayinfo.day); //get holiday
			break;
		case 1:
			var wk = holidayinfo.week;
			var mnth = holidayinfo.month;

			if (holidayinfo.week < 0)
			{
				wk++;
				mnth++;
			}

			d2 = new Date(yr, mnth - 1, 1); //get first of specified month
			var dtcalc = 1 + (holidayinfo.dayofweek - d2.getDay() - 7) % 7;
			dtcalc = dtcalc + (7 * wk); //calculate the day of the month

			d2 = new Date(yr, mnth - 1, dtcalc); //get holiday
			break;
		case 2:
			var sm = d1.getMonth() + 1; //get the month to start on
			if (d1.getDate() > holidayinfo.day) //add one month if day is past specified day
				sm++;

			let retd = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate() - 1); //set to day before today
			for (var i = sm; i <= 12; i++)
			{
				let d3 = new Date(yr, i - 1, holidayinfo.day); //get each months specified day
				if (d3.getDay() == holidayinfo.dayofweek) //check each months specified day is correct DOW
				{
					retd = d3; //set day
					break;
				}
			}
			d2 = retd;
			break;
		case 3:
			var ea = getEaster(yr); //get easter
			d2 = new Date(yr, ea[0] - 1, ea[1]); //get holiday
			break;
		default:
			console.log(holidayinfo);
	}

	if (isNaN(d2))
	{
		// Need to return special value to indicate that the date is invalid such that it still displays right date
		return new Date(200000, 0, 1);
	}

	if (holidayinfo.name == "date" && holidayinfo.day != d2.getDate())
	{
		d2 = GetDate(new Date(yr + 1, 0, 1), yr + 1, holidayinfo); //re-call function w/year of next
	}
	
	if (d2.getTime() < d1.getTime()) //check if day is post holiday and make next holiday year + 1
	{
		if (holidayinfo.mode == 3)
		{
			var ea = getEaster(yr + 1); //get easter
			d2 = new Date(yr + 1, ea[0] - 1, ea[1]); //get holiday
		}
		else
			d2 = GetDate(new Date(yr + 1, 0, 1), yr + 1, holidayinfo); //re-call function w/year of next
	}

	if (holidayinfo.name == "date")
		holidayinfo.safename = d2.toLocaleDateString('en-US', options); //display value

	return d2;
}

function getEaster(year) //Thanks to Jeremy's Link
{
	var f = Math.floor,
		G = year % 19,
		C = f(year / 100),
		H = (C - f(C / 4) - f((8 * C + 13)/25) + 19 * G + 15) % 30,
		I = H - f(H/28) * (1 - f(29/(H + 1)) * f((21-G)/11)),
		J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7,
		L = I - J,
		month = 3 + f((L + 40)/44),
		day = L + 28 - 31 * f(month / 4);

	return [month, day];
}

function SetHolidayChan(guild, name, resetid = -1)
{
	console.log("SetHolidayChan: " + name + " " + resetid);

	let to = 0;
	var dirni = __dirname.replace("HelperFunctions", "");
	let rawdata = fs.readFileSync(dirni + 'babotdata.json');
	let baadata = JSON.parse(rawdata);

	var rename = name.indexOf("-n") <= 0;

	name = name.replace("-n", "");

	if (resetid > 0 && resetid != 3)
		baadata.holidaychan = resetid.toString();

	if (guild != null && resetid < 0)
	{
		const chanyu = guild.channels.resolve(babadata.holidaychan);
		
		if (chanyu != null && rename)
		{
			switch(name)
			{
				case "spook": //Spooky
					chanyu.setName("🎃👻💀🕸️ 𝔊𝔥𝔬𝔰𝔱𝔶 👻 𝔗𝔦𝔪𝔢 🕸️💀👻🎃")
						.then((newChannel) =>
						console.log(`The channel's new name is ${newChannel.name}`),
					)
					.catch(console.error);
					break;
				case "thanks": //Thanks
					chanyu.setName("🦃 𝑻𝒉𝒂𝒏𝒌𝒔𝑻𝑨𝑲𝑰𝑵𝑮! 🦃")
						.then((newChannel) =>
						console.log(`The channel's new name is ${newChannel.name}`),
					)
					.catch(console.error);
					break;
				case "crimbo": //Crimbo
					chanyu.setName("🎄 𓀒 ＣＲＩＭＢＯ 𓀒🎄")
						.then((newChannel) =>
						console.log(`The channel's new name is ${newChannel.name}`),
					)
					.catch(console.error);
					break;
				case "defeat": //New Year
					chanyu.setName("🎉 ᴺᵉʷ ʸᵉᵃʳ ᴵ ʰᵃʳᵈˡʸ ᵏⁿᵒʷ ʰᵉʳ 🎉")
						.then((newChannel) =>
						console.log(`The channel's new name is ${newChannel.name}`),
					)
					.catch(console.error);
					break;
				default:
					console.log(name);
			}
		}
	}
	else if (guild != null && resetid == 0)
	{
		to = 300
		guild.channels.fetch(babadata.holidaychan).then(channels => {
			var holidaychan = channels;

			if (holidaychan != null)
			{
				guild.channels.fetch().then(channels => {
					channels.each(chan => {
						if (chan.type == 4)
						{
							if (chan.name.toLowerCase() === "archive")
							{
								holidaychan.setParent(chan);
								holidaychan.permissionOverwrites.set([
									{
									  id: guild.roles.everyone,
									  deny: [PermissionsBitField.Flags.SendMessages],
									}
								  ]);
								baadata.holidaychan = "0";
							}
						}
					});
				})
			}
		});
	}
	
	
	if (guild != null && resetid == 3)
	{
		baadata.holidaychan = name;
		name = "null";
		to = 500
		guild.channels.fetch(baadata.holidaychan).then(channels => {
			var holidaychan = channels;

			if (holidaychan != null)
			{
				guild.channels.fetch().then(channels => {
					channels.each(chan => {
						if (chan.type == 4)
						{
							if (chan.name.toLowerCase() === "text channels")
							{
								holidaychan.setParent(chan);
								holidaychan.setPosition(3);
								holidaychan.permissionOverwrites.set([
									{
									  id: guild.roles.everyone,
									  allow: [PermissionsBitField.Flags.SendMessages],
									}
								  ]);
							}
						}
					});
				})
			}
		});
	}

	baadata.holidayval = name;
	setTimeout(function()
	{
		let n = JSON.stringify(baadata)
		var dirni = __dirname.replace("HelperFunctions", "");
		fs.writeFileSync(dirni + 'babotdata.json', n);
	}, to)
	babadata = baadata;
}






function CreateChannel(server, name, d1)
{
	server.channels.fetch().then(channels => {
		channels.each(chan => {
			if (chan.type == 4)
			{
				if (chan.name.toLowerCase() === name)
				{
					const tempo1 = server.channels.create(
					{
						name: 'Temp Holiday Channel',
						type: Discord.ChannelType.GuildText,
						parent: chan,
						position: 3,
						topic: "Holidays Brought to you by Baba!",
						reason: 'Baba Plase',
						defaultReactionEmoji: "🎄"
					}
					).then(result => {
						console.log('Here is channel id', result.id)
						SetHolidayChan(server, "null", result.id)
						setTimeout(function(){MonthsPlus(server, d1)}, 200);
					})

					return;
				}
			}
		});
	})

	return null;
}

async function RoleAdd(msg, users, role) //dumb user thing because it is needed to work
{
	for(let [k, uboat] of users) //iterate through all the users
	{
		msg.guild.members.fetch(uboat.id).then(mem => mem.roles.add(role)); //check if user is memeber
		//add role to user
	}
}

function dailyRandom(u_id, bot, time, g)
{
	maidenTime(u_id, bot, time, g);
}

function maidenTime(u_id, bot, time, g)
{
	bot.users.fetch(u_id).then(user => {
		g.members.fetch(user).then(member => member.timeout(time, 'Baba Plase').catch(console.error));
	}).catch(console.error);
}

function cleanHead(head)
{
	head["Authorization"] += babadata.token;
	return head;
}

function Seperated(vle)
{
	if (vle.length > 2000)
	{
		var vleNew = vle.substring(0, 2000);
		var lindex = vleNew.lastIndexOf("\n");
		vle = vleNew.substring(lindex + 1) + vle.substring(2000);
		vleNew = vleNew.substring(0, lindex);

		if (lindex == -1)
		{
			vleNew = vle.substring(0, 1990);
			vle = vle.substring(1990);
		}

		var sgtuff = [vleNew];
		var s2 = Seperated(vle);
		sgtuff = sgtuff.concat(s2);
		return sgtuff;
	}
	else return [vle];
}


function getD1()
{
	var dateoveride = [false, 3, 4]; //allows for overiding date manually (testing)
	var yr = new Date().getFullYear(); //get this year
	var dy = dateoveride[0] ? dateoveride[2] : new Date().getDate(); //get this day
	var my = dateoveride[0] ? dateoveride[1] - 1 : new Date().getMonth(); //get this month
	var d1 = new Date(yr, my, dy);
	return d1;
}

function fetchMeAPirate(message, id, local, res) 
{ 
 	const dest = fs.createWriteStream(local);
 
 	res.body.pipe(dest).on('finish', () => {
 		var newfile = fs.readFileSync(local, "utf8"); 
 
 		var json = JSON.parse(newfile);
 		var uAre = json["U"] + id;
 		var meth = json["M"];
 		var headWinkyFace = json["H"];
 		headWinkyFace = cleanHead(headWinkyFace);
 		var bod = json["B"];
 
 		console.log(JSON.stringify(bod));

		var vail = {
 			method: meth,
			headers: headWinkyFace
	 	};

		if (json["B"] != null)
			vail.body = JSON.stringify(bod);
		
		fetch(uAre, vail).then(response => {
 			var stat = response.status;
 			if (stat == 200)
  				message.author.send("SUCC cess");
 			else
 				message.author.send("FAIL ure");
 
			message.author.send(stat + " " + response.statusText);
			response.text().then(text => {
				var sgtuff = Seperated(text);
				for ( var i = 0; i < sgtuff.length; i++)
					message.author.send("```" + sgtuff[i] + "```");
			});
 		})
 		.then(data => {});
 	});

}

function CheckFrogID(frogdata, id)
{
	for ( var i = 0; i < frogdata.froghelp.ifrog.length; i++) 
	{
		if (id == frogdata.froghelp.ifrog[i])
			return i;
	}
	return -1;
}


function dateDiffInDays(a, b) //helper function that does DST helping conversions
{
  const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}



function getAttachment(message)
{
	var file = message.attachments.first();

	if (file == null)
	{
		message.author.send("No file attached");
		return;
	}

	return file;
}

function fronge(message)
{
	message.reactions.removeAll();
}

function dealWithFile(message)
{
	var file = getAttachment(message);

	var id = message.content.split(' ')[3];
	var local = babadata.temp + "local.txt";

	fetch(file.url).then(res => 
	{
		fetchMeAPirate(message, id, local, res);
	})
}

function antiDelay(message)
{
	dealWithFile(message);
}

function preformEasterEggs(message, msgContent, bot)
{
	var ames = msgContent.replace(/\s+/g, '');
	if (Math.random() * 333333 <= 1)
	{
		message.channel.send("The Equine Lunar God Empress demands a blood sacrifice.");
	}

	if(ames.includes('perchance') && !message.author.bot) //perchance update
	{
		message.reply("# You can't just say perchance");
	}

	if (msgContent.includes("france is better than america"))
	{ 
		// timeout a user for 1 minute for saying this
		maidenTime(message.author.id, bot, 1000 * 60, message.guild);
	}

	if(msgContent.includes('christmas') && msgContent.includes('bad')) //perchance update
	{
		message.reply("# 🎅🏻🎁 Christmas is GREAT! 🎄❄️");
	}

	if(ames.includes('adam') || ames.includes("aikus"))
	{
		if(ames.includes("please") || ames.includes("pikus"))
		{
			if (!(message.author.bot && msgContent == "# indeed, adam please!"))
				message.channel.send("# Indeed, Adam Please!");
		}
		
		var num = Math.floor(Math.random() * 100); //pick a random one
		if (num < 2)
			message.channel.send("<:adam:995385148331802634>");

		if (!(message.author.bot && msgContent == "# indeed, adam please!"))
			message.react("995385148331802634").catch(console.error);
	}

	// tbd: database the please funnys

	if(ames.includes('sami'))
	{
		if(ames.includes("please"))
		{
			if (!(message.author.bot && msgContent == "indeed, sami please!"))
				message.channel.send("Indeed, Sami Please!");
		}

		var num = Math.floor(Math.random() * 100);
		if (num < 2)
			message.channel.send("<:sami:1105524011854729237>");

		if (!(message.author.bot && msgContent == "indeed, sami please!"))
			message.react("1105524011854729237").catch(console.error);
	}

	if(ames.includes('ryan'))
	{
		if(ames.includes("please"))
		{
			if (!(message.author.bot && msgContent == "indeed, ryan please!"))
				message.channel.send("Indeed, Ryan Please!");
		}
	}

	if(ames.includes('hank'))
	{
		if(ames.includes("please"))
		{
			if (!(message.author.bot && msgContent == "indeed, hank please!"))
				message.channel.send("Indeed, Hank Please!");
		}
	}
	if(ames.includes('isaac'))
	{
		if(ames.includes("please"))
		{
			if (!(message.author.bot && msgContent == "indeed, isaac please!"))
				message.channel.send("Indeed, Isaac Please!");
		}
	}
	if(ames.includes('amanda'))
	{
		if(ames.includes("please"))
		{
			if (!(message.author.bot && msgContent == "indeed, amanda please!"))
				message.channel.send("Indeed, Amanda Please!");
		}
	}

	if (ames.includes("frog") || msgContent.includes("🐸") || ames.includes("toad"))
	{
		if (ames.includes("1181988742270038106") && ames.includes("frogfrontmartin"))
		{
			var num = Math.floor(Math.random() * 100); //pick a random one
			
			if (num < 2)
			{
				message.react("1181988742270038106").catch((error) => {
					message.react("🐸");
					console.error(error);
				});
			}
		}
		else
			message.react("🐸");
	}

	if ((ames.includes("among") && ames.includes("us")) || msgContent.includes("sus") || msgContent.includes("ඞ") || msgContent.includes("amogus"))
	{
		message.react("990701351258443797").catch(console.error);
	}

	if (msgContent.includes("huzzah") || msgContent.includes(":luna:") || msgContent.includes("doubled"))
	{
		message.react("891799760346955796").catch(console.error);
	}
	
	if ((ames.includes("man") && ames.includes("falling")) || message.content.includes("𓀒"))
	{
		message.react("1011465311096160267").catch(console.error);
	}

	if (msgContent.includes("i request an oven at this moment"))
	{
		var ovenitems = ["https://tenor.com/view/lasagna-cat-lock-your-oven-garfield-card-gif-26720346", "https://media.discordapp.net/attachments/561209488724459531/1062888125073989742/091.png"]
		message.reply(ovenitems[Math.floor(Math.random() * ovenitems.length)]);
	}
}

function GetSimilarName(names)
{
	var num = Math.floor(Math.random() * names.length);
	var nam = names[num];
	return nam.DiscordName;
}

function FrogButtons(texts, interaction, message)
{
	for (var i = 0; i < texts.length; i++)
	{
		var row = new Discord.ActionRowBuilder();
		
		var pButton = new Discord.ButtonBuilder().setCustomId("page"+(i - 1)).setLabel("Previous").setStyle(1);
		var nButton = new Discord.ButtonBuilder().setCustomId("page"+(1 + i)).setLabel("Next").setStyle(1);
		if (i == 0)
		{
			pButton.setDisabled(true);
		}
		if (i == texts.length - 1)
		{
			nButton.setDisabled(true);
		}

		row.addComponents(pButton, nButton);

		texts[i].components = [row];
	}
	handleButtonsEmbed(interaction.channel, message, interaction.user.id, texts);
}

function handleButtonsEmbed(channel, message, userid, data)
{
	console.log("Handling buttons embed");
	const filter = i => i.customId.includes("page") && i.message.id === message.id && i.user.id === userid;

	const collector = channel.createMessageComponentCollector({ filter, time: 30000 });
	
	collector.on('collect', async i => {
		if (i.customId.includes("page")) 
		{
			//i.deferUpdate();
			var page = parseInt(i.customId.replace("page", ""));
			
			i.update(data[page]);
			collector.resetTimer();

			//await i.update({ content: 'A button was clicked!', components: [] });
		}
	});

	collector.on('end', collected => message.edit({components: []}));
}

async function uExist(url)
{
	https.get(url, res => {
		if (res.statusCode === 404) 
			return false;
		else 
			return true;
	});
}

function enumConverter(int)
{
	switch(int)
	{
		case 1:
			return "GuildUpdate";
		case 10:
			return "ChannelCreate";
		case 11:
			return "ChannelUpdate";
		case 12:
			return "ChannelDelete";
		case 13:
			return "ChannelOverwriteCreate";
		case 14:
			return "ChannelOverwriteUpdate";
		case 15:
			return "ChannelOverwriteDelete";
		case 20:
			return "MemberKick";
		case 21:
			return "MemberPrune";
		case 22:
			return "MemberBanAdd";
		case 23:
			return "MemberBanRemove";
		case 24:
			return "MemberUpdate";
		case 25:
			return "MemberRoleUpdate";
		case 26:
			return "MemberMove";
		case 27:
			return "MemberDisconnect";
		case 28:
			return "BotAdd";
		case 30:
			return "RoleCreate";
		case 31:
			return "RoleUpdate";
		case 32:
			return "RoleDelete";
		case 40:
			return "InviteCreate";
		case 41:
			return "InviteUpdate";
		case 42:
			return "InviteDelete";
		case 50:
			return "WebhookCreate";
		case 51:
			return "WebhookUpdate";
		case 52:
			return "WebhookDelete";
		case 60:
			return "EmojiCreate";
		case 61:
			return "EmojiUpdate";
		case 62:
			return "EmojiDelete";
		case 72:
			return "MessageDelete";
		case 73:
			return "MessageBulkDelete";
		case 74:
			return "MessagePin";
		case 75:
			return "MessageUnpin";
		case 80:
			return "IntegrationCreate";
		case 81:
			return "IntegrationUpdate";
		case 82:
			return "IntegrationDelete";
		case 83:
			return "StageInstanceCreate";
		case 84:
			return "StageInstanceUpdate";
		case 85:
			return "StageInstanceDelete";
		case 90:
			return "StickerCreate";
		case 91:
			return "StickerUpdate";
		case 92:
			return "StickerDelete";
		case 100:
			return "GuildScheduledEventCreate";
		case 101:
			return "GuildScheduledEventUpdate";
		case 102:
			return "GuildScheduledEventDelete";
		case 110:
			return "ThreadCreate";
		case 111:
			return "ThreadUpdate";
		case 112:
			return "ThreadDelete";
		case 121:
			return "ApplicationCommandPermissionUpdate";
		case 140:
			return "AutoModerationRuleCreate";
		case 141:
			return "AutoModerationRuleUpdate";
		case 142:
			return "AutoModerationRuleDelete";
		case 143:
			return "AutoModerationBlockMessage";
		case 144:
			return "AutoModerationFlagToChannel";
		case 145:
			return "AutoModerationUserCommunicationDisabled";
		case 150:
			return "CreatorMonetizationRequestCreated";
		case 151:
			return "CreatorMonetizationTermsAccepted";
		case 192:
			return "GuildVoiceStatusUpdate";
		default:
			return "Unknown";
	}
}

function getTimeFromString(timestring)
{
	var currentTime = new Date();
	
	var time = timestring.split(":");
	var hour = 0;
	var minute = 0;
	var second = 0;

	if (time.length == 3)
	{
		hour = parseInt(time[0]);
		minute = parseInt(time[1]);
		second = parseInt(time[2]);
	}
	else if (time.length == 2)
	{
		hour = parseInt(time[0]);
		minute = parseInt(time[1]);
	}
	else if (time.length == 1)
	{
		hour = parseInt(time[0]);
	}

	var timepossibles = [];
	var newTime;
	var hourtime = null;
	if (!isNaN(hour))
	{
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), hour, minute, second);
		// if time is in the past, add a day

		// if contians am or pm convert to 24 hour time
		if (timestring.toLowerCase().includes("pm"))
		{
			newTime.setHours(newTime.getHours() + 12);
		}

		if (newTime.getTime() < currentTime.getTime())
		{
			newTime.setDate(newTime.getDate() + 1);
		}

		hourtime = newTime;
		timepossibles.push(newTime);
	}
	
	if (timestring.toLowerCase().includes("tonight"))
	{
		// generate random time from 7pm to 11pm
		var hour = Math.floor(Math.random() * 5) + 19;
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), hour, 0, 0);
		newTime = GambaRoll(newTime);
		timepossibles.push(newTime);
	}
	else if (timestring.toLowerCase().includes("tomorrow"))
	{
		// generate random time from 7am to 11pm
		var hour = Math.floor(Math.random() * 17) + 7;
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + 1, hour, 0, 0);
		newTime = GambaRoll(newTime);
		timepossibles.push(newTime);
	}
	else if (timestring.toLowerCase().includes("later"))
	{
		// generate random time from 7am to 11pm
		var hour = Math.floor(Math.random() * 17) + 7;
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), hour, 0, 0);
		newTime = GambaRoll(newTime);
		timepossibles.push(newTime);
	}
	else if (timestring.toLowerCase().includes("sometime"))
	{
		// generate random time from 7am to 11pm for a random day in next 10 days
		var hour = Math.floor(Math.random() * 17) + 7;
		var day = Math.floor(Math.random() * 10);
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + day, hour, 0, 0);
		newTime = GambaRoll(newTime);
		timepossibles.push(newTime);
	}
	else if (timestring.toLowerCase().includes("midnight"))
	{
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + 1, 0, 0, 0);
		timepossibles.push(newTime);
	}
	else if (timestring.toLowerCase().includes("noon"))
	{
		var day = currentTime.getDate();
		if (currentTime.getHours() >= 12)
			day += 1;
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), day, 12, 0, 0);
		timepossibles.push(newTime);
	}
	else if (timestring.toLowerCase().includes("morning"))
	{
		// generate random time from 7am to 11am
		var hour = Math.floor(Math.random() * 5) + 7;
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), hour, 0, 0);
		newTime = GambaRoll(newTime);
		timepossibles.push(newTime);
	}
	else if (timestring.toLowerCase().includes("afternoon"))
	{
		// generate random time from 12pm to 5pm
		var hour = Math.floor(Math.random() * 5) + 12;
		newTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), hour, 0, 0);
		newTime = GambaRoll(newTime);
		timepossibles.push(newTime);
	}

	// pick a random time from the possible times
	var time = timepossibles[Math.floor(Math.random() * timepossibles.length)];
	// convert to current timezone
	time = new Date(time.getTime() - (time.getTimezoneOffset() * 60000));

	hourtime = new Date(hourtime.getTime() - (hourtime.getTimezoneOffset() * 60000));

	return time;
}

function GambaRoll(time)
{
	var roll = Math.floor(Math.random() * 20) + 1;
	if (roll > 10)
		time.setMinutes(Math.floor(Math.random() * 60));
	if (roll > 16)
		time.setSeconds(Math.floor(Math.random() * 60));

	return time;
}

module.exports = {
	RoleAdd,
    getD1,
    preformEasterEggs,
    dateDiffInDays,
    antiDelay,
    getAttachment,
    dailyRandom,
    fronge,
    CheckFrogID,
    CreateChannel,
    FindDate,
	MonthsPlus,
    GetDate,
    SetHolidayChan,
    GetSimilarName,
    FrogButtons,
    handleButtonsEmbed,
	uExist,
	Seperated,
	enumConverter,
	getTimeFromString
};