var babadata = require('../babotdata.json'); //baba configuration file

const fs = require('fs');

const Discord = require('discord.js'); //discord module for interation with discord api

const { loadInDBFSV } = require('./HelperFunctions/dbHelpers.js');
const { SetHolidayChan, CreateChannel, MonthsPlus } = require('./HelperFunctions/basicHelpers.js');
const { FindNextHoliday, CheckHoliday } = require('./HelperFunctions/commandHelpers.js');
const { ObtainDBHolidays } = require('./Database/databaseandvoice');
const { LoadAllTheCache, SaveSlashFridayJson } = require('./Database/databaseVoiceController');
const { resetRNG } = require('./HelperFunctions/slashFridayHelpers.js');
const { DailyReminderCall, StartTheReminders } = require('./HelperFunctions/remindersByBaba.js');
const { getD1 } = require('../Tools/overrides.js');

var to = null;
var toWed = null;
var toTyp = null;

/**
 * Module: Functions/dailycall
 *
 * Responsibilities / behavior summary:
 * - Reads configuration from `babotdata.json` and additional data files
 *   (e.g. `DOWitems.json`, `FrogHolidays/frogholidays.json`).
 * - Resets RNG and runs scheduled reminders (calls into `remindersByBaba`).
 * - Posts birthday messages, day-of-week messages, and typing indicators.
 * - Calls several helper functions with side effects: `LoadAllTheCache`,
 *   `StartTheReminders`, `SaveSlashFridayJson`, `SetHolidayChan`, `CreateChannel`,
 *   and `MonthsPlus`.
 * - Schedules timers (`to`, `toWed`, `toTyp`) via `setTimeout` for future actions
 *   and exposes `cleanupFn` on `global.DailyCallCleanup` to cancel them.
 *
 * Important side effects & globals:
 * - Sets `global.BirthdayToday` to an array of names when birthdays are found.
 * - Sets `global.ResetDaily = true` when the daily run begins.
 * - Uses `global.dbAccess` flags to gate DB/cache loading.
 * - Logs extensively via `console.log` and reports errors with `console.error`.
 *
 * Data shapes/oddities:
 * - `DOWitems.json` is expected to map a day-key to an object containing
 *   `Items` (array of { Name, Occurances }), a probability key spelled
 *   `Probaility` (note the misspelling), and `Start`/`End` strings like
 *   `"HH:MM:SS"`.
 * - `FrogHolidays/frogholidays.json` contains `froghelp.mainfrog` used to resolve
 *   a helper guild id.
 *
 * The codebase contains non-obvious behaviors (e.g., string IDs used interchangeably
 * with channel objects); the docs below call out those behaviors where relevant.
 */
global.BirthdayToday = null;

/**
 * Start the daily-call loop by loading DB state and invoking the first `dailyCall`.
 * This function triggers `loadInDBFSV()` (DB initialization) then fetches the
 * configured guild from `babadata.guildId` and calls `dailyCall`.
 *
 * Side effects:
 * - Calls `loadInDBFSV()` which mutates global DB state used elsewhere.
 * - Kicks off the periodic run by calling `dailyCall` which sets a repeating
 *   timer in the `to` variable.
 *
 * @param {import('discord.js').Client} bot - The Discord client instance.
 * @param {string} dirName - Path to the directory containing `babotdata.json`.
 * @returns {void}
 */
function dailyCallStart(bot, dirName) {
  loadInDBFSV();
  bot.guilds.fetch(babadata.guildId).then((guild) => {
    dailyCall(bot, guild, dirName);
  });
}

/**
 * Find birthdays that match today's date and post a celebratory command
 * into the configured `generalchan` channel.
 *
 * - Requires DB access: gated by `global.dbAccess[1] && global.dbAccess[0]`.
 * - Calls `ObtainDBHolidays()` to load holiday/birthday records.
 * - Uses `FindNextHoliday()` + `CheckHoliday("BIRTHDAY", ...)` to filter
 *   today's birthday entries.
 * - If birthdays are found, sets `global.BirthdayToday` to an array of
 *   `safename` strings and sends two actions in the `generalchan`:
 *     1) `channel.sendTyping()` (typing indicator)
 *     2) `channel.send("!baba wednesday <names>")` (invokes another bot
 *        command via chat message).
 * - All fetching/send errors are logged; the function does not throw.
 *
 * @param {import('discord.js').Guild} guild - Guild to fetch the general channel from.
 * @returns {Promise<void>}
 */
