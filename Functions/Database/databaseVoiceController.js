/**
 * @fileoverview Database and voice activity controller for the babot Discord bot.
 *
 * Manages a MySQL2 database connection with auto-connect/auto-disconnect and
 * exponential-backoff reconnect logic. Tracks voice channel join, leave, and move
 * events for opted-in users and persists them to the database. Also handles:
 *  - Guild scheduled event (GuildScheduledEvent) database operations
 *  - User opt-in / opt-out preferences
 *  - Cache loading for emojis, reactions, fish, frogs, DOW items, channels, users,
 *    pleased tables, holidays, haikus, opts, slash-Friday data, time-gates and reminders
 *  - Hurricane information caching
 *  - Slash-Friday JSON management (counter + messages flush to DB)
 *  - Reminder CRUD helpers
 *  - DM / log-thread messaging helpers
 *
 * @module Functions/Database/databaseVoiceController
 */
var babadata = require('../../babotdata.json'); //baba configuration file

const fs = require('fs');
var mysql = require('mysql2');

const { getD1 } = require('../../Tools/overrides');

var con;

var timeoutDisconnect = null;
var timeoutFix = null;

var timeoutClear = null;

var timeoutCT = 0;


// TBD make connection only connect on calls to SQL, and then auto disconnect after 5 seconds of inactivity
// if sql attempt fails, then try to reconnect every 5 seconds for first minute, then minutely until it works again, then once it works, trigger all the queries that failed


// Helper Functions

/**
 * Splits a string into chunks of at most 1 900 characters, breaking only on spaces.
 * Useful for staying within Discord's 2 000-character message limit when sending
 * large blocks of text (e.g. SQL queries in error reports).
 *
 * @param {string} str - The string to split.
 * @returns {string[]} An array of string chunks, each ≤ 1 900 characters.
 */
function splitStringInto1900CharChunksonSpace(str)
{
	var chunks = [];
	var chunk = "";
	var lines = str.split(" ");
	for (var i = 0; i < lines.length; i++)
	{
		if (chunk.length + lines[i].length > 1900)
		{
			chunks.push(chunk);
			chunk = "";
		}
		chunk += lines[i] + "\n";
	}
	chunks.push(chunk);
	return chunks;
}

/**
 * Pings the current MySQL connection to check whether it is still alive.
 *
 * @returns {Promise<"true"|"false"|"ERROR">} Resolves with:
 *   - `"true"`  – connection is alive,
 *   - `"false"` – connection object is `null`,
 *   - `"ERROR"` – ping returned an error (connection is dead; resets `con` to `null`).
 */
function pingConnection()
{
    var PromisedPing = new Promise((resolve, reject) =>
    {
        if (con != null)
        {
            // check if connection is alive
            con.ping(function (err)
            {
                if (err) 
                {
                    console.log("Connection is not alive", false, true);
                    resolve("ERROR");
                    con = null;
                }
                else
                {
                    // console.log("Connection is alive", false, true);
                    resolve("true");
                }
            });
        }
        else
        {
            console.log("Connection is null", false, true);
            resolve("false");
        }
    });

    return PromisedPing;
}

/**
 * Returns a live MySQL connection, creating one if the current connection is not
 * healthy. Also resets (or sets) a 60-second idle-disconnect timer so the
 * connection is automatically closed when there is no query activity.
 *
 * @async
 * @returns {Promise<import('mysql2').Connection>} The active MySQL connection object.
 */
async function getConnection()
{
    var pingged = await pingConnection();

    if (pingged != "true")
    {
        console.log("Creating New Connection", false, true);
        con = mysql.createConnection({
            host: babadata.database.host,
            user: babadata.database.user,
            password: babadata.database.password,
            database: babadata.database.database,
            port: babadata.database.port,
            charset : 'utf8mb4_general_ci'
        });
    }

    if (timeoutDisconnect != null)
    {
        clearTimeout(timeoutDisconnect);
        timeoutDisconnect = null;
    }

    timeoutDisconnect = setTimeout(function()
    {
        if (con != null)
        {
            try 
            {
                con.end(function(err) 
                {
                    if (err) 
                    {
                        console.log("Error Ending Connection: " + err, false, true);
                        DMMePlease("Error Ending Connection: " + err, false, true);
                    }

                    console.log("Connection Ended", false, true);
                    con = null;
                });
    
                timeoutCT = 0;
                con = null;
            }
            catch (err)
            {
                console.log("Error Ending Connection: " + err, false, true);
                DMMePlease("Error Ending Connection: " + err, false, true);
                con = null;
            }
        }
    }, 60000);

    return con;
}


/**
 * Handles a database connection failure. Increments the consecutive-failure counter
 * and, after more than one failure, marks the database as inaccessible
 * (`global.dbAccess[1] = false`) and starts a 60-second retry loop. Once three
 * consecutive successful pings are confirmed after a recovery, the database is
 * re-enabled and any buffered voice-channel-change (VCC) records are replayed via
 * {@link clearVCCList}.
 */
function dbErrored()
{
    timeoutCT++;
    console.log("Database Connection Failed -> " + timeoutCT, false, true);

    if (timeoutCT > 1)
    {
        global.dbAccess[1] = false;

        if (timeoutFix != null)
        {
            clearTimeout(timeoutFix);
            timeoutFix = null;
        }

        if (timeoutDisconnect != null)
        {
            clearTimeout(timeoutDisconnect);
            timeoutDisconnect = null;
        }

        if (timeoutClear != null)
        {
            clearTimeout(timeoutClear);
            timeoutClear = null;
        }
        
        timeoutFix = setTimeout(async function()
        {
            var pingged = await pingConnection();
            if (pingged == "ERROR")
            {
                var timestring = getD1(true).toLocaleTimeString();
                timeoutCT++;
                console.log(timestring + ": Database Connection Failed, Retrying in 60 seconds -> " + timeoutCT, false, true);
                timeoutFix = setTimeout(arguments.callee, 60000);
            }
            else if (pingged == "false")
            {
                // Try to reconnect to the DB
                await getConnection();
                if (timeoutDisconnect != null) 
                {
                    clearTimeout(timeoutDisconnect);
                    timeoutDisconnect = null;
                }
                
                var timestring = getD1(true).toLocaleTimeString();
                timeoutCT++;
                console.log(timestring + ": Database Connection was null, attempted reconnect, Retrying in 60 seconds -> " + timeoutCT, false, true);
                timeoutFix = setTimeout(arguments.callee, 60000);
            }
            else
            {
                console.log("Database Connection Possibly Restored", false, true);

                // Try 3 more times at 10s intervals to confirm stability
                let confirmAttempts = 0;
                let confirmFailures = 0;
                const confirmDbRestore = async () => 
                {
                    let pingged = await pingConnection();
                    if (pingged !== "true") 
                    {
                        confirmFailures++;
                    }
                    console.log("Confirming DB Restore: Attempt " + (confirmAttempts + 1) + " - Ping Result: " + pingged, false, true);

                    confirmAttempts++;
                    if (confirmAttempts < 3) 
                    {
                        setTimeout(confirmDbRestore, 10000);
                    } 
                    else 
                    {
                        if (confirmFailures > 0) 
                        {
                            // If any failed, revert to retrying every 60s and restore timeoutCT
                            console.log("DB unstable after restore, reverting to retry mode", false, true);
                            timeoutFix = setTimeout(arguments.callee, 60000);
                        } 
                        else 
                        {
                            global.dbAccess[1] = true;
                            timeoutCT = 0;
                            clearTimeout(timeoutFix);
                            timeoutFix = null;

                            // All confirmed, proceed to restore user voice data
                            console.log("Restoring User Voice Data in 10 seconds", false, true);
                            timeoutClear = setTimeout(function() 
                            {
                                console.log("Restoring User Voice Data", false, true);
                                clearVCCList();
                            }, 10000);
                        }
                    }
                };
                setTimeout(confirmDbRestore, 10000);
            }
        }, 60000);
    }
}

/**
 * Executes a raw SQL query string against the database.
 * Skips execution and rejects if the database is currently marked as inaccessible
 * (`global.dbAccess`). On query error, delegates to {@link ErrorWithDB}.
 *
 * @async
 * @param {string} query - The SQL query string to execute.
 * @returns {Promise<import('mysql2').RowDataPacket[]|import('mysql2').OkPacket>}
 *   Resolves with the query result rows / packet, or rejects with the error.
 */
async function callSQLQuery(query)
{
    var condor = await getConnection();
    return new Promise((resolve, reject) =>
    {
        if ((global.dbAccess[1] && global.dbAccess[0]))
        {
            condor.query(query, function (err, result)
            {
                if (err) 
                {
                    ErrorWithDB(err, query);
                    reject(err);
                }
                else 
                {
                    global.dbAccess[1] = true;
                    if (timeoutCT > 0)
                    {
                        timeoutCT = 0;
                        console.log("Timeout CT Reset", false, true);
                    }
                    resolve(result);
                }
            });
        }
        else
        {
            console.log("Query did not Run:", false, true);
            console.log(query, false, true);
            console.log("Database Not Accessible", false, true);
            reject("Database Not Accessible");
        }
    });
}

/**
 * Handles a SQL query error by logging the offending query and error to the console,
 * forwarding them to the bot's log thread via {@link DMMePlease}, and then calling
 * {@link dbErrored} to trigger the reconnect/retry logic.
 *
 * @param {Error} err - The MySQL error object returned by the query callback.
 * @param {string} query - The SQL query string that caused the error.
 */
function ErrorWithDB(err, query)
{
    console.log("Error Occured because of Query: ", false, true);
    console.log(query, false, true);

    DMMePlease("Error Occured because of Query: ");
    var qChunks = splitStringInto1900CharChunksonSpace(query);
    for (var i = 0; i < qChunks.length; i++)
    {
        DMMePlease("```\n"  + qChunks[i] + "\n```", false);
    }

    DMMePlease("Error: \n```\n" + err + "\n```", false);

    dbErrored();
}

/**
 * Sends a text message to the bot's designated log thread on Discord.
 * The target guild and thread are chosen automatically based on whether the bot is
 * running in testing mode (`babadata.testing`).
 *
 * @param {string} sourceMessage - The message content to send to the log thread.
 * @param {boolean} [consoledlog=true] - When `true`, also logs the message to stdout.
 */
function DMMePlease(sourceMessage, consoledlog = true)
{
    if (consoledlog)
        console.log("DMMePlease: " + sourceMessage, false, true);

    var guildID = babadata.testing === undefined ? "454457880825823252" : "522136584649310208";
    var logThreadChanID = babadata.testing === undefined ? "1337944450084769876" : "1337943563996106915";
    var channelOfThread = babadata.testing === undefined ? "509401300874690590" : "757071872721682594";

    global.Bot.guilds.fetch(guildID).then(async guild =>
    {
        guild.channels.fetch(channelOfThread).then(channel => 
        {
            channel.threads.fetch(logThreadChanID).then(thread =>
            {
                thread.send(sourceMessage);
            })
        })
        .catch(console.error);
    }).catch(console.error);
}

/**
 * Sends a file attachment to the bot's designated log thread on Discord.
 * Intended for attaching diagnostic data (e.g. malformed JSON payloads) alongside
 * an error report. The target guild and thread mirror the behaviour of
 * {@link DMMePlease}.
 *
 * @param {string} filename - The filename to use for the uploaded attachment.
 * @param {*} filedata - The data to serialise and attach (stringified with `JSON.stringify`).
 * @param {string} description - A description / caption sent as the message body.
 */
function DMMEAFile(filename, filedata, description)
{
    var guildID = babadata.testing === undefined ? "454457880825823252" : "522136584649310208";
    var logThreadChanID = babadata.testing === undefined ? "1337944450084769876" : "1337943563996106915";
    var channelOfThread = babadata.testing === undefined ? "509401300874690590" : "757071872721682594";

    global.Bot.guilds.fetch(guildID).then(async guild =>
    {
        guild.channels.fetch(channelOfThread).then(channel => 
        {
            channel.threads.fetch(logThreadChanID).then(thread =>
            {
                thread.send({ files: [{ attachment: Buffer.from(JSON.stringify(filedata, null, 2)), name: filename }] , content: description});
            })
        })
        .catch(console.error);
    }).catch(console.error);
}

