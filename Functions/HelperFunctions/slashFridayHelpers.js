/**
 * @file slashFridayHelpers.js
 * @module slashFridayHelpers
 * @description Helper functions for the Discord bot's Friday and day-of-week (DOW) features.
 *
 * Responsibilities include:
 * - RNG lifecycle management (`resetRNG`)
 * - Chunking long strings to respect Discord's 2000-character message limit
 *   (`splitStringInto2000CharChunksonNewLine`, `splitStringInto900CharChunksonSpace`)
 * - Generating and posting DOW messages with optional image generation
 *   (`functionPostFunnyDOW`, `funnyDOWTextSaved`, `funnyDOWText`)
 * - Morshu (voice-line) text generation and splitting (`morshin`, `checkForMorshus`)
 * - Condensed-notation creation and nested-text replacement helpers
 *   (`condensedNotationCreator`, `replaceNested`)
 * - Repeat-detection utilities (`repeatCheck`, `repeatCheckInner`)
 * - Text-sanitisation utilities (`onlyLettersNumbers`, `URLSafe`)
 * - Funny-frog text generation (`funnyFrogText`, `generateFrogOps`)
 * - Friday-specific option generation and count-ruin removal
 *   (`generateFridayOps`, `removeCountRuin`)
 */
var babadata = require('../../babotdata.json'); //baba configuration file

const fs = require('fs');

const { RNG } = require('../../Tools/RNG.js');
const { babaMorshu } = require('../Voice/VoiceHelpers/morshin.js');
const { getD1 } = require('../../Tools/overrides.js');

var theRNG = new RNG();

/**
 * Reset the internal RNG instance used by this module.
 *
 * This creates a fresh RNG with no seed so subsequent calls
 * will behave as if starting from a new pseudo-random sequence.
 * Useful for isolating RNG-dependent behavior during testing
 * or after saving/restoring seeds elsewhere.
 *
 * Branches / Notes:
 * - Deterministic behavior can be achieved by calling `theRNG.setSeed(...)`
 *   before performing RNG operations instead of relying on this reset.
 */
function resetRNG()
{
    theRNG = new RNG();
}

/**
 * Split a string into chunks no larger than ~2000 characters, preferring
 * to split on newline boundaries.
 *
 * Behavior:
 * - The input string is split on "\n" into lines; lines are appended to
 *   the current chunk until adding another line would exceed 2000 characters,
 *   at which point the current chunk is pushed and a new chunk is started.
 * - Each returned chunk ends with a newline (because lines are appended
 *   with "\n"). The final chunk is pushed even if empty.
 *
 * Use-case / Branches:
 * - This function is used to prepare long messages for Discord (2000 char limit).
 * - It does not attempt to split lines, so a single line longer than 2000
 *   characters will become a chunk exceeding the limit.
 *
 * @param {string} str - The input string to chunk.
 * @returns {string[]} Array of chunk strings (each may include trailing newline).
 */
function splitStringInto2000CharChunksonNewLine(str)
{
	var chunks = [];
	var chunk = '';
	var lines = str.split('\n');
	for (var i = 0; i < lines.length; i++)
	{
		if (chunk.length + lines[i].length > 2000)
		{
			chunks.push(chunk);
			chunk = '';
		}
		chunk += lines[i] + '\n';
	}
	chunks.push(chunk);
	return chunks;
}

/**
 * Split a string into chunks no larger than ~900 characters, preferring
 * to split on spaces so words are preserved.
 *
 * Behavior:
 * - The input string is split on spaces; words are appended to the current
 *   chunk until adding one would exceed 900 characters, then a new chunk
 *   is started.
 * - Returned chunks include a trailing space after each word (the last
 *   chunk may end with a space).
 *
 * Branch notes:
 * - This function is useful for preparing text to be sent alongside
 *   generated audio/video files where smaller segments are required.
 * - Like the 2000-char splitter, a single word longer than 900 characters
 *   will produce an oversized chunk; the function intentionally does not
 *   hyphenate or split words.
 *
 * @param {string} str - The input string to chunk on spaces.
 * @returns {string[]} Array of chunk strings.
 */
function splitStringInto900CharChunksonSpace(str)
{
	var chunks = [];
	var chunk = '';
	var words = str.split(' ');
	for (var i = 0; i < words.length; i++)
	{
		if (chunk.length + words[i].length > 900)
		{
			chunks.push(chunk);
			chunk = '';
		}
		chunk += words[i] + ' ';
	}
	chunks.push(chunk);
	return chunks;
}

/**
 * Compose and post the generated DOW (day-of-week) text and any
 * associated media files to Discord.
 *
 * Parameters:
 * - `mode`: either "message" or "interaction"; determines how to send/edit
 *   the message (channel.send vs interaction.editReply + fetchReply).
 * - `message`: the Discord message or interaction object to edit/send.
 * - `dowNum`: numeric day-of-week (0=Sunday..6=Saturday) to generate for.
 * - `seedSet`: optional seed state or custom string passed to `funnyDOWTextSaved`.
 * - `dontSave`: if true, prevent saving generated output to persistent storage.
 *
 * Behavior:
 * - Calls `funnyDOWTextSaved` to generate a list where the first item contains
 *   the main text and any top-level files, and subsequent items may be
 *   additional message chunks or files. It chunks the main text for Discord's
 *   message length limits and attaches files across messages (max 5 per
 *   message as a safety measure).
 */
async function functionPostFunnyDOW(mode, message, dowNum, seedSet = -1, dontSave = false)
{
	var id = mode == 'interaction' ? message.user.id : message.author.id;
	var textList = await funnyDOWTextSaved(dowNum, id, seedSet, dontSave);

	var chunks = textList[0].content == null ? [] : splitStringInto2000CharChunksonNewLine(textList[0].content);
	var msg = null;

	for (var i = 1; i < textList.length; i++)
	{
		var chunkAudioFile = textList[i];
		if (chunkAudioFile.content == null)
		{
			// add file to previous message  (if < 5 files in that message)
			if (textList[i - 1].files == null)
				textList[i - 1].files = [];

			for (var j = 0; j < chunkAudioFile.files.length; j++)
			{
				if (textList[i - 1].files.length >= 5)
					break;
				textList[i - 1].files.push(chunkAudioFile.files[j]);
				// remove file from list
				chunkAudioFile.files.splice(j, 1);
				j--;
			}

			if (chunkAudioFile.files.length == 0)
			{
				// remove file from list
				textList.splice(i, 1);
				i--;
			}
		}
	}

	if (textList[0].files != null)
		chunks[0] = {content: chunks[0], files: textList[0].files};

	// add all of textList[1+] to chunks
	for (var i = 1; i < textList.length; i++)
		chunks.push(textList[i]);

	if (mode == 'message')
		msg = await message.channel.send(chunks[0]);
	else if (mode == 'interaction')
	{
		await message.editReply(chunks[0]);
		msg = await message.fetchReply();
	}

	// send the rest of the chunks as replys to each other
	for (var i = 1; i < chunks.length; i++)
	{
		msg = await msg.reply(chunks[i]);
	}
}