async function DisplayBirthdays(guild) {
  /**
   * Find birthdays that match today's date and post a celebratory command
   * into the configured `generalchan` channel. Behavior details:
   *
   * - Requires DB access: gated by `global.dbAccess[1] && global.dbAccess[0]`.
   * - Calls `ObtainDBHolidays()` to load holiday/birthday records.
   * - Uses `FindNextHoliday()` + `CheckHoliday("BIRTHDAY", ...)` to filter
   *   today's birthday entries.
   * - If birthdays are found, sets `global.BirthdayToday` to an array of
   *   `safename` strings and sends two actions in the `generalchan`:
   *     1) `channel.sendTyping()` (typing indicator)
   *     2) `channel.send("!baba wednesday <names>")` (invokes another bot
   *        command via chat message).
   * - All fetching/send errors are logged; the function does not throw.
   *
   * Notes on odd behavior:
   * - The function constructs a chat command string `!baba wednesday ...`
   *   rather than calling an internal function — this relies on the bot's
   *   message handler to interpret that command.
   */

  if (global.dbAccess[1] && global.dbAccess[0]) {
    var holidays = ObtainDBHolidays();

    let d1 = getD1(); //get today (may be overridden by Tools/overrides)
    var yr = d1.getFullYear();
    var hols = FindNextHoliday(d1, yr, CheckHoliday('BIRTHDAY', holidays));
    global.BirthdayToday = null;

    var generalChan = guild.channels
      .fetch(babadata.generalchan)
      .then((channel) => {
        if (hols.length > 0) {
          var names = [];
          for (var i = 0; i < hols.length; i++) {
            if (hols[i].day == d1.getDate() && hols[i].month == d1.getMonth() + 1) {
              names.push(hols[i]['safename']);
            }
          }
          if (names.length > 0) {
            global.BirthdayToday = names;
            channel.sendTyping();
            console.log('Celebrating: ' + names.join(' and '));
            channel.send('!baba wednesday ' + names.join(' and '));
          }
        }
      })
      .catch(console.error);
  }
}

/**
 * Occasionally send a typing indicator to the configured general channel.
 *
 * Behavior details & edge cases:
 * - Uses `getD1()` to build two reference times: 08:00 and 23:00 on the
 *   same day. The scheduling window is between those two times.
 * - Computes a random delay (`rndTime`) between the two times and registers
 *   a single `setTimeout` stored in the module-level `toTyp` variable.
 * - When triggered the timeout fetches `babadata.generalchan` and calls
 *   `channel.sendTyping()`; errors are caught and logged.
 * - `toTyp` is cleared (set to `null`) after firing. The cleanup function
 *   will cancel this timer if the process shuts down earlier.
 *
 * @param {import('discord.js').Guild} guild - Guild to fetch the general channel from.
 * @param {Date} now - Current time used as reference for scheduling.
 * @returns {void}
 */
function BabaTyping(guild, now) {
  var eightAM = getD1();
  eightAM.setHours(8);

  var tenPM = getD1();
  tenPM.setHours(23);

  var timeToEightAM = Math.max(eightAM.getTime() - now.getTime(), 0);
  var timeToTenPM = Math.max(tenPM.getTime() - now.getTime(), 0);

  var rndTime = Math.floor(Math.random() * (timeToTenPM - timeToEightAM)) + timeToEightAM;

  toTyp = setTimeout(function () {
    var generalChan = guild.channels
      .fetch(babadata.generalchan)
      .then((channel) => {
        channel.sendTyping();
      })
      .catch(console.error);
    toTyp = null;
  }, rndTime);
}

/**
 * Expand a weighted item list into a flat array of messages according to
 * each item's `Occurances` count. This is a simple deterministic expansion
 * (repeats the `Name` value `Occurances` times) and does not perform weighting
 * beyond repetition.
 *
 * Expected item shape: { Name: string, Occurances: number }
 *
 * @param {Array<Object>} itemlist - Array of items with keys `Name` and `Occurances`.
 * @returns {Array<string>} Flattened array of message strings.
 */
