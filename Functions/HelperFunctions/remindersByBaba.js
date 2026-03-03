/**
 * @file remindersByBaba.js
 * @description Reminder system for the Baba Discord bot.
 *
 * Manages the full lifecycle of user reminders:
 *   - Persists reminders to and reads from `reminders.json` on disk.
 *   - Synchronises the local cache with the remote database via
 *     `databaseVoiceController` (add / edit / delete operations).
 *   - Evaluates reminder states (`Added`, `Edited`, `Pending`, `Running`,
 *     `RunningNow`, `Deleted`) and schedules `setTimeout`-based deliveries.
 *   - Delivers reminders to the originating Discord channel or thread,
 *     including any attached files that were saved locally at creation time.
 *   - Exposes slash-command helpers for add / edit / delete / view operations,
 *     including paginated embed UI with button and modal interactions.
 *   - Provides `DailyReminderCall` for a scheduled nightly state refresh and
 *     `StartTheReminders` to initialise the system on bot startup.
 *
 * Exported as `reverseDelay` (add), plus `DailyReminderCall`, `StartTheReminders`,
 * `viewReminders`, `getUserReminder`, `getUserReminderAndIDFromID`,
 * `getUserIDFromID`, `handleButtonsEmbedReminders`, `getReminder`,
 * `removeReminder`, and `editReminder`.
 *
 * @module remindersByBaba
 */
var babadata = require('../../babotdata.json'); //baba configuration file

var fs = require('fs');

const Discord = require('discord.js'); //discord module for interation with discord api
const { ComponentType } = require('discord.js');
const { ModalBuilder, ActionRowBuilder, TextInputBuilder } = require('discord.js');

const { getD1 } = require("../../Tools/overrides");
const { antiDelay } = require("./basicHelpers");
const { DeleteReminderInDB, EditReminderInDB, AddReminderToDB, LoadReminderCache, DMMePlease } = require("../Database/databaseVoiceController");

var to = {};
var toList = [];

global.ReminderMessageExists = {};

/**
 * Reads the reminders list from `reminders.json` on disk.
 *
 * If the file does not yet exist it is created with an empty array so that
 * subsequent reads always succeed.
 *
 * @returns {Array<Object>} Parsed array of reminder objects stored on disk.
 */
function getReminderJSON()
{
    
    if (!fs.existsSync(babadata.datalocation + "reminders.json"))
        fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify([]));

    var data = fs.readFileSync(babadata.datalocation + "reminders.json");
    return JSON.parse(data);
}

/**
 * Returns all reminders that belong to a specific Discord user.
 *
 * @param {string} userID - The Discord user ID to filter reminders by.
 * @returns {Array<Object>} Array of reminder objects whose `UserID` matches
 *   `userID`.  Returns an empty array when the user has no reminders.
 */
function viewReminders(userID)
{
    var reminderList = getReminderJSON();
    var userReminders = [];
    for (var i = 0; i < reminderList.length; i++)
    {
        if (reminderList[i].UserID == userID)
            userReminders.push(reminderList[i]);
    }

    return userReminders;
}

/**
 * Re-evaluates every reminder's state and schedules (or fires) timeouts for
 * reminders that are due within the current day.
 *
 * State machine:
 *   - `Added` / `Edited` / `Pending` → compares the reminder date against
 *     23:59:59 today.  Transitions to `Running` if within today, otherwise
 *     stays / moves to `Pending`.
 *   - `Running` (when `dontRun` is false) → if the due time has already
 *     passed, fires `reminderCompleted` immediately; otherwise schedules a
 *     `setTimeout` and advances to `RunningNow`.
 *   - After state evaluation, any reminder flagged with `UpdateDB` is synced
 *     to the database (add / edit / delete) and removed from the local list
 *     if deleted.
 *
 * @param {boolean} [dontRun=false] - When `true`, state transitions are still
 *   calculated and persisted but no `setTimeout` callbacks are registered.
 *   Used by `DailyReminderCall` to refresh states without re-arming timeouts.
 * @returns {void}
 */
