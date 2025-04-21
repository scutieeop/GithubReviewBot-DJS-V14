const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

// Store for the last check timestamp and repositories
let lastCheck = new Date();
let knownRepos = [];

// Initialize module
function init(client) {
  console.log('GitHub Monitor Module initialized');
  
  // First check on startup
  checkForNewRepositories(client);
  
  // Schedule periodic checks
  const interval = process.env.CHECK_INTERVAL || 30; // Default to 30 minutes
  cron.schedule(`*/${interval} * * * *`, () => {
    checkForNewRepositories(client);
  });
}

// Check for new repositories
async function checkForNewRepositories(client) {
  try {
    const username = process.env.GITHUB_USERNAME;
    const response = await axios.get(`https://api.github.com/users/${username}/repos?sort=created&direction=desc`);
    
    if (!response.data || !Array.isArray(response.data)) {
      console.error('Invalid response from GitHub API');
      return;
    }
    
    const repos = response.data;
    const newRepos = [];
    const updatedRepos = [];
    
    // If this is the first check, just store the repos
    if (knownRepos.length === 0) {
      knownRepos = repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        description: repo.description,
        url: repo.html_url,
        updatedAt: new Date(repo.updated_at)
      }));
      console.log(`Initial load: ${knownRepos.length} repositories found for ${username}`);
      return;
    }
    
    // Check for new and updated repos
    for (const repo of repos) {
      const knownRepo = knownRepos.find(r => r.id === repo.id);
      
      if (!knownRepo) {
        // This is a new repo
        newRepos.push({
          id: repo.id,
          name: repo.name,
          description: repo.description,
          url: repo.html_url,
          updatedAt: new Date(repo.updated_at)
        });
      } else if (new Date(repo.updated_at) > knownRepo.updatedAt && new Date(repo.updated_at) > lastCheck) {
        // This is an updated repo
        updatedRepos.push({
          id: repo.id,
          name: repo.name,
          description: repo.description,
          url: repo.html_url,
          updatedAt: new Date(repo.updated_at)
        });
      }
    }
    
    // Update our known repos
    knownRepos = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      description: repo.description,
      url: repo.html_url,
      updatedAt: new Date(repo.updated_at)
    }));
    
    // Send notifications for new repos
    const channelId = process.env.NOTIFICATION_CHANNEL_ID;
    const channel = client.channels.cache.get(channelId);
    
    if (!channel) {
      console.error(`Could not find channel with ID: ${channelId}`);
      return;
    }
    
    // Send notifications for new repos
    for (const repo of newRepos) {
      await sendNewRepoNotification(channel, repo);
    }
    
    // Send notifications for updated repos
    for (const repo of updatedRepos) {
      await sendRepoUpdateNotification(channel, repo);
    }
    
    // Update last check time
    lastCheck = new Date();
    
  } catch (error) {
    console.error('Error checking for repositories:', error.message);
  }
}

// Send a notification for a new repository
async function sendNewRepoNotification(channel, repo) {
  try {
    const embed = new EmbedBuilder()
      .setColor('#2ECC71')
      .setTitle('🆕 Yeni GitHub Deposu')
      .setDescription(`**${process.env.GITHUB_USERNAME}** yeni bir GitHub deposu paylaştı!`)
      .addFields(
        { name: 'Repo İsmi', value: repo.name || 'Belirtilmemiş', inline: false },
        { name: 'Açıklama', value: repo.description || 'Açıklama yok', inline: false },
        { name: 'Link', value: repo.url, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending notification:', error.message);
  }
}

// Send a notification for an updated repository
async function sendRepoUpdateNotification(channel, repo) {
  try {
    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('🔄 Repo Güncellemesi')
      .setDescription(`**${process.env.GITHUB_USERNAME}** bir GitHub deposunu güncelledi!`)
      .addFields(
        { name: 'Güncellenen Repo', value: repo.name || 'Belirtilmemiş', inline: false },
        { name: 'Açıklama', value: repo.description || 'Açıklama yok', inline: false },
        { name: 'Link', value: repo.url, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending notification:', error.message);
  }
}

module.exports = {
  init
}; 