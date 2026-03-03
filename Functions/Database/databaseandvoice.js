/**
 * @fileoverview Database and voice helper utilities for the BaBot Discord bot.
 *
 * Provides haiku filtering (by user, channel, date, keyword), purity calculation
 * and formatting, random/custom haiku selection, holiday loading from the DB,
 * and user-name resolution from a Discord user object or raw user ID.
 *
 * @module Functions/Database/databaseandvoice
 */

var babadata = require('../../babotdata.json'); //baba configuration file

const fs = require('fs');

const { NameFromUserIDID } = require('./databaseVoiceController');
const { FindDate } = require('../HelperFunctions/basicHelpers');
const { getD1 } = require('../../Tools/overrides');

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Filters a haiku list to only those belonging to a given user.
 *
 * Matching is attempted against the haiku's PersonName, DiscordID, DiscordName,
 * and any alt-names stored in the global userCache, all case-insensitively.
 *
 * Implicit global `altNames`:
 *   Inside the `for...of global.userCache` loop, `altNames = value.AltNames`
 *   (line ~43) is assigned without `var`/`let`/`const`, making it an accidental
 *   implicit global variable. In non-strict mode this creates/overwrites a
 *   property on the global object rather than a local variable.
 *
 * @param {string} messageTerm - The search string (typically the full message content).
 * @param {Object[]} haikuList - Array of haiku objects to filter.
 * @returns {Object[]} Filtered array of haiku objects that match the user term.
 */
function FilterUser(messageTerm, haikuList)
{
    var messageTerm = messageTerm.toLowerCase();
    var filterToDiscordName = haikuList.filter(function(haiku)
    {
        var lowerDiscordName = haiku.DiscordName.toLowerCase();
        return messageTerm.includes(lowerDiscordName);
    });

    var filteredAltEventNames = [];
    for (const [key, value] of Object.entries(global.userCache))
    {
        altNames = value.AltNames;
        var filteredAltNames = altNames.filter(function(altName)
        {
            if (altName == null) return false;
            var lowerAltName = altName.toLowerCase();
            return messageTerm.includes(lowerAltName);
        });

        if (filteredAltNames.length > 0)
        {
            filteredAltEventNames.push(value.PersonName);
        }
    }

    var filteredList = haikuList.filter(function(haiku) 
    {
        var lowerName = haiku.PersonName.toLowerCase();
        var lowerID = haiku.DiscordID.toLowerCase();

        if (messageTerm.includes(lowerName) || messageTerm.includes(lowerID))
        {
            return true;
        }

        // if filterToDiscordName is not empty, then we check if PersonName is in filterToDiscordName
        if (filterToDiscordName.length > 0)
        {
            for (var x in filterToDiscordName)
            {
                if (filterToDiscordName[x].PersonName == haiku.PersonName)
                {
                    return true;
                }
            }
        }

        // if filteredAltEventNames is not empty, then we check if PersonName is in filteredAltEventNames
        if (filteredAltEventNames.length > 0)
        {
            for (var x in filteredAltEventNames)
            {
                if (filteredAltEventNames[x] == haiku.PersonName)
                {
                    return true;
                }
            }
        }
    });

    return filteredList;
}

/**
 * Filters a haiku list to only those recorded in a specific channel.
 *
 * Matches against the haiku's ChannelName and ChannelID, case-insensitively.
 *
 * @param {string} messageTerm - The search string containing the channel name or ID.
 * @param {Object[]} haikuList - Array of haiku objects to filter.
 * @returns {Object[]} Filtered array of haiku objects that match the channel term.
 */
function FilterChannel(messageTerm, haikuList)
{
    var messageTerm = messageTerm.toLowerCase();
    var filteredList = haikuList.filter(function(haiku) 
    {
        var lowerChannel = haiku.ChannelName.toLowerCase();
        var lowerChannelID = haiku.ChannelID.toLowerCase();
        return messageTerm.includes(lowerChannel) || messageTerm.includes(lowerChannelID);
    });

    return filteredList;
}

/**
 * Filters a haiku list by date using an "Exact", "Before", or "After" comparison.
 *
 * Any date component (Year, Month, Day) that is `null` is treated as a wildcard
 * and will always match. Month values follow JavaScript's `Date.getMonth()` convention
 * (0-indexed, so January = 0).
 *
 * @param {Object[]} haikuList - Array of haiku objects to filter.
 * @param {"Exact"|"Before"|"After"} BFE - The comparison mode.
 * @param {number|null} Year  - Four-digit year to match, or `null` to ignore.
 * @param {number|null} Month - Zero-indexed month to match, or `null` to ignore.
 * @param {number|null} Day   - Day of the month to match, or `null` to ignore.
 * @returns {Object[]|null} Filtered haiku array, or `null` if BFE is unrecognised.
 */