function RefreshReminders(dontRun = false)
{
    var reminderList = getReminderJSON();
    for (var i = 0; i < reminderList.length; i++)
    {
        const remmy = reminderList[i];

        if (remmy.State == "Added" || remmy.State == "Edited" || remmy.State == "Pending")
        {
            if (to[remmy.ID] != null)
            {
                clearTimeout(to[remmy.ID]);
                delete to[remmy.ID];
            }

            var stateChangedHere = false;
            var beforeState = remmy.State;
            
            var dateOfRem = new Date(remmy.Date);
            // if date is before midnight, we will set state to Running, else we will set it to Pending
            var nextMidnight = getD1();
            nextMidnight.setHours(23);
            nextMidnight.setMinutes(59);
            nextMidnight.setSeconds(59);

            if (dateOfRem < nextMidnight)
                remmy.State = "Running";
            else
                remmy.State = "Pending";

            stateChangedHere = beforeState != remmy.State;

            if (stateChangedHere)
            {
                reminderList[i] = remmy;
                fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify(reminderList));
            }
        }

        if (remmy.State == "Running" && !dontRun)
        {
            var timeToRun = new Date(remmy.Date) - Date.now();
            if (timeToRun <= 0)
            {
                reminderCompleted(remmy);
                remmy.State = "Deleted";
                remmy.UpdateDB = "Delete";

                reminderList[i] = remmy;
                fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify(reminderList));
            }
            else
            {
                console.log("Reminder " + remmy.ID + " will run in " + timeToRun + "ms");
                var timeout = setTimeout(function()
                {
                    reminderCompleted(remmy);
                    remmy.State = "Deleted";
                    remmy.UpdateDB = "Delete";

                    fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify(reminderList));

                    RefreshReminders();
                }, timeToRun);

                to[remmy.ID] = timeout;
                toList.push(timeout);

                remmy.State = "RunningNow";

                reminderList[i] = remmy;
                fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify(reminderList));
            }
        }
    }

    for (var i = 0; i < reminderList.length; i++)
    {
        if (reminderList[i].UpdateDB)
        {
            if (reminderList[i].UpdateDB == "Delete")
                DeleteReminderInDB(reminderList[i]).catch(function(err) { DMMePlease(err); });
            else if (reminderList[i].UpdateDB == "Edit")
                EditReminderInDB(reminderList[i]).catch(function(err) { DMMePlease(err); });
            else if (reminderList[i].UpdateDB == "Add")
                AddReminderToDB(reminderList[i]).catch(function(err) { DMMePlease(err); });
            
            if (reminderList[i].UpdateDB != "Delete")
            {
                reminderList[i].UpdateDB = false;
                fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify(reminderList));
            }
            else
            {
                // remove the reminder from the timeout list if it exists
                if (to[reminderList[i].ID] != null)
                {
                    clearTimeout(to[reminderList[i].ID]);
                    delete to[reminderList[i].ID];
                }

                reminderList.splice(i, 1);
                fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify(reminderList));
                i--;
            }
        }
    }
}

/**
 * Delivers a completed reminder to its target Discord channel or thread.
 *
 * Constructs a message payload that optionally mentions the user
 * (`EnableAtPerson`), attaches any locally saved files (splitting across
 * multiple reply messages if more than five attachments are present), then
 * fetches the target guild → channel (→ thread) and sends the message.
 * Locally cached attachment files are deleted from disk after sending.
 *
 * @param {Object} reminderItem - The reminder object to deliver.
 * @param {string} reminderItem.ID - Unique identifier for the reminder.
 * @param {string} reminderItem.UserID - Discord user ID of the reminder owner.
 * @param {string} reminderItem.Message - Text content of the reminder message.
 * @param {boolean} reminderItem.EnableAtPerson - Whether to prepend an `@user`
 *   mention to the message.
 * @param {string|null} reminderItem.ChannelID - Target channel (or thread) ID.
 * @param {string|null} reminderItem.ThreadParentID - Parent channel ID when the
 *   target is a thread; `null` for regular channels.
 * @param {Array<string>|null} reminderItem.Files - Array of local file names
 *   saved under `babadata.temp` to attach to the message.
 * @returns {void}
 */
