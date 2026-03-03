/**
 * @module commandHelpers
 * @description Helper utilities for Discord bot commands. Provides image composition
 * using Jimp for frog/holiday week-count images (including multi-hundred-week "bonus"
 * stacking), holiday date look-up and next-holiday finding, hurricane information
 * fetching and caching (NHC XML), haiku Discord embed generation, and miscellaneous
 * Discord message-building utilities such as month-name conversion.
 */

var babadata = require('../../babotdata.json'); //baba configuration file

const fs = require('fs');
const Jimp = require('jimp');
const fetch = require('node-fetch');

const Discord = require('discord.js'); //discord module for interation with discord api

const { dateDiffInDays, GetDate, GetSimilarName, uExist } = require('./basicHelpers.js');
const { getHurricaneInfo, saveUpdatedHurrInfo } = require('../Database/databaseVoiceController.js');
const { getD1 } = require('../../Tools/overrides.js');

const options = { year: 'numeric', month: 'long', day: 'numeric' }; // for date parsing to string

/**
 * Returns the absolute file-system path to the error flag image used when an
 * image asset cannot be located or loaded.
 *
 * @returns {string} Full path to `error.png` inside the configured Flags directory.
 */
function getErrorFlag()
{
	return babadata.datalocation + "Flags/" + "error.png";
}

/**
 * Composes and writes a frog/holiday week-count image by layering multiple PNG
 * assets with Jimp.  Handles week counts over 100 via {@link BonusGenerator} and
 * optionally prints text overlays for holiday names or years.
 *
 * @async
 * @param {string}  templocal        - Directory path (with trailing separator) that
 *                                     contains all image assets.
 * @param {string}  base             - Filename of the base background image.  Falls
 *                                     back to `"date_base.png"` if the file cannot be
 *                                     read, which also forces `textoverlay = true`.
 * @param {string}  wednesdayoverlay - Filename of the "Wednesday" label overlay, or
 *                                     `"since"` / `"sinces"` to print a text label
 *                                     instead of an image.
 * @param {number}  weeks            - Week count to display.  Values above 999 999 are
 *                                     capped and a "+" suffix is rendered.
 * @param {string}  outputname       - Filename to write the finished image to inside
 *                                     `templocal`.
 * @param {Object}  holidayinfo      - Holiday metadata object.
 * @param {string}  holidayinfo.name - Internal holiday key; `"date"` triggers text
 *                                     rendering of `holidayinfo.safename`.
 * @param {string}  holidayinfo.safename - Human-readable holiday name used as a text
 *                                        overlay when `textoverlay` is true or name is
 *                                        `"date"`.
 * @param {number}  [holidayinfo.year]   - Optional year printed above the image when
 *                                        present and name is not `"date"`.
 * @param {boolean} textoverlay      - When `true`, renders the holiday safe-name (or
 *                                     year) as a text overlay instead of relying solely
 *                                     on image assets.
 * @returns {Promise<void>}
 */
async function MakeImage(templocal, base, wednesdayoverlay, weeks, outputname, holidayinfo, textoverlay) //Image Creation is now function
{
	var plu = false;
	if (weeks > 999999)
	{
		plu = true;
		weeks = 999999;
	}

	var bonus = 0;
	var yeartop = holidayinfo.year && holidayinfo.name != "date" ? true : false;

	if (weeks > 100) //set bonus val and reset weeks to between 1 - 100
	{
		bonus = Math.floor(weeks / 100);
		weeks = weeks % 100;
	}

	Jimp.read(templocal + base).catch((err) => {base = "date_base.png";});
	
	var baseImg = await Jimp.read(templocal + base).catch((err) => {base = "date_base.png"; textoverlay = true;});

	if (base == "date_base.png") baseImg = await Jimp.read(templocal + base);

	var mydudes = await Jimp.read(templocal + "mydudes.png");

	baseImg.composite(mydudes, 0, 0);

	if (!(bonus > 0 && weeks == 0)) //if weeks is 0 and bonus is real - no printing zero
	{
		var week = await Jimp.read(templocal + weeks + ".png");
		baseImg.composite(week, 0, 0);
	}

	if (wednesdayoverlay != "since" && wednesdayoverlay != "sinces")
	{
		var wednesday = await Jimp.read(templocal + wednesdayoverlay);
		baseImg.composite(wednesday, 0, 0);
	}

	var res = await BonusGenerator(bonus, baseImg, templocal, weeks, 1, 1, plu);
	baseImg = res[0];
	var textlocal = res[1];

	if (wednesdayoverlay == "since" || wednesdayoverlay == "sinces")
	{
		var s = wednesdayoverlay == "sinces" ? "s" : "";
		var font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
		baseImg.print(font, 80,
							textlocal - 45, 
							"Wednesday" + s + " Since", 
							textoverlay ? 367 : 467);
	}

	if (holidayinfo.name == "date" || textoverlay || yeartop)
	{
		var font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

		baseImg.print(font, 
						yeartop ? 10 : (textoverlay ? 50 : 90),
						textlocal + (yeartop ? 35 : 0),
						yeartop ? holidayinfo.year : holidayinfo.safename,
						textoverlay ? 367 : 467);
	}

	baseImg.write(templocal + outputname);
}