function FilterDate(haikuList, BFE, Year, Month, Day)
{
    if (BFE == "Exact")
    {
        var filteredList = haikuList.filter(function(haiku) 
        {
            var haikuDate = new Date(haiku.Date);
            return  (Year == null ? true : haikuDate.getFullYear() == Year) &&
                    (Month == null ? true : haikuDate.getMonth() == Month) &&
                    (Day == null ? true : haikuDate.getDate() == Day);
        });

        return filteredList;
    }
    else if (BFE == "Before")
    {
        var filteredList = haikuList.filter(function(haiku) 
        {
            var haikuDate = new Date(haiku.Date);
            return  (Year == null ? true : haikuDate.getFullYear() <= Year) &&
                    (Month == null ? true : haikuDate.getMonth() <= Month) &&
                    (Day == null ? true : haikuDate.getDate() <= Day);
        });

        return filteredList;
    }
    else if (BFE == "After")
    {
        var filteredList = haikuList.filter(function(haiku) 
        {
            var haikuDate = new Date(haiku.Date);
            return  (Year == null ? true : haikuDate.getFullYear() >= Year) &&
                    (Month == null ? true : haikuDate.getMonth() >= Month) &&
                    (Day == null ? true : haikuDate.getDate() >= Day);
        });

        return filteredList;
    }

    return null;
}

/**
 * Filters a haiku list to those whose text contains every word in the search term.
 *
 * The search term is split on spaces and each word must appear (case-insensitively)
 * in the haiku text for the haiku to be included.
 *
 * @param {string} messageTerm - Space-separated keyword(s) to search for.
 * @param {Object[]} haikuList - Array of haiku objects to filter.
 * @returns {Object[]} Filtered array of haiku objects matching all keywords.
 */
function FilterKeyword(messageTerm, haikuList)
{
    var splitbySpace = messageTerm.split(" ");
    // check if all words are in the haiku
    var filteredList = haikuList.filter(function(haiku) 
    {
        var lowerHaiku = haiku.Haiku.toLowerCase();
        for (var x in splitbySpace)
        {
            if (!lowerHaiku.includes(splitbySpace[x].toLowerCase()))
            {
                return false;
            }
        }

        return true;
    });

    return filteredList;
}

/**
 * Generates a random "Frankenstein" haiku by randomly recombining lines from the list.
 *
 * Each existing haiku is split into its three lines (5-7-5). A new haiku is assembled
 * by independently selecting a random first five-syllable line, a random seven-syllable
 * line, and a random second five-syllable line from all available lines.
 *
 * @param {Object[]} haikuList - Array of haiku objects to draw lines from.
 * @returns {Object} A synthetic haiku object with `PersonName`, `HaikuFormatted`,
 *   `DiscordName`, `Date`, `ChannelName`, and `Accidental` fields.
 */
function GenerateRandomHaiku(haikuList)
{
    var object = {};
    object.PersonName = "No One";
    object.HaikuFormatted = "";
    object.DiscordName = "No One";
    object.Date = getD1();
    object.ChannelName = "No Channel";
    object.Accidental = 1;

    var fives = [];
    var sevens = [];
    for (var x in haikuList)
    {
        var hform = haikuList[x].HaikuFormatted.replace("\r \r ", "\r\n\r\n").split("\r\n\r\n");

        fives.push(hform[0]);
        sevens.push(hform[1]);
        fives.push(hform[2]);
    }

    var thefive = fives[Math.floor(Math.random() * fives.length)];
    var theseven = sevens[Math.floor(Math.random() * sevens.length)];
    var thefive2 = fives[Math.floor(Math.random() * fives.length)];

    object.HaikuFormatted = thefive + "\r\n\r\n" + theseven + "\r\n\r\n" + thefive2;

    return object;
}

/**
 * Collects all unique Discord display names ever used by a given Discord ID.
 *
 * Iterates over the full haiku list and gathers every distinct DiscordName
 * that is associated with the supplied Discord user ID.
 *
 * @param {Object[]} haikuList - The complete (unfiltered) haiku list.
 * @param {string} discordID   - The Discord user ID to look up.
 * @returns {string[]} De-duplicated array of Discord display names for that ID.
 */