function reminderCompleted(reminderItem)
{
    console.log("Reminder " + reminderItem.ID + " completed");
    var objectiveSender = {
        content: reminderItem.EnableAtPerson ? "<@" + reminderItem.UserID + "> `Baba Reminds You:`\n" + reminderItem.Message : reminderItem.Message,
    };

    console.log(objectiveSender);

    var AdditionalMessagesToSend = [];

    if (reminderItem.Files != null && reminderItem.Files.length > 0)
    {
        objectiveSender.files = [];
        var maxFilesPerMessage = 5;
        var currentFiles = 0;
        var currentFileList = objectiveSender.files;
        for (var i = 0; i < reminderItem.Files.length; i++)
        {
            var extensi = reminderItem.Files[i].split('.').pop();
            var discordFile = new Discord.AttachmentBuilder(babadata.temp + reminderItem.Files[i], { name: 'File' + i + '.' + extensi, description: "Baba Makes Messages" });

            if (currentFiles < maxFilesPerMessage)
            {
                currentFileList.push(discordFile);
                currentFiles++;
            }
            else
            {
                var newFileObject = {};
                var newFileList = [];
                newFileObject.files = newFileList;
                newFileList.push(discordFile);
                AdditionalMessagesToSend.push(newFileObject);
                currentFiles = 1;
                currentFileList = newFileList;
            }
        }
    }

    var guildID = babadata.testing === undefined ? "454457880825823252" : "522136584649310208";
    global.Bot.guilds.fetch(guildID).then(guild => {
        var channelID = reminderItem.ThreadParentID == null ? reminderItem.ChannelID : reminderItem.ThreadParentID;
        guild.channels.fetch(channelID).then(async channel =>
        {
            if (reminderItem.ThreadParentID != null)
            {
                channel.threads.fetch(reminderItem.ChannelID).then(async thread =>
                {
                    console.log("Sending message to thread");
                    var msg = await thread.send(objectiveSender);
                    if (AdditionalMessagesToSend.length > 0)
                    {
                        for (var i = 0; i < AdditionalMessagesToSend.length; i++)
                            var msg = await msg.reply(AdditionalMessagesToSend[i]);
                    }

                    // delete all the files that were saved to the local file system
                    if (reminderItem.Files != null && reminderItem.Files.length > 0)
                    {
                        for (var i = 0; i < reminderItem.Files.length; i++)
                            fs.unlinkSync(babadata.temp + reminderItem.Files[i]);
                    }
                }).catch((error) =>
                {
                    console.error(error);
                });
            }
            else
            {
                console.log("Sending message to channel");
                var msg = await channel.send(objectiveSender);
                if (AdditionalMessagesToSend.length > 0)
                {
                    for (var i = 0; i < AdditionalMessagesToSend.length; i++)
                        var msg = await msg.reply(AdditionalMessagesToSend[i]);
                }

                if (reminderItem.Files != null && reminderItem.Files.length > 0)
                {
                    // delete all the files that were saved to the local file system
                    for (var i = 0; i < reminderItem.Files.length; i++)
                        fs.unlinkSync(babadata.temp + reminderItem.Files[i]);
                }
            }
        }).catch((error) =>
        {
            console.error(error);
        });
    }).catch((error) => 
    {
        console.error(error);
    });
}

/**
 * Downloads all file attachments from a Discord message and saves them to the
 * local temporary directory.
 *
 * Each file is renamed to `file{index}_{IDID}.{extension}` before being
 * written to `babadata.temp` so that multiple reminders cannot clash.
 * Download failures are logged but do not abort the other downloads.
 *
 * @async
 * @param {import('discord.js').Message} message - The Discord message whose
 *   attachments should be downloaded.
 * @param {number|string} IDID - Unique identifier (typically `Date.now()`)
 *   used to namespace the saved file names.
 * @returns {Promise<Array<string>>} Resolves with an array of the saved file
 *   names (basename only, relative to `babadata.temp`).
 */
async function getAttachments(message, IDID)
{
    const files = message.attachments;
    const fileNames = [];

    const promises = files.map((attachment, index) =>
    {
        const fileName = attachment.name;
        const fileExtension = fileName.split('.').pop();
        const newFileName = `file${index}_${IDID}.${fileExtension}`;

        return fetch(attachment.url)
            .then(res => res.arrayBuffer())
            .then(data =>
            {
                const nodeBuffer = Buffer.from(data);
                fs.writeFileSync(babadata.temp + newFileName, nodeBuffer);
                fileNames.push(newFileName);
            })
            .catch(err =>
            {
                console.error(`Failed to process ${attachment.url}:`, err);
            });
    });

    await Promise.all(promises);

    return fileNames;
}

