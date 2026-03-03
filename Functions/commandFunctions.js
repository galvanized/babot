var babadata = require('../babotdata.json'); //baba configuration file

const fs = require('fs');
const Jimp = require('jimp');
const https = require('https');
var PublicGoogleCalendar = require('public-google-calendar');

const Discord = require('discord.js'); //discord module for interation with discord api

const { reverseDelay } = require("./HelperFunctions/remindersByBaba.js");
const { getD1 } = require("../Tools/overrides.js");
const { FormatPurityList, HaikuSelection, ObtainDBHolidays, NameFromUser } = require("./Database/databaseandvoice.js");
const { FindDate, GetDate, dateDiffInDays, getTimeFromString, progressSimple } = require("./HelperFunctions/basicHelpers.js");
const { CheckHoliday, FindNextHoliday, MakeImage, EmbedHaikuGen, checkHurricaneStuff, monthFromInt } = require("./HelperFunctions/commandHelpers.js");
const { normalizeMSG } = require("./HelperFunctions/dbHelpers.js");

const options = { year: 'numeric', month: 'long', day: 'numeric' }; // for date parsing to string

/**
 * Module: Functions/commandFunctions
 *
 * Collection of command helper functions that build message payloads or
 * perform small side-effecting tasks used by the bot's command handlers.
 *
 * ⚠️ Pre-existing syntax error — unbalanced braces:
 *   The outer `function babaYugo()` declaration (line ~237) opens a function
 *   body that is never explicitly closed. The pattern repeats: `babaYugo`
 *   contains a nested `babaYugo` implementation, then `babaRepost`, then
 *   `babaHaikuLinks`, `babaHaikuEmbed`, and all subsequent function
 *   declarations are inside that ever-deepening outer shell. The file ends
 *   with `module.exports = {...};` but is missing the closing braces for the
 *   outer wrapper functions, producing:
 *     `SyntaxError: Unexpected end of input`
 *   This was present in the codebase before this documentation PR and is not
 *   introduced by it. The bot appears to be non-functional as-is unless the
 *   file is loaded through an unconventional mechanism.
 *
 * Outer wrapper shell pattern (babaYugo, babaRepost, etc.):
 *   Each function has two declarations: an OUTER shell with no return statement
 *   and an INNER implementation that actually computes and returns a value.
 *   Due to JavaScript function hoisting, calling the outer-scope name would
 *   invoke the outer shell which returns `undefined`. The inner function is
 *   locally scoped and unreachable from outside.
 *
 * Design notes & behaviors:
 * - Most functions return an object shaped for Discord message sending,
 *   e.g. `{ content: string, files?: [AttachmentBuilder], embeds?: [...] }`.
 * - Several functions are asynchronous (return Promises) and must be awaited
 *   by callers before sending the resulting payload.
 * - This module extensively uses other helpers and DB functions, notably:
 *   - `Functions/HelperFunctions/*` for date, image, and message utilities
 *   - `Functions/Database/*` for haiku/holiday data and caches
 *   - `Tools/overrides.js` for date overrides via `getD1()`
 * - The codebase relies on several globals (e.g. `global.BirthdayToday`,
 *   `global.userCache`, `global.channelCache`, `global.dbAccess`) which are
 *   mutated/read across modules; callers should be mindful of these shared
 *   side effects.
 * - Some on-disk JSON keys are misspelled (`Probaility`) and the code depends
 *   on those exact keys; be careful when editing data files.
 */

/**
 * Build the Friday image payload. If `global.BirthdayToday` contains a list
 * of names this function will overlay them onto the Friday image.
 *
 * Returns an object suitable for sending via a Discord message: `{ content, files }`.
 *
 * Interactions:
 * - Reads `babadata.datalocation` to find image templates.
 * - Reads `global.BirthdayToday` (set by `Functions/dailycall.js`).
 * - Uses `Jimp` to compose an image when birthdays are present.
 *
 * @param {boolean} [isFake=false] - If true, do not overlay birthday text.
 * @returns {Promise<{content:string, files:Array}>}
 */
async function babaFriday(isFake = false)
{
    alttext = isFake ? "YOU THINK IT IS FRIDAY??" : "Baba Friday Image, As it is ALWAYS Friday!"
    var templocal = babadata.datalocation + "FrogHolidays/"; //creates the output frog image

    var newFile = null;
    if (!isFake && global.BirthdayToday != null)
    {
        var font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
        var image = await Jimp.read(templocal + "Friday.jpg");

        var names = global.BirthdayToday;
        var name = names.join(" and ");
        name = name + " Edition!";

        var nameWidth = Jimp.measureText(font, name);
        var nameHeight = Jimp.measureTextHeight(font, name, 500);

        var nameX = 500 - nameWidth / 2;
        var nameY = 235 - nameHeight / 2;

        image.print(font, nameX, nameY, name);

        alttext = "Baba Friday Image, As it is ALWAYS Friday!\nCelebrating: " + names.join(" and ") + " Edition!";

        newFile = new Discord.AttachmentBuilder(await image.getBufferAsync(Jimp.MIME_JPEG), { name: 'Friday.jpg', description : alttext });
    }
    else
    {
        newFile = new Discord.AttachmentBuilder(templocal + "Friday.jpg", { name: 'Friday.jpg', description : alttext });
    }

    return { content: "FRIDAY!", files: [newFile] };
}

/**
 * Simple RNG command helper. Produces a single random integer in [min,max]
 * and formats it for presentation. If `spoiler` is true the number is wrapped
 * in Discord spoiler markers `||`.
 *
 * @param {number} min
 * @param {number} max
 * @param {boolean} spoiler
 * @returns {{content: string}}
 */
function babaRNG(min, max, spoiler)
{
    var num = Math.floor(Math.random() * (max - min + 1)) + min;
    return { content: "Your Random Number is: " + (spoiler ? "||" : "")  + num + (spoiler ? "||" : "") };
}

/**
 * `!baba please` response generator. Picks a canned response with a
 * probability distribution. Returns `{ content }` or `undefined` in rare cases.
 *
 * @returns {{content:string}|undefined}
 */