/**
 * Look-up table ("Retarded Lookup Table" — Hank, 2021) that maps a week-count value
 * to the correct white-overlay image suffix used when the week count exceeds 100.
 * The suffix corresponds to how much of the previous digit row needs to be masked.
 *
 * @param {number} weekct - The week count (or sub-count) for which to retrieve the
 *                          white-overlay identifier.
 * @returns {string} A single-character string (`"1"` – `"9"`) identifying which
 *                   `White<n>.png` overlay asset to use.  Returns `"8"` as the
 *                   default fallback when no entry matches.
 */
function GetWhite(weekct) //For frogs more than 100 weeks; "Retarded Lookup Table" - Hank 2021
{
	var wites = [
		["1", 0,1,2,4,5,6,9,10], 
		["2", 3,8],
		["3", 7,11,12,14,15,16,18,19],
		["4", 13,17,20],
		["5", 21,22,23,24,25,26,28,29,31,32,33,34,35,37,38,39],
		["6", 27],
		["7", 30,40,50,60,70,80,90],
		["8", 36,41,42,43,44,45,46,47,48,49,
				 51,52,53,54,55,56,57,58,59,
				 61,62,63,64,65,66,67,68,69,
				 71,72,73,74,75,76,77,78,79,
				 81,82,83,84,85,86,87,88,89,
				 91,92,93,94,95,96,97,98,99],
		["9", 100,200,300,400,500,600,700,800,900]
	]; // for more than 100 week

	for ( var i = 0; i < wites.length; i++) 
	{
		var retme = wites[i][0]; //white value
		for ( var j = 0; j < wites[i].length; j++) 
		{
			if (wites[i][j] == weekct) //check for the day in list
				return retme;
		}
	}

	return "8";
}

/**
 * Recursively builds the stacked digit rows for week counts greater than 100.
 * Each recursive call adds one additional row (hundreds, thousands, etc.) to the
 * Jimp image and adjusts the vertical text position accordingly.
 *
 * `"+"` suffix string concatenation (not addition):
 *   When the count was capped at 999999 (`moere = true`) and `h == 900` at the
 *   highest renderable tier, the line `if (h == 900 && moere) h = h + "+"` uses
 *   JavaScript's implicit string coercion: `900 + "+"` produces `"900+"` (string),
 *   NOT the number 900. The subsequent `Jimp.read(templocal + h + ".png")` then
 *   reads `"900+.png"` — a deliberately named asset that shows the capped value
 *   with a `+` suffix to indicate overflow.
 *
 * @async
 * @param {number}       bonus     - The carry-over multiplier for the current digit
 *                                   tier (e.g. how many hundreds/thousands to show).
 * @param {Jimp}         im        - The current Jimp image being composed.
 * @param {string}       templocal - Directory path containing image assets.
 * @param {number}       weeks     - The base week-count digit for the current tier.
 * @param {number}       ct        - Recursion depth / tier counter (starts at 1).
 * @param {number}       ln        - Line count — tracks how many extra rows have been
 *                                   added so the canvas can be extended correctly.
 * @param {boolean}      moere     - When `true` the highest renderable value gets a
 *                                   `"+"` suffix to indicate the count was capped.
 * @returns {Promise<[Jimp, number]>} A two-element array containing the updated Jimp
 *                                    image and the vertical text-position offset.
 */