/**
 * Creates a new reminder and persists it to disk, then refreshes the scheduler.
 *
 * If `DelayinMS` is negative the reminder is considered invalid and
 * `antiDelay` is called instead.  Otherwise a reminder object is constructed
 * with state `Added`, any message attachments are saved locally, and the
 * object is appended to `reminders.json`.  `RefreshReminders` is invoked
 * afterwards to immediately evaluate and arm the new reminder.
 *
 * This function is exported as `reverseDelay`.
 *
 * @async
 * @param {import('discord.js').Message|null} DiscordMessage - The originating
 *   Discord message (used to extract attachments).  Pass `null` when creating
 *   a reminder programmatically without a message context.
 * @param {string} UID - Discord user ID of the reminder owner.
 * @param {import('discord.js').TextChannel|import('discord.js').ThreadChannel} ChannelSendTo
 *   - The channel or thread the reminder should be delivered to.
 * @param {string} MessageToSend - The reminder text to deliver.
 * @param {number} DelayinMS - Milliseconds from now until the reminder fires.
 *   A negative value triggers the anti-delay handler instead.
 * @param {boolean} IncludeAtUser - Whether to mention the user when delivering
 *   the reminder.
 * @returns {Promise<void>}
 */
async function addReminder(DiscordMessage, UID, ChannelSendTo, MessageToSend, DelayinMS, IncludeAtUser)
{
    var IDIDIDID = Date.now();
    var Files = null;
    if (DiscordMessage != null && DelayinMS >= 0)
    {
        Files = await getAttachments(DiscordMessage, IDIDIDID);
    }

	if (DelayinMS < 0)
		antiDelay(DiscordMessage);
	else
	{
        var dateOfReminder = new Date(Date.now() + DelayinMS);
        var reminderObject = {
            "Source": DiscordMessage == null ? "Reminder" : "DM Message",
            "Message": MessageToSend,
            "Files": Files,
            "Date": dateOfReminder,
            "ChannelID": ChannelSendTo.id,
            "UserID": UID,
            "ThreadParentID": (ChannelSendTo.type == 11 || ChannelSendTo.type == 12) ? ChannelSendTo.parentId : null,
            "EnableAtPerson": IncludeAtUser,
            "State": "Added",
            "ID": IDIDIDID,
            "UpdateDB": "Add"
        }

        var reminders = getReminderJSON();
        reminders.push(reminderObject);
        fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify(reminders));

        RefreshReminders();
	}
}

/**
 * Marks a reminder for deletion and triggers a scheduler refresh.
 *
 * Finds the reminder by `reminderID` in `reminders.json`, sets its state to
 * `"Deleted"` and its `UpdateDB` flag to `"Delete"`, persists the change, then
 * calls `RefreshReminders` which will cancel any active timeout, remove the
 * entry from the file, and propagate the delete to the database.
 *
 * @param {number|string} reminderID - The unique ID of the reminder to remove.
 * @returns {void}
 */
function removeReminder(reminderID)
{
    var reminderList = getReminderJSON();
    for (var i = 0; i < reminderList.length; i++)
    {
        if (reminderList[i].ID == reminderID)
        {
            reminderList[i].State = "Deleted";
            reminderList[i].UpdateDB = "Delete";
            break;
        }
    }

    fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify(reminderList));

    RefreshReminders();
}

/**
 * Retrieves a single reminder object by its ID from `reminders.json`.
 *
 * @param {number|string} reminderID - The unique ID of the reminder to fetch.
 * @returns {Object|null} The matching reminder object, or `null` if not found.
 */
function getReminder(reminderID)
{
    var reminderList = getReminderJSON();
    for (var i = 0; i < reminderList.length; i++)
    {
        if (reminderList[i].ID == reminderID)
            return reminderList[i];
    }

    return null;
}

/**
 * Updates an existing reminder's message and/or date, then refreshes the
 * scheduler.
 *
 * Locates the reminder by `reminderID` in `reminders.json`, applies the new
 * values, sets the state to `"Edited"` and `UpdateDB` to `"Edit"`, persists
 * the file, and calls `RefreshReminders` to re-arm the timeout with the
 * updated delivery time.
 *
 * @param {number|string} reminderID - The unique ID of the reminder to edit.
 * @param {string} newMessage - The updated reminder text.
 * @param {Date|string|null} newDate - The new delivery date/time, or `null` to
 *   keep the existing date unchanged.
 * @returns {void}
 */