function babaPlease()
{
    var num = Math.floor(Math.random() * 100); //pick a random one
    if (num < 2)
        return { content: "AAAAAAAAAAA" }
    else if (num < 15)
        return { content: "BABA IS HAPPY!" };
    else if (num < 45)
        return { content: "BABA IS THANKS!" };
    else if (num < 68)
        return { content: "BABA IS PLEASED!" };
    else if (num == 69)
        return { content: "Nice!" };
}

/**
 * Placeholder for pizza ordering functionality. Currently returns a stub
 * message payload.
 *
 * @returns {{content:string}}
 */
function babaPizza()
{
    return { content: "Baba Pizza Ordering Service™ coming soon!" };
}

/**
 * Render a simple progress bar using the helper `progressSimple`.
 * Returns a message object containing the rendered progress string.
 *
 * @param {number} [n=20]
 * @returns {{content:string}}
 */
function babaProgress(n = 20)
{
    var pb = progressSimple(n);

    return { content: pb };
}

/**
 * Returns a help text payload listing available commands and brief
 * descriptions. This string is intended for display in chat.
 *
 * @returns {{content:string}}
 */
function babaHelp()
{
    var helptext = "BABA IS HELP"
    helptext += "\n```Commands:"

    helptext += "\nAll commands can be run as slash commands!";

    helptext += "\n" + "- !baba password - Gets the server password for games!"
    helptext += "\n" + "- !baba [night shift | vibe time] flag - Gets the current vibe time flag for the day!"
    helptext += "\n" + "- !baba make yugo - Baba will give you a yugo!"

    helptext += "\n" + "- !baba haiku - Pulls a random haiku from the haiku database of the server!"
    helptext += "\n" + "- !baba haiku by [person] - Gets a random haiku make by the specified person!"
    helptext += "\n" + "- !baba haiku purity list [channels] - Gets a list of all people or channels haiku purity's!"
    helptext += "\n" + "- !baba my haiku purity - Gets the haiku purity of the sender!"
    helptext += "\n" + "- !baba haiku purity [channel/person/date] - Gets the haiku purity of the the specified value!"

    helptext += "\n" + "- !baba wednesday {holiday} - Displays a frog with how many wednesdays until the specified holiday!"
    helptext += "\n" + "- !baba days until {holiday} - Displays how many days until specified holiday!"
    helptext += "\n" + "- !baba when is {holiday} - Displays the exact date of the specified holiday!"
    helptext += "\n" + "- !baba day of week {holiday} - Displays what day of week the specified holiday is!";
    
    helptext += "\n" + "- !baba friday - Displays the friday image!";
    helptext += "\n" + "- !baba order pizza - Baba will order you a pizza (coming soon)!";
    helptext += "\n" + "- !baba please - >:(";
    helptext += "```"

    return { content: helptext };
}

/**
 * Compute the current 'vibe time' flag image payload.
 *
 * Behavior and interactions:
 * - Uses `getD1()` from `Tools/overrides.js` to get the reference date.
 * - Computes a pseudo-random index `sood` based on date-derived seeds.
 * - Loads a corresponding PNG from `babadata.datalocation + 'Flags/'` and
 *   returns it as an attachment in `{ content, files }`.
 *
 * @returns {{content:string, files:Array}}
 */
function babaVibeFlag()
{
    var d1 = getD1();
    var flagtext = "BABA IS AT VIBE TIME";; //V I B E  T I M E
    let d1_useage = new Date(d1.getFullYear(), d1.getMonth(), 1); //today that has been wednesday shifted
    d1_useage.setDate(d1.getDate() - d1.getDay()); //modify today for wed

    d1_useage.setDate(d1_useage.getDate() + (d1_useage.getMonth() % 7)); //modify today for wed

    var seed = (d1_useage.getDate() % 9) + (d1_useage.getMonth() % 5); //seeds are cool

    var locals = [ //another thing hank doesnt like, but it is needed
        [0,1,2,3,4,5,6],
        [6,5,4,3,2,1,0], 
        [1,3,5,0,2,4,6],
        [0,2,4,6,5,3,1],
        [0,4,5,1,2,6,2],
        [5,6,1,4,3,2,0],
        [4,0,6,2,1,5,3]
    ]

    var sood = locals[seed % 7][(d1.getDay() + d1_useage.getDate()) % 7]; // "the mommy number and daddy numbers get drunk and invite cousins" - Caden 2021
    
    // var newAttch = new Discord.MessageAttachment().setFile(); //makes a new discord attachment
    var newFile = new Discord.AttachmentBuilder(babadata.datalocation + "Flags/" + "Night_Shift_" + sood + ".png", 
        { name: 'NightShift.png', description : "This one is indexed as " + sood + "!" });

    return {content: flagtext, files: [newFile] };
    
}

/**
 * Return a random 'Yugo' image payload from the Yugo assets directory.
 * Picks a random image numbered 0–10 from the `Yugo/` folder.
 *
 * ⚠️ This declaration is an EMPTY OUTER WRAPPER due to the pre-existing
 * double-nesting pattern in this file. The actual implementation is the
 * identically-named inner function declared in the body below. The outer
 * function returns `undefined`; the inner function's return value is
 * unreachable from the outer scope. See the module-level JSDoc for context.
 *
 * @returns {{content:string, files:Array<Discord.AttachmentBuilder>}}
 */
