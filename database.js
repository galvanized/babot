const fs = require('fs');
var babadata = require('./babotdata.json'); //baba configuration file
var mysql = require('mysql2');
const { FindDate } = require('./helperFunc');

var con;

function handleDisconnect(print) 
{
	console.log(print + " - Starting Database Connection");
	con = mysql.createConnection({
		host: babadata.database.host,
		user: babadata.database.user,
		password: babadata.database.password,
		database: babadata.database.database,
		port: babadata.database.port,
		charset : 'utf8mb4_general_ci'
	});

	con.on('error', function(err) 
	{
		console.log('db error', err);
		handleDisconnect(err.code);
	});
}
  
handleDisconnect("Initializing");

function compare( a, b ) 
{
	if (a.Count < b.Count)
	{
	  return 1;
	}
	if (a.Count > b.Count)
	{
	  return -1;
	}
	return 0;
}

function FormatPurityList(resultList, type, pagestuff)
{
	var listsFull = [];

	var returns = [];

	for (var x in resultList)
	{
		listsFull[x] = {};
		listsFull[x].Name = resultList[x].Name;
		listsFull[x].Count = resultList[x].Count;
		listsFull[x].Accidental = resultList[x].Accidental;
		listsFull[x].Purity = resultList[x].Purity;
		listsFull[x].ID = resultList[x].ID;
	}

	listsFull.sort(compare);

    var pagetotal = Math.ceil(listsFull.length/ pagestuff.ipp);

	for (var pp = 0; pp < pagetotal; pp++)
	{
		var lists = [];
		for (var i = 0; i < listsFull.length; i++)
		{
			var pagelocal = Math.floor(i / pagestuff.ipp);
			if (pagelocal == pp)
			{
				lists.push(listsFull[i]);
			}
		}
		
		var retme = ""
		for (var x in lists)
		{
			var lin = lists[x];
			retme += GenInfo(lin, type);

			if (x < lists.length - 1)
				retme += "\n\n";
		}

		returns.push(retme);
	}

	return {"retstring": returns, "total": listsFull.length};
}

const options = { year: 'numeric', month: 'long', day: 'numeric' }; // for date parsing to string

function GenInfo(line, type)
{
	if (type == 2) line.Name = line.Name.toLocaleDateString('en-US', options);
	line.Purity = +Number(line.Purity).toFixed(3);
	return line.Name + (type == 2 ? "" : " [<" + (type == 1 ? "#" : "@") + line.ID + ">]") + "\n\t`" + line.Count + " Haikus` - `" + line.Accidental + " Accidental` - `" + line.Purity + "% Purity`";
}

// HPL = Haiku Purity List

function HPLGenChannel(callback)
{
	con.query("SELECT ChannelName as Name, haiku.ChannelID as ID, Count(*) as Count, SUM(IF(Accidental = '1', 1, 0)) as Accidental, SUM(IF(Accidental = '1', 1, 0))/COUNT(Accidental) * 100 As Purity FROM haiku Left Join channelval on haiku.ChannelID = channelval.ChannelID Group by haiku.ChannelID", function (err, result) 
	{
		if (err) throw err;
		return callback(result);
	});
}

function HPLGenUsers(callback)
{
	con.query("SELECT haiku.PersonName as Name, DiscordID as ID, Count(*) as Count, SUM(IF(Accidental = '1', 1, 0)) as Accidental, SUM(IF(Accidental = '1', 1, 0))/COUNT(Accidental) * 100 As Purity FROM haiku Left Join userval on haiku.PersonName = userval.PersonName Group by haiku.PersonName", function (err, result) 
	{
		if (err) throw err;
		return callback(result);
	});
}

function HPLGenD8(callback)
{
	con.query("SELECT date as Name, Count(*) as Count, SUM(IF(Accidental = '1', 1, 0)) as Accidental, SUM(IF(Accidental = '1', 1, 0))/COUNT(Accidental) * 100 As Purity FROM haiku Group by date order by count desc, purity desc, name desc", function (err, result) 
	{
		if (err) throw err;
		return callback(result);
	});
}

function searchPerson(msgContent)
{
	return ` LOWER(haiku.PersonName) in (Select distinct LOWER(PersonName) from haiku Where Lower("` + msgContent + `") LIKE CONCAT("%", Lower(DiscordName), "%"))
	or LOWER(haiku.PersonName) in (SELECT Lower(PersonName) FROM userval Left join alteventnames on BirthdayEventID = EventID Where Lower("` + msgContent + `") LIKE CONCAT("%", Lower(EventName), "%"))
	or Lower("` + msgContent + `") LIKE CONCAT("%", Lower(DiscordID), "%") 
	or Lower("` + msgContent + `") LIKE CONCAT("%", Lower(haiku.PersonName), "%")`;
}