function editReminder(reminderID, newMessage, newDate)
{
    var reminderList = getReminderJSON();
    for (var i = 0; i < reminderList.length; i++)
    {
        if (reminderList[i].ID == reminderID)
        {
            reminderList[i].Message = newMessage;
            if (newDate != null)
                reminderList[i].Date = newDate;
            reminderList[i].State = "Edited";
            reminderList[i].UpdateDB = "Edit";
            break;
        }
    }

    fs.writeFileSync(babadata.datalocation + "reminders.json", JSON.stringify(reminderList));

    RefreshReminders();
}

/**
 * Performs a daily state refresh of all reminders without re-arming timeouts.
 *
 * Intended to be called once per day (e.g., via a scheduled task) to
 * transition `Pending` reminders that are now due within the current day to
 * the `Running` state so that `RefreshReminders` (called without `dontRun`)
 * will arm their timeouts on the next invocation.
 *
 * @returns {void}
 */
function DailyReminderCall()
{
    RefreshReminders(true);
}

/**
 * Initialises the reminder system at bot startup.
 *
 * Loads the reminder cache from the database via `LoadReminderCache`, then
 * calls `RefreshReminders` to arm timeouts for all current reminders.  If the
 * cache load fails, `RefreshReminders` is still called so that locally
 * persisted reminders (from `reminders.json`) continue to fire.
 *
 * @returns {Promise<string>} Resolves with `"SuccCess"` when the cache loaded
 *   successfully, or rejects with `"AllCache"` if the cache load failed (the
 *   reminders are still started in either case).
 */
function StartTheReminders()
{    
    const CachceAsync = async function() 
    {
        // Reminder Values - reminders.json - `Select * from reminders`
        const ReminderResult = await LoadReminderCache();
        console.log("Reminder Cache: " + ReminderResult, false, true);
    }

    var PromisedStartReminders = new Promise((resolve, reject) =>
    {
        CachceAsync().then(() => 
        {
            RefreshReminders();
            console.log("Reminders Loaded and Started");
            resolve("SuccCess");
        }).catch((err) => 
        {
            RefreshReminders();
            console.log("Reminders Started");
            reject("AllCache");
        });
    });

    return PromisedStartReminders;
}


/////// Embed Stuff ///////

/**
 * Clamps a pagination index to valid bounds for a reminder list.
 *
 * @param {Array<Object>} reminderList - The list of reminders being paginated.
 * @param {number} index - The requested page index (zero-based).
 * @returns {number} The clamped index: `0` if `index < 0`, the last valid
 *   index if `index >= reminderList.length`, otherwise `index` unchanged.
 */
function checkUntilGood(reminderList, index)
{
    if (index < 0)
        return 0;
    if (index >= reminderList.length)
        return reminderList.length - 1;
    return index;
}

/**
 * Retrieves the formatted embed/component object for a specific reminder
 * identified by its raw reminder ID within a user's reminder list.
 *
 * Looks up the reminder in the user's filtered list by `reminderID`, then
 * delegates to `getUserReminder` with the resolved list index to produce the
 * paginated embed payload.
 *
 * @param {number|string} reminderID - The unique ID of the reminder to look up.
 * @param {string} userID - The Discord user ID whose reminder list is searched.
 * @returns {Object|null} The embed/component message object returned by
 *   `getUserReminder`, or `null` if the reminder ID is not found in the user's
 *   list.
 */
function getUserReminderbyID(reminderID, userID)
{
    var reminderList = viewReminders(userID);
    for (var i = 0; i < reminderList.length; i++)
    {
        if (reminderList[i].ID == reminderID)
            return getUserReminder(userID, i);
    }

    return null;
}

/**
 * Looks up a reminder by its raw ID across all users and returns both the
 * formatted embed object and the owning user's ID.
 *
 * Searches the full `reminders.json` list for a matching `ID`, then delegates
 * to `getUserReminderbyID` to build the embed payload.
 *
 * @param {number|string} id - The unique reminder ID to search for.
 * @returns {[Object, string]|null} A two-element array `[embedObject, userID]`
 *   where `embedObject` is the result of `getUserReminderbyID` and `userID` is
 *   the Discord user ID of the owner.  Returns `null` when no matching
 *   reminder is found.
 */
