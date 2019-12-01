var Discord = require('discord.js'); //discord stuff
var auth = require('./bauth.json'); //auth for discord
var authWR = require('./WRauth.json'); //auth for Wolfram
var wolfram = require('wolfram').createClient(authWR.appid); //wolfram

// Initialize Discord Bot
var bot = new Discord.Client();

bot.login(auth.token); //login

//not shure what this does but it was in jeremy's code so
bot.on('ready', function (evt) 
{
    console.log('Connected');
});

//stuff when message is recived.
bot.on('message', message => 
{
    if(message.content.includes('@560872746087743528')) //perfix check
    {
      message.channel.send('BABA IS ADMIN'); 
      if(message.content.includes('help'))
            {
                message.channel.send('@BABA to call comands \n help: you allready figured that one out \n wolfram: will do a search of wolfram \n');
            }
      if(message.content.includes('wolfram')) //wolfram prefix
      {
            message.channel.send("BABA IS WOLFRAM");
            var data = message.content.replace("<@560872746087743528>" , "").replace("wolfram","");
            wolfram.query(data,function(err, result) //querys wolfram
            {
                  for( i = 0; i < result.length; i++) //loop cause array
                  {
                        message.channel.send(result[i].title + " " + result[i].subpods[0].image); //print to server
                  }
            message.channel.send("RAM IS WOLFED");
            });
      }
    }
});

//not shure what this does also but it was in jeremy's code so
var cleanupFn = function cleanup() 
{
    console.log("Logging off");
    bot.destroy();
}

process.on('SIGINT', cleanupFn);
process.on('SIGTERM', cleanupFn);
