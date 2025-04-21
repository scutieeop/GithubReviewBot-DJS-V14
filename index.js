const { Client, IntentsBitField, Partials } = require('discord.js');
require('dotenv').config();

// Import modules
const guildModule = require('./modules/guild');

// Create Discord client with intents
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages
  ],
  partials: [Partials.Channel]
});

// When client is ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Initialize modules
  guildModule.init(client);
});

// Handle errors
client.on('error', error => {
  console.error('Discord client error:', error);
});

// Login with token
client.login(process.env.TOKEN); 