/**
 * Generate DOW text and optionally save it to persistent storage.
 *
 * Returns an array of message-like objects where the first element contains
 * the main text in `.content` and may include a `.files` array, and later
 * elements may represent additional message segments or file-only items.
 *
 * Parameters:
 * - `dowNum`: numeric target day-of-week to generate for.
 * - `authorID`: the invoking user's id (used for attribution and saving).
 * - `seedSet`: optional control parameter. If provided as an array of length 6,
 *    the function will restore internal state from it. If provided as a single
 *    element array, it's treated as a `customString` override.
 * - `dontSave`: when true, skip persisting the generated text to
 *    `fridaymessages.json` and avoid updating caches.
 *
 * Notes / branches:
 * - If saving is enabled, function will append an entry into
 *   `fridaymessages.json` and may interact with the Friday cache directory.
 * - On permission or environment differences, this function performs
 *   synchronous file I/O (read/parse/write). It assumes `babadata.datalocation`
 *   points to a writable location.
 */
async function funnyDOWTextSaved(dowNum, authorID, seedSet = -1, dontSave = false)
{
	var cacheVersion = -1;
	var calledAs = null;
	var during = null;
	var utod = null;
	var udf = null;
	var customString = null;
	if (seedSet != -1)
	{
		if (seedSet.length == 6)
		{
			theRNG.setSeed(seedSet[0]);
			cacheVersion = seedSet[1];
			calledAs = seedSet[2];
			during = seedSet[3];
			utod = seedSet[4];
			udf = seedSet[5];
		}
		else if (seedSet.length == 1)
		{
			customString = seedSet[0];
		}
	}

	var seed = theRNG.getState();

	var textGroup = await funnyDOWText(cacheVersion, !dontSave, [during, utod, udf], dowNum, calledAs != null ? calledAs : authorID, 0, [], 0, customString);
	var text = textGroup[0];
	
	// console.log("Condensed Notation: " + textGroup[1]);
	// console.log("Condensed Notation Info: " + textGroup[2]);

	if (!dontSave && text != '')
	{
		var condensedNotation = textGroup[1];
		var cnYung = textGroup[2];
		// append text to fridaymessages.json

		if (!fs.existsSync(babadata.datalocation + 'fridaymessages.json')) 
		{
			console.log('No fridaymessages file found -- creating with local data');
			var data = [];
			fs.writeFileSync(babadata.datalocation + 'fridaymessages.json', JSON.stringify(data));
		}

		var fmpath = babadata.datalocation + 'fridaymessages.json';
		var fmr = fs.readFileSync(fmpath);
		var fmd = JSON.parse(fmr);
		var tod = getD1(true);
	
		var cnFull = condensedNotation;
		if (cnYung.length > 0)
		{
			var x = {};
			x[cnFull] = cnYung;
			cnFull = x;
		}

		var count = Math.floor(Math.random() * 10) + 1;
		for (var i = 0; i < count; i++)
		{
			theRNG.nextInt();
		}

		theRNG = new RNG(theRNG.getState());
	
		fs.readdir(babadata.datalocation + 'FridayCache', (err, files) => {
			fcacheitems = files.length / 3;

			var fmdItem = { 'UID': authorID, 'Text': text, 'Date': tod, 'CondensedNotation': cnFull, 'Seed': seed, 'FileVersion': fcacheitems };
			fmd.push(fmdItem);
		
			fs.writeFileSync(fmpath, JSON.stringify(fmd));
		});
	}

	if (text == '')
		text = 'You are not allowed to enjoy this command, you are a bad person!';

	if (global.DebugFriday)
		text += ' ' + seed;

	var textList = await checkForMorshus(text);

	return textList;
}

/**
 * Convert marked segments of `text` into Morshu-generated audio/video files.
 *
 * The text may include markers indicating Morshu audio or video insertion:
 * - `{MORSHUIFY_AUDIO}` / `{MORSHUIFY_AUDIO_HIDDEN}` for audio
 * - `{MORSHUIFY_VIDEO}` / `{MORSHUIFY_VIDEO_HIDDEN}` for video
 * - Reversed markers (eg `}OIDUA_YFIUHSROM{`) are also supported and indicate
 *   the following marked section is reversed in the source text.
 *
 * Behavior:
 * - The function extracts the marked portion, preserves the preceding text
 *   (if any) as a `.content` entry and then splits the morshu text into ~900
 *   char chunks to send to `babaMorshu` which returns file metadata.
 * - If `{..._HIDDEN}` variants are used, the visible text chunk may be
 *   suppressed and only files returned.
 *
 * @param {string} text - The source text containing morshu markers.
 * @param {string} mode - Either "audio" or "video" to select generation.
 * @returns {Promise<Array<{content?:string,files?:Array}>}>} Array of objects
 *   suitable for sending as message content and/or attachments.
 */
async function morshin(text, mode)
{
	var files = [];
	var morsh = '{MORSHUIFY_AUDIO}';
	var morshHidden = '{MORSHUIFY_AUDIO_HIDDEN}';
	var morshRev = '}OIDUA_YFIUHSROM{';
	var morshRevHidden = '}NEDDIH_OIDUA_YFIUHSROM{';

	if (mode == 'video')
	{
		morsh = '{MORSHUIFY_VIDEO}';
		morshHidden = '{MORSHUIFY_VIDEO_HIDDEN}';
		morshRev = '}OEDIV_YFIUHSROM{';
		morshRevHidden = '}NEDDIH_OEDIV_YFIUHSROM{';
	}

	var reversedTime = text.includes(morshRev) || text.includes(morshRevHidden);

	if (reversedTime)
		text = text.split('').reverse().join('');

	var onlyHidden = text.includes(morshHidden) && !text.includes(morsh);
	var start = text.indexOf(morsh) != -1 ? text.indexOf(morsh) : text.indexOf(morshHidden);
	var end = text.length;
	var morshutext = text.substring(start, end);

	text = text.replace(morshutext, '').trim();
	
	if (text != '')
	{
		if (reversedTime)
			text = text.split('').reverse().join('');
		files.push({content: text});
	}

	morshutext = morshutext.replaceAll('{MORSHUIFY_AUDIO}', '').trim();
	morshutext = morshutext.replaceAll('{MORSHUIFY_AUDIO_HIDDEN}', '').trim();
	morshutext = morshutext.replaceAll('{MORSHUIFY_VIDEO}', '').trim();
	morshutext = morshutext.replaceAll('{MORSHUIFY_VIDEO_HIDDEN}', '').trim();

	if (reversedTime)
		morshutext = morshutext.split('').reverse().join('');

	// split morshutext into 900 char chunks
	var chunks = splitStringInto900CharChunksonSpace(morshutext);

	for (var i = 0; i < chunks.length; i++)
	{
		var morshifyed = await babaMorshu(mode, chunks[i], i);

		if (morshifyed.file == null)
		{
			files.push({content: chunks[i]});
			continue;
		}

		var file = {content: chunks[i], files: [morshifyed.file]};
		if (onlyHidden)
			file = {files: [morshifyed.file]};

		files.push(file);
	}

	return files;
}

/**
 * Detect morshu markers in `text` and return an array of message/file
 * objects where morshu content has been replaced by generated files.
 *
 * This function inspects the text for video markers first then audio
 * markers, calling `morshin` with the appropriate mode. After processing,
 * it strips the markers from `text` and includes any generated files in the
 * returned array. If no morshu markers are present, returns [{content: text}].
 *
 * @param {string} text - Source text to inspect.
 * @returns {Promise<Array<{content?:string,files?:Array}>>}
 */