async function BonusGenerator(bonus, im, templocal, weeks, ct, ln, moere) //for more than 100 weeks
{
	var mult = (40 * ln); //for text output
	var textlocal = 93 + mult - 38; //numbwr

	var kip = false; // for skiping the image being printed

	if (bonus > 0) //creates images for more than 100 weeks
	{
		var bonusbonus = 0; //new bonus value

		var invisbonus = false; //for 1000 line only
		var max = ct == 3 ? 100 : 10; //check if over 1K

		if (bonus >= max) //new values coming soon
		{
			bonusbonus = Math.floor(bonus / max); //calc bonus for next set
			bonus = bonus % max; //current bonus is less than max now
			if (bonus == 0 && ct != 2) //for skiping
			{
				kip = true;
			}
		}

		if (ct == 2 && bonus == 0) //make sure 1000 is printed
		{
			invisbonus = true;
			bonus = 1;
		}

		if (!kip) //not skipped
		{
			textlocal += 38; //move down text
			var ni = new Jimp(427, 512 + mult, "#FFFFFF"); //new imgre
		
			var h = Math.pow(10, (ct + 1) % 4) * bonus; // value of the image
			
			if (h > 1000)
				h = 1000;

			var whitenm = "White" + GetWhite(Math.pow(100, (ct - 1) % 4) * weeks) + ".png"; //white overaly because otherwise there will be 1000 image
			var whiteImg = await Jimp.read(templocal + whitenm);
			var Twight = await Jimp.read(templocal + "TopWhite.png");
			
			if (h == 900 && moere) h = h + "+";

			if (ct != 3 && weeks != 0) //only block white on values where last line wasnt 1000
				im.composite(whiteImg, 0, 0);

			var him = await Jimp.read(templocal + h + ".png");

			ni.composite(him, 0, 0) //draw image
				.composite(im, 0, (ln == 0 ? 0 : 40)) // redraw img
				.composite(him, 0, 0); //make new image with hundred mult and old image

			// ni.draw(images(templocal + h + ".png"), 0, 0) //make new image with hundred mult and old image
			// 	.draw(im, 0, (ln == 0 ? 0 : 40)) // redraw img
			// 	.draw(images(templocal + h + ".png"), 0, 0);//make new image with hundred mult and old image
			
			if (ln != 0)
				ni.composite(Twight, 0, 0); //get rid of black spots
		
			im = ni;
		}

		if (invisbonus) //reset bonus so no ecxtra 1 is printed
			bonus = 0;

		if (ct == 2) //push value through on 1000's
		{
			bonusbonus = (bonusbonus * 10) + bonus;
		}

		var res = await BonusGenerator(bonusbonus, im, templocal, (kip ? weeks : bonus), (ct == 3 ? ct + 2 : ct + 1), ln + (kip ? 0 : 1), moere); //do it again
		
		im = res[0];
		textlocal = res[1];

		return [im, textlocal]; //return textlocal for text spot and image
	}
	else return [im, textlocal]; //return textlocal for text spot and image
}

/**
 * Finds the holiday(s) from `simpleholidays` that are closest (fewest days away)
 * to the given date.  If multiple holidays share the same minimum day-difference
 * they are all returned.
 *
 * @param {Date}   d1              - The reference date to measure from.
 * @param {number} yr              - The year used when resolving holiday dates via
 *                                   {@link GetDate}.
 * @param {Array}  simpleholidays  - Array of holiday definition objects compatible
 *                                   with {@link GetDate} and {@link dateDiffInDays}.
 * @returns {Array} Array of holiday definition objects that are nearest to `d1`.
 *                  May contain more than one entry when holidays fall on the same day.
 */
function FindNextHoliday(d1, yr, simpleholidays)
{
	let diff = 100000;
	var retme = [];
	for (var i = 0; i < simpleholidays.length; i++)
	{
		let d2 = GetDate(d1, yr, simpleholidays[i]);
		let dbigdiff = dateDiffInDays(d1, d2);

		if (dbigdiff < diff)
		{
			retme = [];
			retme.push(simpleholidays[i]);
			diff = dbigdiff;
		}
		else if (dbigdiff === diff)
		{
			retme.push(simpleholidays[i]);
		}
	}
	return retme;
}