function babaYugo()
{
/**
 * Return a random 'Yugo' image payload from the Yugo assets directory.
 *
 * @returns {{content:string, files:Array}}
 */
function babaYugo()
{
    var yugotext = "Here Yugo!";
    var num = Math.floor(Math.random() * 11); //pick a random one
    var yugo = new Discord.AttachmentBuilder(babadata.datalocation + "Yugo/" + num.toString() + ".jpg", 
        { name: 'Yugo.jpg', description : "This is yugo number " + num + "!\nHere Yugo, Get IT, GET IT! HHUEHUEHEUHEHEUEUEHUEHUEHUE!" });

    return { content: yugotext, files: [yugo] };
}

/**
 * Return a random repost image payload. Picks an image numbered 0–4 from
 * the `Repost/` folder.
 *
 * ⚠️ This declaration is an EMPTY OUTER WRAPPER — see `babaYugo` and the
 * module-level JSDoc for context.
 *
 * @returns {{files:Array<Discord.AttachmentBuilder>}}
 */
function babaRepost()
{
/**
 * Return a random repost image payload. Used by the `repost` command.
 *
 * @returns {{files:Array}}
 */
function babaRepost()
{
    var num = Math.floor(Math.random() * 5); //pick a random one
    var reppy = new Discord.AttachmentBuilder(babadata.datalocation + "Repost/" + num.toString() + ".png", 
        { name: 'Repost.png', description : "This is repost number " + num + "!\nWhen will jeremy finish his report detector?"});
    return { files: [reppy] };
}

/**
 * Convert an array of haiku message component pages into per-page
 * ActionRowBuilder arrays that each contain a single URL "View Source" button.
 * Pages without a URL button (style ≠ 5 on the last component) are skipped.
 *
 * ⚠️ This declaration is an EMPTY OUTER WRAPPER — see `babaYugo` and the
 * module-level JSDoc for context.
 *
 * @param {Array} cont - Array of message payload objects whose `.components[0].components`
 *   contains Discord ButtonBuilder instances.
 * @returns {Array} Array of ActionRow arrays (one per page that has a source URL).
 */
function babaHaikuLinks(cont)
{
/**
 * Convert an array of component descriptors into ActionRowBuilders that
 * contain URL buttons for haiku sources. The input `cont` is expected to be
 * the `components` array from previously built message components.
 *
 * Interaction:
 * - Used by higher-level haiku commands to append a "View Source" button
 *   when the source URL is available.
 *
 * @param {Array} cont - Array of component blocks to inspect.
 * @returns {Array} Array of ActionRow arrays suitable for attaching to messages.
 */

    var deadData = [];
    for (var i = 0; i < cont.length; i++)
    {
        var cpu = cont[i].components[0].components;
        // if cont[i].components[0].components[cpu.length - 1].data.style == 5
        if (cont[i].components[0].components[cpu.length - 1].data.style == 5)
        {
            var row = new Discord.ActionRowBuilder();
            var URLButton = new Discord.ButtonBuilder().setURL(cont[i].components[0].components[cpu.length - 1].data.url).setLabel("View Source").setStyle(5);
            row.addComponents(URLButton);
            
            var cpu2 = [row];
            deadData.push(cpu2);
        }
    }

    return deadData;
}

/**
 * Build an embed or embeds for haiku queries.
 *
 * Modes/behavior:
 * - When `purity` is true, the function returns a paginated "purity list"
 *   (using `FormatPurityList`) and calls `EmbedPurityGen` to render pages.
 * - When `purity` is false, a single haiku is selected via `HaikuSelection`
 *   and formatted with `EmbedHaikuGen`.
 *
 * @param {boolean} purity - Whether to return purity lists instead of haiku.
 * @param {number} mode - Mode indicator used by `HaikuSelection`.
 * @param {Array|string} msgContent - Query arguments used by selection routines.
 * @param {Object} pagestuff - Pagination settings (e.g., `ipp` = items per page).
 * @returns {Array|Object} Embed objects or message payloads ready to send.
 */
function babaHaikuEmbed(purity, mode, msgContent, pagestuff)
{
/**
 * Build an embed or embeds for haiku queries.
 *
 * Modes/behavior:
 * - When `purity` is true, the function returns a paginated "purity list"
 *   (using `FormatPurityList`) and calls `EmbedPurityGen` to render pages.
 * - When `purity` is false, a single haiku is selected via `HaikuSelection`
 *   and formatted with `EmbedHaikuGen`.
 *
 * Dependencies:
 * - `HaikuSelection`, `FormatPurityList` and `EmbedHaikuGen` from
 *   `Functions/Database/databaseandvoice.js` and `HelperFunctions/commandHelpers.js`.
 * - Relies on `normalizeMSG` to normalize query strings in non-mode-4 cases.
 *
 * @param {boolean} purity - Whether to return purity lists instead of haiku.
 * @param {number} mode - Mode indicator used by `HaikuSelection`.
 * @param {Array|string} msgContent - Query arguments used by selection routines.
 * @param {Object} pagestuff - Pagination settings (e.g., `ipp` = items per page).
 * @returns {Array|Object} Embed objects or message payloads ready to send.
 */
    if (mode != 4)
        msgContent = normalizeMSG(msgContent);
    else
    {
        for (var i = 0; i < msgContent.length; i++)
        {
            if (typeof(msgContent[i]) == "string")
                msgContent[i] = normalizeMSG(msgContent[i]);
        }
    }
    
    if (purity)
    {
        var hpl = {"retstring": ["No Haiku Purity Found!"], "total": 1};
        var bonust = ""
        var bonupr = ""
        var haifou = false;

        bonust = " List for ";
        bonust += (msgContent[6] == "chans" ? "Channels" : (msgContent[6] == "dates" ? "Dates" : "Users"));
        var result = HaikuSelection(msgContent, mode);

        if (result == null) 
        {
            haifou = true;
            return [{content: "Result was null, something may have gone wrong, or no Haikus were found!"}];
        }

        hpl = FormatPurityList(result, (msgContent[6] == "chans" ? true : (msgContent[6] == "dates" ? 2 : false)), pagestuff);

        if (hpl.retstring.length != 0)
        {
            haifou = true;
            return EmbedPurityGen(hpl, bonust, bonupr, pagestuff, msgContent);
        }
        else hpl = {"retstring": ["No Haiku Purity Found based on Selections"], "total": 1};

        if (!haifou)
            return EmbedPurityGen(hpl, bonust, bonupr, pagestuff);
    }
    else
    { 
        var haikussimnames = HaikuSelection(msgContent, mode);
        if (haikussimnames == null) return [{content: "No Haiku Found, or the DB is Disabled!"}];

        var haiku = haikussimnames[0];
        var simnames = haikussimnames[1];
        //console.log(haiku, true);

        return EmbedHaikuGen(haiku, simnames);
    }
}

/**
 * Render paginated "haiku purity" message payloads from a purity list.
 *
 * Detailed behavior:
 * - `hpl` is expected to have the shape produced by `FormatPurityList`,
 *   e.g. `{ retstring: Array<string>, total: number }` where `retstring`
 *   contains formatted page bodies.
 * - `pagestuff` should include an `ipp` (items per page) integer used to
 *   compute `pagetotal`.
 * - If `msgContent` is provided the function builds a human-readable
 *   summary block describing filters (users, channels, keywords, date range)
 *   which is included as the message content for each page.
 * - For multi-page results the function constructs `Previous/Next` buttons
 *   (Discord `ActionRowBuilder` with `ButtonBuilder`) and attaches them to
 *   the message `components` so that a higher-level interaction handler can
 *   respond to pagination events.
 * - Each page returns an object shaped for sending: either `{ content }`
 *   or `{ content, embeds, components }` containing a `Discord.EmbedBuilder`.
 *
 * Edge-cases and notes:
 * - The function assumes `global.userCache` and `global.channelCache` map ids
 *   to human-readable names when rendering the filter summary.
 * - The formatted page bodies are taken from `hpl.retstring[e]` and used as
 *   the embed description; callers should ensure `hpl.retstring` length
 *   matches `hpl.total` or `pagestuff.ipp` boundaries.
 *
 * @param {Object} hpl - Purity list object with `retstring` and `total`.
 * @param {string} bonust - Title prefix text (e.g., ' List for ').
 * @param {string} bonupr - Title suffix text.
 * @param {Object} pagestuff - Pagination options (expects `.ipp`).
 * @param {Array} [msgContent] - Optional query parameters used to build a summary.
 * @returns {Array<Object>} Array of message payload objects (one per page).
 */
function EmbedPurityGen(hpl, bonust, bonupr, pagestuff, msgContent)
{
    var objs = [];
    var pagetotal = Math.ceil(hpl.total / pagestuff.ipp);
    for (var e = 0; e < pagetotal; e++)
    {
        var obj = {content: "BABA MAKE HAIKU"};
        if (msgContent != undefined)
        {
            var sd = msgContent[0];
            var startDate = null;
            var ed = msgContent[1];
            var endDate = null;
            var chan = msgContent[2];
            var pson = msgContent[3];
            var kword = msgContent[4];

            var cont = "BABA MAKE HAIKU\n";
            cont += "```\n";

            if (pson != null)
            {
                var ppl2s = pson.split("---");
                cont += "Users: \n";
                if (ppl2s[1] != "")
                {
                    var ids = ppl2s[1].split(",");
                    
                    cont += "\t-> " + ids.map(id => global.userCache[id].PersonName).join(", ") + "\n";
                }
                if (ppl2s[0] != "")
                {
                    cont += "\t-> " + ppl2s[0] + "\n";
                }
            }

            if (chan != null)
            {
                var chans = chan.split(",");
                cont += "Channels: \n";
                cont += "\t-> " + chans.map(id => global.channelCache[id]).join(", ") + "\n";
            }

            if (kword != null)
                cont += "Containing: " + kword.split(" ").join(", ") + "\n";

            if (sd != null || ed != null)
            {
                if (sd != null)
                    startDate = FindDate(sd);
                if (ed != null)
                    endDate = FindDate(ed);

                if (startDate == null && endDate != null) startDate = endDate;

                if (startDate != null)
                {
                    var d1 = new Date(startDate.year, startDate.month - 1, startDate.day);
                    if (endDate != null)
                    {
                        var d2 = new Date(endDate.year, endDate.month - 1, endDate.day);
                        if (endDate < startDate)
                        {
                            var temp = startDate;
                            startDate = endDate;
                            endDate = temp;
                        }
                        
                        cont += "From: " + d1.toLocaleDateString('en-US', options) + "\n";
                        cont += "To: " + d2.toLocaleDateString('en-US', options) + "\n";
                    }
                    else
                    {
                        cont += "Occuring On: " + d1.toLocaleDateString('en-US', options) + "\n";
                    }
                }
                else if (sd != null)
                {
                    startDate = FindDate(sd, true);
                    if (startDate != null)
                    {
                        var year = startDate.year;
                        var month = startDate.month;
                        var day = startDate.day;
                        
                        month = (month == 0) ? month = "ANY Month" : monthFromInt(month)
                        day = (day == 0) ? day = "ANY Day" : day;
                        year = (year == 0) ? year = "ANY Year" : year;
                        
                        cont += "Occuring On Any Instance of: " + `${month} ${day}, ${year}` + "\n";
                    }
                }
            } 

            //remove last newline
            cont = cont.substring(0, cont.length - 1);
            cont += "```\n";

            if (msgContent[0] == null && msgContent[1] == null && msgContent[2] == null && msgContent[3] == null && msgContent[4] == null)
                cont = "BABA MAKE HAIKU";

            obj = {content: cont};
        }

        var footer = "Haikus by Baba!";
        if (pagetotal > 1) 
        {
            footer += " - Page " + (1 + e) + " of " + pagetotal;
            var row = new Discord.ActionRowBuilder();
            
            var pButton = new Discord.ButtonBuilder().setCustomId("page"+(e - 1)).setLabel("Previous").setStyle(1);
            var nButton = new Discord.ButtonBuilder().setCustomId("page"+(1 + e)).setLabel("Next").setStyle(1);
            if (e == 0)
            {
                pButton.setDisabled(true);
            }
            if (e == pagetotal - 1)
            {
                nButton.setDisabled(true);
            }
    
            row.addComponents(pButton, nButton);
            obj.components = [row];
        }
    
        var footobj = {
            text : footer,
            iconURL : "https://media.discordapp.net/attachments/574840583563116566/949515044746559568/JSO3bX0V.png"
        };

        var exampleEmbed = new Discord.EmbedBuilder() // embed for the haiku
        .setColor("#" + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F"))
        .setTitle(bonupr + "Haiku Purity" + bonust)
        .setDescription(hpl.retstring[e])
        .setFooter(footobj);
        obj.embeds = [exampleEmbed];
        objs.push(obj);
    }
    
    return objs;
}


/**
 * Return a message payload telling how many days until (or since) the next
 * Wednesday. If `since` > 1 the calculation is scaled to that many weeks.
 *
 * @param {number} [since=1] - Week multiplier. 1 = until next Wednesday.
 * @returns {{content:string}}
 */
function babaDayNextWed(since = 1)
{
/**
 * Return a small message telling how many days until (or since) the
 * next/last Wednesday, used by the `wednesday`-related commands.
 *
 * Uses `getD1()` (which may be overridden by `Tools/overrides.js`) so tests
 * can simulate different dates.
 *
 * @param {number} [since=1] - If 1 computes until next Wednesday; if >1, computes multiples.
 * @returns {{content:string}}
 */

    var seven  = 7 * since;
    let d1 = getD1(); //get today
    var dow_d1 = (d1.getDay() + 4) % 7;//get day of week (making wed = 0)

    var dtnw = ""
    var ct = Math.abs(seven - dow_d1);
    if (ct > 7) ct -= 7;
    
    if (ct == 1)
        dtnw = "\nIt is only " + ct + " day " + (since == 1 ? "until" : "since") + " the " + (since == 1 ? "next" : "last") + " Wednesday!"
    else
        dtnw = "\nIt is only " + ct + " days " + (since == 1 ? "until" : "since") + " the " + (since == 1 ? "next" : "last") + " Wednesday!"
        
    return { content: dtnw };
}

/**
 * Return a random adjective+animal 'jeremy' string built from `data.json`.
 *
 * @returns {{content:string}} Discord-formatted code block with the generated name.
 */
function babaJeremy()
{
/**
 * Return a random adjective+animal 'jeremy' string from disk `data.json`.
 * This is a small utility used by the `jeremy` command.
 *
 * @returns {{content:string}}
 */
    var data = JSON.parse(fs.readFileSync(babadata.datalocation + "data.json", {encoding:'utf8', flag:'r'}));
    var adjective = data.adjectives[Math.floor(Math.random() * data.adjectives.length)];
    var animal = data.animals[Math.floor(Math.random() * data.animals.length)].replaceAll(' ', '');

    return { content: "```" + adjective + animal + "```" };
}

/**
 * Handle queries about holidays/dates and build one or more message payloads.
 *
 * Behavior and interactions:
 * - Normalizes the query via `normalizeMSG`.
 * - Loads holidays via `ObtainDBHolidays()` and resolves requested holiday
 *   names with `CheckHoliday()` and `FindDate()`.
 * - Supports several query styles: `when is`, `days until`, `days since`,
 *   `day of week`, `eves`, `next event`, and `next birthday`.
 * - For 'wednesday' style responses the function may call `MakeImage` to
 *   generate frog images (which writes files to `babadata.datalocation`).
 * - Returns an array of message payloads (`{ content, files? }`).
 *
 * Side effects:
 * - Reads/writes image files in the `FrogHolidays` directory and may log
 *   errors to the console. Does not mutate global state directly but relies
 *   on helper modules that may.
 *
 * @param {string} msgContent - Normalized message text of the query.
 * @param {Object} author - Author object (used for attribution in some flows).
 * @param {string} DOWChosen - Day-of-week preference code (e.g., '04' for wed).
 * @returns {Promise<Array>} Array of message payload objects.
 */
async function babaUntilHolidays(msgContent, author, DOWChosen)
{
    msgContent = normalizeMSG(msgContent);
    var outs = [];

    var holidays = ObtainDBHolidays();

    //get the holidays that are reqested and the date if it is a date
    var IsHoliday = CheckHoliday(msgContent, holidays);
    var IsDate = FindDate(msgContent);
    if (IsDate != null)
        IsHoliday.push(IsDate);

    var d1 = getD1(); //get today
    var yr = d1.getFullYear();

    if (msgContent.includes('next event'))
    {
        var hols = FindNextHoliday(d1, yr, CheckHoliday("ALL", holidays));
        for (var i = 0; i < hols.length; i++) // Add all the events to the list that are coming up
            IsHoliday.push(hols[i]);
    }
    
    if (msgContent.includes('next birthday'))
    {
        var hols = FindNextHoliday(d1, yr, CheckHoliday("BIRTHDAY", holidays));
        for (var i = 0; i < hols.length; i++) // Add all the birthdays to the list that are coming up
            IsHoliday.push(hols[i]);
    }

    if(IsHoliday.length > 0)
    {
        var templocationslist = [];
        for ( var i = 0; i < IsHoliday.length; i++) //loop through the holidays that are requested
        {
            var holidayinfo = IsHoliday[i];
            if (holidayinfo.name != "date" && holidayinfo.year)
            {
                yr = holidayinfo.year;
                var tempDate = new Date(yr, holidayinfo.month - 1, holidayinfo.day);
                if (tempDate < d1)
                    yr--;
            }

            console.log("holidayinfo: " + holidayinfo.name);
            var d2 = GetDate(d1, yr, holidayinfo);

            if (isNaN(d2))
            {
                var fronge = new Discord.AttachmentBuilder(babadata.datalocation + "FrogHolidays/error.png", 
                    { name: 'ErrorFrog.png', description : "Brug, run commands better bud hee!"});

                outs.push({ content: "The date does not exist so BABA will give you ERROR frog!", files: [fronge] });
                continue;
            }

            var additionaltext = "";
            var showwed = false;

            var dowtext = "";

            if (DOWChosen == "00")
                DOWChosen = "0" + (d1.getDay() + 1);

            if (DOWChosen == "01")
                dowtext = "sunday";
            else if (DOWChosen == "02")
                dowtext = "monday";
            else if (DOWChosen == "03")
                dowtext = "tuesday";
            else if (DOWChosen == "04")
                dowtext = "wednesday";
            else if (DOWChosen == "05")
                dowtext = "thursday";
            else if (DOWChosen == "06")
                dowtext = "friday";
            else if (DOWChosen == "07")
                dowtext = "saturday";

            if (msgContent.includes(dowtext))
                showwed = true;
            
            if (msgContent.includes('when is')) //outputs the next occurance of the event
            {
                var timed = d2.getTime() / 1000;
                var ison = " is on ";
                
                if (msgContent.includes('when isnt') || msgContent.includes('when is not') || msgContent.includes('when isn\'t'))
                {
                    // add a random number of days to d2 either before or after the date
                    var days = Math.floor(Math.random() * 364) + 1;

                    // add a random number of years from 0 to 5 either before or after the date
                    var years = Math.floor(Math.random() * 5);

                    var before = Math.random() < 0.5;
                    var before2 = Math.random() < 0.5;

                    var d3po = new Date(d2);
                    d3po.setDate(d2.getDate() + (before ? -days : days));
                    d3po.setFullYear(d2.getFullYear() + (before2 ? -years : years));

                    timed = d3po.getTime() / 1000;
                    ison = " is not on ";
                }

                var bonustext = holidayinfo.year != undefined ? " " + holidayinfo.year : "";

                var whenistext = "";
                if (IsDate != null)
                {
                    if (ison == " is not on ")
                        whenistext += "\n<t:" + (d2.getTime() / 1000) + ":D> is not on " + "<t:" + timed + ":D>";
                    else
                        whenistext += "\n<t:" + timed + ":D>";
                }
                else
                {
                    if (holidayinfo.year != undefined)
                        whenistext += "\n" + holidayinfo.safename + bonustext + ison + "<t:" + timed + ":D>";
                    else
                        whenistext += "\nThe next occurance of " + holidayinfo.safename + ison + "<t:" + timed + ":D>";
                }
                
                additionaltext += whenistext + "\n";
            }

            if (msgContent.includes('day of week')) //custom days until text output - for joseph
            {
                var bonustext = holidayinfo.year != undefined && holidayinfo.year != 0 ? " " + holidayinfo.year : "";
                var dowtext = holidayinfo.safename + bonustext + " is on " + d2.toLocaleDateString('en-US', {weekday: 'long'}); //future text
                
                additionaltext += dowtext + "\n";
            }

            if (msgContent.includes('days until')) //custom days until text output - for joseph
            {
                var int = dateDiffInDays(d1, d2); //convert to days difference
                var bonustext = holidayinfo.year != undefined && holidayinfo.year != 0 ? " " + holidayinfo.year : "";

                dutext = holidayinfo.safename + bonustext + " is ";

                if (int != 0)
                    dutext += "<t:" + d2.getTime() / 1000 + ":R>" + (int > 31 ? " which is in " + int + " day" + (int == 1 ? "" : "s") : "!");
                else
                {
                    dutext += "Today!";
                    showwed = true;
                }

                additionaltext += dutext + "\n";
            }

            if (msgContent.includes('days since')) //custom days until text output - for joseph
            {
                var int = dateDiffInDays(d1, d2); //convert to days difference
                int = Math.abs(int);
                var bonustext = holidayinfo.year != undefined && holidayinfo.year != 0 ? " " + holidayinfo.year : "";

                dutext = holidayinfo.safename + bonustext + " is ";

                if (int != 0)
                    dutext += "<t:" + d2.getTime() / 1000 + ":R>" + (int > 31 ? " which was " + int + " day" + (int == 1 ? "" : "s") : " ago!");
                else
                {
                    dutext += "Today!";
                    showwed = true;
                }

                additionaltext += dutext + "\n";
            }

            if (msgContent.includes("eves"))
            {
                var int = dateDiffInDays(d1, d2); //convert to days difference
                int = Math.abs(int);
                var bonustext = holidayinfo.year != undefined && holidayinfo.year != 0 ? " " + holidayinfo.year : "";

                var eves = "";
                var evesCloner = "eve ";
                var HundredGroups = Math.ceil(int / 450);
                for (var j = 0; j < HundredGroups; j++)
                {
                    var newInt = 450;
                    if (j == HundredGroups - 1 && int % 450 != 0)
                        newInt = int % 450;

                    eves += evesCloner.repeat(newInt);
                    eves = eves.trim();
                    eves += "\n";
                }
                eves = eves.trim();

                // if today is before d2
                if (d1 < d2)
                    additionaltext += "Today is " + holidayinfo.safename + bonustext + " " + eves + "!\n";
                else
                    additionaltext += holidayinfo.safename + bonustext + " is Today " + eves + "!\n";
            }

            if (additionaltext !== "")
            {
                outs.push({ content: additionaltext });

                if (!showwed)
                    continue;
            }

            var dow_d1 = (d1.getDay() + parseInt(DOWChosen)) % 7; // get day of week (making wed = 0)
            let d1_useage = new Date(d1.getFullYear(), d1.getMonth(), 1); // today that has been wednesday shifted
            d1_useage.setDate(d1.getDate() - dow_d1); // modify today for wednesdays

            var dow_d2 = (d2.getDay() + parseInt(DOWChosen)) % 7; // get day of week (making wed = 0)
            let d2_useage = new Date(d2.getFullYear(), d2.getMonth(), 1); // holiday that has been wednesday shifted
            d2_useage.setDate(d2.getDate() - dow_d2); // modify holiday for wednesdays

            let weeks = Math.abs((d1_useage.getTime() - d2_useage.getTime()) / 3600000 / 24 / 7); // how many weeks
            
            if (weeks < .3) //for when it is the week before and set to .142
                weeks = 0;

            weeks = Math.round(weeks);

            if (DOWChosen == "04")
            {
                var wednesdayoverlay = "Wednesday_Plural.png"; //gets the wednesday portion
                if (weeks == 1)
                    wednesdayoverlay = "Wednesday_Single.png"; //one week means single info

                if (d2 < d1)
                {
                    wednesdayoverlay = "sinces";
                    if (weeks == 1)
                        wednesdayoverlay = "since";
                }

                var templocal = babadata.datalocation + "FrogHolidays/"; //creates the output frog image

                var outputname = "outputfrog_" + i + ".png"; //default output name
                if (d1.getTime() - d2.getTime() == 0)
                {
                    outputname =  holidayinfo.name + ".png"; //if today is the event, show something cool

                    var custom = false;
                    if (holidayinfo.name == "date")
                        custom = true;
                    else
                    {
                        try
                        {
                            fs.accessSync(templocal + outputname, fs.constants.R_OK | fs.constants.W_OK);
                        } 
                        catch (err)
                        {
                            custom = true;
                            outputname = "date.png";
                        }
                    }

                    if (custom)
                    {
                        // images(templocal + outputname).save(templocal + "outputfrog_0.png");

                        Jimp.read(templocal + outputname)
                            .then(function (image) {
                                loadedImage = image;
                                return Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
                            })
                            .then(function (font) {
                                loadedImage.print(font, 190, 20, holidayinfo.safename)
                                        .write(templocal + "outputfrog_0.png");
                            })
                            .catch(function (err) {
                                console.error(err);
                            });
                        outputname = "outputfrog_0.png";
                    }
                }
                else
                {
                    weeks = Math.floor(weeks);
                    if (weeks > 999999) weeks = 1000000;
                    var base = holidayinfo.name + "_base.png";

                    try 
                    {
                        await MakeImage(templocal, base, wednesdayoverlay, weeks, outputname, holidayinfo, false);
                    }
                    catch(err) // probably not nessisary
                    {
                        await MakeImage(templocal, "date_base.png", wednesdayoverlay, weeks, outputname, holidayinfo, true);
                    }
                    
                }
                
                var tempFilePath = templocal + outputname; // temp file location
                templocationslist.push(tempFilePath);
            }
        }
        
        for (var j = 0; j < templocationslist.length; j++)
        {
            var newAttch = new Discord.AttachmentBuilder(templocationslist[j], 
                { name: IsHoliday[j].name + '.png', description : "It is " + IsHoliday[j].name + ", my dudes"}); //makes a new discord attachment
            try
            {
                fs.accessSync(templocationslist[j], fs.constants.R_OK | fs.constants.W_OK);
            } 
            catch (err)
            {
                var newAttch = new Discord.AttachmentBuilder(templocal + "error.png", 
                    { name: 'error.png', description : "It is error time, my dudes! Brug why you erroring baba?"}); //makes a new discord attachment (default fail image)
            }
            
            var op = { content: "It is Wednesday, My BABAs", files: [newAttch] }
            outs.push(op);
        }
    }
    else
    {
        if ((d1.getDay() == 3 && (mode == "00" || mode == "04")))
            outs.push({ content: "It is Wednesday, My Dudes" });
        else
        {
            if (msgContent.replace("wednesday", "").replace("when is", "").replace("day of week", "").replace("days until", "").trim() == "next")
                outs.push({ content: "The definition of insanity is doing the same thing over and over expecting a different result" });
            else
                outs.push({ content: "FUNNYDOW" });
        }
    }

    if (outs.length == 0)
        outs.push({ content: "Baba Broke Getting that Event!" });
    
    return outs;
}

/**
 * Lookup a user's display name or other derived identity via the DB helper
 * `NameFromUser` and return a human-readable string.
 *
 * @param {Object} user - Discord user object or identifier used by `NameFromUser`.
 * @returns {Promise<string>} Readable description or an error message.
 */
async function babaWhomst(user)
{
    var result = await NameFromUser(user);

    if (result == null)
        return "Baba could not find that user!";

    // do formatting on result
    if (result.length == 0)
    {
        console.log(`Whomst lookup for id ${user.id} (${user.username}) returned no results`)
        return  `User ${user.username} not found!`;
    }
    else
    {
        return `User ${user.username} is ${result}`;
    }
}

/**
 * Fetch hurricane image data and return a payload via callback.
 *
 * Behavior:
 * - Uses `checkHurricaneStuff` (from helper `commandHelpers`) to search for
 *   the best matching hurricane info; that routine may inspect an internal
 *   hurricane database and return an `ImageURL`.
 * - Downloads an image from the resolved URL, writes it to `babadata.temp`
 *   and returns an attachment payload via the provided callback.
 *
 * @param {string} hurricanename - Query string describing desired hurricane.
 * @param {Function} callback - Callback invoked with the message payload.
 * @returns {Promise<void>}
 */
async function babaHurricane(hurricanename, callback)
{
    var tempFilePath = babadata.temp + "hurricane.png";
    const file = fs.createWriteStream(tempFilePath);
    var url = "https://www.nhc.noaa.gov/xgtwo/two_atl_7d0.png";

    var binus = "";

    console.log("Hurricane lookup for " + hurricanename);

    // check the hurricane.json for exisiting name or subname classification:
        // if name, use the the link saved  -DONE
        // else if name starts with existing letter, provide the link to corresponding letter  -DONE
        // else look up on the site starting with the number indexed letter
            // if letter is not a-z skip
            // if letter pulls a blank folder, skip (as may be something far down alphabet)
            // XX if letter (to number) pulls a folder with files (check for xml file)
                // if xml file exists, get name and check if in db and matches
                    // if not in db, add to db with name of hurricane and link to image
                    // check if name matches now or subname, or subletter
                        // if so, we got em boys, use image in db
                    // if name doesnt match, check next index and repeat starting at XX
                // if xml file does not exist, stop searching as empty folder means end of line

    // {"name": "bikus", "letter": "B", "url": "bikus.png"}
    var hfull = undefined;
    if (hurricanename != "" && hurricanename != null)
    {
        var hurricaneInfo = await checkHurricaneStuff(hurricanename);

        if (hurricaneInfo != null)
        {
            hfull = " for " + (hurricaneInfo.Category == "N/A" ? hurricaneInfo.Type : hurricaneInfo.Category + " " + hurricaneInfo.Type) + " " + hurricaneInfo.Name;

            if (hurricaneInfo.OverideText != null)
            {
                if ("AltName" in hurricaneInfo.OverideText)
                    hfull += " (Closest Match to " + hurricaneInfo.OverideText.AltName + ")";
                else if ("NumberSearch" in hurricaneInfo.OverideText)
                    hfull += " (Hurricane Numbered: " + hurricaneInfo.OverideText.NumberSearch + ")";
            }

            url = hurricaneInfo.ImageURL;

            binus = hfull;
        }
    }
    
    console.log(url);

    const request = https.get(url, function(response) {
       response.pipe(file);
    
       // after download completed close filestream
        file.on("finish", () => {
            file.close();
            console.log("Download Completed for " + hurricanename);

            var vv = hfull === undefined ? " for all Hurricanes" : hfull;
           
            var newAttch = new Discord.AttachmentBuilder(tempFilePath, 
                { name: vv + '.png', description : "Hurricane Info" + vv}); //makes a new discord attachment

           callback({ content: "Baba Hurricane Info" + binus, files: [newAttch] });
        });
    });
}

/**
 * Fetch a random cat image from `thiscatdoesnotexist.com`, save to temp,
 * and invoke the callback with a payload containing the file.
 *
 * @param {Function} callback - Callback invoked with `{ content, files }`.
 * @returns {void}
 */
function babaCat(callback)
{
    var tempFilePath = babadata.temp + "hurricane.png";
    const file = fs.createWriteStream(tempFilePath);
    var url = "https://thiscatdoesnotexist.com/";

    console.log(url);

    const request = https.get(url, function(response) {
       response.pipe(file);
    
       // after download completed close filestream
       file.on("finish", () => {
           file.close();
           console.log("Download Completed for Cat");

           callback({ content: "Baba Cat", files: [tempFilePath] });
       });
    });
}

/**
 * Download weather image from `wttr.in` for the provided city and return an
 * attachment payload via the callback. `mode` selects URL variant.
 *
 * @param {string} mode - One of 'four', 'deets', or other modes controlling URL.
 * @param {string} city - City name to query.
 * @param {Function} callback - Callback invoked with `{ content, files }`.
 * @returns {void}
 */
function babaWeather(mode, city, callback)
{
    //TODO: add check if site down
    var tempFilePath = babadata.temp + "weather.png";
    const file = fs.createWriteStream(tempFilePath);
    var cityUnderscore = city.replace(" ", "%20");
    var url = "https://wttr.in/" + cityUnderscore + ".png?u";

    if (mode == "four")
        url = "https://wttr.in/" + cityUnderscore + ".png?u";
    else if (mode == "deets")
        url = "https://v2.wttr.in/" + cityUnderscore + ".png?u";

    console.log(url);

    const request = https.get(url, function(response) {
       response.pipe(file);
    
       // after download completed close filestream
       file.on("finish", () => {
           file.close();
           console.log("Download Completed for Weather");

           var newAttch = new Discord.AttachmentBuilder(tempFilePath, 
               { name: city + '.png', description : "Weather info for " + city}); //makes a new discord attachment

           callback({ content: "Baba Weather", files: [newAttch] });
        }).on('error', () => {
            callback({ content: "Baba Weather Error" });
        });
    });
}

/**
 * Schedule a reminder for the user. This function resolves to the scheduled
 * Date object and uses `reverseDelay` from `remindersByBaba` to register the
 * reminder in the system (which performs persistence and delayed delivery).
 *
 * Behavior:
 * - Parses `time` into a Date-like object using `getTimeFromString`.
 * - If `date` is provided it parses it with `FindDate` and sets the time
 *   component; otherwise it schedules for today or tomorrow depending on
 *   whether the time has already passed.
 * - Looks up the current channel via `interaction.guild.channels.fetch`
 *   and passes the channel to `reverseDelay` to actually register the reminder.
 *
 * @param {string} message - Reminder text.
 * @param {string} time - Time string to parse (e.g., '14:30').
 * @param {string|null} date - Optional date string to parse. If null, use today/tomorrow.
 * @param {Object} interaction - Discord interaction object used to find guild/channel.
 * @returns {Promise<Date>} The Date scheduled for the reminder.
 */
async function babaRemind(message, time, date, interaction)
{
    var theTime = getTimeFromString(time); // returns Date object for today at that time
    var now = getD1(true); // now in correct timezone
    var theDate = null;

    if (date != null)
    {
        var parsedDate = FindDate(date); 
        theDate = new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day);
        // Set the time part
        theDate.setHours(theTime.getHours(), theTime.getMinutes(), theTime.getSeconds(), theTime.getMilliseconds());
    }
    else
    {
        // No date provided — use today's time, but if it's already passed, use tomorrow
        if (theTime.getTime() <= now.getTime())
        {
            theTime.setDate(theTime.getDate() + 1); // move to tomorrow
        }
        theDate = theTime;
    }

    var newTimeFromNow = theDate.getTime() - now.getTime();

    var fullmsg = message;

    // obtain channel
    var channel = await interaction.guild.channels.fetch(interaction.channelId);

    await reverseDelay(null, interaction.member.id, channel, fullmsg, newTimeFromNow, true);

    return theDate;
}

/**
 * Download aurora forecast image for a given time from NOAA services and
 * invoke `callback` with a message payload containing the file.
 *
 * @param {string} time - Time identifier used to pick the aurora image.
 * @param {Function} callback - Callback invoked with payload `{ content, files }`.
 * @returns {void}
 */
function babaAurora(time, callback)
{
    var url = "https://services.swpc.noaa.gov/experimental/images/aurora_dashboard/" + time + "_static_viewline_forecast.png"
    var tempFilePath = babadata.temp + "aurora.png";
    const file = fs.createWriteStream(tempFilePath);
    
    const request = https.get(url, function(response) {
        response.pipe(file);
     
        // after download completed close filestream
         file.on("finish", () => {
             file.close();
             console.log("Download Completed for Aurora");
 
             var vv = "Aurora Forecast for " + time;
            
             var newAttch = new Discord.AttachmentBuilder(tempFilePath, 
                 { name: vv + '.png', description : "Aurora Info" + vv}); //makes a new discord attachment
 
            callback({ content: "Baba Aurora Info", files: [newAttch] });
         });
     });
}

/**
 * Query a public Google Calendar for 'goodberry' events and return via
 * callback. Uses `public-google-calendar` package.
 *
 * @param {Function} callback - Callback invoked with `{ events }`.
 * @returns {void}
 */
function babaGoodberrys(callback)
{
    publicGoogleCalendar = new PublicGoogleCalendar({ calendarId: '24gbb7942jsn557e7l93in7itjmo5lqj@import.calendar.google.com' });

    publicGoogleCalendar.getEvents(function(err, events) 
    {
        if (err) { return console.log(err.message); }
        return callback({ events: events});
    });
}

module.exports = {
    babaFriday, 
    babaHelp, 
    babaPlease, 
    babaPizza, 
    babaVibeFlag, 
    babaYugo, 
    babaHaikuEmbed,
    babaHaikuLinks,
    babaUntilHolidays,
    babaDayNextWed,
    babaRepost,
    babaProgress,
    babaJeremy,
    babaRNG,
    babaWhomst,
    babaHurricane,
    babaCat,
    babaWeather,
    babaRemind,
    babaAurora,
    babaGoodberrys
};