function genMessages(itemlist) {
  var msgall = [];
  for (var i = 0; i < itemlist.length; i++) {
    for (var j = 0; j < itemlist[i]['Occurances']; j++) {
      msgall.push(itemlist[i]['Name']);
    }
  }
  return msgall;
}

/**
 * Load DOW (day-of-week) items from `DOWitems.json`. If the file is absent
 * a default object is returned containing one placeholder message.
 *
 * Important: the code expects the probability key to be spelled `Probaility`
 * (note the typo) in any on-disk JSON. Do not rename it without updating
 * callers.
 *
 * Returned structure example:
 * {
 *   "0": {
 *     "Items": [{ "Name": "...", "Occurances": 1 }],
 *     "Probaility": 0.5,
 *     "Start": "08:00:00",
 *     "End": "22:00:00"
 *   }
 * }
 *
 * @param {string|number} dow - Day-of-week key used in the DOWitems JSON.
 * @returns {Object} Parsed DOW items keyed by `dow`.
 */
function generateItems(dow) {
  let path = babadata.datalocation + 'DOWitems.json';

  if (!fs.existsSync(path)) {
    console.log('No DOWitems file found -- using default');

    var defaultItems = {};
    defaultItems[dow] = {
      Items: [{ Name: 'Baba is Pleased', Occurances: 1 }],
      Probaility: 1,
      Start: '00:00:00',
      End: '23:59:59',
    };
    return defaultItems;
  }

  let rawdata = fs.readFileSync(babadata.datalocation + 'DOWitems.json');

  var adam = JSON.parse(rawdata);
  return adam;
}

/**
 * Possibly schedule and send a day-of-week message based on probability and
 * the configured time window. High-level behavior and edge cases:
 *
 * - Loads DOW items via `generateItems(dow)` and reads the `Probaility`
 *   (sic) threshold. A random value `rngchance` determines if a message will
 *   be scheduled.
 * - If selected, `genMessages()` expands `Items` into a flat message list and
 *   a single message is chosen uniformly at random.
 * - The function enumerates all channels from `guild.channels.fetch()` and
 *   builds a `coolCats` list. The code mixes preconfigured channel ID strings
 *   with actual channel objects; later it replaces string IDs with the live
 *   object when found. This means `coolestCat` may be either a string ID or a
 *   channel object.
 * - The scheduled action is stored in `toWed`. When executed:
 *   - If `coolestCat` is a string id the function searches all channels'
 *     threads (including archived) and sends the message to the matching
 *     thread id if found.
 *   - Otherwise it calls `.send(msg)` on the channel object.
 * - The implementation has potential race conditions: asynchronous
 *   `threads.fetch()` calls set `foundme` in nested callbacks; if the
 *   environment is under load multiple fetches may behave unpredictably.
 *
 * @param {number} dow - Numeric day of week (0-6) used to select items.
 * @param {import('discord.js').Guild} guild - Guild to send messages in.
 * @param {Date} now - Reference time for scheduling.
 * @returns {void}
 */