// Name User ID Functions -------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Looks up a user's cached database record by their Discord ID.
 * Checks `global.userCache` first; if there is a cache miss, triggers
 * {@link LoadUserValuesCache} to refresh the cache before retrying.
 *
 * @param {string} userID - The Discord user snowflake ID to look up.
 * @returns {Promise<{PersonName: string, AltNames: string[]}>}
 *   Resolves with the user record object, or rejects with `"NameFromUserID"` if the
 *   user is not found even after a cache refresh.
 */
function NameFromUserIDID(userID)
{
    var PromisedName = new Promise((resolve, reject) =>
    {
        if (global.userCache[userID] != null)
        {
            // console.log("NameFromUserID Cache Hit", false, true);
            resolve(global.userCache[userID]);
        }
        else
        {
            // call LoadUserValuesCache
            LoadUserValuesCache().then(() =>
            {
                if (global.userCache[userID] != null)
                {
                    resolve(global.userCache[userID]);
                }
                else
                {
                    reject("NameFromUserID");
                }
            }).catch((err) => {reject("NameFromUserID")});
        }
    });

    return PromisedName;
}

// Event DB Functions -----------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Persists a guild scheduled event change to the database.
 *
 * When `change` does **not** contain the substring `"user"`, the event record itself
 * is created, soft-deleted (status → `"CANCELED"`), or updated in the
 * `scheduleevent` table according to the value of `change`:
 *  - `"create"` – inserts a new row,
 *  - `"delete"` – marks the event as `CANCELED`,
 *  - `"update"` – updates all event fields.
 *
 * When `change` **does** contain `"user"`, the user's attendance record in the
 * `eventpurity` table is updated:
 *  - `"useradd"`    – upserts the user as having joined (flaked = 0, joined = 1),
 *  - `"userremove"` – marks the user as having flaked (flaked = 1, joined = 0).
 *
 * @param {import('discord.js').GuildScheduledEvent} event - The Discord scheduled event object.
 * @param {"create"|"delete"|"update"|"useradd"|"userremove"} change - The type of change to record.
 * @param {import('discord.js').User|null} user - The Discord user involved (required for user-related changes).
 */
function EventDB(event, change, user)
{
	var eid = event.id;
    if (!change.includes("user"))
    {
        var cid = event.creatorId;
        var chanid = event.channelId;
        var name = event.name;
        var desc = event.description;
        var d1 = new Date(event.scheduledStartTimestamp);
        var d2 = new Date(event.scheduledEndTimestamp);
        var status = event.status;
        switch (status)
        {
            case 1:
                status = "SCHEDULED";
                break;
            case 2:
                status = "ACTIVE";
                break;
            case 3:
                status = "COMPLETED";
                break;
            case 4:
                status = "CANCELED";
                break;
        }

        var loc = "Voice Channel";

        var mpre1 = d1.getMonth() + 1 < 10 ? 0 : "";
        var dpre1 = d1.getUTCDate() < 10 ? 0 : "";
        var mpre2 = d2.getMonth() + 1 < 10 ? 0 : "";
        var dpre2 = d2.getUTCDate() < 10 ? 0 : "";

        var start = `${d1.getFullYear()}-${mpre1}${d1.getMonth() + 1}-${dpre1}${d1.getUTCDate()} ${d1.getHours()}:${d1.getMinutes()}:${d1.getSeconds()}`
        var end = `${d2.getFullYear()}-${mpre2}${d2.getMonth() + 1}-${dpre2}${d2.getUTCDate()} ${d2.getHours()}:${d2.getMinutes()}:${d2.getSeconds()}`
        
        // add time leaving and joining
        if (event.entityMetadata != null)
        {
            loc = event.entityMetadata.location;
        }

        if (change == "create")
        {
            var qurey = `INSERT INTO scheduleevent (eventID, creatorID, name, channelID, description, StartTime, EndTime, status, Location) VALUES ("${eid}", "${cid}", "${name}", "${chanid}", "${desc}", "${start}", "${end}", "${status}", "${loc}")`;
            callSQLQuery(qurey)
            .then((result) => {})
            .catch((err) => {DMMePlease("Error Creating Event: " + err)});
        }
        else if (change == "delete")
        {
            var qurey = `UPDATE scheduleevent Set status = "CANCELED" WHERE eventID = "${eid}"`;
            callSQLQuery(qurey)
            .then((result) => {})
            .catch((err) => {DMMePlease("Error Deleting Event: " + err)});
        }
        else if (change == "update")
        {
            var qurey = `UPDATE scheduleevent Set creatorID = "${cid}", name = "${name}", channelID = "${chanid}", description = "${desc}", StartTime = "${start}", EndTime = "${end}", status = "${status}", Location = "${loc}" WHERE eventID = "${eid}"`;
            callSQLQuery(qurey)
            .then((result) => {})
            .catch((err) => {DMMePlease("Error Updating Event: " + err)});
        }
    }
    else 
    {
        var uid = user.id;
        var time = getD1(true);
        var mpre = time.getMonth() + 1 < 10 ? 0 : "";
        var dpre = time.getUTCDate() < 10 ? 0 : "";
        var jtime = `${time.getFullYear()}-${mpre}${time.getMonth() + 1}-${dpre}${time.getUTCDate()} ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`
        if (change == "useradd")
        {
            var query = `UPDATE eventpurity SET flaked = 0, timesrejoined = timesrejoined + 1, joined = 1, latestjointime = "${jtime}", flaketime = null WHERE eventID = "${eid}" AND userID = "${uid}"`;
            callSQLQuery(query)
            .then((result) =>
            {
                if (result.affectedRows == 0)
                {
                    var innrquery = `INSERT INTO eventpurity (eventID, userID, flaked, timesrejoined, joined, latestjointime, initjointime) VALUES ("${eid}", "${uid}", 0, 1, 1, "${jtime}", "${jtime}")`;
                    callSQLQuery(innrquery)
                    .then((result) => {})
                    .catch((err) => {DMMePlease("Error Adding User to Event: " + err)});
                }
            })
            .catch((err) => {DMMePlease("Error Updating User in Event: " + err)});
        }
        else if (change == "userremove")
        {
            var query = `UPDATE eventpurity SET flaked = 1, joined = 0, flaketime = "${jtime}", latestjointime = null WHERE eventID = "${eid}" AND userID = "${uid}"`;
            callSQLQuery(query)
            .then((result) => {})
            .catch((err) => {DMMePlease("Error Removing User from Event: " + err)});
        }
    }
}

// Opting Functions -------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Sets a user's opt-in preference for a given feature in the `opting` table.
 * Attempts an `UPDATE` first; if no row is affected, inserts a new row with
 * `Val = 'in'`.
 *
 * @param {import('discord.js').User} user - The Discord user object (must have `.id`).
 * @param {string} type - The feature / item key to opt into (e.g. `"voice"`).
 * @returns {Promise<"OptIn">} Resolves with `"OptIn"` on success, or rejects with
 *   `"OptIn"` if the database operation fails.
 */
function optIn(user, type)
{
    var PromisedOptIn = new Promise((resolve, reject) =>
    {
        var query = `UPDATE opting Set Val='in' WHERE DiscordID = "${user.id}" AND ItemToRemove = "${type}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.affectedRows == 0)
            {
                var query = `INSERT INTO opting (DiscordID, ItemToRemove, Val) VALUES ("${user.id}", "${type}", "in")`;
                callSQLQuery(query)
                .then((result) => {resolve("OptIn")})
                .catch((err) => {reject("OptIn")});
            }
            else
            {
                resolve("OptIn");
            }
        })
        .catch((err) => {reject("OptIn")});
    });

    return PromisedOptIn;
}

/**
 * Sets a user's opt-out preference for a given feature in the `opting` table.
 * Attempts an `UPDATE` first; if no row is affected, inserts a new row with
 * `Val = 'out'`.
 *
 * @param {import('discord.js').User} user - The Discord user object (must have `.id`).
 * @param {string} type - The feature / item key to opt out of (e.g. `"voice"`).
 * @returns {Promise<"OptOut">} Resolves with `"OptOut"` on success, or rejects with
 *   `"OptOut"` if the database operation fails.
 */
function optOut(user, type)
{
    var PromisedOptOut = new Promise((resolve, reject) =>
    {
        var query = `UPDATE opting Set Val='out' WHERE DiscordID = "${user.id}" AND ItemToRemove = "${type}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.affectedRows == 0)
            {
                var query = `INSERT INTO opting (DiscordID, ItemToRemove, Val) VALUES ("${user.id}", "${type}", "out")`;
                callSQLQuery(query)
                .then((result) => {resolve("OptOut")})
                .catch((err) => {reject("OptOut")});
            }
            else
            {
                resolve("OptOut");
            }
        })
        .catch((err) => {reject("OptOut")});
    });

    return PromisedOptOut;
}

// Voice Channel Functions ------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Ensures a user row exists in the `userval` table, creating one if absent.
 *
 * @param {string} userID - The Discord user snowflake ID.
 * @param {string} userName - The Discord username to store if a new row is created.
 * @returns {Promise<"User Created"|"User Exists">} Resolves with a status string, or
 *   rejects with `"CreateUser"` on failure.
 */
function CheckAndCreateUser(userID, userName)
{
    var PromisedUser = new Promise((resolve, reject) =>
    {
        var query = `Select * from userval where DiscordID = "${userID}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.length == 0)
            {
                var query = `INSERT INTO userval (DiscordID, PersonName) VALUES ("${userID}", "${userName}")`;
                callSQLQuery(query)
                .then((result) => {resolve("User Created")})
                .catch((err) => {reject("CreateUser")});
            }
            else
            {
                resolve("User Exists");
            }
        })
        .catch((err) => {reject("CreateUser")});
    });

    return PromisedUser;
}

/**
 * Ensures a channel row exists in the `channelval` table, creating one if absent.
 *
 * @param {string} channelID - The Discord channel snowflake ID.
 * @param {string} channelName - The channel name to store if a new row is created.
 * @returns {Promise<"Channel Created"|"Channel Exists">} Resolves with a status
 *   string, or rejects with `"CreateChannel"` on failure.
 */
function checkAndCreateChannel(channelID, channelName)
{
    var PromisedChannel = new Promise((resolve, reject) =>
    {
        var query = `Select * from channelval where ChannelID = "${channelID}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.length == 0)
            {
                var query = `INSERT INTO channelval (ChannelID, ChannelName, Type) VALUES ("${channelID}", "${channelName}", "Voice")`;
                callSQLQuery(query)
                .then((result) => {resolve("Channel Created")})
                .catch((err) => {reject("CreateChannel")});
            }
            else
            {
                resolve("Channel Exists");
            }
        })
        .catch((err) => {reject("CreateChannel")});
    });

    return PromisedChannel;
}

/**
 * Executes a voice-activity SQL query, automatically recovering from foreign-key
 * constraint violations by creating the missing user or channel row and retrying.
 *
 * - If the error references `voiceactivity_ibfk_1` (channel FK), fetches the channel
 *   from Discord, calls {@link checkAndCreateChannel}, then retries.
 * - If the error references `voiceactivity_ibfk_2` (user FK), fetches the member
 *   from Discord, calls {@link CheckAndCreateUser}, then retries.
 *
 * @param {string} queryz - The SQL query string to execute.
 * @param {string} userID - Discord user snowflake ID (used for FK auto-create on retry).
 * @param {string} channelID - Discord channel snowflake ID (used for FK auto-create on retry).
 * @param {import('discord.js').Guild} guild - The Discord guild, used to fetch missing entities.
 * @param {string} subtext - Descriptive label used in log output.
 * @returns {Promise<string>} Resolves with the original query string on success, or
 *   rejects with an error string on unrecoverable failure.
 */