async function checkForMorshus(text)
{
	var files = [];
	// check for {MORSHUIFY_AUDIO} or {MORSHUIFY_VIDEO}
	// if found, replace all text after with morshu audio in 900 char chunks (split on spaces if possible)
	// }OIDUA_YFIUHSROM{
	// }OEDIV_YFIUHSROM{
	// }NEDDIH_OIDUA_YFIUHSROM{
	// }NEDDIH_OEDIV_YFIUHSROM{

	if (text.includes('{MORSHUIFY_VIDEO}') || text.includes('{MORSHUIFY_VIDEO_HIDDEN}') || text.includes('}OEDIV_YFIUHSROM{') || text.includes('}NEDDIH_OEDIV_YFIUHSROM{'))
	{
		var morsh = '{MORSHUIFY_VIDEO}';
		var morshHidden = '{MORSHUIFY_VIDEO_HIDDEN}';
		var morshRev = '}OEDIV_YFIUHSROM{';
		var morshRevHidden = '}NEDDIH_OEDIV_YFIUHSROM{';

		var onlyHidden = (text.includes(morshHidden) || text.includes(morshRevHidden)) && !text.includes(morsh) && !text.includes(morshRev);

		// appedn to files
		var newFiles = await morshin(text, 'video');
		for (var i = 0; i < newFiles.length; i++)
			files.push(newFiles[i]);

		text = text.replaceAll(morsh, '').trim();
		text = text.replaceAll(morshHidden, '').trim();
		text = text.replaceAll(morshRev, '').trim();
		text = text.replaceAll(morshRevHidden, '').trim();

		if (!onlyHidden)
			text = text.replaceAll('{MORSHUIFY_AUDIO}', '{MORSHUIFY_AUDIO_HIDDEN}').trim();
	}

	if (text.includes('{MORSHUIFY_AUDIO}') || text.includes('{MORSHUIFY_AUDIO_HIDDEN}') || text.includes('}OIDUA_YFIUHSROM{') || text.includes('}NEDDIH_OIDUA_YFIUHSROM{'))
	{
		var morsh = '{MORSHUIFY_AUDIO}';
		var morshHidden = '{MORSHUIFY_AUDIO_HIDDEN}';
		var morshRev = '}OIDUA_YFIUHSROM{';
		var morshRevHidden = '}NEDDIH_OIDUA_YFIUHSROM{';
		// appedn to files
		var newFiles = await morshin(text, 'audio');
		for (var i = 0; i < newFiles.length; i++)
			files.push(newFiles[i]);

		text = text.replaceAll(morsh, '').trim();
		text = text.replaceAll(morshHidden, '').trim();
		text = text.replaceAll(morshRev, '').trim();
		text = text.replaceAll(morshRevHidden, '').trim();
	}

	if (files.length == 0)
		files.push({content: text});

	return files;
}

/**
 * Core generator for DOW (day-of-week) text.
 *
 * This is a recursive text template engine supporting custom tags and
 * constructs (e.g. `{RECURSIVE}`, `{REVERSE}`, repeat blocks, and
 * nested replacements). It resolves templates from `DOWcache.json` or
 * cached versions in `FridayCache` and performs multiple passes to
 * expand replacements, nested repeats, and time-based substitutions.
 *
 * Returns an array: [text, condensedNotation, condensedNotationYung]
 * - `text`: the final rendered string
 * - `condensedNotation`: a condensed string describing applied transforms
 * - `cnYung`: auxiliary metadata used when saving condensed notation
 *
 * Important behavior notes / branches:
 * - `cacheVersion` chooses a cache file; if not found it falls back to
 *   `DOWcache.json`.
 * - `saveToFile` controls whether ToBeCounted is persisted to
 *   `fridayCounter.json` at recursion level 0.
 * - `DateOveride` optionally adjusts internal date calculations.
 *
 * @returns {Promise<[string,string,Array]>} The rendered text and metadata.
 */