function getUserReminderAndIDFromID(id)
{
    var reminderList = getReminderJSON();

    for (var i = 0; i < reminderList.length; i++)
    {
        if (reminderList[i].ID == id)
            return [getUserReminderbyID(reminderList[i].ID , reminderList[i].UserID), reminderList[i].UserID];
    }

    return null;
}

/**
 * Retrieves the Discord user ID that owns a reminder with the given raw ID.
 *
 * @param {number|string} id - The unique reminder ID to look up.
 * @returns {string|null} The `UserID` of the reminder owner, or `null` if no
 *   reminder with that ID exists in `reminders.json`.
 */
function getUserIDFromID(id)
{
    var reminderList = getReminderJSON();

    for (var i = 0; i < reminderList.length; i++)
    {
        if (reminderList[i].ID == id)
            return reminderList[i].UserID;
    }

    return null;
}

/**
 * Builds the full Discord message payload (content, embeds, and action-row
 * components) for displaying a paginated reminder embed to a user.
 *
 * When the user has more than one reminder, Previous / Jump / Next navigation
 * buttons are included in the first action row, with Previous disabled on the
 * first page and Next disabled on the last.  Edit, Delete, and Dismiss buttons
 * are always present.  The embed colour transitions from green → yellow → red
 * based on how much of the reminder's lifespan has elapsed.
 *
 * @param {string} userID - The Discord user ID whose reminders are displayed.
 * @param {number} i - Zero-based index of the reminder page to render.
 * @returns {Object} A Discord message-options object with `content`, `embeds`,
 *   `components`, and `finalComponents` (the action row shown after the
 *   collector expires) properties.  If the user has no reminders, returns
 *   `{ content: "No Reminders Found", embeds: [] }`.
 */