function userVoiceChange(queryz, userID, channelID, guild, subtext)
{
    var PromisedVoiceChange = new Promise((resolve, reject) =>
    {
        var query = queryz;
        callSQLQuery(query)
        .then((result) =>
        {
            resolve(queryz);
        })
        .catch((err) => 
        {
            if (err != null && err.sqlMessage != null && err.sqlMessage.includes("voiceactivity_ibfk_1"))
            {
                console.log("Error: " + err.sqlMessage, false, true);
                guild.channels.fetch(channelID)
                .then(channel => 
                {
                    checkAndCreateChannel(channelID, channel.name).then(() =>
                    {
                        userVoiceChange(queryz, userID, channelID, guild, subtext).then((result) => {resolve(result)}).catch((err) => {reject(err)});
                    })
                    .catch((err) => {reject("CreateChannel")});
                })
                .catch(console.error);
            }
            else if (err != null && err.sqlMessage != null && err.sqlMessage.includes("voiceactivity_ibfk_2"))
            {
                console.log("Error: " + err.sqlMessage, false, true);
                guild.members.fetch(userID)
                .then(user => 
                {
                    CheckAndCreateUser(userID, user.user.username).then(() =>
                    {
                        userVoiceChange(queryz, userID, channelID, guild, subtext).then((result) => {resolve(result)}).catch((err) => {reject(err)});
                    })
                    .catch((err) => {reject("CreateUser")});
                })
                .catch(console.error);
            }
            else
            {
                console.log("Error: " + err, false, true);
                reject("UserVoiceChange");
            }
        });
    });

    return PromisedVoiceChange;
}

/**
 * Records a voice channel join event for a user in the `voiceactivity` table by
 * inserting a new row with the current (or overridden) start time.
 *
 * @param {string} userID - Discord user snowflake ID.
 * @param {string} channelID - Discord channel snowflake ID the user joined.
 * @param {import('discord.js').Guild} guild - The Discord guild, passed through to
 *   {@link userVoiceChange} for FK auto-create.
 * @param {Date|null} [overideTime=null] - Optional timestamp override; defaults to now.
 * @returns {Promise<string>} Resolves with the executed query string, or rejects with
 *   `"JoinVoice"` on failure.
 */
function userJoinedVoice(userID, channelID, guild, overideTime = null)
{
    var PromisedUserJoined = new Promise((resolve, reject) =>
    {
        var dt = overideTime == null ? getD1(true) : overideTime;
        var dtsrart = dt.toISOString().slice(0, 19).replace('T', ' ');
        var q = `INSERT INTO voiceactivity (ChannelID, UserID, StartTime) VALUES ("${channelID}", "${userID}", "${dtsrart}")`;
        userVoiceChange(q, userID, channelID, guild, "JoinVoice").then((result) => {resolve(result)}).catch((err) => {reject("JoinVoice")});
    });

    return PromisedUserJoined;
}

/**
 * Records a voice channel leave event for a user by setting the `EndTime` on the
 * most recent open `voiceactivity` row for that user/channel pair.
 *
 * @param {string} userID - Discord user snowflake ID.
 * @param {string} channelID - Discord channel snowflake ID the user left.
 * @param {import('discord.js').Guild} guild - The Discord guild, passed through to
 *   {@link userVoiceChange} for FK auto-create.
 * @param {Date|null} [overideTime=null] - Optional timestamp override; defaults to now.
 * @returns {Promise<string>} Resolves with the executed query string, or rejects with
 *   `"LeaveVoice"` on failure.
 */
function userLeftVoice(userID, channelID, guild, overideTime = null)
{
    var PromisedUserLeft = new Promise((resolve, reject) =>
    {
        var dt = overideTime == null ? getD1(true) : overideTime;
        var dtsrart = dt.toISOString().slice(0, 19).replace('T', ' ');
        var q = `UPDATE voiceactivity SET EndTime = "${dtsrart}" WHERE UserID = "${userID}" AND ChannelID = "${channelID}" AND EndTime IS NULL`;
        userVoiceChange(q, userID, channelID, guild, "JoinVoice").then((result) => {resolve(result)}).catch((err) => {reject("LeaveVoice")});
    });

    return PromisedUserLeft;
}

/**
 * Appends a voice-channel-change (VCC) event record to the local CSV buffer file
 * (`loggedUsersVCC.csv`). This acts as a write-ahead log so that events are not lost
 * when the database is temporarily unavailable.
 *
 * @param {string} newMemberID - Discord user snowflake ID of the member in their new state.
 * @param {string|null} newChannelID - Channel snowflake ID the member moved **to**, or
 *   `null` if they disconnected.
 * @param {string} oldMemberID - Discord user snowflake ID of the member in their old state.
 * @param {string|null} oldChannelID - Channel snowflake ID the member moved **from**, or
 *   `null` if they were not previously in a channel.
 * @param {string} guildID - Discord guild snowflake ID.
 * @param {Date|null} [timeoveride=null] - Optional timestamp override; defaults to now.
 */
function logVCC(newMemberID, newChannelID, oldMemberID, oldChannelID, guildID, timeoveride = null)
{
    var time = getD1(true);
	console.log("Logging VCC Data: " + newMemberID + " " + oldMemberID + " " + newChannelID + " " + oldChannelID + " " + time + " " + guildID, false, true);
	// save time as a number
	time = time.getTime();

    if (timeoveride != null)
        time = timeoveride.getTime();

	if (!fs.existsSync(babadata.datalocation + "loggedUsersVCC.csv"))
	{
		fs.writeFileSync(babadata.datalocation + "loggedUsersVCC.csv", "");
	}

	fs.appendFileSync(babadata.datalocation + "loggedUsersVCC.csv", newMemberID + "," + newChannelID + "," + oldMemberID + "," + oldChannelID + "," + time + "," + guildID + "\n");
}

/**
 * Reads the buffered VCC CSV log file, clears it, and replays every recorded
 * voice-channel-change event sequentially through {@link voiceChannelChangeLOGGED}.
 * Called automatically after the database connection is confirmed restored by
 * {@link dbErrored}.
 */
function clearVCCList()
{
	// load loggedUsersVCC.json
	var loggedUsersVCC = fs.readFileSync(babadata.datalocation + "loggedUsersVCC.csv");
	// clear the file
	fs.writeFileSync(babadata.datalocation + "loggedUsersVCC.csv", "");

	loggedUsersVCC = loggedUsersVCC.toString();

	// loop through each line
	// for each line, get the newMember.id, newMember.channelId, oldMember.id, oldMember.channelId, time
	// call voiceChannelChangeLOGGED(newMember.id, oldMember.id, newMember.channelId, oldMember.channelId, time)
    // Process lines sequentially to ensure saveStuff runs one at a time
    var lines = loggedUsersVCC.split("\n");
    async function processLinesSequentially(lines) 
    {
        for (let i = 0; i < lines.length; i++)
            await saveStuff(lines[i], i);
    }
    processLinesSequentially(lines);
}

/**
 * Processes a single CSV line from the VCC buffer, with a small staggered delay
 * (`i * 100 ms`) to avoid flooding the database on replay. Parses the comma-separated
 * fields and delegates to {@link voiceChannelChangeLOGGED}.
 *
 * @param {string} lineWhole - A single raw CSV line from `loggedUsersVCC.csv`.
 * @param {number} i - The zero-based index of this line, used to compute the delay.
 * @returns {Promise<void>} Always resolves (errors are swallowed so sequential
 *   processing continues).
 */
function saveStuff(lineWhole, i)
{
    return new Promise((resolve) =>
    {
        setTimeout(function()
        {
            if (lineWhole.length > 0)
            {
                var line = lineWhole.split(",");
                var newMemberID = line[0];
                var newChannelID = line[1] == "null" ? null : line[1];
                var oldMemberID = line[2];
                var oldChannelID = line[3] == "null" ? null : line[3];
                var time = line[4];
                // convert time to Date object
                time = new Date(parseInt(time));
                
                var guildID = line[5];
                // voiceChannelChangeLOGGED is async, so wait for it to finish
                Promise.resolve(voiceChannelChangeLOGGED(newMemberID, oldMemberID, newChannelID, oldChannelID, time, guildID))
                    .then(() => resolve())
                    .catch(() => resolve());
            }
            else
                resolve();
        }, i * 100);
    });
}

/**
 * Replays a previously buffered voice-channel-change event against the live database.
 * Fetches the guild by ID, then calls {@link userJoinedVoice} and/or
 * {@link userLeftVoice} as appropriate. On failure, re-buffers the event via
 * {@link logVCC} so it is not permanently lost.
 *
 * @param {string} newMemberID - Discord user snowflake ID in the new (post-change) state.
 * @param {string} oldMemberID - Discord user snowflake ID in the old (pre-change) state.
 * @param {string|null} newChannelID - Channel the member moved **to**, or `null`.
 * @param {string|null} oldChannelID - Channel the member moved **from**, or `null`.
 * @param {Date|null} [overideTime=null] - The original timestamp of the event.
 * @param {string} guildID - Discord guild snowflake ID.
 */
function voiceChannelChangeLOGGED(newMemberID, oldMemberID, newChannelID, oldChannelID, overideTime = null, guildID)
{
	global.Bot.guilds.fetch(guildID).then(async guild =>
	{
        const VCCChangeAsync = async function() 
        {
            if (newChannelID != null && newChannelID != oldChannelID && userOptValue(guild, newMemberID, "voice"))
            {
                var uJV = await userJoinedVoice(newMemberID, newChannelID, guild, overideTime);
                console.log("Join Update: " + uJV, false, true);
            }

            if (oldChannelID != null && newChannelID != oldChannelID)
            {
                var uLV = await userLeftVoice(oldMemberID, oldChannelID, guild, overideTime);
                console.log("Leave Update: " + uLV, false, true);
            }
        };

        if (newChannelID != oldChannelID)
        {
            VCCChangeAsync().then(() =>
            {
                console.log("Voice Channel Change Complete from Logged Values", false, true);
            }).catch((err) => 
            {
                DMMePlease("Error in Voice Channel Change from Logged Values: " + err);
                logVCC(newMemberID, newChannelID, oldMemberID, oldChannelID, guildID, overideTime);
            });
        }
	});
}

/**
 * Resolves a user's display name from their Discord ID using the database cache.
 * Falls back to `"No One"` if the user is not found, rather than rejecting.
 *
 * @param {string} userid - The Discord user snowflake ID to look up.
 * @returns {Promise<string>} Resolves with the stored `PersonName`, or `"No One"` if
 *   the user is not in the cache.
 */
function NameFromUserIDNoFakes(userid)
{
    var userDBItemPromise = new Promise((resolve, reject) => {
        NameFromUserIDID(userid).then((result) =>
        {
            resolve(result.PersonName);
        }).catch((err) => 
        {
            resolve("No One");
        });
    });

    return userDBItemPromise;
}

/**
 * Determines the best display name for a guild member by checking multiple name
 * sources in the caller-supplied priority order and returning the first non-empty
 * result.
 *
 * Name source codes:
 *  - `"N"` – Discord server nickname (`member.nickname`)
 *  - `"C"` – Cached database name (via {@link NameFromUserIDNoFakes})
 *  - `"G"` – Discord global display name (`member.user.globalName`)
 *  - `"U"` – Discord username (`member.user.username`)
 *
 * @async
 * @param {import('discord.js').GuildMember} member - The guild member whose name to resolve.
 * @param {Array<"N"|"C"|"G"|"U">} [order=["N","C","G","U"]] - Priority order of name sources.
 * @param {boolean} [regexTrim=true] - When `true`, strips all non-alphanumeric / non-space
 *   characters from every candidate before comparison.
 * @returns {Promise<string>} The best available display name, falling back to the
 *   Discord username if all other sources are empty.
 */
async function PickThePerfectUsername(member, order = ["N", "C", "G", "U"], regexTrim = true)
{
	// N - Discord Nickname in Server
	// C - Cached Name (from database)
	// G - Discord Global Nickname
	// U - Discord Username

    nName = member.nickname;
    cahcedName = await NameFromUserIDNoFakes(member.user.id);
    gName = member.user.globalName;
    uName = member.user.username;

    // if any are null set to empty string
    if (nName == null)
        nName = "";
    if (cahcedName == null)
        cahcedName = "";
    if (gName == null || gName == "No One")
        gName = "";
    if (uName == null)
        uName = "";

    // filter to only character a-z, A-Z, 0-9, and space
    if (regexTrim)
    {
        var regex = /[^a-zA-Z0-9 ]/g;
        nName = nName.replace(regex, '');
        cahcedName = cahcedName.replace(regex, '');
        gName = gName.replace(regex, '');
        uName = uName.replace(regex, '');
    }

	// Loop through the order array and return the first non-empty name
	for (const key of order) 
	{
		switch (key) 
		{
			case "N":
				if (nName != "") return nName;
				break;
			case "C":
				if (cahcedName != "") return cahcedName;
				break;
			case "G":
				if (gName != "") return gName;
				break;
			case "U":
				if (uName != "") return uName;
				break;
		}
	}

    return uName;
}