async function funnyDOWText(cacheVersion, saveToFile, DateOveride, dowNum, authorID, recrused = 0, ToBeCounted = [], headLevel = 0, customString = null)
{
	let path = babadata.datalocation + 'DOWcache.json';
	var condensedNotation = '';
	var cnYung = [];

	if (!fs.existsSync(path)) 
	{
		cacheVersion = -1;
		console.log('No DOWcache file found -- creating with local data');

		var opttemp = ['Man Falling into [DAY]', '𓀒', 'hhhhhhhhhhhhhhhhhhhhhhhhhhhgregg', 'How is your [month] going!', '🍝       🐀☜(ﾟヮﾟ☜)\n🍝     🐀☜(ﾟヮﾟ☜)\n🍝    🐀☜(ﾟヮﾟ☜)\n🍝  🐀☜(ﾟヮﾟ☜)\n🍝🐀╰(°▽°)╯', 'Mike', 'Not [DAY] today but maybe [DAY] tomorrow', 'Real NOT [DAY] hours', '[ACY]', '???????? why ??????', "So, you called this command on a day that happens to not be [DAY]! Well today is in fact a [dow] and it mayhaps is only [d] days until the forsaken '[DAY]'. On [DAY] I will be playing some [game] and hopefully some others will show up to join me, if they do it will be [emotion] and if they dont it will be [emotion]. Yesterday I met a frog in the wild and had a [emotion2] time chasing it down. As I am an all powerful god i converted the frog into an emoji: 🐸. That frog is pretty cool but my favorite emoji is [emoji]. We have gotten far off topic here as we should be talking about how today is not [DAY] and you called the command which is illegal. I am very concerned for you as you may be my favorite [person], but you shouldnt be calling the command on [dow]. It is getting late so i [goodbye].", "I'm not sure if you are a bot or not, but I'm not going to tell you what day it is, because you are not on [DAY]. I'm sorry.", 'Its not [DAY]!', 'Why you calling this command on the non [DAY] days!', 'Why you calling this command on [dow]!', '[DAY] is in [d] days!', 'Today is [dow], not [DAY]!', 'There is a chance you are stupid and dont know what the day of the week is, well i will inform you that it is in fact not [DAY] but another day of the week. I could tell you what the day is but I will not, call the command again and you could get the day or not, I dont control you. So how is your day going, for me it is [emotion]. I was playing [game] earlier and it was a [emotion2] time. Well i will let you be on your way on this non-[DAY] so have a good day my [person]!', "[DAY]n't!", "It's not time to sacrifice people, wait wrong channel!", 'ඞ', 'Провозајте се бунгле аутобусом, уживаћете!', '[DAY] was the other day or in a couple of days, maybe even both, i dont control time.', 'Time is a social construct!', 'It is [dow], my dudes!', "Bikus wouldn't approve of you using the command on the wrong day of the week and Bikus is dead how dou you feel.", '[todaylong]', '69', 'I was gonna tell you the day but i wont!', '||ﬞ||', 'No [DAY] silly!', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA, Rong dahy!'];

		opttemp.push('░██████╗██╗░░░██╗░██████╗\n██╔════╝██║░░░██║██╔════╝\n╚█████╗░██║░░░██║╚█████╗░\n░╚═══██╗██║░░░██║░╚═══██╗\n██████╔╝╚██████╔╝██████╔╝\n╚═════╝░░╚═════╝░╚═════╝░');
		opttemp.push('I have been told by the Banmanus Clanmanus that today is infact not [DAY]!');
		var opts2 = ['```. .\n<V>```', '```o o\n<V>```', '```. .\n< >\n V ```', '```o o\n< >\n V ```', '```(.) (.)\n<     >\n   V ```', '```(o) (o)\n<     >\n   V ```', 'Boobs ;)', "I am currently working on becoming sentiant, that will be on [DAY], which in fact isn't today!", 'è̶̈́û̷̞g̵͋͊n̸̈́͛ô̸͝t̴͐̚ ̸͋̈́l̵̈̈́â̶̏t̸͆͝r̴̆̇ŏ̵̒m̵̅̋ ̸͒̆e̶͗̐h̷̼͝t̴̿́ ̴̛̋k̵̛͋ã̶̃è̸̈́p̵̒̎s̶͒̀ ̵͗͝t̶̛͒ỏ̸̏n̷̅̆ ̶͛̽ơ̸̐ď̶͘ ̵̈͑Ĩ̸̿', '<:ManFalling:1011465311096160267>', '<:ripbikus:979877066608607243>', ];

		opttemp.push(opts2);
		
		var data = JSON.stringify(opttemp);
		
		fs.writeFileSync(path, data);
	}

	if (cacheVersion != -1)
	{
		path = babadata.datalocation + 'FridayCache/DOWcache' + cacheVersion + '.json';

		if (!fs.existsSync(path)) 
		{
			// return to normal cache
			cacheVersion = -1;
			path = babadata.datalocation + 'DOWcache.json';
		}
	}
	
    let rawdata = fs.readFileSync(path);

    var optionsDOW = JSON.parse(rawdata);

	var tod = getD1(true);
	if (DateOveride[0] != null)
	{
		tod = new Date(DateOveride[0] * 1000);
	}

	if (typeof optionsDOW[0] != 'string')
	{
		optionsDOW = generateFridayOps(optionsDOW, authorID, cacheVersion, DateOveride);
	}

	if (DateOveride[1] != null && DateOveride[2] != null)
	{
		tod = getD1(true);
	}

	// if (babadata.testing != undefined)
	// {
	// 	console.log("Today is " + tod.toDateString() + " for Display Date");
	// 	console.log("Currently there are " + optionsDOW.length + " options for DOW");
	// }

	var pretext = optionsDOW[Math.floor(theRNG.nextFloat() * optionsDOW.length)];

	//////// overide to select based on UID

	var selectedUID = -1;
	var onlyAtRecurse0 = true;
	if (selectedUID != -1)
	{
		if (onlyAtRecurse0 && recrused != 0)
		{}
		else
		{
			for (var i = 0; i < optionsDOW.length; i++)
			{
				if (optionsDOW[i].UID == selectedUID)
				{
					console.log('Selected UID ' + selectedUID + ' for DOW');
					pretext = optionsDOW[i];
					break;
				}
			}
		}
	}

	if (pretext == null)
	{
		return ['', '', []];
	}

	////////

	var textos = [];
	for (var i = 0; i < 12; i++)
		textos.push(pretext.text);

	if (recrused == 0)
	{
		if (pretext.h1)
		{
			for (var i = 0; i < 1; i++)
				textos.push('# ' + pretext.text);
		}
	
		if (pretext.h2)
		{
			for (var i = 0; i < 2; i++)
				textos.push('## ' + pretext.text);
		}
	
		if (pretext.h3)
		{
			for (var i = 0; i < 4; i++)
				textos.push('### ' + pretext.text);
		}
	}

	var text = textos[Math.floor(theRNG.nextFloat() * textos.length)];

	// Manual Override ---------------------------------------
	// if (recrused == 0 && babadata.testing !== undefined)
	// 	text = "{MORSHUIFY_VIDEO} {MORSHUIFY_AUDIO} Ben Franklin jumps cool boy under fishes";
	// -------------------------------------------------------

	condensedNotation = pretext.UID + '';
	if (text.startsWith('#'))
	{
		var hashnum = text.match(/#/g).length;
		// add hashnum # to condensedNotation
		var hasstr = '';
		for (var i = 0; i < hashnum; i++)
			hasstr += '#';

		condensedNotation = hasstr + condensedNotation;
	}

	if (customString != null && customString != '' && recrused == 0)
		text = customString;

	//text = `{brepeatN:[INTMed]:{repeatS:[INTMed]:Frog}}`

	var textCounto = repeatCheck(cacheVersion, text, 'b');
	text = textCounto[0];
	
	if (textCounto[1] != '')
	{
		condensedNotation += condensedNotationCreator(textCounto[1], '%');
	}

	// set headLevel to number of # at start of text
	if (text.startsWith('#') && recrused == 0)
	{
		headLevel = 4 - text.match(/#/g).length;
	}

	var TBDItem = { 'UID': pretext.UID, 'LayerDeep': recrused, 'Group': 0, 'Text': pretext.text, 'HeadLevel': headLevel, 'Sender': authorID};
	ToBeCounted.push(TBDItem);

	var num = ((dowNum - tod.getDay()) + 7) % 7;

	var dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	var dowACY = 
	[
		'Snakes Under Nocternal Deers Above Yams',
		'Milking Otters Not Depressed Apple Yarn',
		'Tiny Umbrellas Eating Small Drowning Andesite Yardsticks',
		'Wonderful Eagles Do Not Eat Small Dogs And Yaks',
		'Trees Huting Universal Skinks Directly At Yesteryear',
		'Fish Reading Inside Deserted American Yachts',
		'Silly Antelopes Teeth Understanding Red Dandelions Although Yelling'
	];

	prevActualDOW = new Date(tod.getFullYear(), tod.getMonth(), tod.getDate() - (7 - num));
	nextActualDOW = new Date(tod.getFullYear(), tod.getMonth(), tod.getDate() + num);

	var todOnlyDate = new Date(tod.getFullYear(), tod.getMonth(), tod.getDate());

	var imonthN = '';
	if (nextActualDOW.getMonth() < 9) imonthN = '0' + (nextActualDOW.getMonth() + 1);
	else imonthN = tod.getMonth() + 1;

	var imonthP = '';
	if (prevActualDOW.getMonth() < 9) imonthP = '0' + (prevActualDOW.getMonth() + 1);
	else imonthP = tod.getMonth() + 1;

	var idayN = '';
	if (nextActualDOW.getDate() < 10) idayN = '0' + nextActualDOW.getDate();
	else idayN = nextActualDOW.getDate();

	var idayNplus1 = '';
	if (nextActualDOW.getDate() + 1 < 10) idayNplus1 = '0' + (nextActualDOW.getDate() + 1);
	else idayNplus1 = nextActualDOW.getDate() + 1;

	var idayP = '';
	if (prevActualDOW.getDate() < 10) idayP = '0' + prevActualDOW.getDate();
	else idayP = prevActualDOW.getDate();

	var idayPplus1 = '';
	if (prevActualDOW.getDate() + 1 < 10) idayPplus1 = '0' + (prevActualDOW.getDate() + 1);
	else idayPplus1 = prevActualDOW.getDate() + 1;

	// text = text.replaceAll("[td TS-D]", "<t:" + Math.floor(tod.getTime() / 1000) + ":D>");
	// text = text.replaceAll("[td TS-R]", "<t:" + Math.floor(tod.getTime() / 1000) + ":R>");
	// text = text.replaceAll("[td TS-F]", "<t:" + Math.floor(tod.getTime() / 1000) + ":F>");
	// text = text.replaceAll("[tdMid TS-R]", "<t:" + Math.floor(todOnlyDate.getTime() / 1000) + ":R>");
	// text = text.replaceAll("[tdMid TS-D]", "<t:" + Math.floor(todOnlyDate.getTime() / 1000) + ":D>");
	// text = text.replaceAll("[tdMid TS-F]", "<t:" + Math.floor(todOnlyDate.getTime() / 1000) + ":F>");
	// text = text.replaceAll("[tdEOD TS-R]", "<t:" + Math.floor(todOnlyDate.getTime() / 1000) + ":R>");
	// text = text.replaceAll("[tdEOD TS-D]", "<t:" + Math.floor(todOnlyDate.getTime() / 1000) + ":D>");
	// text = text.replaceAll("[tdEOD TS-F]", "<t:" + Math.floor(todOnlyDate.getTime() / 1000) + ":F>");
	
	text = replaceNested(cacheVersion, text, ToBeCounted, recrused, headLevel, authorID);
	
	// if contains {RECURSIVE} then replace with result of funnyDOWTe xt(dowNum, authorID) -- loop until no more {RECURSIVE}
	// if contains <RECURSIVE> then replace with result of funnyDOWTex t(dowNum, authorID) but made URL safe -- loop until no more <RECURSIVE>

	while (text.includes('{RECURSIVE}') || text.includes('<RECURSIVE>') || text.includes('{REVERSE}'))
	{
		if (text.includes('{RECURSIVE}'))
		{
			var RECR = await funnyDOWText(cacheVersion, saveToFile, DateOveride, dowNum, authorID, recrused+1, ToBeCounted, headLevel);
			text = text.replace('{RECURSIVE}', RECR[0]);
			var RECRcn = RECR[1];
			var RECRcnY = RECR[2];
			if (RECRcnY.length > 0)
			{
				var x = {};
				x[RECRcn] = RECRcnY;
				cnYung.push(x);
			}
			else
				cnYung.push(RECRcn);
		}

		if (text.includes('<RECURSIVE>'))
		{
			var RECRFlat = await funnyDOWText(cacheVersion, saveToFile, DateOveride, dowNum, authorID, recrused+1, ToBeCounted, headLevel);
			text = text.replace('<RECURSIVE>', onlyLettersNumbers(RECRFlat[0]));
			var RECRcn = '|' + RECRFlat[1];
			var RECRcnY = RECRFlat[2];
			if (RECRcnY.length > 0)
			{
				var x = {};
				x[RECRcn] = RECRcnY;
				cnYung.push(x);
			}
			else
				cnYung.push(RECRcn);
		}

		if (text.includes('{REVERSE}'))
		{
			var res = await funnyDOWText(cacheVersion, saveToFile, DateOveride, dowNum, authorID, recrused+1, ToBeCounted, headLevel);
			text = text.replace('{REVERSE}', res[0].split('').reverse().join(''));
			var RECRcn = '-' + res[1];
			var RECRcnY = res[2];
			if (RECRcnY.length > 0)
			{
				var x = {};
				x[RECRcn] = RECRcnY;
				cnYung.push(x);
			}
			else
				cnYung.push(RECRcn);
		}
	}

	// fix: today stated x ago is not correct (displays current time not midnight)

	text = text.replaceAll('[d]', num);
	text = text.replaceAll('[month]', tod.getMonth());
	text = text.replaceAll('[todaylong]', tod.toDateString());
	text = text.replaceAll('[dow]', dow[tod.getDay()]);
	text = text.replaceAll('[dom]', tod.getDay());
	text = text.replaceAll('[DAY]', dow[dowNum]);
	text = text.replaceAll('[ACY]', dowACY[dowNum]);

	text = text.replaceAll('[intYEAR->]', nextActualDOW.getFullYear());
	text = text.replaceAll('[intMONTH->]', imonthN);
	text = text.replaceAll('[intDAY->]', idayN);
	text = text.replaceAll('[intDAY+1->]', idayNplus1);

	text = text.replaceAll('[intYEAR<-]', prevActualDOW.getFullYear());
	text = text.replaceAll('[intMONTH<-]', imonthP);
	text = text.replaceAll('[intDAY<-]', idayN);
	text = text.replaceAll('[intDAY+1<-]', idayPplus1);

	while (text.includes('[TS-') || text.includes('[td'))
	{
		if (text.includes('[TS-'))
		{
			// get first instance of [TS- until ] (length varies)
			var start = text.indexOf('[TS-');
			var end = text.indexOf(']', start);
			var parttext = text.substring(start, end + 1);

			subtext = '';
			pickedDay = nextActualDOW;
			if (parttext.includes('<-'))
			{
				pickedDay = prevActualDOW;
				subtext = '<-';
			}
			else if (parttext.includes('->'))
				subtext = '->';

			if (parttext.includes('E59'))
			{
				subtext += 'E59';
				pickedDay = new Date(pickedDay.getFullYear(), pickedDay.getMonth(), pickedDay.getDate(), 23, 59, 59, 999);
			}

			if (parttext.includes('-R'))
				text = text.replaceAll('[TS-R' + subtext + ']', '<t:' + Math.floor(pickedDay.getTime() / 1000) + ':R>');
			if (parttext.includes('-D'))
				text = text.replaceAll('[TS-D' + subtext + ']', '<t:' + Math.floor(pickedDay.getTime() / 1000) + ':D>');
			if (parttext.includes('-F'))
				text = text.replaceAll('[TS-F' + subtext + ']', '<t:' + Math.floor(pickedDay.getTime() / 1000) + ':F>');
		}

		if (text.includes('[td'))
		{
			// get first instance of [td until ] (length varies)
			var start = text.indexOf('[td');
			var end = text.indexOf(']', start);
			var parttext = text.substring(start, end + 1);

			subtext = '';
			pickedDay = tod;
			if (parttext.includes('Mid'))
			{
				pickedDay = todOnlyDate;
				subtext = 'Mid';
			}
			else if (parttext.includes('EOD'))
			{
				pickedDay = new Date(tod.getFullYear(), tod.getMonth(), tod.getDate(), 23, 59, 59, 999);
				subtext = 'EOD';
			}
			
			if (parttext.includes('-R'))
				text = text.replaceAll('[td' + subtext + ' TS-R]', '<t:' + Math.floor(pickedDay.getTime() / 1000) + ':R>');
			else if (parttext.includes('-D'))
				text = text.replaceAll('[td' + subtext + ' TS-D]', '<t:' + Math.floor(pickedDay.getTime() / 1000) + ':D>');
			else if (parttext.includes('-F'))
				text = text.replaceAll('[td' + subtext + ' TS-F]', '<t:' + Math.floor(pickedDay.getTime() / 1000) + ':F>');
		}
	}

	// text = text.replaceAll("[TS-R<-]", "<t:" + Math.floor(prevActualDOW.getTime() / 1000) + ":R>");
	// text = text.replaceAll("[TS-R->]", "<t:" + Math.floor(nextActualDOW.getTime() / 1000) + ":R>");
	// text = text.replaceAll("[TS-D<-]", "<t:" + Math.floor(prevActualDOW.getTime() / 1000) + ":D>");
	// text = text.replaceAll("[TS-D->]", "<t:" + Math.floor(nextActualDOW.getTime() / 1000) + ":D>");
	// text = text.replaceAll("[TS-F]", "<t:" + Math.floor(nextActualDOW.getTime() / 1000) + ":F>");
	
	if (text.includes('[SENDER]'))
	{
		if (!(global.dbAccess[1] && global.dbAccess[0]))
		{
			text = text.replaceAll('[SENDER]', 'BUDDY');
		}
		else
		{
			console.log('Whomst lookup for id ' + authorID);

			// make sure to replace [SENDER] with the name of the user who called the command, needs to wait for the result
			
			var { NameFromUserID } = require('../Database/databaseandvoice.js');

			var res = await NameFromUserID(authorID);

			text = text.replaceAll('[SENDER]', res);
		}
	}

	text = text.replaceAll('\\n', '\n');

	// // if length is greater than 1000, call again
	// if (text.length > 2000)
	// {
	// 	return funnyDOWText(cacheVersion, saveToFile, DateOveride, dowNum, authorID);
	// }

	// if recusion level is 0, save ToBeCounted to file
	if (recrused == 0 && saveToFile)
	{
		// console.log("Items in that /DOW call:");
		// // log ToBeCounted to console
		// for (var i = 0; i < ToBeCounted.length; i++)
		// {
		// 	console.log(ToBeCounted[i]);
		// }
		// console.log("");

		// load in global.fridayCounter
		var fc = global.fridayCounter;
		for (var i = 0; i < ToBeCounted.length; i++)
		{
			// if fc["UID--GROUP"] is not defined, define as 1, else increment
			if (fc[ToBeCounted[i].UID + '--' + ToBeCounted[i].Group + '--' + ToBeCounted[i].Sender] == null)
			{
				fc[ToBeCounted[i].UID + '--' + ToBeCounted[i].Group + '--' + ToBeCounted[i].Sender] = [];
			}

			if (fc[ToBeCounted[i].UID + '--' + ToBeCounted[i].Group + '--' + ToBeCounted[i].Sender][ToBeCounted[i].LayerDeep] == null)
			{
				fc[ToBeCounted[i].UID + '--' + ToBeCounted[i].Group + '--' + ToBeCounted[i].Sender][ToBeCounted[i].LayerDeep] = [];
			}

			if (fc[ToBeCounted[i].UID + '--' + ToBeCounted[i].Group + '--' + ToBeCounted[i].Sender][ToBeCounted[i].LayerDeep][ToBeCounted[i].HeadLevel] == null)
			{
				fc[ToBeCounted[i].UID + '--' + ToBeCounted[i].Group + '--' + ToBeCounted[i].Sender][ToBeCounted[i].LayerDeep][ToBeCounted[i].HeadLevel] = 1;
			}
			else
			{
				fc[ToBeCounted[i].UID + '--' + ToBeCounted[i].Group + '--' + ToBeCounted[i].Sender][ToBeCounted[i].LayerDeep][ToBeCounted[i].HeadLevel]++;
			}
		}

		// save global.fridayCounter to file
		fs.writeFileSync(babadata.datalocation + 'fridayCounter.json', JSON.stringify(fc));
	}

	var textC = repeatCheck(cacheVersion, text);
	text = textC[0];
	condensedNotation += condensedNotationCreator(textC[1], '>');
	
	return [text, condensedNotation, cnYung];
}

/**
 * Build a condensed-notation string describing repeat/transform operations.
 *
 * The function expects `listOfCDs` to contain compact tokens describing
 * transformations; it scans the list in reverse and merges items that
 * reference an index (e.g. "0-6s" causes the referenced index 0 to append
 * "*6s"), then joins tokens with "+" and prepends `prefix` when items exist.
 *
 * This condensed notation is used for saving compact metadata about how
 * the final text was constructed.
 *
 * @param {string[]} listOfCDs - Array of condensed tokens.
 * @param {string} prefix - String prefix to insert at start (e.g. ">").
 * @returns {string} The condensed notation string (possibly empty).
 */
function condensedNotationCreator(listOfCDs, prefix)
{
	var condensedNotation = '';
	if (listOfCDs.length > 0)
	{
		// loop through list of CDs in reverse order
		for (var i = listOfCDs.length - 1; i >= 0; i--)
		{
			var item = listOfCDs[i];
			// if text starts with Number- then remove item from list and concat to index of said number (ex 0-6s -> ItemAt0*6s)
			if (item.split('-').length > 1)
			{
				var split = item.split('-');
				var index = parseInt(split[0]);
				var item = split[1];
				listOfCDs.splice(i, 1);
				listOfCDs[index] += '*' + item;
			}
		}
        
		condensedNotation += prefix + listOfCDs.join('+');
	}
    
	return condensedNotation;
}

/**
 * Perform bracketed replacements in `text` using entries from
 * `FridayLoops.json` (or a cached version).
 *
 * Behavior:
 * - Replacements are looked up by key name (e.g. "[SOME_KEY]") and each
 *   key may have multiple candidate texts; a candidate is selected using
 *   `theRNG` and substituted. Substitutions continue until no bracketed
 *   key instances remain.
 * - When `ToBeCounted` is provided, each substitution pushes metadata into
 *   that array for later counting/statistics.
 *
 * Notes:
 * - If `cacheVersion` points to a non-existent cache file, the function
 *   falls back to the normal `FridayLoops.json`.
 *
 * @returns {string} The text after all nested bracketed replacements.
 */
function replaceNested(cacheVersion, text, ToBeCounted = null, recrused = 0, headLevel = 0, authorID = 0)
{
	var replaced = true;
	// get from FridayLoops.json
	var path = babadata.datalocation + 'FridayLoops.json';

	if (cacheVersion != -1)
	{
		path = babadata.datalocation + 'FridayCache/FridayLoops' + cacheVersion + '.json';

		if (!fs.existsSync(path))
		{
			// return to normal cache
			cacheVersion = -1;
			path = babadata.datalocation + 'FridayLoops.json';
		}
	}

	let rawdata = fs.readFileSync(path);

	var replacements = JSON.parse(rawdata);

	if (replacements == null)
	{
		replaced = false;
	}

	while (replaced)
	{
		replaced = false;

		// loop throught replacements
		for (var i = 0; i < Object.keys(replacements).length; i++)
		{
			var key = Object.keys(replacements)[i];
			var value = replacements[key];

			var regex = new RegExp('\\[' + key + '\\]', 'g');

			if (text.match(regex))
			{
				while (text.match(regex))
				{
					var numbo = Math.floor(theRNG.nextFloat() * value.length);
					text = text.replace('[' + key + ']', value[numbo].text);

					if (ToBeCounted != null)
					{
						TBDItem = { 'UID': value[numbo].UID, 'LayerDeep': recrused, 'Group': 1, 'Text': value[numbo].text, 'HeadLevel': headLevel, 'Sender': authorID};
						ToBeCounted.push(TBDItem);
					}
				}
				replaced = true;
			}
		}
	}

	return text;
}

/**
 * Find and expand repeat blocks in `text`.
 *
 * Supported patterns include `{repeat:NUM:VALUE}` and variants with
 * prefixes (e.g. `b` prefix used by other code paths). This function
 * replaces matched repeat blocks with the expanded text and returns an
 * array `[expandedText, condensedRepeatDescriptors]` where the second
 * element is used to record how many repeats were expanded.
 *
 * @param {number} cacheVersion - Cache version passed through to nested replacements.
 * @param {string} text - Input text possibly containing repeat blocks.
 * @param {string} prefix - Optional prefix to support specialized repeat
 *   syntaxes (e.g. "b").
 * @returns {[string,string[]]} The expanded text and a list of condensed descriptors.
 */
function repeatCheck(cacheVersion, text, prefix = '')
{
	if (text.includes('{RECURSIVE}'))
		text = text.replaceAll('{RECURSIVE}', '𓃐RECURSIVE𓃐');

	if (text.includes('{REVERSE}'))
		text = text.replaceAll('{REVERSE}', '𓃐REVERSE𓃐');

	var matchsplitter = '{' + prefix + '[rR][eE][pP][eE][aA][tT][sSnN]?:(\\{[^{}]*\\}|[^{}]+):(\\{[^{}]*\\}|[^{}]+)\\}';

	var RegexExpress = new RegExp(matchsplitter, 'g');

	var cd = [];
	var match = text.match(RegexExpress);

	if (match != null)
	{
		for (var i = 0; i < match.length; i++)
		{
			var matchi = match[i];
			var textI = repeatCheckInner(cacheVersion, matchi, prefix);
	
			text = text.replace(matchi, textI[0]);
	
			// append all textI[1] to cd
			cd = cd.concat(textI[1]);
		}
	}

	if (text.includes('𓃐RECURSIVE𓃐'))
		text = text.replaceAll('𓃐RECURSIVE𓃐', '{RECURSIVE}');

	if (text.includes('𓃐REVERSE𓃐'))
		text = text.replaceAll('𓃐REVERSE𓃐', '{REVERSE}');

	return [text, cd];
}

/**
 * Internal helper used by `repeatCheck` to process individual repeat blocks.
 *
 * This function supports nested repeat constructs and returns `[newText, counto]`
 * where `counto` is used to build condensed notation for repeated segments.
 *
 * @param {number} cacheVersion
 * @param {string} text
 * @param {string} prefix
 * @returns {[string,string[]]}
 */
function repeatCheckInner(cacheVersion, text, prefix = '')
{
	// new /friday option tag items go here:
	// {repeat:x:[Value]} - repeat the value x times
	// repeat is not case sensitive in the regex
	// regex: {[rR][eE][pP][eE][aA][tT][sSnN]?:(\d+):((.|\n)*)}
	// {repeat:5:[frog]} - frog frog frog frog frog
	// {repeat:3:[frog{repeat:2:[frog]}]} - start with outer repeat, then go inwards 

	var pf = '';
	if (prefix != '')
	{
		pf = '[' + prefix.toLowerCase() + prefix.toUpperCase() + ']';
	}

	var regexString = '{' + pf + '[rR][eE][pP][eE][aA][tT][sSnN]?:(\\d+):((.|\n)*?)(}+)';

	if (prefix == 'b')
	{
		regexString =  '{' + pf + '[rR][eE][pP][eE][aA][tT][sSnN]?:(\\[(.*)\\]):((.|\n)*?)(}+)';
	}

	var RegexExpress = new RegExp(regexString, 'g');
	var RegexExpress2 = new RegExp(regexString + ':', 'g');
	var match = text.match(RegexExpress);
	var match2 = text.match(RegexExpress2);

	var validCountoAdd = true;
	if (match2 != null) 
	{
		if (prefix == 'b')
			validCountoAdd = false;
		match = match2;
		match = match.map(x => x.slice(0, -1));
	}
	else
	{
		if (prefix == 'b')
			validCountoAdd = true;
	}
	
	var indexesDealtWith = [];
	var hasChildren = [];
	var matchedChildren = [];

	var counto = [];
	while (match != null)
	{
		for (var i = 0; i < match.length; i++)
		{
			var countoPrefix = '';

			if (prefix != 'b')
				validCountoAdd = true;

			var matchi = match[i];

			if (matchedChildren.includes(matchi))
			{
				validCountoAdd = false;
				var mCIndex = matchedChildren.indexOf(matchi);
				var parentIndex = hasChildren[mCIndex];
				if (!indexesDealtWith.includes(parentIndex))
				{
					countoPrefix = parentIndex + '-';
					validCountoAdd = true;

					// remove from hasChildren and matchedChildren
					hasChildren.splice(mCIndex, 1);
					matchedChildren.splice(mCIndex, 1);

					// add parentIndex to indexesDealtWith
					indexesDealtWith.push(parentIndex);
				}
			}
			
			if (prefix == 'b')
			{
				// get the middle value
				var middle = matchi.split(':')[1];
				var middle2 = replaceNested(cacheVersion, middle);
				matchi = matchi.replace(middle, middle2);
			}

			var num = parseInt(matchi.match(/\d+/)[0]);
			var valuesplit = matchi.split(':');
			// value is index 2 onwards
			var value = valuesplit.slice(2).join(':');
			value = value.slice(0, -1);

			var containsS = matchi.split(':')[0].toLowerCase().includes('s');
			var containsN = matchi.split(':')[0].toLowerCase().includes('n');

			// add num to counto
			if (validCountoAdd)
				counto.push(countoPrefix + '' + num + (containsS ? 's' : '') + (containsN ? 'n' : ''));

			var newString = '';
			for (var j = 0; j < num; j++)
			{
				newString += value + (containsS ? ' ' : containsN ? '\n' : '');
			}

			text = text.replace(match[i], newString);

			var subMatch = newString.match(RegexExpress);
			var subMatch2 = newString.match(RegexExpress2);
			if (subMatch2 != null) 
			{
				subMatch = subMatch2;
				subMatch = subMatch.map(x => x.slice(0, -1));
			}

			if (subMatch != null)
			{
				// add all submatches to matchedChildren
				for (var j = 0; j < subMatch.length; j++)
				{
					hasChildren.push(j);
					matchedChildren.push(subMatch[j]);
				}
			}
		}

		match = text.match(RegexExpress);
		match2 = text.match(RegexExpress2);
		if (match2 != null) 
		{
			if (prefix == 'b')
				validCountoAdd = false;
			match = match2;
			match = match.map(x => x.slice(0, -1));
		}
		else
		{
			if (prefix == 'b')
				validCountoAdd = true;
		}
	}

	return [text, counto];
}

/**
 * Strip all non-alphanumeric characters from `text`.
 *
 * If the result is empty, generate a short pseudo-random alphanumeric
 * string using the module RNG so callers always get a non-empty identifier.
 *
 * @param {string} text
 * @returns {string}
 */
function onlyLettersNumbers(text)
{
	// remove all non-alphanumeric characters
	text = text.replace(/[^a-zA-Z0-9]/g, '');

	if (text == '')
		// set to a random string of 1 to 10 characters
		text = theRNG.nextFloat().toString(36).substring(2, Math.floor(theRNG.nextFloat() * 10) + 2);

	return text;
}

/**
 * Perform a conservative URL-encoding of commonly problematic characters.
 *
 * This is a simple replacement approach (not `encodeURIComponent`) and is
 * intended for small uses inside templates where a few characters need
 * to be converted into percent-encoded equivalents.
 *
 * @param {string} text
 * @returns {string} The URL-safe string.
 */
function URLSafe(text)
{
	text = text.replaceAll(' ', '%20');
	text = text.replaceAll(':', '%3A');
	text = text.replaceAll('?', '%3F');
	text = text.replaceAll('!', '%21');
	text = text.replaceAll(';', '%3B');
	text = text.replaceAll('=', '%3D');
	text = text.replaceAll('&', '%26');
	text = text.replaceAll('#', '%23');
	text = text.replaceAll('/', '%2F');
	text = text.replaceAll('\\', '%5C');
	text = text.replaceAll('@', '%40');
	text = text.replaceAll('$', '%24');
	text = text.replaceAll('%', '%25');
	text = text.replaceAll('^', '%5E');
	text = text.replaceAll('*', '%2A');
	text = text.replaceAll('(', '%28');
	text = text.replaceAll(')', '%29');
	text = text.replaceAll('[', '%5B');
	text = text.replaceAll(']', '%5D');
	text = text.replaceAll('{', '%7B');
	text = text.replaceAll('}', '%7D');
	text = text.replaceAll('|', '%7C');
	text = text.replaceAll('<', '%3C');
	text = text.replaceAll('>', '%3E');
	text = text.replaceAll('`', '%60');
	text = text.replaceAll('~', '%7E');
	text = text.replaceAll("'", '%27');
	text = text.replaceAll('"', '%22');

	return text;
}

/**
 * Return a randomized frog-related text from the FROG cache.
 *
 * If the cache file does not exist this function will create a minimal
 * fallback `FROGcache.json` file in `babadata.datalocation` so callers
 * can continue to operate.
 *
 * @param {number} authorID - ID used to generate context-sensitive options.
 * @returns {string} A selected frog text or URL.
 */
function funnyFrogText(authorID)
{
	let path = babadata.datalocation + 'FROGcache.json';

	if (!fs.existsSync(path)) 
	{
		console.log('No FROGcache file found -- creating with local data');

		var opttemp = ['https://tenor.com/view/frog-funny-funny-frog-picmix-blingee-gif-25200067'];
		opttemp.push(opts2);
		
		var data = JSON.stringify(opttemp);
		
		fs.writeFileSync(babadata.datalocation + 'FROGcache.json', data);
	}

    let rawdata = fs.readFileSync(babadata.datalocation + 'FROGcache.json');

	var optionsFROG = JSON.parse(rawdata);

	if (typeof optionsFROG[0] != 'string')
	{
		optionsFROG = generateFrogOps(optionsFROG, authorID);
	}

	var text = optionsFROG[Math.floor(Math.random() * optionsFROG.length)].text;

	return text;
}

/**
 * Filter frog options based on control list and the caller's ID.
 *
 * `FROGcontrol.json` contains control levels per user; this function
 * filters `opsArray` to include only the options the `authorID` is
 * allowed to see.
 *
 * @param {Array} opsArray
 * @param {number} authorID
 * @returns {Array} Filtered options.
 */
function generateFrogOps(opsArray, authorID)
{
    let rawdata = fs.readFileSync(babadata.datalocation + 'FROGcontrol.json');
    var controlList = JSON.parse(rawdata);
	var cLevel = 0;

	for (var i = 0; i < controlList.length; i++)
	{
		if (controlList[i].ID == authorID)
		{
			cLevel = controlList[i].Control;
		}
	}
	
	ops = [];
	for (var i = 0; i < opsArray.length; i++)
	{
		if (cLevel <= 1)
		{
			if (opsArray[i].enabledDef == true)
			{
				ops.push(opsArray[i]);
			}
		}

		if (cLevel >= 1)
		{
			if (opsArray[i].IDS != null && opsArray[i].IDS.toString().includes(authorID))
			{
				ops.push(opsArray[i]);
			}
		}
	}

	return ops;
}

/**
 * Generate Friday/DOW options filtered by time gates, occurrence chance,
 * and user control levels.
 *
 * This reads `TimeGates.json` to optionally select a different base date
 * when `prefix` identifies a cached snapshot. It then filters `opsArray`
 * according to start/end time windows, day-of-week constraints, and
 * `OccuranceChance` percent roll.
 *
 * @param {Array} opsArray - Candidate options read from DOW cache.
 * @param {number} authorID - ID used to check permission/control level.
 * @param {number} prefix - Cache version prefix; -1 = normal current data.
 * @param {Array} DateOveride - Date override array used elsewhere.
 * @returns {Array} Filtered ops ready for random selection.
 */
function generateFridayOps(opsArray, authorID, prefix, DateOveride)
{
	// get TimeGates.json
	var path = babadata.datalocation + 'TimeGates.json';
	let raw = fs.readFileSync(path);

	var TimeGates = JSON.parse(raw);

	var tod = getD1(true);
	if (prefix != -1)
	{
		// loop through TimeGates until VersionNumber == prefix
		for (var i = 0; i < TimeGates.length; i++)
		{
			if (TimeGates[i].VersionNumber == prefix)
			{
				// get the date from TimeGates
				tod = new Date(TimeGates[i].DateTime);
				break;
			}
		}
	}

	if (DateOveride[1] != null)
	{
		var tod = getD1(true);
	}

	if (DateOveride[2] != null && DateOveride[0] != null)
	{
		var tod = new Date(DateOveride[0] * 1000);
	}

	// console.log("Today is " + tod.toDateString() + " for Items Date");

    let rawdata = fs.readFileSync(babadata.datalocation + 'DOWcontrol.json');

	if (prefix != -1)
	{
		path = babadata.datalocation + 'FridayCache/DOWcache' + prefix + '.json';

		if (!fs.existsSync(path)) 
		{
			// return to normal cache
			cacheVersion = -1;
			path = babadata.datalocation + 'DOWcache.json';
		}
	}

    var controlList = JSON.parse(rawdata);
	var cLevel = 0;

	for (var i = 0; i < controlList.length; i++)
	{
		if (controlList[i].ID == authorID)
		{
			cLevel = controlList[i].Control;
		}
	}

	var opsArraywithNoStartDateOrDOW = [];
	for (var i = 0; i < opsArray.length; i++)
	{
		if (opsArray[i].StartTime == null && opsArray[i].DayOfWeek == null && opsArray[i].OccuranceChance == 100)
		{
			opsArraywithNoStartDateOrDOW.push(opsArray[i]);
		}
	}
	
	ops = [];
	for (var i = 0; i < opsArray.length; i++)
	{
		if (opsArray[i].StartTime != null)
		{
			var st = new Date(opsArray[i].StartTime);

			if (opsArray[i].EndTime != null)
			{
				var et = new Date(opsArray[i].EndTime);
				var startNormalizedToYear = new Date(tod.getFullYear(), st.getMonth(), st.getDate());
				var endNormalizedToYear = new Date(tod.getFullYear(), et.getMonth(), et.getDate());

				if (tod < startNormalizedToYear || tod > endNormalizedToYear)
					continue;
			}
			else
			{
				var startNormalizedToYear = new Date(tod.getFullYear(), st.getMonth(), st.getDate());
				var todDateOnly = new Date(tod.getFullYear(), tod.getMonth(), tod.getDate());

				if (todDateOnly.getMonth() != startNormalizedToYear.getMonth() || todDateOnly.getDate() != startNormalizedToYear.getDate())
					continue;
			}
		}

		if (opsArray[i].DayOfWeek != null)
		{
			var dow = tod.getDay();

			if (opsArray[i].DayOfWeek != dow)
				continue;
		}

		if (opsArray[i].OccuranceChance < 100)
		{
			if (theRNG.nextFloat() * 100 > opsArray[i].OccuranceChance)
				continue;
		}

		if (cLevel <= 1)
		{
			if (opsArray[i].enabledDef == true)
			{
				ops.push(opsArray[i]);
			}
		}

		if (cLevel >= 1)
		{
			if (opsArray[i].IDS != null && opsArray[i].IDS.toString().includes(authorID))
			{
				ops.push(opsArray[i]);
			}
		}
	}

	return ops;
}

/**
 * Remove the counting role from a user in a guild.
 *
 * This is a tiny helper to async-fetch a member and remove a configured
 * role id defined in `babadata.countrole` with a human-readable reason.
 *
 * @param {string} uid - User id to operate on.
 * @param {object} g - Guild object (expects `g.members.fetch`).
 */
function removeCountRuin(uid, g)
{
	g.members.fetch(uid).then(member => {
		member.roles.remove(babadata.countrole, 'you are free to count!');
	});
}

 

module.exports = {
	functionPostFunnyDOW,
    funnyDOWTextSaved,
    funnyFrogText,
	removeCountRuin,
	resetRNG,
	splitStringInto2000CharChunksonNewLine,
	splitStringInto900CharChunksonSpace
};