function searchChannel(msgContent)
{
	return ` Lower('` + msgContent + `') LIKE CONCAT('%', Lower(channelName), '%')
	or Lower('` + msgContent + `') LIKE CONCAT('%', Lower(haiku.ChannelID), '%')`;
}

function searchDate(msgContent)
{
	return ` Lower("` + msgContent + `") LIKE CONCAT("%", Lower(date), "%")`;
}

function HPLSelectChannel(callback, msgContent)
{
	con.query(`SELECT ChannelName as Name, haiku.ChannelID as ID, Count(*) as Count, SUM(IF(Accidental = '1', 1, 0)) as Accidental, SUM(IF(Accidental = '1', 1, 0))/COUNT(Accidental) * 100 As Purity FROM haiku 
	Left Join channelval on haiku.ChannelID = channelval.ChannelID 
	Where ` + searchChannel(msgContent) + 
	` Group by haiku.ChannelID`, function (err, result)
	{
		if (err) throw err;
		return callback(result);
	});
}

function HPLSelectDate(callback, msgContent)
{
	console.log(msgContent);
	con.query(`SELECT date as Name, Count(*) as Count, SUM(IF(Accidental = '1', 1, 0)) as Accidental, SUM(IF(Accidental = '1', 1, 0))/COUNT(Accidental) * 100 As Purity FROM haiku 
	Where `+ searchDate(msgContent) +
	`Group by date`, function (err, result)
	{
		if (err) throw err;
		return callback(result);
	});
}

function HPLSelectUser(callback, msgContent)
{
	con.query(`SELECT haiku.PersonName as Name, DiscordID as ID, Count(*) as Count, SUM(IF(Accidental = '1', 1, 0)) as Accidental, SUM(IF(Accidental = '1', 1, 0))/COUNT(Accidental) * 100 As Purity FROM haiku 
	Left Join userval on haiku.PersonName = userval.PersonName
	Where ` + searchPerson(msgContent) +
	` Group by haiku.PersonName`, function (err, result)
	{
		if (err) throw err;
		return callback(result);
	});
}

function HaikuSelection(callback, by, msgContent)
{
	var query = `SELECT * FROM haiku
	Left Join userval on haiku.PersonName = userval.PersonName 
	Left Join channelval on haiku.ChannelID = channelval.ChannelID`
	if (by == 1)
		query += "WHERE " + searchPerson(msgContent);
	else if (by == 2)
	{
		query += "WHERE " + searchChannel(msgContent);
	}
	else if (by == 3)
	{
		var IsDate = FindDate(msgContent);
		if (IsDate != null)
		{
			d1 = new Date(IsDate.year, IsDate.month - 1, IsDate.day);
			var mpre = d1.getMonth() + 1 < 10 ? 0 : "";
			var dpre = d1.getUTCDate() < 10 ? 0 : "";
			query += "WHERE " + searchDate(`${d1.getFullYear()}-${mpre}${d1.getMonth() + 1}-${dpre}${d1.getUTCDate()}`);
		}
		else return callback(null);
	}
	else if (by == 4)
	{
		var sd = msgContent[0];
		var startDate = null;
		var ed = msgContent[1];
		var endDate = null;
		var chan = msgContent[2];
		var pson = msgContent[3];

		var addquery = [];

		if (sd != null)
			startDate = FindDate(sd);
		if (ed != null)
			endDate = FindDate(ed);

		if (startDate == null && endDate != null) startDate = endDate;

		if (startDate != null)
		{
			var d1 = new Date(startDate.year, startDate.month - 1, startDate.day);
			var mpre1 = d1.getMonth() + 1 < 10 ? 0 : "";
			var dpre1 = d1.getUTCDate() < 10 ? 0 : "";
			if (endDate != null)
			{
				var d2 = new Date(endDate.year, endDate.month - 1, endDate.day);
				var mpre2 = d2.getMonth() + 1 < 10 ? 0 : "";
				var dpre2 = d2.getUTCDate() < 10 ? 0 : "";

				var d1form = `${d1.getFullYear()}-${mpre1}${d1.getMonth() + 1}-${dpre1}${d1.getUTCDate()}`
				var d2form = `${d2.getFullYear()}-${mpre2}${d2.getMonth() + 1}-${dpre2}${d2.getUTCDate()}`

				if (endDate < startDate)
				{
					var temp = startDate;
					startDate = endDate;
					endDate = temp;
				}

				var q = ` date BETWEEN "${d1form}" AND "${d2form}"`
				addquery.push("(" + q + ")");
			}
			else
			{
				addquery.push("(" + searchDate(`${d1.getFullYear()}-${mpre1}${d1.getMonth() + 1}-${dpre1}${d1.getUTCDate()}`) + ")");
			}
		}

		if (chan != null)
			addquery.push("(" + searchChannel(chan) + ")");

		if (pson != null)
			addquery.push("(" + searchPerson(pson) + ")");

		if (addquery.length)
			query += " WHERE ";

		query += addquery.join(" AND ");
	}

	console.log(query);

	con.query(query, function (err, result)
	{
		if (err) throw err;
		if (result.length == 0) return callback(null);

        var num = Math.floor(Math.random() * result.length);
        var haiku = result[num];

		var qq = `SELECT Distinct DiscordName FROM haiku where Lower(PersonName) = Lower("` + haiku.PersonName + `");`;

		con.query(qq, function (err2, result2)
		{
			if (err2) throw err2;
			return callback(haiku, result2);
		});
	});
}