/**
 * Handles a Discord `voiceStateUpdate` event in real time.
 * Compares the new and old voice states and, when the channel has actually changed:
 *  - Updates the Shadow Realm channel status string to list currently sleeping members.
 *  - Calls {@link userJoinedVoice} if the member joined a new channel and has opted in.
 *  - Calls {@link userLeftVoice} if the member left their previous channel.
 *
 * On any processing error, the event is buffered to the CSV log via {@link logVCC}
 * so it can be replayed once the database recovers.
 *
 * @param {import('discord.js').VoiceState} newMember - The updated voice state.
 * @param {import('discord.js').VoiceState} oldMember - The previous voice state.
 */
function voiceChannelChange(newMember, oldMember)
{
    const VCCChangeAsync = async function() 
    {
        var newUserID = newMember.id;
        var oldUserID = oldMember.id;
        var newUserChannel = newMember.channelId;
        var oldUserChannel = oldMember.channelId;
    
        var guild = newMember.guild;

        var shadowRealmChannel = babadata.testing === undefined ? "454464489681715200" : "1240062704966832209";

        if (newUserChannel == shadowRealmChannel || oldUserChannel == shadowRealmChannel)
        {
            const { channelStatusChange } = require('../HelperFunctions/basicHelpers');

            var usersInShadowRealm = await guild.channels.fetch(shadowRealmChannel).then(channel => channel.members.map(member => member.id));
            if (usersInShadowRealm.length == 0)
                channelStatusChange(shadowRealmChannel, "");
            else
            {
                var userNamedList = [];
                for (var i = 0; i < usersInShadowRealm.length; i++)
                {
                    var userID = usersInShadowRealm[i];
                    var userName = await PickThePerfectUsername(guild.members.cache.get(userID), ["C", "N", "G", "U"], true);
                    userNamedList.push(userName);
                }

                // join the names with commas without the last comma and having an and before the last name
                var userNamedListString = userNamedList.join(", ");
                if (userNamedList.length > 1)
                	userNamedListString = userNamedListString.substring(0, userNamedListString.lastIndexOf(",")) + (userNamedList.length > 2 ? "," : "") + " and" + userNamedListString.substring(userNamedListString.lastIndexOf(",") + 1);
                else if (userNamedList.length == 1)
                	userNamedListString = userNamedList[0];

                userNamedListString += (userNamedList.length > 1 ? " are" : " is") + " Sleeping, please do not wake" + (userNamedList.length > 1 ? " them" : "") + ".";

                channelStatusChange(shadowRealmChannel, userNamedListString);
            }
        }

        if (newUserChannel != null && newUserChannel != oldUserChannel && await userOptValue(guild, newUserID, "voice"))
        {
            var uJV = await userJoinedVoice(newUserID, newUserChannel, guild);
            console.log("Join Update: " + uJV, false, true);
        }
    
        if (oldUserChannel != null && newUserChannel != oldUserChannel)
        {
            var uLV = await userLeftVoice(oldUserID, oldUserChannel, guild);
            console.log("Leave Update: " + uLV, false, true);
        }
    }
    
    if (newMember.channelId != oldMember.channelId)
    {
        VCCChangeAsync().then(() =>
        {
            console.log("Voice Channel Change Complete", false, true);
        }).catch((err) => 
        {
            DMMePlease("Error in Voice Channel Change: " + err);
            logVCC(newMember.id, newMember.channelId, oldMember.id, oldMember.channelId, newMember.guild.id);
        });
    }
}

/**
 * Checks whether a user has opted in to a specific feature, consulting the local
 * `optscache.json` file first. If the user has no existing preference:
 *  - Ensures the user exists in the database via {@link CheckAndCreateUser}.
 *  - Sets the default preference (opt-in for testing environments, opt-out otherwise).
 *  - Sends an informational message to the bot channel prompting the user to set
 *    their preference explicitly.
 *
 * @param {import('discord.js').Guild} guild - The Discord guild (used to fetch the
 *   member and post the info message).
 * @param {string} userID - Discord user snowflake ID.
 * @param {string} val - The feature / item key to check (e.g. `"voice"`).
 * @returns {Promise<boolean>} Resolves with `true` if the user is opted in, `false`
 *   otherwise (including on any error).
 */
function userOptValue(guild, userID, val)
{
    var PromisedOptVal = new Promise((resolve, reject) => {
        let rawdata = fs.readFileSync(babadata.datalocation + "optscache.json");
        let optscache = JSON.parse(rawdata);
    
        for (var i = 0 ; i < optscache.length; i++)
        {
            var opt = optscache[i];
            if (opt.DiscordID == userID && opt.Item == val)
            {
                resolve(opt.Opt == "in");
                return;
            }
        }
        
        guild.members.fetch(userID)
        .then(user => 
        {
            CheckAndCreateUser(userID, user.user.username).then(async (result) => 
            {
                var OptInOrOut = null;
                if (babadata.testing != undefined)
                    OptInOrOut = optIn;
                else
                    OptInOrOut = optOut;

                OptInOrOut(user, val).then((result) =>
                {
                    guild.channels.fetch(babadata.botchan).then(channel => {
                        channel.send("<@" + userID + "> would you like to opt in for baba voice activity data analysis?\n"
                        + "Type `/optin` to opt in, or `/optout` to opt out (default).\n" + 
                        "This data will be used to create fun charts and do predictive analysis of voice activity.\n" +
                        "If you don't want to see this message, call one of the commands.\n" +
                        "Check out <#1069025445162524792> to see some cool charts that were made over the years.");
                    })
                    .catch(console.error);
                
                    // do the @ of person and add to opt out first
                    console.log("No In"); 

                    resolve(false);
                })
                .catch((err) => {
                    console.log(err);
                    resolve(false);
                });
            })
            .catch((err) => {
                console.log(err);
                resolve(false);
            });
        });
    });

    return PromisedOptVal;
}

// Slash Friday Saving Functions ------------------------------------------------------------------------------------------------------------------------------------

/**
 * Flushes the in-memory Slash Friday counters and messages to the database by
 * delegating to {@link IncrementCounters}. Respects the current environment
 * (production vs. testing) and an optional override flag.
 *
 * @param {boolean} [testingOveride=false] - When `true`, allows the flush to run in
 *   testing mode.
 * @returns {Promise<string>} Resolves with a human-readable status message describing
 *   whether the counters were updated.
 */
function SaveSlashFridayJson(testingOveride = false)
{
    var PromisedSave = new Promise((resolve, reject) =>
    {
        var retVal = "Friday Counter has not been updated, as it is Empty";
        if ((global.dbAccess[1] && global.dbAccess[0]))
        {
            if (testingOveride && babadata.testing !== undefined)
            {
                console.log("Saving Friday Counter to Database (Testing Overide)", false, true);
                IncrementCounters().then(() =>
                {
                    retVal = "Friday Counter Updated (Testing Overide)";
                    resolve(retVal);
                }).catch((err) => {resolve("Friday Counter Failed to Update (Testing Overide): " + err)});
            }
    
            // save to database
            if (babadata.testing === undefined)
            {
                console.log("Saving Friday Counter to Database", false, true);
                IncrementCounters().then(() =>
                {
                    retVal = "Friday Counter Updated";
                    resolve(retVal);
                }).catch((err) => {resolve("Friday Counter Failed to Update: " + err)});
            }
        }

        resolve(retVal);
    });

    return PromisedSave;
}

/**
 * Runs both the Friday layer-depth counter flush ({@link FridayCounterIncrement}) and
 * the Friday messages flush ({@link FridayMessagesUpdate}) sequentially.
 *
 * @returns {Promise<"SuccCess">} Resolves with `"SuccCess"` when both sub-operations
 *   complete, or rejects with a descriptive error string on failure.
 */
function IncrementCounters()
{
    const CounterAsync = async function()
    {
        // Increment Friday Counter
        const FridayResult = await FridayCounterIncrement();
        console.log("Friday Counter: " + FridayResult, false, true);

        // Increment Friday Messages
        const FridayMessagesResult = await FridayMessagesUpdate();
        console.log("Friday Messages: " + FridayMessagesResult, false, true);
    }

    var PromisedIncrement = new Promise((resolve, reject) =>
    {
        CounterAsync().then(() => 
        {
            console.log("All Counters Incremented", false, true);
            resolve("SuccCess");
        }).catch((err) => 
        {
            DMMePlease("Error Incrementing Counters: " + err);
            reject("IncrementCounters: " + err);
        });
    });

    return PromisedIncrement;
}

/**
 * Flushes the `fridayCounter.json` file to the `layersdeep` database table using an
 * `INSERT … ON DUPLICATE KEY UPDATE` bulk upsert. After a successful write, the local
 * JSON file and `global.fridayCounter` are reset to empty objects.
 *
 * @returns {Promise<"SuccCess"|"Friday Counter Empty">} Resolves with a status string,
 *   or rejects with `"FridayCounter"` on failure (also sends the payload to the log
 *   thread as a file attachment for debugging).
 */
function FridayCounterIncrement()
{
    var PromisedFridayCounter = new Promise((resolve, reject) =>
    {
        var fridayJson = fs.readFileSync(babadata.datalocation + "fridayCounter.json");
        var friday = JSON.parse(fridayJson);
        var qureyStart = "INSERT INTO layersdeep (FridayUID,LoopsOrDOW,LayersDeep,Count,HeadingLevel,Sender) VALUES "
        var qureyEnd = `AS newDeepLayers ON DUPLICATE KEY UPDATE layersdeep.Count = layersdeep.Count + newDeepLayers.Count;`;
        var queryMiddle = "";

        for (var i = 0; i < Object.keys(friday).length; i++)
        {
            var key = Object.keys(friday)[i];
            var layersdeeps = friday[key];

            // uid is key before --, group is key after --
            var uid = key.split("--")[0];
            var group = key.split("--")[1];
            var user = key.split("--")[2];


            // update the value in the database for each layer in value, on new entry add it
            for (var deepness = 0; deepness < layersdeeps.length; deepness++)
            {
                var headingLevels = layersdeeps[deepness];
                if (headingLevels != null)
                {
                    for (var heding = 0; heding < headingLevels.length; heding++)
                    {
                        var count = headingLevels[heding];
                        if (count != null)
                            queryMiddle += `("${uid}", "${group}", "${deepness}", "${count}", "${heding}", "${user}"),`;
                    }
                }
            }
        }
        queryMiddle = queryMiddle.slice(0, -1);

        if (queryMiddle.length == 0)
        {
            resolve("Friday Counter Empty");
            return;
        }

        var query = qureyStart + queryMiddle + qureyEnd;
        callSQLQuery(query)
        .then((result) =>
        {
			var data = {};
			fs.writeFileSync(babadata.datalocation + "fridayCounter.json", JSON.stringify(data));
            global.fridayCounter = {};
            resolve("SuccCess");
        })
        .catch((err) => 
        {
            DMMePlease("Error Incrementing Friday Counter: " + err);
            DMMEAFile("fridayCounter.json", fridayJson, "Friday Counter Increment Error Data");
            reject("FridayCounter");
        });
    });

    return PromisedFridayCounter;
}

/**
 * Flushes the `fridaymessages.json` buffer to the `myitisfriday` database table via
 * a bulk `INSERT`. After a successful write, the local JSON file is reset to an
 * empty array.
 *
 * @returns {Promise<"SuccCess"|"Friday Messages Empty">} Resolves with a status
 *   string, or rejects with `"FridayMessages"` on failure (also sends the payload to
 *   the log thread as a file attachment for debugging).
 */