function getUserReminder(userID, i)
{
    var reminderList = viewReminders(userID);

    var pagetotal = reminderList.length;
    
    var obj = {
        content: "Your Reminders",
        embeds: []
    };

    var finalComponents = [];

    var reminder = reminderList[i];

    if (reminder == null)
    {
        obj.content = "No Reminders Found";
        return obj;
    }

    var editButton = new Discord.ButtonBuilder().setCustomId("editrem-" + reminder.ID + "-" + i + "-" + userID).setLabel("Edit").setStyle(2);
    var deleteButton = new Discord.ButtonBuilder().setCustomId("deleterem-" + reminder.ID + "-" + i+ "-" + userID).setLabel("Delete").setStyle(4);
    var dismissButton = new Discord.ButtonBuilder().setCustomId("dismissrem-" + reminder.ID + "-" + i + "-" + userID).setLabel("Dismiss Message").setStyle(3);

    var footer = "Baba Works in Reminders and in Mysterious Ways";
    if (pagetotal > 1) 
    {
        footer += " - Page " + (1 + i) + " of " + pagetotal;
        var row = new Discord.ActionRowBuilder();
        
        var pButton = new Discord.ButtonBuilder().setCustomId("page"+(i - 1)).setLabel("Previous").setStyle(1);
        var jumpButton = new Discord.ButtonBuilder().setCustomId("jumpToReminder").setLabel("Jump to ...").setStyle(3);
        var nButton = new Discord.ButtonBuilder().setCustomId("page"+(1 + i)).setLabel("Next").setStyle(1);
        if (i == 0)
        {
            pButton.setDisabled(true);
        }
        if (i == pagetotal - 1)
        {
            nButton.setDisabled(true);
        }

        row.addComponents(pButton, jumpButton, nButton, editButton, deleteButton);
        obj.components = [row];

        var row = new Discord.ActionRowBuilder();
        row.addComponents(editButton, deleteButton, dismissButton);
        finalComponents = [row];
    }
    else
    {
        var row = new Discord.ActionRowBuilder();
        row.addComponents(editButton, deleteButton, dismissButton);
        obj.components = [row];
    }

    var desco = "**Message:** \n" + reminder.Message + "\n\n";
    var dateString = "<t:" + Math.floor(new Date(reminder.Date).getTime() / 1000) + ":F> which is <t:" + Math.floor(new Date(reminder.Date).getTime() / 1000) + ":R>";
    desco += "**Date:** " + dateString + "\n";
    desco += "**Channel:** <#" + reminder.ChannelID + ">\n";

    var footobj = {
        text : footer,
        iconURL : "https://media.discordapp.net/attachments/574840583563116566/949515044746559568/JSO3bX0V.png"
    };

    var colorString = getReminderColor(new Date(parseInt(reminder.ID)), new Date(reminder.Date), getD1(true));

    // if color strong is not a valid hex color, set it to white
    if (!/^#[0-9A-F]{6}$/i.test(colorString))
        colorString = "#FFFFFF";

    var exampleEmbed = new Discord.EmbedBuilder() // embed for the haiku
    .setColor(colorString)
    .setTitle(reminder.Source + " Information")
    .setDescription(desco)
    .setFooter(footobj);

    obj.embeds = [exampleEmbed];
    obj.finalComponents = finalComponents;

    return obj;
}

/**
 * Calculates a hex colour that visually represents a reminder's urgency.
 *
 * The colour transitions in two linear phases:
 *   1. **Green → Yellow** (`#00FF00` → `#FFFF00`) during the first half of
 *      the reminder's lifespan.
 *   2. **Yellow → Red** (`#FFFF00` → `#FF0000`) during the second half.
 *
 * @param {Date} started - The date/time the reminder was created (i.e. its ID
 *   interpreted as a Unix timestamp).
 * @param {Date} end - The scheduled delivery date/time of the reminder.
 * @param {Date} now - The current date/time used to compute progress.
 * @returns {string} A CSS hex colour string (e.g. `"#FF8000"`), or `"#FFFFFF"`
 *   as a fallback if the computation cannot produce a valid colour.
 */
function getReminderColor(started, end, now) 
{
    const startTime = started.getTime();
    const endTime = end.getTime();
    const nowTime = now.getTime();
    const midTime = startTime + (endTime - startTime) / 2;
  
    if (nowTime <= midTime) 
    {
        // Phase 1: Green (0,255,0) → Yellow (255,255,0)
        const progress = (nowTime - startTime) / (midTime - startTime);
        const g = Math.round(255 * progress);
        const r = 255;
        const b = 0;
        return rgbToHex(r, g, b);
    } 
    else 
    {
        // Phase 2: Yellow (255,255,0) → Red (255,0,0)
        const progress = (nowTime - midTime) / (endTime - midTime);
        const g = 255;
        const r = Math.round(255 * (1 - progress));
        const b = 0;
        return rgbToHex(r, g, b);
    }

    return "#FFFFFF"; // Default to white if something goes wrong
}
  
/**
 * Converts individual red, green, and blue channel values to an uppercase CSS
 * hex colour string.
 *
 * @param {number} r - Red channel value (0–255).
 * @param {number} g - Green channel value (0–255).
 * @param {number} b - Blue channel value (0–255).
 * @returns {string} Uppercase hex colour string including the `#` prefix
 *   (e.g. `"#FF8C00"`).
 */
function rgbToHex(r, g, b) 
{
    return `#${[r, g, b]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()}`;
}


/**
 * Attaches a pagination collector to a reminder embed message and handles
 * Previous / Next page button interactions.
 *
 * Registers a 30-second `MessageComponentCollector` filtered to pagination
 * button clicks (`customId` contains `"page"`) on the given message by the
 * given user.  On each click the message is updated in-place via `i.update`
 * with the reminder at the new page index, and the collector timer is reset.
 * The "Jump to …" modal flow is handled concurrently by
 * `buttonsAwaitMessageComponentReminder`.  When the collector expires the
 * message is restored to `finalComps` (the non-paginated action row).
 *
 * @param {import('discord.js').TextChannel} channel - The channel that
 *   contains the reminder embed message (used to create the collector).
 * @param {import('discord.js').Message} message - The sent embed message to
 *   attach the collector to.
 * @param {string} userid - Discord user ID; only interactions from this user
 *   are accepted by the collector filter.
 * @param {Array<import('discord.js').ActionRowBuilder>} finalComps - Action-row
 *   components to restore on the message once the collector ends.
 * @returns {void}
 */
function handleButtonsEmbedReminders(channel, message, userid, finalComps)
{
    global.paged[message.id] = 0;
    global.ReminderMessageExists[message.id] = true;
    console.log("Handling buttons embed reminders");
    const filter = i => (i.customId.includes("page")) 
                        && i.message.id === message.id && i.user.id === userid;

    
    const collector = channel.createMessageComponentCollector({ filter, time: 30000 });
    collector.on('collect', async i => {
        if (i.customId.includes("page")) 
        {
            //i.deferUpdate();
            var page = parseInt(i.customId.replace("page", ""));
            
            global.paged[message.id] = page;

            var newd = getUserReminder(userid, page);

            if (newd.content != "No Reminders Found")
            {
                delete newd.finalComponents;
                i.update(newd);
            }

            collector.resetTimer();

            //await i.update({ content: 'A button was clicked!', components: [] });
        }
    });

	buttonsAwaitMessageComponentReminder(message, userid, collector);
 
    collector.on('end', collected => {
        try 
        {
            if (global.ReminderMessageExists[message.id])
                message.edit({components: finalComps});
        }
        catch (error) 
        {
            console.error(error, false);
        }
    });
}

/**
 * Awaits a "Jump to …" button click on a reminder embed and presents the user
 * with a modal to enter a specific page number.
 *
 * Uses `awaitMessageComponent` (100 second timeout) scoped to the "Jump to
 * Reminder" button on the given message for the given user.  On click it
 * shows a `ModalBuilder` prompting for a 1-based page number.  After modal
 * submission the message is updated to the requested page, the pagination
 * collector timer is reset, and this function recurses to await the next
 * potential jump.
 *
 * @param {import('discord.js').Message} message - The reminder embed message
 *   that contains the "Jump to …" button.
 * @param {string} userid - Discord user ID; only interactions from this user
 *   are accepted.
 * @param {import('discord.js').InteractionCollector} collector - The active
 *   pagination collector so its timer can be reset after a jump.
 * @returns {void}
 */
function buttonsAwaitMessageComponentReminder(message, userid, collector)
{
    const collectorFilter = i => {
        return i.user.id === userid && i.message.id === message.id && i.customId.includes("jumpToReminder");
    };

    message.awaitMessageComponent({ filter: collectorFilter, componentType: ComponentType.Button, time: 100000 })
    .then(async initialInteraction => 
        {
            // open a modal with a text input for the user to enter the haiku number
            const modal = new ModalBuilder()
                .setCustomId('jumpToNumberRemind')
                .setTitle('Jump to Custom Reminder Page');

            const input = new TextInputBuilder()
                .setCustomId('remNum')
                .setLabel("The page of the reminder to jump too")
                .setStyle(1)
                .setRequired(true)
                .setPlaceholder("Reminder Number");

            const firstActionRow = new ActionRowBuilder().addComponents(input);
            modal.addComponents(firstActionRow);

            initialInteraction.showModal(modal);

            await initialInteraction.awaitModalSubmit({
                filter: (i) =>
                      i.customId === "jumpToNumberRemind" &&
                      i.user.id === userid,
                time: 60000,
            }).then(async (modalInteraction) => {
                modalInteraction.deferUpdate();
                var chansend = modalInteraction.fields.getTextInputValue('remNum');
                var num = parseInt(chansend);
                if (num != null && num > 0)
                {
                    global.paged[message.id] = num - 1;
                    // update the message to show the haiku at the given number
                    
                    var newd = getUserReminder(userid, global.paged[message.id]);

                    if (newd.content != "No Reminders Found")
                    {
                        delete newd.finalComponents;
                        message.edit(newd);
                    }

                    collector.resetTimer();
                    buttonsAwaitMessageComponentReminder(message, userid, collector);
                }
            });
        }
    )
    .catch(err => console.error(err, true));
}

var cleanupFn = function cleanup() 
{
	console.log("Ending Reminder Messages");
	if (toList != null)
        toList.forEach(clearTimeout);

    to = {};
    toList = [];
}

global.CommandHelperCleanup = cleanupFn;

process.on('SIGINT', cleanupFn);
process.on('SIGTERM', cleanupFn);

module.exports = 
{ 
    reverseDelay: addReminder,
    DailyReminderCall,
    StartTheReminders,
    viewReminders,
    getUserReminder,
    getUserReminderAndIDFromID,
    getUserIDFromID,
    handleButtonsEmbedReminders,
    getReminder,
    removeReminder,
    editReminder
};