function GetSimilarName(names)
{
	var num = Math.floor(Math.random() * names.length);
	var nam = names[num];
	return nam.DiscordName;
}

function ObtainDBHolidays(callback)
{
	con.query("SELECT * FROM event left join alteventnames on event.EventID = alteventnames.EventID;", function (err, result) 
	{
		if (err) throw err;
		var retme = {};
		for (var i = 0; i < result.length; i++)
		{
			var retter = retme;
			if (result[i].ParentEventID != null) retter = GetParent(retme, result[i].ParentEventID);
			var e = retter[result[i].EventRealName];
			if (e == undefined)
			{
				retter[result[i].EventRealName] = {};
				e = retter[result[i].EventRealName];
				e.safename = result[i].EventFrogName;
				e.mode = result[i].Mode;
				e.id = result[i].EventID;
	
				if (result[i].Day != null) e.day = result[i].Day;
				if (result[i].Month != null) e.month = result[i].Month;
				if (result[i].Week != null) e.week = result[i].Week;
				if (result[i].DOW != null) e.dayofweek = result[i].DOW;
	
				e.name = [];

				if (e.mode == -1) e.sub = {};
			}
			e.name.push(result[i].EventName);
		}
		return callback(retme);
	});
}

function NameFromUserID(callback, user)
{
	con.query(
		`SELECT PersonName FROM userval
		 WHERE DiscordID = "${user.id}"`,
		function (err, result)
		{
			if (err) throw err;
			return callback(result);
		}
	);
}

function GetParent(retme, id)
{
	for (var x in retme)
	{
		if (retme[x].id == id) return retme[x].sub;
	}
	return retme;
}

var cleanupFn = function cleanup() 
{
	console.log("Ending SQL Connection");
	con.end();
}

function userVoiceChange(queryz, userID, channelID, guild)
{
	con.query(
		queryz,
		function (err, result)
		{
			if (err && err.sqlMessage.includes("voiceactivity_ibfk_1"))
			{
				console.log("Error: " + err.sqlMessage);
				guild.channels.fetch(channelID)
				.then(channel => checkAndCreateChannel(channelID, channel.name, function() 
				{
					userVoiceChange(queryz, userID, channelID, guild);
				}))
				.catch(console.error);
			}
			else if (err && err.sqlMessage.includes("voiceactivity_ibfk_2"))
			{
				console.log("Error: " + err.sqlMessage);
				guild.members.fetch(userID)
				.then(user => checkAndCreateUser(userID, user.user.username, function() 
				{
					userVoiceChange(queryz, userID, channelID, guild);
				}))
				.catch(console.error);
			}
			else if (err) throw err;
		}
	);
}

function userJoinedVoice(newUserID, newUserChannel, guild)
{
	var dtsrart = new Date().toISOString().slice(0, 19).replace('T', ' ');
	var q = `INSERT INTO voiceactivity (ChannelID, UserID, StartTime) VALUES ("${newUserChannel}", "${newUserID}", "${dtsrart}")`;
	userVoiceChange(q, newUserID, newUserChannel, guild);
}