function FridayMessagesUpdate()
{
    var PromisedFridayMessages = new Promise((resolve, reject) =>
    {
        var fridayMessages = fs.readFileSync(babadata.datalocation + "fridaymessages.json");
        var friday = JSON.parse(fridayMessages);
    
        if (friday.length == 0)
        {
            resolve("Friday Messages Empty");
            return;
        }

        var qureyStart2 = `INSERT INTO myitisfriday (Sender,TimeStamp,Message,Condensed,Seed,FileVersion) VALUES `;
        var queryMiddle2 = "";

        for (var i = 0; i < friday.length; i++)
        {
            // var fmdItem = { "UID": authorID, "Text": text, "Date": tod, "CondensedNotation": cnFull, "Seed": seed, "FileVersion": fc };
            var fmdItem = friday[i];
            var sender = fmdItem.UID;
    
            var d1 = new Date(fmdItem.Date);
            var mpre1 = d1.getMonth() + 1 < 10 ? 0 : "";
            var dpre1 = d1.getUTCDate() < 10 ? 0 : "";
    
            var time = `${d1.getFullYear()}-${mpre1}${d1.getMonth() + 1}-${dpre1}${d1.getDate()} ${d1.getHours()}:${d1.getMinutes()}:${d1.getSeconds()}`
            
            var msg = fmdItem.Text;
            // replace all " with ""
            msg = msg.replace(/"/g, '""');
            var cond = fmdItem.CondensedNotation;
            // if cond is object, convert to string
            if (typeof cond === 'object')
            {
                cond = JSON.stringify(cond);
                cond = cond.replace(/"/g, '""');
            }
    
            var seed = fmdItem.Seed;
    
            // add to query
            queryMiddle2 += `("${sender}", "${time}", "${msg}", "${cond}", "${seed}", "${fmdItem.FileVersion}"),`;
        }
    
        // remove last comma
        queryMiddle2 = queryMiddle2.slice(0, -1);

        var query2 = qureyStart2 + queryMiddle2;
        callSQLQuery(query2)
        .then((result) =>
        {
			var data = [];
			fs.writeFileSync(babadata.datalocation + "fridaymessages.json", JSON.stringify(data));
            resolve("SuccCess");
        })
        .catch((err) => 
        {
            DMMePlease("Error Updating Friday Messages: " + err);
            DMMEAFile("fridaymessages.json", fridayMessages, "Friday Messages Update Error Data");
            reject("FridayMessages");
        });
    });

    return PromisedFridayMessages;
}

// Cache Functions  ------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Sequentially loads every in-memory and on-disk cache used by the bot. The caches
 * are loaded in the following order: emoji, react, fish, frog, frog control, DOW
 * items, channel names, user values, pleased, pleased overrides, holidays, haikus,
 * opts, and all Slash Friday data (time gates, DOW cache, DOW control, Friday loops).
 *
 * @returns {Promise<"SuccCess">} Resolves once all caches have been populated, or
 *   rejects with `"AllCache"` if any individual load fails.
 */
function LoadAllTheCache()
{
    const CachceAsync = async function() 
    {
        // Emoji Cache
        const EmojiResult = await LoadEmojiCache();
        console.log("Emoji Cache: " + EmojiResult, false, true);

        // React Values - REACTOcache.json - `Select * from reacto`
        const ReactResult = await LoadReactCache();
        console.log("React Cache: " + ReactResult, false, true);

        // Fish Values - FISHcache.json - `Select * from fishdb`
        const FishResult = await LoadFishCache();
        console.log("Fish Cache: " + FishResult, false, true);

        // Frog Values - FROGcache.json - `Select * from frog`
        const FrogResult = await LoadFrogCache();
        console.log("Frog Cache: " + FrogResult, false, true);
        // Frog Control Options - FROGcontrol.json - `Select * from frogcontrol`
        const FrogControlResult = await LoadFrogControlCache();
        console.log("Frog Control Cache: " + FrogControlResult, false, true);

        // DOWItems Cache - DOWItems.json - `Select * from dow` -> `Select * from dowitems`
        const DOWItemsResult = await LoadDOWItemsCache();
        console.log("DOWItems Cache: " + DOWItemsResult, false, true);

        // Channel Name Cache - channelCache.json - `Select * from channelval`
        const ChannelNamesResult = await LoadChannelNamesCache();
        console.log("Channel Names Cache: " + ChannelNamesResult, false, true);

        // User Name Cache - userCache.json - `Select * from userval`
        const UserValuesResult = await LoadUserValuesCache();
        console.log("User Values Cache: " + UserValuesResult, false, true);
        
        // Please Values - Pleasedcache.json - `SELECT PersonName, UserID, DefaultNormalChance, DefaultH1Chance, DefaultH2Chance, DefaultH3CHance, DefaultRNGFontChance, DefaultFlagChance FROM pleased
                                            // Left Join userval on pleased.UserID = userval.DiscordID;`
        const PleasedResult = await LoadPleasedCache();
        console.log("Pleased Cache: " + PleasedResult, false, true);
        // Please Overide Options - PleasedOVERIDEcache.json - `SELECT PersonName, OverideUserIDs, UserID, DefaultNormalChance, DefaultH1Chance, DefaultH2Chance, DefaultH3CHance, DefaultRNGFontChance, DefaultFlagChance FROM pleasedOverides
                                                            //  Left Join userval on pleasedOverides.UserID = userval.DiscordID;`
        const PleasedOverideResult = await LoadPleasedOverideCache();
        console.log("Pleased Overide Cache: " + PleasedOverideResult, false, true);    
        
        // Baba Wednesday Database
        const BabaWednesdayResult = await LoadHolidaysCache();
        console.log("Baba Wednesday Cache: " + BabaWednesdayResult, false, true);

        // Haiku Database
        const HaikuResult = await LoadHaikusCache();
        console.log("Haiku Cache: " + HaikuResult, false, true);

        // Opts Cache - optscache.json - `Select * from opting`
        const OptResult = await LoadOptCache();
        console.log("Opts Cache: " + OptResult, false, true);
    
        // Slash Friday Values -- DOWcache.json - `SELECT * FROM dowfunny left join fridaytimegates on dowfunny.UID = fridaytimegates.fUID`
            // Friday Control Options -- DOWcontrol.json - `Select * from dowcontrol`
            // Friday Sub Options -- FridayLoops.json - `Select * from fridaynestedloops`
            // Time Gates -- TimeGates.json - `Select * from timegatess`
        const FridayResult = await LoadAllSlashFridayStuff();
        console.log("Friday Cache: " + FridayResult, false, true);

        // TODO: On the first of the month, update frogholidays folder from downloading bikus.org/frogholidays.zip, and to add a flag to force download images from force cache download
    }

    var PromisedAllCache = new Promise((resolve, reject) =>
    {
        CachceAsync().then(() => 
        {
            console.log("All Cache Loaded", false, true);
            resolve("SuccCess");
        }).catch((err) => 
        {
            DMMePlease("Error Loading Cache: " + err);
            reject("AllCache");
        });
    });

    return PromisedAllCache;
}

/**
 * Downloads the emoji list from the remote `emojis.json` repository, groups skin-tone
 * variants under their base emoji via {@link groupEmojiByTones}, and saves the result
 * to `emojiJSONCache.json`.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"Emoji"` if
 *   the fetch or file write fails.
 */
function LoadEmojiCache()
{
    var PromisedEmoji = new Promise((resolve, reject) =>
    {
        var emojiurl = "https://raw.githubusercontent.com/chalda-pnuzig/emojis.json/refs/heads/master/src/list.with.modifiers.json";

        fetch(emojiurl).then(res => res.json()).then(json => {
            // save to emojiJSONCache
            var newEmojis = groupEmojiByTones(json);
            json.emojis = newEmojis;

            fs.writeFileSync(babadata.datalocation + "emojiJSONCache.json", JSON.stringify(json));
            resolve("SuccCess");
        }).catch((err) => {reject("Emoji")});
    });

    return PromisedEmoji;
}

/**
 * Loads all rows from the `reacto` table, normalises date fields (sets year to the
 * current year, substitutes epoch/max dates for nulls), expands `ReactIDs` and their
 * weighted probability lists, splits alternate and ignored phrases, and saves the
 * result to `REACTOcache.json`.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"React"` on
 *   failure.
 */
function LoadReactCache()
{
    var PromisedReact = new Promise((resolve, reject) =>
    {
        var query = `Select * from reacto`;
        var jsonLocation = babadata.datalocation + "REACTOcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                var resj = 
                {
                    "Phrase": res.phrase,
                    "ReactIDs": res.reactIDs,
                    "AlternatePhrases": res.altPhrases,
                    "IgnoredPhrases": res.ignorePhrases,
                    "IgnorePlease": res.IgnorePlease,
                    "StartDate": res.StartTime,
                    "EndDate": res.EndTime,
                    "Prompt": res.Prompt,
                }
    
                // if startdate != null set year to this year
                if (resj.StartDate != null)
                    resj.StartDate.setFullYear(getD1().getFullYear());
    
                // if enddate != null set year to this year
                if (resj.EndDate != null)
                    resj.EndDate.setFullYear(getD1().getFullYear());
    
                // if startdate == null set to earliest date
                if (resj.StartDate == null)
                    resj.StartDate = new Date(0);
    
                // if enddate == null set to latest date
                if (resj.EndDate == null)
                    resj.EndDate = new Date(8640000000000000);
    
                // split reactIDs by comma
                resj.ReactIDs = resj.ReactIDs.split(",");
                for (var j = 0; j < resj.ReactIDs.length; j++)
                {
                    // trim spaces
                    resj.ReactIDs[j] = resj.ReactIDs[j].trim();
                    var reactID = resj.ReactIDs[j].split(":");
                    resj.ReactIDs[j] = {"ID": reactID[0], "Chance": reactID[1] ? reactID[1] : 100};
                }
    
                // loop through reactIDs and add id to ReactIDList, chance number of times
                resj.ReactIDList = [];
                for (var j = 0; j < resj.ReactIDs.length; j++)
                {
                    for (var k = 0; k < resj.ReactIDs[j].Chance; k++)
                    {
                        resj.ReactIDList.push(resj.ReactIDs[j].ID);
                    }
                }
    
                // split altPhrases by comma, if not null
                if (resj.AlternatePhrases != null)
                    resj.AlternatePhrases = resj.AlternatePhrases.split(",");
                else 
                    resj.AlternatePhrases = [];
    
                // loop through alternate phrases and change from "val" to ["val"], or "a+b" to ["a", "b"]
                for (var j = 0; j < resj.AlternatePhrases.length; j++)
                {
                    // trim spaces
                    resj.AlternatePhrases[j] = resj.AlternatePhrases[j].trim();
                    resj.AlternatePhrases[j] = resj.AlternatePhrases[j].split("+");
                }
    
                // split ignoredPhrases by comma, if not null
                if (resj.IgnoredPhrases != null)
                    resj.IgnoredPhrases = resj.IgnoredPhrases.split(",");
                else
                    resj.IgnoredPhrases = [];
    
                // loop through ignored phrases and change from "val" to ["val"], or "a+b" to ["a", "b"]
    
                for (var j = 0; j < resj.IgnoredPhrases.length; j++)
                {
                    // trim spaces
                    resj.IgnoredPhrases[j] = resj.IgnoredPhrases[j].trim();
                    resj.IgnoredPhrases[j] = resj.IgnoredPhrases[j].split("+");
                }
    
                opts.push(resj);
            }
    
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("React")});
    });

    return PromisedReact;
}

/**
 * Loads all rows from the `fishdb` table and saves the formatted result to
 * `FISHcache.json`. Each entry includes the image URL, trigger words, buff
 * multiplier, fishless-proc flag, proc chance, and default occurrence count.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"Fish"` on
 *   failure.
 */