function GenerateAssociatedNames(haikuList, discordID)
{
    var associatedNames = [];
    for (var x in haikuList)
    {
        if (haikuList[x].DiscordID == discordID)
        {
            associatedNames.push(haikuList[x].DiscordName);
        }
    }

    // remove duplicates
    associatedNames = associatedNames.filter(function(item, pos) {
        return associatedNames.indexOf(item) == pos;
    });

    return associatedNames;
}

/**
 * Builds a purity-statistics list from a haiku list, grouped by a chosen dimension.
 *
 * Each entry in the returned list contains:
 * - `Name`       – group key (channel name, person name, or date string)
 * - `ID`         – Discord channel/user ID (omitted for `"date"` mode)
 * - `Count`      – total haiku count for the group
 * - `Accidental` – cumulative accidental count
 * - `Purity`     – percentage of haikus that were accidental (`Accidental / Count * 100`)
 *
 * @param {Object[]} haikuList            - Array of haiku objects to aggregate.
 * @param {"chans"|"users"|"date"} pMode  - Grouping dimension.
 * @returns {Object[]} Array of purity-stat objects, one per unique group key.
 */
function GetPurityList(haikuList, pMode)
{
    var purityList = [];
    
    for (var x in haikuList)
    {
        var obj = {};
        var haiku = haikuList[x];
        if (pMode == "chans")
        {
            // see if haiku.ChannelName is in purityList
            var found = false;
            for (var y in purityList)
            {
                if (purityList[y].Name == haiku.ChannelName)
                {
                    found = true;
                    obj = purityList[y];
                    break;
                }
            }

            if (!found)
            {
                obj.Name = haiku.ChannelName;
                obj.ID = haiku.ChannelID; 
                obj.Count = 0;
                obj.Accidental = 0;
                obj.Purity = 0;

                purityList.push(obj);
            }
        }
        else if (pMode == "users")
        {
            // see if haiku.PersonName is in purityList
            var found = false;
            for (var y in purityList)
            {
                if (purityList[y].Name == haiku.PersonName)
                {
                    found = true;
                    obj = purityList[y];
                    break;
                }
            }

            if (!found)
            {
                obj.Name = haiku.PersonName;
                obj.ID = haiku.DiscordID;
                obj.Count = 0;
                obj.Accidental = 0;
                obj.Purity = 0;

                purityList.push(obj);
            }
        }
        else if (pMode == "date")
        {
            // see if haiku.Date is in purityList
            var found = false;
            for (var y in purityList)
            {
                if (purityList[y].Name == haiku.Date)
                {
                    found = true;
                    obj = purityList[y];
                    break;
                }
            }

            if (!found)
            {
                obj.Name = haiku.Date;
                obj.Count = 0;
                obj.Accidental = 0;
                obj.Purity = 0;

                purityList.push(obj);
            }
        }

        obj.Count++;
        obj.Accidental += haiku.Accidental;
        obj.Purity = obj.Accidental / obj.Count  * 100;
    }

    return purityList;
}

/**
 * Selects one or more haikus from the cache according to the requested mode.
 *
 * Modes:
 * - `1` – filter by user (messageTerm = search string)
 * - `2` – filter by channel (messageTerm = search string)
 * - `3` – filter by exact date (messageTerm = date string)
 * - `4` – custom multi-filter (messageTerm = array: [startDate, endDate, channel, person, keyword, outputMode, purityMode])
 * - `5` – filter by keyword (messageTerm = search string)
 * - `6` – generate a random Frankenstein haiku from the filtered list
 *
 * For mode `4` with `messageTerm[5] == "purity"`, a raw purity list is returned instead
 * of a haiku selection. For mode `4` with `messageTerm[5] == "all"`, the full filtered
 * list is returned.
 *
 * @param {string|Array} messageTerm - Search term or parameter array depending on mode.
 * @param {1|2|3|4|5|6} mode        - Selection mode (see above).
 * @returns {Array|null} `[haikuArray, associatedNames]` for single selections,
 *   a raw purity list for purity mode, the full filtered list for "all" mode,
 *   or `null` if no haikus match.
 */