/**
 * Builds a single Discord message object containing an embed for one haiku entry.
 * When `simnames` is provided the author name, channel name, and date are each
 * randomised — giving anonymous, Discord-name, person-name, or a similar-sounding
 * name with configurable probabilities.  When `simnames` is `null` all three fields
 * are shown as-is (used for direct/admin lookups).
 *
 * Embed color:
 *   The embed color is generated by independently flipping a coin for each of the
 *   six hex digits: each digit is either `"0"` or `"F"`. This produces one of 64
 *   possible colors, all composed purely of `0` and `F` channel values (e.g.
 *   `#000000`, `#FF0000`, `#00FF00`, `#FFFFFF`, etc.). No mid-range colors are
 *   possible. About 1/64 of embeds will be fully black (`#000000`) and invisible
 *   on dark Discord themes.
 *
 * @param {Object}      haiku             - The haiku database record.
 * @param {string}      haiku.HaikuFormatted - Pre-formatted haiku text for the embed
 *                                            description.
 * @param {string}      haiku.DiscordName  - Author's Discord display name.
 * @param {string}      haiku.PersonName   - Author's real/person name.
 * @param {string}      haiku.ChannelName  - Discord channel where the haiku was said.
 * @param {string|number} haiku.Date       - Date the haiku was recorded (parseable by
 *                                           `new Date()`).
 * @param {boolean}     haiku.Accidental   - `true` if the haiku was accidental;
 *                                           affects the footer label.
 * @param {Array|null}  simnames           - Array of similar names for randomised
 *                                           attribution, or `null` to show the exact
 *                                           name.
 * @param {number|null} page               - Zero-based page index, or `null` if this
 *                                           is a standalone (non-paginated) embed.
 * @param {number|null} pagetotal          - Total number of pages, or `null` if not
 *                                           paginated.
 * @returns {{ content: string, embeds: Discord.EmbedBuilder[] }} Discord message
 *          payload object ready to be sent or stored.
 */