function LoadFishCache()
{
    var PromisedFish = new Promise((resolve, reject) =>
    {
        var query = `Select * from fishdb`;
        var jsonLocation = babadata.datalocation + "FISHcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                text = "https://bikus.org/Images/Fish/" + res.FishIMGURL;
                var resj = 
                {
                    "url": text,
                    "FishWords": res.FishWords,
                    "FishBuff": res.WithFishMultBuff,
                    "ProcFishless": res.ProcOnWordsNoFish,
                    "ProcChance": res.ProcChance,
                    "DefaultOccCount": res.DefaultOccCount,
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Fish")});
    });

    return PromisedFish;
}

/**
 * Loads all pending reminders from the `reminders` table (filtered by the current
 * testing mode), applies timezone offset correction to each date, and saves the result
 * to `reminders.json`.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"Reminders"`
 *   on failure.
 */
function LoadReminderCache()
{
    var PromisedReminders = new Promise((resolve, reject) =>
    {
        var testIndex = babadata.testing === undefined ? "0" : "1";

        var query = `Select * from reminders where Testing = ` + testIndex;
        var jsonLocation = babadata.datalocation + "reminders.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];

                var files = null;
                if (res.Files != null && res.Files.length > 0)
                    files = res.Files.split(",");

                
                var ctimez = new Date(res.Date);
                var offset = ctimez.getTimezoneOffset();
                ctimez.setMinutes(ctimez.getMinutes() - offset);

                var resj = 
                {
                    "Source": res.Source,
                    "Message": res.Message,
                    "Files": files,
                    "Date": ctimez,
                    "ChannelID": res.ChannelID,
                    "UserID": res.UserID,
                    "ThreadParentID": res.ThreadParentID == "null" ? null : res.ThreadParentID,
                    "EnableAtPerson": res.EnabledAtPerson,
                    "State": "Pending",
                    "ID": res.ID,
                    "UpdateDB": false
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Reminders")});
    });

    return PromisedReminders;
}

/**
 * Loads all rows from the `frog` table and saves the formatted result to
 * `FROGcache.json`. Each entry contains the frog image link, default enabled flag,
 * and override user IDs.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"Frog"` on
 *   failure.
 */
function LoadFrogCache()
{
    var PromisedFrog = new Promise((resolve, reject) =>
    {
        var query = `Select * from frog`;
        var jsonLocation = babadata.datalocation + "FROGcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				text = res.froglink;
				var resj = 
				{
					"text": text,
					"enabledDef": res.enabled,
					"IDS": res.overideIDs
				}

				opts.push(resj);
			}
            
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Frog")});
    });

    return PromisedFrog;
}

/**
 * Loads all rows from the `frogcontrol` table and saves the formatted result to
 * `FROGcontrol.json`. Each entry maps a control ID to its control level.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"FrogControl"`
 *   on failure.
 */
function LoadFrogControlCache()
{
    var PromisedFrogControl = new Promise((resolve, reject) =>
    {
        var query = `Select * from frogcontrol`;
        var jsonLocation = babadata.datalocation + "FROGcontrol.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
				var resj = 
				{
					"ID": res.IDFROGControl,
					"Control": res.controlLevel
				}

                opts.push(resj);
            }
            
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("FrogControl")});
    });

    return PromisedFrogControl;
}

/**
 * Loads the Day-of-Week (DOW) schedule by querying both the `dow` table (probability,
 * start/end times per date key) and the `dowitems` table (individual items per DOW
 * key). Merges the results and saves to `DOWItems.json`.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"DOWItems"` on
 *   failure.
 */
function LoadDOWItemsCache()
{
    var PromisedDOWItems = new Promise((resolve, reject) =>
    {
        var query = `Select * from dow`;
        var jsonLocation = babadata.datalocation + "DOWItems.json";

        callSQLQuery(query)
        .then((result) =>
        {
			var adam = {};
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				adam[res.date] = {};
				adam[res.date].Probaility = res.probablilty;
				adam[res.date].Items = [];
				adam[res.date].Start = res.starttime;
				adam[res.date].End = res.endtime;
			}

            var query = `Select * from dowitems`;
            callSQLQuery(query)
            .then((result) =>
            {
                for (var i = 0; i < result.length; i++)
                {
                    var res = result[i];
                    var itm = {};
                    itm.Name = res.name;
                    itm.Occurances = res.occ;
                    
                    adam[res.dow].Items.push(itm);
                }

                var data = JSON.stringify(adam);
                fs.writeFileSync(jsonLocation, data);
                resolve("SuccCess");
            })
            .catch((err) => {reject("DOWItems")});
        })
        .catch((err) => {reject("DOWItems")});
    });

    return PromisedDOWItems;
}

/**
 * Loads all rows from the `channelval` table into `global.channelCache` (keyed by
 * `ChannelID → ChannelName`). Does **not** write a file; the cache lives in memory
 * only.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"ChannelNames"`
 *   on failure.
 */
function LoadChannelNamesCache()
{
    var PromisedChannelNames = new Promise((resolve, reject) =>
    {
        var query = `Select * from channelval`;
        global.channelCache = {};
    
        callSQLQuery(query)
        .then((result) =>
        {
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                global.channelCache[res.ChannelID] = res.ChannelName;
            }
            resolve("SuccCess");
        })
        .catch((err) => {reject("ChannelNames")});
    });

    return PromisedChannelNames;
}

/**
 * Loads all rows from the `userval` table (left-joined with `alteventnames`) into
 * `global.userCache` (keyed by `DiscordID`). Each entry stores the primary
 * `PersonName` and an `AltNames` array populated from the join. Does **not** write a
 * file; the cache lives in memory only.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"UserValues"`
 *   on failure.
 */
function LoadUserValuesCache()
{
    var PromisedUserValues = new Promise((resolve, reject) =>
    {
        var query = `SELECT * FROM userval Left join alteventnames on BirthdayEventID = EventID`;
        global.userCache = {};
    
        callSQLQuery(query)
        .then((result) =>
        {
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                if (global.userCache[res.DiscordID] != null)
                {
                    global.userCache[res.DiscordID].AltNames.push(res.EventName);
                }
                else
                {
                    var resj =
                    {
                        "PersonName": res.PersonName,
                        "AltNames": [ res.EventName ]
                    }
                    global.userCache[res.DiscordID] = resj;
                }
            }
            resolve("SuccCess");
        })
        .catch((err) => {reject("UserValues")});
    });

    return PromisedUserValues;
}

/**
 * Loads per-user "pleased" probability settings from the `pleased` table (left-joined
 * with `userval`) and saves the result to `Pleasedcache.json`. Each entry contains
 * the user's name, Discord ID, and default chance values for normal, heading, font,
 * and flag formatting.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"Pleased"` on
 *   failure.
 */
function LoadPleasedCache()
{
    var PromisedPleased = new Promise((resolve, reject) =>
    {
        var query = `SELECT PersonName, UserID, DefaultNormalChance, DefaultH1Chance, DefaultH2Chance, DefaultH3CHance, DefaultRNGFontChance, DefaultFlagChance FROM pleased
	                 Left Join userval on pleased.UserID = userval.DiscordID;`;
        var jsonLocation = babadata.datalocation + "Pleasedcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                var resj = 
                {
                    "PersonName": res.PersonName,
                    "UserID": res.UserID,
                    "DefaultNormalChance": res.DefaultNormalChance,
                    "DefaultH1Chance": res.DefaultH1Chance,
                    "DefaultH2Chance": res.DefaultH2Chance,
                    "DefaultH3CHance": res.DefaultH3CHance,
                    "DefaultRNGFontChance": res.DefaultRNGFontChance,
                    "DefaultFlagChance": res.DefaultFlagChance,
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Pleased")});
    });

    return PromisedPleased;
}

/**
 * Loads per-user "pleased override" probability settings from the `pleasedOverides`
 * table (left-joined with `userval`) and saves the result to
 * `PleasedOVERIDEcache.json`. The output is a map keyed by `PersonName`, where each
 * value contains the user ID, override user IDs, and all default chance settings.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with
 *   `"PleasedOveride"` on failure.
 */
function LoadPleasedOverideCache()
{
    var PromisedPleasedOveride = new Promise((resolve, reject) =>
    {
        var query = `SELECT PersonName, OverideUserIDs, UserID, DefaultNormalChance, DefaultH1Chance, DefaultH2Chance, DefaultH3CHance, DefaultRNGFontChance, DefaultFlagChance FROM pleasedOverides
                     Left Join userval on pleasedOverides.UserID = userval.DiscordID;`;
        var jsonLocation = babadata.datalocation + "PleasedOVERIDEcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
			var opts = {};
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				var resj = 
				{
					"UID": res.UserID,
					"OverideUIDs": res.OverideUserIDs,
					"DefaultNormalChance": res.DefaultNormalChance,
					"DefaultH1Chance": res.DefaultH1Chance,
					"DefaultH2Chance": res.DefaultH2Chance,
					"DefaultH3Chance": res.DefaultH3CHance,
					"DefaultRNGFontChance": res.DefaultRNGFontChance,
					"DefaultFlagChance": res.DefaultFlagChance
				}

				opts[res.PersonName] = resj;
			}

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("PleasedOveride")});
    });

    return PromisedPleasedOveride;
}

/**
 * Loads all rows from the `opting` table and saves the formatted result to
 * `optscache.json`. Each entry maps a `DiscordID` and feature `Item` to its `Opt`
 * value (`"in"` or `"out"`).
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"Opts"` on
 *   failure.
 */
function LoadOptCache()
{
    var PromisedOpt = new Promise((resolve, reject) =>
    {
        var query = `Select * from opting`;
        var jsonLocation = babadata.datalocation + "optscache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
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
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Opts")});
    });

    return PromisedOpt;
}

/**
 * Orchestrates loading all Slash Friday–related caches in order: time gates
 * ({@link LoadTimeGatesCache}), DOW cache ({@link LoadFridayCache}), DOW control
 * ({@link LoadFridayControlCache}), and Friday loops ({@link LoadFridayLoopsCache}).
 *
 * After loading, compares the newly fetched data against the previously cached files.
 * If any changes are detected, archives the old cache files to a versioned
 * `FridayCache/` directory and appends a new time-gate version entry to both the
 * local JSON file and the `timegates` database table.
 *
 * @returns {Promise<"SuccCess, Changes Detected"|"SuccCess, No Changes Detected">}
 *   Resolves with a status string, or rejects with the underlying error on failure.
 */