function userLeftVoice(oldUserID, oldUserChannel, guild)
{
	var dtsrart = new Date().toISOString().slice(0, 19).replace('T', ' ');
	var q = `UPDATE voiceactivity SET EndTime = "${dtsrart}" WHERE UserID = "${oldUserID}" AND ChannelID = "${oldUserChannel}" AND EndTime IS NULL`;
	userVoiceChange(q, oldUserID, oldUserChannel, guild);
}

function checkUserVoiceCrash(userID, channelID, guild)
{
	con.query(`Select * from voiceactivity where UserID = "${userID}" AND ChannelID = "${channelID}" AND EndTime IS NULL`,
		function (err, result)
		{
			if (err) throw err;
			if (result.length == 0)
			{
				userJoinedVoice(userID, channelID, guild);
			}
		}
	);
}

function checkAndCreateUser(userID, userName, callback)
{
	con.query(`Select * from userval where DiscordID = "${userID}"`,
		function (err, result)
		{
			if (err) throw err;
			if (result.length == 0)
			{
				console.log("Creating user: " + userID + " " + userName);
				con.query(`INSERT INTO userval (DiscordID, PersonName) VALUES ("${userID}", "${userName}")`,
					function (err, result)
					{
						if (err) throw err;
						return callback();
					}
				);
			}
		}
	);
}

function checkAndCreateChannel(channelID, channelName, callback)
{
	con.query(`Select * from channelval where ChannelID = "${channelID}"`,
		function (err, result)
		{
			if (err) throw err;
			if (result.length == 0)
			{
				console.log("Creating channel: " + channelID + " " + channelName);
				con.query(
					`INSERT INTO channelval (ChannelID, ChannelName, Type) VALUES ("${channelID}", "${channelName}", "Voice")`,
					function (err, result)
					{
						if (err) throw err;
						return callback();
					}
				);
			}
		}
	);
}

function optIn(user, type, callback)
{
	con.query(
		`UPDATE opting Set Val='in' WHERE DiscordID = "${user.id}" AND ItemToRemove = "${type}"`,
		function (err, result)
		{
			if (err) throw err;
			if (result.affectedRows == 0)
			{
				con.query(
					`INSERT INTO opting (DiscordID, ItemToRemove, Val) VALUES ("${user.id}", "${type}", "in")`,
					function (err, result)
					{
						if (err) throw err;
						cacheOpts();
						return callback();
					}
				);
			}
			else
			{
				cacheOpts();
				return callback();
			}
		}
	);
}

function optOut(user, type, callback)
{
	con.query(
		`UPDATE opting Set Val='out' WHERE DiscordID = "${user.id}" AND ItemToRemove = "${type}"`,
		function (err, result)
		{
			if (err) throw err;

			if (result.affectedRows == 0)
			{
				con.query(
					`INSERT INTO opting (DiscordID, ItemToRemove, Val) VALUES ("${user.id}", "${type}", "out")`,
					function (err, result)
					{
						if (err) throw err;
						cacheOpts();
						return callback();
					}
				);
			}
			else 
			{
				cacheOpts();
				return callback();
			}
		}
	);
}

function endLeftUsersCrash(onlineusers, guild)
{
	con.query(`Select * from voiceactivity where EndTime IS NULL`,
	function (err, result)
	{
		if (err) throw err;
		for (var i = 0; i < result.length; i++)
		{
			var res = result[i];
			if (!onlineusers.includes(res.UserID + "-" + res.ChannelID))
			{
				userLeftVoice(res.UserID, res.ChannelID, guild);
			}
		}
	}
	);
}

function cacheOpts(callback)
{
	con.query(`Select * from opting`,
		function (err, result)
		{
			var opts = [];
			if (err) throw err;
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				var resj = {
					"DiscordID": res.DiscordID,
					"Item": res.ItemToRemove,
					"Opt": res.Val
				}
				opts.push(resj);
			}

			var data = JSON.stringify(opts);

			fs.writeFileSync(babadata.datalocation + "/optscache.json", data);
			
			if (callback)
				return callback();
		}
	);
}

process.on('SIGINT', cleanupFn);
process.on('SIGTERM', cleanupFn);

module.exports = {
	FormatPurityList,
	HPLGenChannel,
	HPLGenUsers,
	HPLSelectChannel,
	HPLSelectDate,
	HPLSelectUser,
	HaikuSelection,
	GetSimilarName,
	ObtainDBHolidays,
	NameFromUserID,
	userJoinedVoice,
	userLeftVoice,
	checkUserVoiceCrash,
	endLeftUsersCrash,
	checkAndCreateUser,
	checkAndCreateChannel,
	optIn,
	optOut,
	cacheOpts,
	HPLGenD8
}