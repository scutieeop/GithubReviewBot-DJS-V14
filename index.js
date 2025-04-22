const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Import modules
const guildModule = require('./modules/guild');
const loggerModule = require('./modules/logger');

// Sabit bildirim kanalı ID'si
const NOTIFICATION_CHANNEL_ID = process.env.NOTIFICATION_CHANNEL_ID || "your_channel_id_here";

// Create Discord client with intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Initialize collections
client.commands = new Collection();
client.cooldowns = new Collection();

// Load only help and stats commands
const allowedCommands = ['help.js', 'stats.js'];
const commandsPath = path.join(__dirname, 'commands');

try {
  if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath)
      .filter(file => file.endsWith('.js') && allowedCommands.includes(file));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`);
      } else {
        console.log(`[WARNING] Command at ${filePath} is missing required "data" or "execute" property.`);
      }
    }
  } else {
    fs.mkdirSync(commandsPath, { recursive: true });
    console.log('Created commands directory as it did not exist');
  }
} catch (error) {
  loggerModule.error('Error loading commands', error);
}

// Register slash commands when bot is ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  try {
    // Override environment variable with constant
    process.env.NOTIFICATION_CHANNEL_ID = NOTIFICATION_CHANNEL_ID;
    
    // Register commands
    const commands = [];
    client.commands.forEach(command => {
      commands.push(command.data.toJSON());
    });

    if (commands.length > 0) {
      const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
      
      console.log(`Started refreshing ${commands.length} application (/) commands.`);
      
      if (process.env.GUILD_ID) {
        // Guild commands - instant update but only for specific guild
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
          { body: commands },
        );
        console.log(`Successfully reloaded application commands for guild ${process.env.GUILD_ID}`);
      } else {
        // Global commands - takes up to an hour to update but works everywhere
        await rest.put(
          Routes.applicationCommands(client.user.id),
          { body: commands },
        );
        console.log('Successfully reloaded global application commands');
      }
    } else {
      console.log('No commands to register');
    }
    
    // Initialize modules
    guildModule.init(client);
    
    // Start statistics collector
    if (process.env.ENABLE_STATS === 'true') {
      require('./modules/stats').init(client);
    }
  } catch (error) {
    loggerModule.error('Error during initialization:', error);
  }
});

// Handle interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  
  try {
    await command.execute(interaction, client);
  } catch (error) {
    loggerModule.error(`Error executing command ${interaction.commandName}:`, error);
    const errorMessage = 'Komut çalıştırılırken bir hata oluştu!';
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

// Handle errors
client.on('error', error => {
  loggerModule.error('Discord client error:', error);
});

// Handle warnings
client.on('warn', warning => {
  loggerModule.warn('Discord client warning:', warning);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  loggerModule.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  loggerModule.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Login with token
client.login(process.env.TOKEN); 