function LoadAllSlashFridayStuff()
{
    var PromisedFriday = new Promise((resolve, reject) =>
    {
        // load in dowcache and fridayloops from json files
        let rawdata = fs.readFileSync(babadata.datalocation + "DOWcache.json");
        var tempdowcache = JSON.parse(rawdata);
        var newdowcache = null;
    
        let rawloops = fs.readFileSync(babadata.datalocation + "FridayLoops.json");
        var tempfridayloops = JSON.parse(rawloops);
        var newfridayloops = null;
    
        let rawcontrol = fs.readFileSync(babadata.datalocation + "DOWcontrol.json");
        var tempdowcontrol = JSON.parse(rawcontrol);
        var newdowcontrol = null;

        const FridayAsync = async function() 
        {    
            // Time Gates -- TimeGates.json - `Select * from timegatess`
            const TimeGatesResult = await LoadTimeGatesCache();
            console.log("Time Gates Cache: " + TimeGatesResult, false, true);
    
            // Slash Friday Values -- DOWcache.json - `SELECT * FROM dowfunny left join fridaytimegates on dowfunny.UID = fridaytimegates.fUID`
            newdowcache = await LoadFridayCache();
            console.log("Friday Cache: SuccCess", false, true);
            // Friday Control Options -- DOWcontrol.json - `Select * from dowcontrol`
            newdowcontrol = await LoadFridayControlCache();
            console.log("Friday Control Cache: SuccCess", false, true);
            // Friday Sub Options -- FridayLoops.json - `Select * from fridaynestedloops`
            newfridayloops = await LoadFridayLoopsCache();
            console.log("Friday Loops Cache: SuccCess", false, true);
        }

        FridayAsync().then(() => 
        {
            // we do the saving stuff here
            var changes = false;
            if (newdowcache.length != tempdowcache.length)
                changes = true;
            else
            {
                for (var i = 0; i < newdowcache.length; i++)
                {
                    if (newdowcache[i].text != tempdowcache[i].text)
                    {
                        changes = true;
                        break;
                    }
                }
            }

            if (!changes)
            {
                // compare newfridayloops to tempfridayloops
                if (Object.keys(newfridayloops).length != Object.keys(tempfridayloops).length)
                    changes = true;
                else
                {
                    for (var x in newfridayloops)
                    {
                        if (tempfridayloops[x] == null)
                        {
                            changes = true;
                            break;
                        }
                        if (newfridayloops[x].length != tempfridayloops[x].length)
                        {
                            changes = true;
                            break;
                        }
                        for (var i = 0; i < newfridayloops[x].length; i++)
                        {
                            if (newfridayloops[x][i].text != tempfridayloops[x][i].text)
                            {
                                changes = true;
                                break;
                            }
                        }
                        if (changes)
                            break;
                    }
                }
            }

            if (!changes)
            {
                // compare newdowcontrol to tempdowcontrol
                if (newdowcontrol.length != tempdowcontrol.length)
                    changes = true;
                else
                {
                    for (var i = 0; i < newdowcontrol.length; i++)
                    {
                        if (newdowcontrol[i].Control != tempdowcontrol[i].Control)
                        {
                            changes = true;
                            break;
                        }
                    }
                }
            }

            if (changes)
            {
                console.log("Changes Detected, Saving Cache", false, true);
                // if babadata.datalocation + "FridayCache" doesn't exist, create it
                if (!fs.existsSync(babadata.datalocation + "FridayCache"))
                {
                    fs.mkdirSync(babadata.datalocation + "FridayCache");
                }

                // save tempfridayloops to babadata.datalocation + "FridayCache/FridayLoops" + fcacheitems + ".json";
                var fcacheitems = 0;
                // set to number of files in directory / 3
                fs.readdir(babadata.datalocation + "FridayCache", (err, files) => {
                    fcacheitems = files.length / 3;
                    var data = JSON.stringify(tempfridayloops);
                    fs.writeFileSync(babadata.datalocation + "FridayCache/FridayLoops" + fcacheitems + ".json", data);
                });

                // save tempdowcache to babadata.datalocation + "FridayCache/DOWcache" + dcacheitems + ".json";
                var dcacheitems = 0;
                // set to number of files in directory / 3
                fs.readdir(babadata.datalocation + "FridayCache", (err, files) => {
                    dcacheitems = files.length / 3;
                    var data = JSON.stringify(tempdowcache);
                    fs.writeFileSync(babadata.datalocation + "FridayCache/DOWcache" + dcacheitems + ".json", data);
                });

                // save tempdowcontrol to babadata.datalocation + "FridayCache/DOWcontrol" + dcontrolitems + ".json";
                var dcontrolitems = 0;
                // set to number of files in directory / 3
                fs.readdir(babadata.datalocation + "FridayCache", (err, files) => {
                    dcontrolitems = files.length / 3;
                    var data = JSON.stringify(tempdowcontrol);
                    fs.writeFileSync(babadata.datalocation + "FridayCache/DOWcontrol" + dcontrolitems + ".json", data);
                });


                // update TimeGates.json by adding another row (items + 1)
                let rawdata = fs.readFileSync(babadata.datalocation + "TimeGates.json");
                var tempTimeGates = JSON.parse(rawdata);
                // get length of tempTimeGates
                var items = tempTimeGates.length;

                var ctimez = getD1(true);
                var offset = ctimez.getTimezoneOffset();
                ctimez.setMinutes(ctimez.getMinutes() - offset);

                // add new row to tempTimeGates
                var newboy = {
                    "VersionNumber": items,
                    "DateTime": ctimez
                }
                tempTimeGates.push(newboy);

                // save tempTimeGates to TimeGates.json
                var data = JSON.stringify(tempTimeGates);
                fs.writeFileSync(babadata.datalocation + "TimeGates.json", data);

                if (babadata.testing === undefined)
                {
                    // update db with newboy
                    con.query(`INSERT INTO timegates (VersionNumber, DateTime) VALUES ("${items}", "${newboy.DateTime.toISOString().slice(0, 19).replace('T', ' ')}")`, 
                    function (err, result)
                    {
                        if (err)
                        {
                            if (validErrorCodes(err.code))
                            {
                                EnterDisabledMode(err);
                                return;
                            }
                            else
                                dbErrored(err)
                        }
                    });
                }
                resolve("SuccCess, Changes Detected");
            }
            else
            {
                resolve("SuccCess, No Changes Detected");
            }
        })
        .catch((err) => {reject(err)});
    });

    return PromisedFriday;
}

/**
 * Loads all rows from the `timegates` table, applies timezone offset correction to
 * each `DateTime` value, and saves the result to `TimeGates.json`.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"TimeGates"`
 *   on failure.
 */
function LoadTimeGatesCache()
{
    var PromisedTimeGates = new Promise((resolve, reject) =>
    {
        var query = `Select * from timegates`;
        var jsonLocation = babadata.datalocation + "TimeGates.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];

			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];

				var ctimez = new Date(res.DateTime);
				var offset = ctimez.getTimezoneOffset();
				ctimez.setMinutes(ctimez.getMinutes() - offset);

				var resj = 
				{
					"VersionNumber": res.VersionNumber,
					"DateTime": ctimez,
				}

				opts.push(resj);
			}
            
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("TimeGates")});
    });

    return PromisedTimeGates;
}

/**
 * Loads all rows from the `dowfunny` table (left-joined with `fridaytimegates`)
 * and saves the formatted result to `DOWcache.json`. Each entry includes the UID,
 * combined text, enabled flag, override IDs, heading levels, occurrence chance, and
 * time-gate start/end/day-of-week fields.
 *
 * @returns {Promise<Object[]>} Resolves with the array of formatted DOW cache objects
 *   (also written to disk), or rejects with `"DOWCache"` on failure.
 */
function LoadFridayCache()
{
    var PromisedFriday = new Promise((resolve, reject) =>
    {
        var query = `SELECT * FROM dowfunny left join fridaytimegates on dowfunny.UID = fridaytimegates.fUID`;
        var jsonLocation = babadata.datalocation + "DOWcache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				text = res.text;
				if (res.text2 != null)
				{
					text += " " + res.text2;
				}

				var resj = 
				{
					"UID": res.UID,
					"text": text,
					"enabledDef": res.enabled,
					"IDS": res.overideIDs,
					"h1": res.h1,
					"h2": res.h2,
					"h3": res.h3,
					"Occurance": 100,

					"StartTime": res.StartTime,
					"EndTime": res.EndTime,
					"DayOfWeek": res.DayOfWeek,
					"OccuranceChance": res.OccuranceChance == null ? 100 : res.OccuranceChance,
				}

				opts.push(resj);
			}

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve(opts);
        })
        .catch((err) => {reject("DOWCache")});
    });

    return PromisedFriday;
}

/**
 * Loads all rows from the `dowcontrol` table and saves the formatted result to
 * `DOWcontrol.json`. Each entry maps a control ID to its control level.
 *
 * @returns {Promise<Object[]>} Resolves with the array of formatted control objects
 *   (also written to disk), or rejects with `"DOWControl"` on failure.
 */
function LoadFridayControlCache()
{
    var PromisedFridayControl = new Promise((resolve, reject) =>
    {
        var query = `Select * from dowcontrol`;
        var jsonLocation = babadata.datalocation + "DOWcontrol.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];

				var resj = 
				{
					"ID": res.IDDOWControl,
					"Control": res.controlLevel
				}

				opts.push(resj);
			}
            
            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve(opts);
        })
        .catch((err) => {reject("DOWControl")});
    });

    return PromisedFridayControl;
}

/**
 * Loads all rows from the `fridaynestedloops` table, builds a weighted replacement
 * map grouped by the `group` field (normalising weights relative to the group
 * minimum), and saves the result to `FridayLoops.json`.
 *
 * @returns {Promise<Object>} Resolves with the weighted replacement map object
 *   (also written to disk), or rejects with `"FridayLoops"` on failure.
 */
function LoadFridayLoopsCache()
{
    var PromisedFridayLoops = new Promise((resolve, reject) =>
    {
        var query = `Select * from fridaynestedloops`;
        var jsonLocation = babadata.datalocation + "FridayLoops.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
			for (var i = 0; i < result.length; i++)
			{
				var res = result[i];
				text = res.text;
				var resj = 
				{
					"UID": res.UID,
					"text": text,
					"group": res.group,
					"weight": res.weight,
				}

				opts.push(resj);
			}

			// var data = JSON.stringify(opts);

			// fs.writeFileSync(babadata.datalocation + "FridayLoops.json", data);
			// let rawloops = fs.readFileSync(babadata.datalocation + "FridayLoops.json");

			var fridLoops = opts
		
			var replacements = {};
			var replacementsWeights = {};
			for (var i = 0; i < fridLoops.length; i++)
			{
				if (replacements[fridLoops[i].group] == null)
				{
					replacements[fridLoops[i].group] = [];
					replacementsWeights[fridLoops[i].group] = {"min": 1}
				}
		
				if (fridLoops[i].weight < replacementsWeights[fridLoops[i].group].min)
					replacementsWeights[fridLoops[i].group].min = fridLoops[i].weight;
		
			}
			
			for (var i = 0; i < fridLoops.length; i++)
			{
				gWeight = replacementsWeights[fridLoops[i].group].min;
				insertCount = gWeight == 1 ? fridLoops[i].weight : Math.floor((1 / gWeight) * fridLoops[i].weight);
		
				for (var j = 0; j < insertCount; j++)
					replacements[fridLoops[i].group].push({"text": fridLoops[i].text, "UID": fridLoops[i].UID});
			}

			//save to a json file -- testing dont delete shane like you love to delete these things, i saw what you did that one time
			var data = JSON.stringify(replacements);

            fs.writeFileSync(jsonLocation, data);
            resolve(replacements);
        })
        .catch((err) => {reject("FridayLoops")});
    });

    return PromisedFridayLoops;
}

/**
 * Loads all holiday / frog-holiday events from the `event` table (left-joined with
 * `alteventnames`) and saves the formatted result to `HolidayFrogs.json`. Each entry
 * includes real and frog event names, scheduling mode, day/month/DOW/week fields, and
 * parent/event IDs.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"Holidays"` on
 *   failure.
 */