function SingleHaiku(haiku, simnames, page, pagetotal)
{
	var obj = {content: "BABA MAKE HAIKU"};
    var showchan = Math.random();
    var showname = Math.random();
    var showdate = Math.random();

    //get signiture and things
	var outname = "";
	var channame = "";
	var datetime = "";

	if (simnames == null)
	{
    	outname = haiku.DiscordName;
		channame = haiku.ChannelName;
		datetime = new Date(haiku.Date);
	}
    else
	{
		outname = showname < .025 ? "Anonymous" : (showname < .325 ? haiku.PersonName : (showname < .5 ? haiku.DiscordName : GetSimilarName(simnames))); // .85 > random discord name
		channame = showchan < .35 ? haiku.ChannelName : "";
		datetime = showdate < .5 ? new Date(haiku.Date) : "";
	}

    var signature = "";

    if (channame == "" && datetime == "") signature = outname; // randomness is great, dont judge
    else 
    {
        signature = outname;

        if (channame != "") signature += " in " + channame;
        if (datetime != "") signature += " on " + datetime.toLocaleDateString('en-US', options);
    }

	//footer from discordjs

	var footobj = {
		text : "- " + (!haiku.Accidental ? "Purposful Haiku by " : "") + signature + (page != null ? " - Page " + (1 + page) + " of " + pagetotal : ""),
		iconURL : "https://media.discordapp.net/attachments/574840583563116566/949515044746559568/JSO3bX0V.png"
	};

    exampleEmbed = new Discord.EmbedBuilder() // embed for the haiku
    .setColor("#" + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F"))
    .setDescription(haiku.HaikuFormatted)
    .setFooter(footobj);

    obj.embeds = [exampleEmbed];
	return obj;
}

/**
 * Generates an array of Discord message payload objects — one per haiku — each
 * containing an embed and an action-row with navigation buttons.  When `haiku` is
 * `null` a single "No Haikus Found!" embed is returned.  When multiple haikus are
 * provided, Previous/Next/Jump pagination buttons are attached; the first page's
 * Previous button and the last page's Next button are disabled.  A "View Source"
 * URL button is always included.
 *
 * @param {Array|null}  haiku    - Array of haiku database records (see
 *                                 {@link SingleHaiku} for record shape), or `null`
 *                                 when no haikus were found.
 * @param {Array|null}  simnames - Array of similar names passed through to
 *                                 {@link SingleHaiku} for randomised attribution,
 *                                 or `null` to display exact names.
 * @returns {Array<{ content: string, embeds: Discord.EmbedBuilder[], components: Discord.ActionRowBuilder[] }>}
 *          Array of Discord message payload objects, one per haiku page.
 */
function EmbedHaikuGen(haiku, simnames)
{
    var objs = [];
    if (haiku == null) 
    {
        var footobj = {
            text : "Haikus by Baba",
            iconURL : "https://media.discordapp.net/attachments/574840583563116566/949515044746559568/JSO3bX0V.png"
        };

		var obj = {content: "BABA MAKE HAIKU"};
        var bad = new Discord.EmbedBuilder() // embed for the haiku
        .setColor("#" + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F") + (Math.random() < .5 ? "0" : "F"))
        .setDescription("No Haikus Found!")
        .setFooter(footobj);
        obj.embeds = [bad];
        return [obj];
    }

	var objs = [];
	for (var e = 0; e < haiku.length; e++)
	{
		var ovb = null;
		var row = new Discord.ActionRowBuilder();

		var URLButton = new Discord.ButtonBuilder().setURL(haiku[e].URL == null ? "https://discord.com/channels/454457880825823252/979881683790733333/1183900512828006492" : haiku[e].URL).setLabel("View Source").setStyle(5);

		if (haiku.length > 1)
		{
			ovb = SingleHaiku(haiku[e], simnames, e, haiku.length);
			var pButton = new Discord.ButtonBuilder().setCustomId("page"+(e - 1)).setLabel("Previous").setStyle(1);
			var nButton = new Discord.ButtonBuilder().setCustomId("page"+(1 + e)).setLabel("Next").setStyle(1);
			
			if (e == 0)
			{
				pButton.setDisabled(true);
			}
			if (e == haiku.length - 1)
			{
				nButton.setDisabled(true);
			}

			var jumpButton = new Discord.ButtonBuilder().setCustomId("jumpToHaiku").setLabel("Jump to ...").setStyle(3);
	
			row.addComponents(pButton, jumpButton, nButton);
		}
		else
		{
			ovb = SingleHaiku(haiku[e], simnames);
		}

		row.addComponents(URLButton);
		
		ovb.components = [row];
		objs.push(ovb);
	}
	
	return objs;
}

/**
 * Scans `holdaylist` and returns metadata for every holiday whose name appears in
 * `msg`.  Supports the special values `"BIRTHDAY"` (matches only Birthday entries),
 * `"ALL"` (matches every non-help entry), and arbitrary text searches.  Handles
 * nested holiday groups (mode `-1`) by recursing into sub-lists and prefixing the
 * parent name to the picture-lookup key.  Also extracts an optional year from the
 * message text and attaches it to the returned item.
 *
 * @param {string} msg         - The user-supplied message string to search within.
 *                               Case-insensitive.  May contain a year integer which
 *                               will be captured into the returned item.
 * @param {Object} holdaylist  - Keyed object of holiday definitions as stored in the
 *                               bot configuration.  Each entry has at minimum:
 *                               `name` (string[]), `mode` (number), `safename`
 *                               (string), and `ignoredays`.
 * @returns {Array<Object>} Array of matched holiday item objects.  Each object
 *          contains at least `{ name, mode, safename, ignoredays }` plus mode-
 *          specific fields such as `day`, `month`, `week`, `dayofweek`, and
 *          optionally `year`.
 */
function CheckHoliday(msg, holdaylist) //checks if any of the holiday list is said in the message
{
	var retme = [];
	var ct = 0;
	for ( var x in holdaylist) 
	{
		var hol = holdaylist[x];

		if (hol.mode == -2) //skip help info
			continue;

		for ( var i = 0; i < hol.name.length; i++) 
		{
			if ((msg == "BIRTHDAY" && hol.safename == "Birthday") || msg == "ALL" || msg.toLowerCase().includes(hol.name[i].replace("[NY]", getD1().getFullYear() + 1))) //checks if the holiday name is in the message
			{
				var item = {};
				item.name = x; //picture lookup value
				item.mode = hol.mode; //date calc value
				item.safename = hol.safename; //display value
				item.ignoredays = hol.ignoredays; //for days with custom images

				var outps = msg.toLowerCase().split(" ");

				var year = 0;
				for ( var j = 0; j < outps.length; j++)
				{
					var block = outps[j];
					if (year == 0) //set year to first year found
					{
						var iv = parseInt(block);
						if (iv > 1300)
						{
							year = iv;
						}
					}
				}
				
				if (year != 0)
					item.year = year;

				switch(hol.mode)
				{
					case -1: //Nested Holiday
						smsg = msg;
						if (msg == "BIRTHDAY") smsg = "ALL";
						var tempret = CheckHoliday(smsg, hol.sub) //Check all the subs
						for ( var j = 0; j < tempret.length; j++) 
						{
							retme[ct] = tempret[j]; //Add items in return list to current returnlist
							retme[ct].name = item.name + retme[ct].name; //modify name for picture finding
							retme[ct].safename = retme[ct].safename + " " + item.safename; //display text name modify
							ct++; //counter add
						}
						break;
					case 0: //Normal Day/Month Item
						item.day = hol.day;
						item.month = hol.month;
						break;
					case 1: //Day of Week and Week Number per Month - Ex: Thanksgiving
						item.week = hol.week;
						item.dayofweek = hol.dayofweek;
						item.month = hol.month;
						break;
					case 2: //Day of Month based on a day of week - Ex: Friday the 13th
						item.day = hol.day;
						item.dayofweek = hol.dayofweek;
						break;
					case 3: //Easter
						break;
					default:
						console.log(hol);
				}
				if (hol.mode != -1)
				{
					retme[ct] = item;
					ct++;
				}

				break;
			}
		}
	}
	return retme; //returns list of holidays asked for
}

/**
 * Loads the hurricane tracking data from the configured data source.  If database
 * access is available (`global.dbAccess`) the latest records are first pulled from
 * the database via {@link getHurricaneInfo}.  The function then reads (and, if
 * absent, initialises) the local `hurricanes.json` cache file.
 *
 * @async
 * @returns {Promise<Array<Object>>} Parsed array of hurricane record objects from
 *                                   `hurricanes.json`.
 */
async function loadHurricaneHelpers()
{
	if (global.dbAccess[1] && global.dbAccess[0])
		await getHurricaneInfo();
	
	if(!fs.existsSync(babadata.datalocation + '/hurricanes.json')) 
	{
		fs.writeFileSync(babadata.datalocation + '/hurricanes.json', JSON.stringify([]));
	}

	let rawdata = fs.readFileSync(babadata.datalocation + '/hurricanes.json');
	let baadata = JSON.parse(rawdata);

	return baadata;
}

/**
 * Determines whether a user-supplied hurricane name or number matches a single
 * hurricane record from the JSON store.  Matching is attempted in this order:
 * 1. Exact name match (case-insensitive).
 * 2. First-letter match — only for named storms (not potential tropical cyclones or
 *    tropical depressions).
 * 3. Exact storm-number match.
 *
 * @param {string}        hurricaneName   - The name, first letter, or number string
 *                                          provided by the user.
 * @param {Object}        hurricaneJsonI  - A single hurricane record from the JSON
 *                                          cache.
 * @param {string}        hurricaneJsonI.Name       - Full storm name.
 * @param {string}        hurricaneJsonI.systemType - NHC system-type string (e.g.
 *                                                    `"TROPICAL STORM"`).
 * @param {string|number} hurricaneJsonI.Number     - NHC sequential storm number.
 * @returns {boolean} `true` if the record is considered a match for `hurricaneName`.
 */
function checkHurricane(hurricaneName, hurricaneJsonI)
{
	var huricaneNameLetter = hurricaneName.charAt(0).toUpperCase();
	var match = hurricaneJsonI.Name.toLowerCase() == hurricaneName.toLowerCase() || 
	(hurricaneJsonI.Name.charAt(0).toLowerCase() == huricaneNameLetter.toLowerCase() && (hurricaneJsonI.systemType != "POTENTIAL TROPICAL CYCLONE" && hurricaneJsonI.systemType != "TROPICAL DEPRESSION")) ||
	hurricaneJsonI.Number == hurricaneName

	return match;
}

/**
 * Parses an NHC `messageDateTimeUTC` date string into a Unix-epoch millisecond
 * timestamp.
 *
 * Expected input format: `"YYYYMMDD HH:MM:SS AM/PM UTC"`
 * (e.g. `"20240926 09:00:00 PM UTC"`).
 *
 * @param {string} date - NHC-formatted date/time string.
 * @returns {number} Milliseconds since the Unix epoch representing the parsed date,
 *                   as returned by `Date.parse()`.
 */
function parseHurricaneDate(date)
{
	// format example 20240926 09:00:00 PM UTC
	var year = date.substring(0, 4);
	var month = date.substring(4, 6);
	var day = date.substring(6, 8);
	var time = date.substring(9, 17);
	var ampm = date.substring(18, 20);

	var ddd = Date.parse(month + " " + day + " " + year + " " + time + " " + ampm + " UTC");
	return ddd;
}

/**
 * Looks up, fetches, and (if necessary) discovers hurricane information for the
 * given name or number.  The function:
 * 1. Loads the local hurricane cache via {@link loadHurricaneHelpers}.
 * 2. Searches the cache for a matching entry using {@link checkHurricane}.
 * 3. If a match is found, fetches the NHC XML feed to check for updates and
 *    refreshes `Type`, `Category`, `Name`, and `LastUpdated` when the remote data
 *    is newer.
 * 4. If no match is found, sequentially probes NHC XML URLs (incrementing storm
 *    numbers) until the named storm is located or no more XML files exist, appending
 *    any newly discovered storms to the cache.
 * 5. Persists the updated cache to `hurricanes.json` and, if database access is
 *    available, syncs via {@link saveUpdatedHurrInfo}.
 *
 * Dead-code: `uExist(url)` call (line ~750):
 *   The local variable `urlE` is assigned `uExist(url)` but the guard
 *   `if (!urlE) { break; }` never fires because `uExist` is an `async` function
 *   and therefore always returns a truthy Promise object (see {@link uExist}
 *   for full explanation). The discovery loop continues past the `!urlE` check
 *   and relies on the `xml.includes("Page Not Found")` content check instead.
 *
 * @async
 * @param {string} hurricanename - Storm name, first letter of the storm name, or
 *                                 storm number to search for.
 * @returns {Promise<Object|undefined>} The hurricane record object for the matched
 *                                      storm, or `undefined` if no match was found.
 */
async function checkHurricaneStuff(hurricanename)
{
    var hurricaneJson = await loadHurricaneHelpers();

	var thisYear = getD1().getFullYear();

	// iNum = size of hurricaneJson
	var iNum = hurricaneJson.length;
	var huricaneNameLetter = hurricanename.charAt(0).toUpperCase();

	// check if name is in the list
	for (var i in hurricaneJson)
	{
		// compare lowercase, if not found, compare first letter, if not found, compare number
		if (checkHurricane(hurricanename, hurricaneJson[i]))
		{
			console.log("Hurricane Info Found for " + hurricanename);
			var xml = await fetch(hurricaneJson[i].XMLURL).then(response => response.text());	
			var lastUpdated = xml.split("<messageDateTimeUTC>")[1].split("</messageDateTimeUTC>")[0];
			var lastUpdatedDate = parseHurricaneDate(lastUpdated);
			// if lastUpdated is different than hurricaneJson[i].lastUpdated, update the hurricaneJson[i].lastUpdated
			var newDay = new Date(lastUpdatedDate);
			//  dbDay is hurricaneJson[i].LastUpdated as local time
			var dbDay = new Date(hurricaneJson[i].LastUpdated);
			if (newDay > dbDay)
			{
				console.log("Hurricane Info Updated for " + hurricanename);
				hurricaneJson[i].LastUpdated = newDay.toISOString().slice(0, 19).replace('T', ' ');
				hurricaneJson[i].Updated = true;
				var systemType = xml.split("<systemType>")[1].split("</systemType>")[0];
				var saffirsympson = xml.split("<systemSaffirSimpsonCategory>")[1].split("</systemSaffirSimpsonCategory>")[0];
				hurricaneJson[i].Type = systemType;
				hurricaneJson[i].Category = saffirsympson;
				hurricaneJson[i].Name = xml.split("<systemName>")[1].split("</systemName>")[0];
			}
			
			hurricaneJson[i].OverideText = 
				hurricaneJson[i].Name.charAt(0).toLowerCase() == huricaneNameLetter.toLowerCase() ? {"AltName": hurricanename} : 
				(hurricaneJson[i].Number == hurricanename ? {"NumberSearch": hurricanename} : null);

			iNum = i;
			fs.writeFileSync(babadata.datalocation + '/hurricanes.json', JSON.stringify(hurricaneJson));
			break;
		}
	}

	if (iNum == hurricaneJson.length)
	{
		console.log("Hurricane Info Not Found for " + hurricanename + " searching for it");
		// loop until xml file cant be found
		var xmlFound = true;
		var iNumTemp = iNum;
		while (xmlFound)
		{
			iNumTemp++;

			var hurricanenameNum = iNumTemp;
			if (hurricanenameNum < 10) hurricanenameNum = "0" + hurricanenameNum;
			var url = "https://www.nhc.noaa.gov/storm_graphics/AT" + hurricanenameNum + "/atcf-al" + hurricanenameNum + thisYear + ".xml";

			var urlE = uExist(url);

			if (!urlE)
			{
				xmlFound = false;
				break;
			}

			var xml = await fetch(url).then(response => response.text());

			if (xml.includes("Page Not Found") || xml.includes("503 Service Temporarily Unavailable"))
			{
				xmlFound = false;
				break;
			}

			var id = hurricanenameNum + "" + thisYear;
			var lastUpdated = xml.split("<messageDateTimeUTC>")[1].split("</messageDateTimeUTC>")[0];
			var stormName = xml.split("<systemName>")[1].split("</systemName>")[0];
			var number = iNumTemp;
			var systemType = xml.split("<systemType>")[1].split("</systemType>")[0];
			var saffirsympson = xml.split("<systemSaffirSimpsonCategory>")[1].split("</systemSaffirSimpsonCategory>")[0];
			var imgURL = "https://www.nhc.noaa.gov/storm_graphics/AT" + hurricanenameNum + "/refresh/AL" + hurricanenameNum + thisYear + "_5day_cone_no_line_and_wind+png/";
			var xmlURL = url;
			var year = thisYear;

			var lUpdateDate = new Date(parseHurricaneDate(lastUpdated));

			var item = {
				"ID": id,
				"LastUpdated": lUpdateDate.toISOString().slice(0, 19).replace('T', ' '),
				"Name": stormName,
				"Number": number,
				"Type": systemType,
				"Category": saffirsympson,
				"ImageURL": imgURL,
				"XMLURL": xmlURL,
				"Year": year,
				"Updated": true,
				"OverideText": 
					stormName.charAt(0).toLowerCase() == huricaneNameLetter.toLowerCase() ? {"AltName": hurricanename} : 
					(number == hurricanename ? {"NumberSearch": hurricanename} : null)
			};

			iNum = checkHurricane(hurricanename, item) ? iNumTemp - 1 : iNum;

			console.log("Getting Hurricane Info for " + stormName + " from " + url);

			hurricaneJson.push(item);
	
			fs.writeFileSync(babadata.datalocation + '/hurricanes.json', JSON.stringify(hurricaneJson));
		}
	}

	var pickedItem = hurricaneJson[iNum];

	if (global.dbAccess[1] && global.dbAccess[0])
	{
		saveUpdatedHurrInfo();
	}

	return pickedItem;
}

/**
 * Converts a numeric month (1–12) to its full English name.
 * Any value outside the range 1–11 returns `"December"`.
 *
 * @param {number} mint - Integer month number (1 = January … 12 = December).
 * @returns {string} Full English month name (e.g. `"January"`, `"February"`, …).
 */
function monthFromInt(mint)
{
	switch(mint)
	{
		case 1:
			return "January";
		case 2:
			return "Febuary";
		case 3:
			return "March";
		case 4:
			return "April";
		case 5:
			return "May";
		case 6:
			return "June";
		case 7:
			return "July";
		case 8:
			return "August";
		case 9:
			return "September";
		case 10:
			return "October";
		case 11:
			return "November";
		default:
			return "December";
	}
}

module.exports = {
    getErrorFlag,
    MakeImage,
    FindNextHoliday,
    EmbedHaikuGen,
    CheckHoliday,
	loadHurricaneHelpers,
	checkHurricaneStuff,
	monthFromInt
};