function todayDay(dow, guild, now) {
  var adam = generateItems(dow);
  var todayAdam = adam[dow];
  var rngchance = Math.random();
  console.log('RNG Chance is ' + rngchance + ' and the threshold is ' + todayAdam['Probaility']);
  if (rngchance < todayAdam['Probaility']) {
    console.log('Adam is happy today'); // copilot why?
    console.log(
      'RNG Message Call ran for ' +
        todayAdam['Items'][0]['Name'] +
        ' with a ' +
        todayAdam['Probaility'] * 100 +
        '% chance'
    );

    var msgs = genMessages(todayAdam['Items']);

    var startDate = todayAdam['Start'];
    var endDate = todayAdam['End'];
    var start = new Date('1970-01-01T' + startDate);
    var end = new Date('1970-01-01T' + endDate);

    guild.channels
      .fetch()
      .then((channels) => {
        console.log(`There are ${channels.size} channels.`);
        bannedCats = ['955141276574035988', '955251220057047110', '587298042068074526']; // categories to not post in
        bannedKittens = [
          '826320007675641876',
          '917516043583361034',
          '1064319655872827432',
          '882681066127777792',
          '1072288299361763378',
        ]; // channels to not post in
        coolCats = [
          '1203559278393430076',
          '915351407287222403',
          '979881683790733333',
          '1069025445162524792',
          '1072635694167634032',
        ]; // allowed channels, add exceptions manually

        for (let currenter of channels) {
          if (
            currenter[1] != null &&
            currenter[1].type == 0 &&
            !bannedKittens.includes(currenter[1].id)
          ) {
            if (!bannedCats.includes(currenter[1].parentId)) coolCats.push(currenter[1]);
          }

          // if currenter[1].id in coolCats as id replace with currenter[1]
          if (coolCats.includes(currenter[1].id)) {
            coolCats[coolCats.indexOf(currenter[1].id)] = currenter[1];
          }
        }

        var coolestCat = coolCats[Math.floor(Math.random() * coolCats.length)];

        var eightAM = getD1();
        eightAM.setHours(start.getHours());
        eightAM.setMinutes(start.getMinutes());
        eightAM.setSeconds(start.getSeconds());
        eightAM.setMilliseconds(start.getMilliseconds());

        var tenPM = getD1();
        tenPM.setHours(end.getHours());
        tenPM.setMinutes(end.getMinutes());
        tenPM.setSeconds(end.getSeconds());
        tenPM.setMilliseconds(end.getMilliseconds());

        var timeToEightAM = Math.max(eightAM.getTime() - now.getTime(), 0);
        var timeToTenPM = Math.max(tenPM.getTime() - now.getTime(), 0);

        var rndTime = Math.floor(Math.random() * (timeToTenPM - timeToEightAM)) + timeToEightAM;
        console.log(
          'Sending to ' +
            (coolestCat && coolestCat.name ? coolestCat.name : coolestCat) +
            ' at ' +
            new Date(now.getTime() + rndTime).toTimeString()
        );

        var msg = msgs[Math.floor(Math.random() * msgs.length)];

        toWed = setTimeout(function () {
          // if coolestCat is a string, fetch the thread by searching all the channels for the thread with the id of coolestCat
          if (typeof coolestCat === 'string' || coolestCat instanceof String) {
            foundme = false;
            for (let currenter of channels) {
              if (currenter[1].type == 0 && !foundme) {
                currenter[1].threads.fetch().then((threads) => {
                  threads.threads.forEach((thread) => {
                    if (thread.id == coolestCat) {
                      thread.send(msg);
                      foundme = true;
                    }
                  });
                });

                if (!foundme) {
                  currenter[1].threads.fetchArchived().then((threads) => {
                    threads.threads.forEach((thread) => {
                      if (thread.id == coolestCat) {
                        thread.send(msg);
                      }
                    });
                  });
                }
              }

              if (foundme) {
                break;
              }
            }
          } else {
            coolestCat.send(msg);
          }
          toWed = null;
        }, rndTime);
      })
      .catch(console.error);
  }
}

/**
 * Main daily runner. Performs one full daily pass and schedules the next run
 * just after the next midnight.
 *
 * Steps performed:
 * - reset RNG and errors
 * - load babot config
 * - set holiday channel if necessary
 * - run reminders and birthday displays
 * - schedule the next invocation at midnight + 20s
 *
 * @param {import('discord.js').Client} bot - Discord client instance.
 * @param {import('discord.js').Guild} guild - Guild object to operate in.
 * @param {string} sourceDir - Directory path where `babotdata.json` is located.
 * @returns {Promise<void>} Resolves once scheduling is complete.
 */