function LoadHolidaysCache()
{
    var PromisedHolidays = new Promise((resolve, reject) =>
    {
        var query = `SELECT * FROM event left join alteventnames on event.EventID = alteventnames.EventID`;
        var jsonLocation = babadata.datalocation + "HolidayFrogs.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                var resj = 
                {
                    "EventRealName": res.EventRealName,
                    "EventFrogName": res.EventFrogName,
                    "Mode": res.Mode,
                    "Day": res.Day,
                    "Month": res.Month,
                    "DOW": res.DOW,
                    "Week": res.Week,
                    "EventName": res.EventName,
                    "ParentEventID": res.ParentEventID,
                    "EventID": res.EventID,
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Holidays")});
    });

    return PromisedHolidays;
}

/**
 * Loads all rows from the `haiku` table (left-joined with `userval` and `channelval`)
 * and saves the formatted result to `HaikusCache.json`. Each entry contains the
 * person name, Discord ID and username, raw and formatted haiku text, accidental flag,
 * date, message URL, and channel ID/name.
 *
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with `"Haikus"` on
 *   failure.
 */
function LoadHaikusCache()
{
    var PromisedHaikus = new Promise((resolve, reject) =>
    {
        var query = `SELECT * FROM haiku
                     Left Join userval on haiku.PersonName = userval.PersonName 
                     Left Join channelval on haiku.ChannelID = channelval.ChannelID`;
        var jsonLocation = babadata.datalocation + "HaikusCache.json";

        callSQLQuery(query)
        .then((result) =>
        {
            var opts = [];
            for (var i = 0; i < result.length; i++)
            {
                var res = result[i];
                var resj = 
                {
                    "PersonName": res.PersonName,

                    "DiscordID": res.DiscordID,
                    "DiscordName": res.DiscordName,

                    "Haiku": res.Haiku,
                    "HaikuFormatted": res.HaikuFormatted,

                    "Accidental": res.Accidental,

                    "Date": res.Date,
                    "URL": res.URL,

                    "ChannelID": res.ChannelID,
                    "ChannelName": res.ChannelName,
                }

                opts.push(resj);
            }

            var data = JSON.stringify(opts);
            fs.writeFileSync(jsonLocation, data);
            resolve("SuccCess");
        })
        .catch((err) => {reject("Haikus")});
    });

    return PromisedHaikus;
}

/**
 * Upserts a control-level value for a DOW or FROG entity in its respective control
 * table (`dowcontrol` or `frogcontrol`). After the database write, refreshes the
 * relevant in-memory cache.
 *
 * @param {string} id - The ID of the entity to update (e.g. a DOW item ID).
 * @param {string|number} level - The new control level to set.
 * @param {"DOW"|"FROG"} prefix - Determines which control table is targeted and which
 *   cache is refreshed afterwards.
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with a descriptive
 *   error string on failure.
 */
function controlDOW(id, level, prefix)
{
	var lcx = prefix.toLowerCase();
    var PromisedControlDOW = new Promise((resolve, reject) =>
    {
        var query = `Select * from ${lcx}control where ID${prefix}Control = "${id}"`;
        callSQLQuery(query)
        .then((result) =>
        {
            if (result.length == 0)
                query = `INSERT INTO ${lcx}control (ID${prefix}Control, controlLevel) VALUES ("${id}", "${level}")`;
            else
                query = `UPDATE ${lcx}control Set controlLevel = "${level}" WHERE ID${prefix}Control = "${id}"`;

            callSQLQuery(query)
            .then((result) =>
            {
                if (prefix == "DOW")
                {
                    LoadAllSlashFridayStuff();
                }
                else if (prefix == "FROG")
                {
                    LoadFrogCache();
                }
                resolve("SuccCess");
            }) 
            .catch((err) => {reject(lcx + "Control")});
        })
        .catch((err) => {reject(lcx + "Control")});
    });

    return PromisedControlDOW;
}

// Emoji Functions  --------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Finds an emoji entry in a list by its `name` property.
 *
 * @param {Object[]} emojiList - Array of emoji objects (each must have a `name` field).
 * @param {string} emojiName - The emoji name to search for.
 * @returns {Object|null} The matching emoji object, or `null` if not found.
 */
function getGroupedEmoji(emojiList, emojiName)
{
    for (var i = 0; i < emojiList.length; i++)
    {
        var emoji = emojiList[i];
        if (emoji.name == emojiName)
        {
            return emoji;
        }
    }

    return null;
}

/**
 * Processes a raw emoji list and groups skin-tone variant emojis under their base
 * emoji. Each base emoji object gains an `emojis` array containing the base glyph
 * and all skin-tone variants. Entries whose stripped base name cannot be matched to an
 * existing emoji are added as new top-level entries.
 *
 * @param {{emojis: Object[]}} emojiList - The raw emoji data object (must have an
 *   `emojis` array property).
 * @returns {Object[]} The processed list with skin-tone variants grouped under their
 *   base emoji.
 */
function groupEmojiByTones(emojiList)
{
    var list = emojiList.emojis;
    var grouped = [];
    for (var i = 0; i < list.length; i++)
    {
        var emoji = list[i];
        var eName = emoji.name;
        emoji.emojis = [];
        emoji.emojis.push(emoji.emoji);

		if (eName.includes("skin tone"))
        {
            var enameSplit = "";
            // split the name by "light", "medium", "dark", "mediumdark", "mediumlight"
            enameSplit = eName.replace("medium-dark skin tone", "")
            .replace("medium-light skin tone", "")
            .replace("light skin tone", "")
            .replace("medium skin tone", "")
            .replace("dark skin tone", "")
            .replace(" , ", " ");

            // remove trailing : or ,
            enameSplit = enameSplit.replace(/[:,\s]+$/, "");

            // trim
            enameSplit = enameSplit.trim();

            var parent = getGroupedEmoji(list, enameSplit);
            if (parent != null)
                parent.emojis.push(emoji.emoji);
            else
            {
                if (enameSplit != "")
                {
                    console.log("Parent not found: " + enameSplit);
                    emoji.name = enameSplit;
                    grouped.push(emoji);
                }
            }
        }
        else
        {
            var parent = getGroupedEmoji(grouped, eName); // check if already in list
            if (parent != null)
                parent.emojis.push(emoji.emoji);
            else
                grouped.push(emoji);
        }
    }

    return grouped;
}

// Hurricane Functions  ----------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Iterates over the in-memory hurricane cache (`hurricanes.json`) and writes any
 * entries marked `Updated = true` to the `hurricane` database table via an
 * `INSERT … ON DUPLICATE KEY UPDATE` query, then resets their `Updated` flag.
 *
 * @async
 * @returns {Promise<void>} Resolves when all pending updates have been persisted.
 */
async function saveUpdatedHurrInfo()
{
	return new Promise((resolve, reject) => 
	{
		if(!fs.existsSync(babadata.datalocation + '/hurricanes.json')) 
		{
			fs.writeFileSync(babadata.datalocation + '/hurricanes.json', JSON.stringify([]));
		}
	
		var data = fs.readFileSync(babadata.datalocation + "hurricanes.json");
		var hurrInfo = JSON.parse(data);
	
		for (var i = 0; i < hurrInfo.length; i++)
		{
			if (hurrInfo[i].Updated)
			{
				// update all the info
				var id = hurrInfo[i].ID;
				var name = hurrInfo[i].Name;
				var number = hurrInfo[i].Number;
				var type = hurrInfo[i].Type;
				var category = hurrInfo[i].Category;
				var imgURL = hurrInfo[i].ImageURL;
				var xmlURL = hurrInfo[i].XMLURL;
				var year = hurrInfo[i].Year;
				var lastUpdated = hurrInfo[i].LastUpdated;
	
				// insert into database, if it already exists, update it
				con.query(`Insert into hurricane (id, name, number, type, category, imageURL, XMLUrl, Year, lastupdated) VALUES ("${id}", "${name}", "${number}", "${type}", "${category}", "${imgURL}", "${xmlURL}", "${year}", "${lastUpdated}") ON DUPLICATE KEY UPDATE name = "${name}", type = "${type}", category = "${category}", lastupdated = "${lastUpdated}"`,
				function (err, result)
				{
					if (err)
					{
						if (validErrorCodes(err.code))
						{
							EnterDisabledMode(err);
							return;
						}
						else
							dbErrored(err)
					}
				});
	
				hurrInfo[i].Updated = false;
			}
		}

		resolve();
	});
}

/**
 * Flushes any pending hurricane updates via {@link saveUpdatedHurrInfo}, then queries
 * the `hurricane` table for all storms in the current year, applies timezone offset
 * correction to `LastUpdated`, and saves the result to `hurricanes.json`.
 *
 * @async
 * @returns {Promise<void>} Resolves once the cache file has been written.
 */
async function getHurricaneInfo()
{
	return new Promise((resolve, reject) =>
	{
		// wait for saveUpdatedHurrInfo to finish
		saveUpdatedHurrInfo().then(() =>
		{
			con.query(`Select * from hurricane`,
			function (err, result)
				{
					var opts = [];
					if (err)
					{
						if (validErrorCodes(err.code))
						{
							EnterDisabledMode(err);
							return;
						}
						else
							dbErrored(err)
					}
		
					for (var i = 0; i < result.length; i++)
					{
						var res = result[i];
		
						if (res.Year != getD1().getFullYear())
							continue;
						
						// convert lastupdated to current timezone
						var ctimez = new Date(res.LastUpdated);
						var offset = ctimez.getTimezoneOffset();
						ctimez.setMinutes(ctimez.getMinutes() - offset);

						var resj = 
						{
							"ID": res.id,
							"LastUpdated": ctimez,
							"Name": res.name,
							"Number": res.number,
							"Type": res.type,
							"Category": res.category,
							"ImageURL": res.imageURL,
							"XMLURL": res.XMLUrl,
							"Year": res.Year,
							"Updated": false,
							"OverideText": null
						}

		
						opts.push(resj);
					}
		
					var data = JSON.stringify(opts);
		
					fs.writeFileSync(babadata.datalocation + "hurricanes.json", data);
				
					resolve();
				}
			);
		});
	});
}

// Reminder Functions  -----------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Inserts a new reminder record into the `reminders` database table.
 *
 * @param {{
 *   Source: string,
 *   Message: string,
 *   UserID: string,
 *   Files: string[]|null,
 *   Date: Date|string,
 *   ChannelID: string,
 *   ThreadParentID: string|null,
 *   EnableAtPerson: boolean,
 *   ID: string
 * }} reminderItem - The reminder object to persist.
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with
 *   `"Reminder Add"` on failure.
 */
function AddReminderToDB(reminderItem)
{
    var fileString = "";
    if (reminderItem.Files != null)
    {
        for (var i = 0; i < reminderItem.Files.length; i++)
        {
            fileString += reminderItem.Files[i] + ",";
        }
    }

    var dtsrart = new Date(reminderItem.Date).toISOString().slice(0, 19).replace('T', ' ');

    return new Promise((resolve, reject) =>
    {
        var testIndex = babadata.testing === undefined ? false : true;
        var threadParentID = reminderItem.ThreadParentID == "null" ? null : reminderItem.ThreadParentID;

        var query = `Insert into reminders (Source, Message, UserID, Files, Date, ChannelID, ThreadParentID, EnabledAtPerson, ID, Testing) VALUES ("${reminderItem.Source}", "${reminderItem.Message}", "${reminderItem.UserID}", "${fileString}", "${dtsrart}", "${reminderItem.ChannelID}", "${threadParentID}", ${reminderItem.EnableAtPerson}, "${reminderItem.ID}", ${testIndex})`;
        callSQLQuery(query)
        .then(() => 
        {
            resolve("SuccCess");
        })
        .catch((err) => {reject("Reminder Add")});
    });
}

/**
 * Updates an existing reminder record in the `reminders` database table, matched by
 * `ID`.
 *
 * @param {{
 *   Source: string,
 *   Message: string,
 *   Files: string[]|null,
 *   Date: Date|string,
 *   ChannelID: string,
 *   ThreadParentID: string|null,
 *   EnableAtPerson: boolean,
 *   ID: string
 * }} reminderItem - The reminder object containing updated values and the target `ID`.
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with
 *   `"Reminder Edit"` on failure.
 */
function EditReminderInDB(reminderItem)
{
    var fileString = "";
    if (reminderItem.Files != null)
    {
        for (var i = 0; i < reminderItem.Files.length; i++)
        {
            fileString += reminderItem.Files[i] + ",";
        }
    }

    var dtsrart = new Date(reminderItem.Date).toISOString().slice(0, 19).replace('T', ' ');

    return new Promise((resolve, reject) =>
    {
        var threadParentID = reminderItem.ThreadParentID == "null" ? null : reminderItem.ThreadParentID;

        var query = `Update reminders Set Source = "${reminderItem.Source}", Message = "${reminderItem.Message}", Files = "${fileString}", Date = "${dtsrart}", ChannelID = "${reminderItem.ChannelID}", ThreadParentID = "${threadParentID}", EnabledAtPerson = ${reminderItem.EnableAtPerson} WHERE ID = "${reminderItem.ID}"`;
        callSQLQuery(query)
        .then(() => 
        {
            resolve("SuccCess");
        })
        .catch((err) => {reject("Reminder Edit")});
    });
}

/**
 * Deletes a reminder record from the `reminders` database table by its `ID`.
 *
 * @param {{ ID: string }} reminderItem - An object containing the `ID` of the reminder
 *   to delete.
 * @returns {Promise<"SuccCess">} Resolves on success, or rejects with
 *   `"Reminder Delete"` on failure.
 */
function DeleteReminderInDB(reminderItem)
{
    return new Promise((resolve, reject) =>
    {
        var query = `Delete from reminders WHERE ID = "${reminderItem.ID}"`;
        callSQLQuery(query)
        .then(() => 
        {
            resolve("SuccCess");
        })
        .catch((err) => {reject("Reminder Delete")});
    });
}

// Cleanup Functions  ------------------------------------------------------------------------------------------------------------------------------------------------

var cleanupFn = function cleanup() 
{
	if ((global.dbAccess[1] && global.dbAccess[0]))
	{
        try 
        {
            con.end();
            console.log("Ending SQL Connection");
            con = null;
        }
        catch (err)
        {
            con = null;
        }
	}

	if (timeoutClear != null)
	{
		console.log("Clearing Timeout - VCC Updater");
		clearTimeout(timeoutClear);
	}
	if (timeoutDisconnect != null)
	{
		console.log("Clearing Timeout - DB Auto Disconnect");
		clearTimeout(timeoutDisconnect);
	}
	if (timeoutFix != null)
	{
		console.log("Clearing Timeout - DB Down Checker");
		clearTimeout(timeoutFix);
	}
}

process.on('SIGINT', cleanupFn);
process.on('SIGTERM', cleanupFn);

global.DBVoiceCleanup = cleanupFn;

module.exports = {
    LoadAllTheCache,
    controlDOW,
    SaveSlashFridayJson,
    EventDB,
    voiceChannelChange,

    NameFromUserIDID,
    PickThePerfectUsername,
    
    clearVCCList,
    optOut,
    optIn,

    getHurricaneInfo,
    saveUpdatedHurrInfo,

    DMMePlease,

    LoadReminderCache,
    AddReminderToDB,
    EditReminderInDB,
    DeleteReminderInDB
}