function HaikuSelection(messageTerm, mode)
{
    var haikuJson = fs.readFileSync(babadata.datalocation + "HaikusCache.json");
    var haikuList = JSON.parse(haikuJson);
    var entierHaikuList = haikuList;

    if (mode == 1)
    {
        // filter by user (messageTerm)
        haikuList = FilterUser(messageTerm, haikuList);
    }
    else if (mode == 2)
    {
        // filter by channel (messageTerm)
        haikuList = FilterChannel(messageTerm, haikuList);
    }
    else if (mode == 3)
    {
        // filter by date (messageTerm)
		var IsDate = FindDate(messageTerm, true);
        var Year = IsDate.year;
        var Month = IsDate.month;
        var Day = IsDate.day;

        haikuList = FilterDate(haikuList, "Exact", Year == 0 ? null : Year, Month == 0 ? null : Month - 1, Day == 0 ? null : Day);
    }
    else if (mode == 5)
    {
        // filter by keyword (messageTerm)
        haikuList = FilterKeyword(messageTerm, haikuList);
    }
    else if (mode == 4)
    {
        // custom filter
		var sd = messageTerm[0];
		var startDate = null;
		var ed = messageTerm[1];
		var endDate = null;
		var chan = messageTerm[2];
		var pson = messageTerm[3];
		var kword = messageTerm[4];

		if (sd != null)
			startDate = FindDate(sd, true);
		if (ed != null)
			endDate = FindDate(ed, true);

		if (startDate == null && endDate != null) 
		{
			startDate = endDate;
			endDate = null;
		}
        if (startDate != null)
        {
            if (endDate != null)
            {
                if (endDate < startDate)
                {
                    var temp = startDate;
                    startDate = endDate;
                    endDate = temp;
                }

                haikuList = FilterDate(haikuList, "After", startDate.year == 0 ? null : startDate.year, startDate.month == 0 ? null : startDate.month - 1, startDate.day == 0 ? null : startDate.day);
                haikuList = FilterDate(haikuList, "Before", endDate.year == 0 ? null : endDate.year, endDate.month == 0 ? null : endDate.month - 1, endDate.day == 0 ? null : endDate.day);
            }
            else
            {
                haikuList = FilterDate(haikuList, "Exact", startDate.year == 0 ? null : startDate.year, startDate.month == 0 ? null : startDate.month - 1, startDate.day == 0 ? null : startDate.day);
            }
        }

        if (chan != null)
        {
            haikuList = FilterChannel(chan, haikuList);
        }

        if (pson != null)
        {
            haikuList = FilterUser(pson, haikuList);
        }

        if (kword != null)
        {
            haikuList = FilterKeyword(kword, haikuList);
        }

        if (messageTerm[5] == "purity")
        {
            var pMode = messageTerm[6];
            
            var purityList = GetPurityList(haikuList, pMode);

            return purityList;
        }
    }

    // if no haikus in list, return null
    if (haikuList.length == 0) return null;

    var haiku = null;

    // if mode == 6 then we get a random generated haiku of 5-7-5, need function to generate haiku
    if (mode == 6) return [[GenerateRandomHaiku(haikuList)], null];

    // if mode == 4 and messageTerm[5] == "all" then we return the entire list
    if (mode == 4 && messageTerm[5] == "all") return [haikuList, null];

    haiku = haikuList[Math.floor(Math.random() * haikuList.length)];

    var associatedNames = GenerateAssociatedNames(entierHaikuList, haiku.DiscordID);

    return [[haiku], associatedNames];
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the bot-database PersonName for a Discord user object.
 *
 * Wraps {@link NameFromUserID} using `user.id` as the lookup key.
 *
 * @param {import('discord.js').User} user - A Discord.js User (or GuildMember) object.
 * @returns {Promise<string>} Resolves with the PersonName from the database,
 *   or a random friendly fallback string if the user is not found.
 */
function NameFromUser(user)
{
    var userDBItemPromise = new Promise((resolve, reject) => {
        NameFromUserID(user.id).then((result) =>
        {
            resolve(result);
        });
    });

    return userDBItemPromise;
}

/**
 * Resolves the bot-database PersonName for a raw Discord user ID.
 *
 * Queries the database controller via {@link NameFromUserIDID}. If the lookup fails
 * (e.g. unknown user), a random humorous fallback name is returned instead of
 * rejecting the promise.
 *
 * Dead code on error path:
 *   Line `fakeVales[Math.floor(Math.random() * fakeVales.length)]` computes a
 *   random index but discards the result — it is not assigned to anything. The
 *   `resolve(...)` on the very next line re-computes the same random selection
 *   independently, so the first indexing expression is effectively a no-op.
 *
 * @param {string} userid - The Discord snowflake user ID to look up.
 * @returns {Promise<string>} Resolves with the PersonName, or a random
 *   friendly placeholder (e.g. "Buddy", "Pal") on error.
 */
function NameFromUserID(userid)
{
    var userDBItemPromise = new Promise((resolve, reject) => {
        NameFromUserIDID(userid).then((result) =>
        {
            resolve(result.PersonName);
        }).catch((err) => 
        {
            var fakeVales = ["Buddy", "Pal", "Buddy Man", "Buddy Pal", "Fella", "Friend", "Friendo", "Friend Buddy", "Friend Pal", "Friend Buddy Pal"];
            fakeVales[Math.floor(Math.random() * fakeVales.length)];
            resolve(fakeVales[Math.floor(Math.random() * fakeVales.length)]);
        });
    });

    return userDBItemPromise;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Formats a single purity-list entry as a display string for Discord.
 *
 * For date entries (`type == 2`) the name is rendered as a Discord timestamp mention;
 * for channel entries (`type == 1`) a `#channel` mention is used; for user entries
 * an `@user` mention is used. Purity is rounded to three decimal places.
 *
 * @param {Object} line       - A purity-stat entry (mutated in-place for name/purity).
 * @param {number} type       - Display type: `1` = channel, `2` = date, other = user.
 * @returns {string} Formatted one-line string ready for embedding in a Discord message.
 */
function GenInfo(line, type)
{
	// if (type == 2) line.Name = line.Name.toLocaleDateString('en-US', options);
	if (type == 2) line.Name = "<t:" + line.Name.getTime() / 1000 + ":D>";
	line.Purity = +Number(line.Purity).toFixed(3);
	return line.Name + (type == 2 ? "" : " [<" + (type == 1 ? "#" : "@") + line.ID + ">]") + "\n\t`" + line.Count + " Haikus` - `" + line.Accidental + " Accidental` - `" + line.Purity + "% Purity`";
}

/**
 * Comparator for sorting purity-list entries by haiku count in descending order.
 *
 * Intended for use with `Array.prototype.sort`.
 *
 * @param {{ Count: number }} a - First entry.
 * @param {{ Count: number }} b - Second entry.
 * @returns {1|-1|0} Positive if `a` should sort after `b`, negative if before, 0 if equal.
 */
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

/**
 * Sorts and paginates a purity-stat list into Discord-ready page strings.
 *
 * Entries are sorted by haiku count (descending via {@link compare}) and then split
 * into pages based on `pagestuff.ipp` (items per page). Each page is rendered as a
 * newline-separated string of {@link GenInfo} lines.
 *
 * @param {Object[]} resultList     - Raw purity-stat entries (from {@link GetPurityList}).
 * @param {number}   type           - Display type forwarded to {@link GenInfo}
 *                                    (`1` = channel, `2` = date, other = user).
 * @param {{ ipp: number }} pagestuff - Pagination config; `ipp` is items per page.
 * @returns {{ retstring: string[], total: number }} `retstring` is an array of
 *   page strings; `total` is the overall entry count.
 */
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

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Finds and returns the `sub` collection of a nested holiday entry by its ID.
 *
 * Used internally by {@link ObtainDBHolidays} to locate the correct sub-object
 * when attaching child events to a parent holiday entry.
 *
 * @param {Object} retme - The current top-level holiday map being built.
 * @param {string|number} id - The parent event ID to search for.
 * @returns {Object} The `sub` object of the matching entry, or `retme` itself if
 *   no match is found.
 */
function GetParent(retme, id)
{
	for (var x in retme)
	{
		if (retme[x].id == id) return retme[x].sub;
	}
	return retme;
}

/**
 * Loads and structures the holiday/event data from the local JSON database file.
 *
 * Reads `HolidayFrogs.json` from the configured data location and converts the flat
 * array into a nested map keyed by `EventRealName`. Each entry contains:
 * - `safename`   – the frog-safe event name
 * - `mode`       – event scheduling mode (`-1` means it has child events via `sub`)
 * - `id`         – unique event ID
 * - `day`        – day of month (if applicable)
 * - `month`      – month number (if applicable)
 * - `week`       – week number (if applicable)
 * - `dayofweek`  – day of week (if applicable)
 * - `name`       – array of all display names for this event
 * - `sub`        – nested child-event map (present when `mode == -1`)
 *
 * @returns {Object} Nested holiday map structured for bot consumption.
 */
function ObtainDBHolidays()
{
    let holidayJson = fs.readFileSync(babadata.datalocation + "HolidayFrogs.json");
    var result = JSON.parse(holidayJson);

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

    return retme;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    NameFromUser,
    NameFromUserID,
	FormatPurityList,
    ObtainDBHolidays,
    HaikuSelection,
}