async function dailyCall(bot, guild, sourceDir) {
  /**
   * Main daily runner. Performs one full daily pass and schedules the next run
   * just after the next midnight.
   *
   * Steps performed:
   * - reset RNG and errors
   * - load babot config
   * - set holiday channel if necessary
   * - run reminders and birthday displays
   * - schedule the next invocation at midnight + 20s
   *
   * @param {import('discord.js').Client} bot - Discord client instance.
   * @param {import('discord.js').Guild} guild - Guild object to operate in.
   * @param {string} sourceDir - Directory path where `babotdata.json` is located.
   * @returns {Promise<void>} Resolves once scheduling is complete.
   */

  resetRNG();
  global.DailyErrors = 0;
  let rawdataBB = fs.readFileSync(sourceDir + '/babotdata.json');
  babadata = JSON.parse(rawdataBB);

  var now = getD1(true, true); //todayish
  var nowAtMidnight = getD1(false, true); //todayish at midnight
  var d1Sim = getD1(); //todayish

  console.log('Daily Call Running: ' + now.toDateString());

  // Set holiday channel if it is a holiday
  let rawdata = fs.readFileSync(babadata.datalocation + 'FrogHolidays/' + 'frogholidays.json'); //load file each time of calling wednesday
  let frogdata = JSON.parse(rawdata);
  var g = bot.guilds.resolve(frogdata.froghelp.mainfrog);
  holidayDaily(nowAtMidnight, g);

  DailyReminderCall();

  if (nowAtMidnight.getTime() != d1Sim.getTime())
    console.log('Simulating: ' + d1Sim.toDateString() + ' in the Program');

  if (global.dbAccess[1] && global.dbAccess[0]) {
    await LoadAllTheCache().catch(() => {
      console.log('Error loading cache');
    });
  }

  await StartTheReminders().catch(() => {
    console.log('Error loading reminders');
  });

  // daily birthday informer
  DisplayBirthdays(guild);

  // Baba typing funny robot things
  global.ResetDaily = true;
  BabaTyping(guild, now);

  // Friday
  if (nowAtMidnight.getDay() == 5) console.log('FRIDAY!');

  // send the it is wednesday message/any other day messages
  todayDay(now.getDay(), guild, now);

  // save slash friday json info
  SaveSlashFridayJson();

  var midnight = getD1(false, true);
  midnight.setHours(24);
  midnight.setMinutes(0);
  midnight.setSeconds(20);
  midnight.setMilliseconds(0);
  var timeToMidnight = midnight.getTime() - now.getTime();

  console.log('Calling next command in: ' + timeToMidnight / 1000 / 60 + ' minutes');
  to = setTimeout(function () {
    dailyCall(bot, guild, sourceDir);
  }, timeToMidnight);
}

/**
 * Perform holiday-specific adjustments for the server based on the provided date.
 * - If early in the year, set a 'defeat' holiday channel for New Year.
 * - If late-year (September+) ensure seasonal channels exist and call `MonthsPlus`.
 *
 * @param {Date} d1 - Date used to determine seasonal behavior.
 * @param {import('discord.js').Guild} server - Guild object to adjust.
 * @returns {void}
 */
function holidayDaily(d1, server) {
  /**
   * Perform holiday-specific adjustments for the server based on the provided date.
   * - If early in the year, set a 'defeat' holiday channel for New Year.
   * - If late-year (September+) ensure seasonal channels exist and call `MonthsPlus`.
   *
   * @param {Date} d1 - Date used to determine seasonal behavior.
   * @param {import('discord.js').Guild} server - Guild object to adjust.
   * @returns {void}
   */

  if (d1.getMonth() < 9) {
    if (
      babadata.holidayval != 'defeat' &&
      d1.getMonth() == 0 &&
      d1.getDate() == 1 &&
      babadata.holidayval != 'null'
    ) {
      SetHolidayChan(server, 'defeat');
    }
  } else if (d1.getMonth() >= 9) {
    if (babadata.holidaychan == 0) {
      CreateChannel(server, 'text channels', d1);
    }
    MonthsPlus(server, d1);
  }
}

/**
 * Cleanup function to clear any scheduled timers used by the daily runner.
 * This function is exported to `global.DailyCallCleanup` and bound to
 * process `SIGINT`/`SIGTERM` events.
 *
 * @returns {void}
 */
var cleanupFn = function cleanup() {
  /**
   * Cleanup function to clear any scheduled timers used by the daily runner.
   * This function is exported to `global.DailyCallCleanup` and bound to
   * process `SIGINT`/`SIGTERM` events.
   *
   * @returns {void}
   */

  console.log('Ending Daily Call Timer');
  if (to != null) clearTimeout(to);
  if (toWed != null) clearTimeout(toWed);
  if (toTyp != null) clearTimeout(toTyp);
};

global.DailyCallCleanup = cleanupFn;

process.on('SIGINT', cleanupFn);
process.on('SIGTERM', cleanupFn);

module.exports = {
  dailyCallStart,
};
