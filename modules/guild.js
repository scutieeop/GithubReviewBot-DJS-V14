const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();
const logger = require('./logger');
const githubApi = require('./github');
const stats = require('./stats');
const fs = require('fs');
const path = require('path');

// Sabit GitHub kullanıcısı - dışarıdan değiştirilemez
const GITHUB_USERNAME = "scutieeop";

// Hata durumunda yeniden deneme ayarları
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 10000; // 10 saniye

// Store for the last check timestamp and repositories
let lastCheck = new Date();
let knownRepos = [];

// Path for persistence
const DATA_FILE = path.join(__dirname, '..', 'data', 'repositories.json');

// Initialize module
async function init(client) {
  logger.info('GitHub Monitor Module initialized');
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  
  // Load known repositories from file if exists
  loadKnownRepositories();
  
  // First check on startup with delay to allow bot to properly connect
  setTimeout(async () => {
    try {
      await checkForNewRepositories(client);
    } catch (error) {
      logger.error('Error during initial repository check:', error);
    }
  }, 5000); // 5 saniye bekle
  
  // Schedule periodic checks
  const interval = process.env.CHECK_INTERVAL || 15 ; // Default to 30 minutes
  
  // Ana kontrol cron işi
  cron.schedule(`*/${interval} * * * *`, async () => {
    try {
      await checkForNewRepositories(client);
    } catch (error) {
      logger.error('Error during scheduled repository check:', error);
      stats.recordError();
    }
  });
  
  // Ek olarak günlük "pull" kontrolü - gece yarısında çalışacak
  cron.schedule('0 0 * * *', async () => {
    try {
      await fullRefresh(client);
    } catch (error) {
      logger.error('Error during daily full refresh:', error);
    }
  });
  
  logger.info(`Repository check scheduled every ${interval} minutes`);
}

// Günlük tam veri yenileme - tüm repoları yeniden çeker
async function fullRefresh(client) {
  logger.info('Starting daily full refresh of all repositories');
  
  // Tüm repo verilerini sıfırla
  knownRepos = [];
  
  // Kontrol işlemini başlat
  await checkForNewRepositories(client, true);
  
  logger.info('Daily full refresh completed');
}

// Load known repositories from file
function loadKnownRepositories() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(data);
      
      // Convert string dates back to Date objects
      knownRepos = parsed.repositories.map(repo => ({
        ...repo,
        updatedAt: new Date(repo.updatedAt),
        createdAt: new Date(repo.createdAt)
      }));
      
      lastCheck = new Date(parsed.lastCheck);
      logger.info(`Loaded ${knownRepos.length} known repositories`);
    }
  } catch (error) {
    logger.error('Error loading known repositories:', error);
    knownRepos = [];
    lastCheck = new Date();
  }
}

// Save known repositories to file
function saveKnownRepositories() {
  try {
    const data = {
      lastCheck: lastCheck.toISOString(),
      repositories: knownRepos
    };
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    logger.info(`Saved ${knownRepos.length} repositories to disk`);
  } catch (error) {
    logger.error('Error saving known repositories:', error);
  }
}

// Check for new repositories with retry mechanism
async function checkForNewRepositories(client, isForcedCheck = false) {
  let attempts = 0;
  let success = false;
  
  while (attempts < MAX_RETRY_ATTEMPTS && !success) {
    try {
      attempts++;
      
      // Check if we have enough API calls available
      if (!githubApi.hasEnoughRateLimit(2)) {
        const rateLimit = githubApi.getRateLimit();
        logger.warn(`Skipping repository check due to rate limit. Resets at ${rateLimit.reset?.toLocaleString()}`);
        return;
      }
      
      // Fetch GitHub user information first
      const username = GITHUB_USERNAME; // Sabit kullanıcı adı
      const userInfo = await githubApi.getUserInfo(username);
      logger.info(`Checking repositories for ${username} (${userInfo.name || 'Unknown'})`);
      
      // Fetch repositories
      const repos = await githubApi.getUserRepositories(username, 'updated', 'desc');
      stats.recordCheckTime();
      
      if (!repos || !Array.isArray(repos)) {
        logger.error('Invalid response from GitHub API');
        return;
      }
      
      const newRepos = [];
      const updatedRepos = [];
      
      // If this is the first check or a forced check, just store the repos
      if (knownRepos.length === 0 || isForcedCheck) {
        knownRepos = repos.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          apiUrl: repo.url,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          watchers: repo.watchers_count,
          updatedAt: new Date(repo.updated_at),
          createdAt: new Date(repo.created_at),
          defaultBranch: repo.default_branch,
          isPrivate: repo.private,
          topics: repo.topics || [],
          license: repo.license ? repo.license.name : null
        }));
        
        if (isForcedCheck) {
          logger.info(`Forced refresh: ${knownRepos.length} repositories reloaded for ${username}`);
        } else {
          logger.info(`Initial load: ${knownRepos.length} repositories found for ${username}`);
        }
        
        saveKnownRepositories();
        
        // Send a status message if this is a forced check
        if (isForcedCheck && client) {
          try {
            const channelId = process.env.NOTIFICATION_CHANNEL_ID;
            const channel = client.channels.cache.get(channelId);
            
            if (channel) {
              const statusEmbed = new EmbedBuilder()
                .setColor('#4CAF50')
                .setTitle('🔄 GitHub Repo Verileri Yenilendi')
                .setDescription(`**${username}** kullanıcısının tüm repo verileri yeniden yüklendi.`)
                .addFields(
                  { name: '📊 Repo Sayısı', value: knownRepos.length.toString(), inline: true },
                  { name: '📅 Tarih', value: formatDate(new Date()), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'GitHub Monitör Bot - Günlük Yenileme' });
              
              await channel.send({ embeds: [statusEmbed] });
            }
          } catch (error) {
            logger.error('Error sending refresh status message:', error);
          }
        }
        
        success = true;
        return;
      }
      
      // Check for new and updated repos
      for (const repo of repos) {
        const knownRepo = knownRepos.find(r => r.id === repo.id);
        
        if (!knownRepo) {
          // This is a new repo
          logger.info(`New repository found: ${repo.full_name}`);
          
          newRepos.push({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            url: repo.html_url,
            apiUrl: repo.url,
            language: repo.language,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            watchers: repo.watchers_count,
            updatedAt: new Date(repo.updated_at),
            createdAt: new Date(repo.created_at),
            defaultBranch: repo.default_branch,
            isPrivate: repo.private,
            topics: repo.topics || [],
            license: repo.license ? repo.license.name : null
          });
          
          stats.recordNewRepo();
        } else if (new Date(repo.updated_at) > knownRepo.updatedAt && new Date(repo.updated_at) > lastCheck) {
          // This is an updated repo - detect what changed
          logger.info(`Repository update detected: ${repo.full_name}`);
          
          const changes = [];
          
          // Check what changed
          if (repo.description !== knownRepo.description) {
            changes.push('Açıklama değişti');
          }
          
          if (repo.stargazers_count !== knownRepo.stars) {
            changes.push(`Yıldızlar: ${knownRepo.stars} ➡️ ${repo.stargazers_count}`);
          }
          
          if (repo.forks_count !== knownRepo.forks) {
            changes.push(`Fork'lar: ${knownRepo.forks} ➡️ ${repo.forks_count}`);
          }
          
          if (repo.language !== knownRepo.language) {
            changes.push(`Ana dil: ${knownRepo.language || 'Bilinmiyor'} ➡️ ${repo.language || 'Bilinmiyor'}`);
          }
          
          updatedRepos.push({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            url: repo.html_url,
            apiUrl: repo.url,
            language: repo.language,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            watchers: repo.watchers_count,
            updatedAt: new Date(repo.updated_at),
            createdAt: new Date(repo.created_at),
            defaultBranch: repo.default_branch,
            isPrivate: repo.private,
            topics: repo.topics || [],
            license: repo.license ? repo.license.name : null,
            changes: changes
          });
          
          stats.recordUpdate();
        }
      }
      
      // Update our known repos
      knownRepos = repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        apiUrl: repo.url,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        watchers: repo.watchers_count,
        updatedAt: new Date(repo.updated_at),
        createdAt: new Date(repo.created_at),
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
        topics: repo.topics || [],
        license: repo.license ? repo.license.name : null
      }));
      
      saveKnownRepositories();
      
      // Send notifications
      const channelId = process.env.NOTIFICATION_CHANNEL_ID;
      const channel = client.channels.cache.get(channelId);
      
      if (!channel) {
        logger.error(`Could not find channel with ID: ${channelId}`);
        return;
      }
      
      // Send notifications for new repos
      for (const repo of newRepos) {
        await sendNewRepoNotification(channel, repo, userInfo);
      }
      
      // Send notifications for updated repos
      for (const repo of updatedRepos) {
        await sendRepoUpdateNotification(channel, repo, userInfo);
      }
      
      // Update last check time
      lastCheck = new Date();
      
      // Success!
      success = true;
      
    } catch (error) {
      logger.error(`Error checking for repositories (attempt ${attempts}/${MAX_RETRY_ATTEMPTS}):`, error);
      stats.recordError();
      
      if (attempts < MAX_RETRY_ATTEMPTS) {
        logger.info(`Retrying in ${RETRY_DELAY/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  
  if (!success) {
    logger.error(`Failed to check repositories after ${MAX_RETRY_ATTEMPTS} attempts`);
  }
}

// Send a notification for a new repository
async function sendNewRepoNotification(channel, repo, userInfo) {
  try {
    // Try to get additional details if rate limit allows
    let languages = {};
    let latestCommit = null;
    
    if (githubApi.hasEnoughRateLimit(2)) {
      try {
        const [owner, repoName] = repo.fullName.split('/');
        
        // Get languages
        languages = await githubApi.getRepositoryLanguages(owner, repoName);
        
        // Try to get the latest commit
        try {
          const commits = await githubApi.getRepositoryCommits(owner, repoName, 1);
          if (commits && commits.length > 0) {
            latestCommit = {
              message: commits[0].commit.message,
              author: commits[0].commit.author.name,
              date: new Date(commits[0].commit.author.date)
            };
          }
        } catch (error) {
          logger.warn(`Could not fetch latest commit for ${repo.fullName}:`, error);
        }
      } catch (error) {
        // Just log and continue if we can't get languages
        logger.warn(`Could not fetch languages for ${repo.fullName}:`, error);
      }
    }
    
    // Format languages for display
    const languagesList = Object.keys(languages).length > 0
      ? Object.keys(languages).join(', ')
      : repo.language || 'Belirtilmemiş';
    
    // Set color based on primary language
    const primaryLanguage = Object.keys(languages)[0] || repo.language;
    const embedColor = primaryLanguage 
      ? githubApi.getLanguageColor(primaryLanguage)
      : '#2ECC71';
    
    // Format topics if available
    const topicsText = repo.topics && repo.topics.length > 0
      ? repo.topics.map(topic => `\`${topic}\``).join(' ')
      : 'Belirtilmemiş';
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`🌟 Yeni GitHub Deposu: ${repo.name}`)
      .setDescription(`**${userInfo.name || GITHUB_USERNAME}** yeni bir GitHub deposu paylaştı!\n\n${repo.description || '*Açıklama yok*'}`)
      .addFields(
        { name: '📂 Depo Bilgileri', value: `${repo.isPrivate ? '🔒 Özel' : '🌐 Açık'} • ${formatDate(repo.createdAt)} tarihinde oluşturuldu`, inline: false },
        { name: '🔤 Programlama Dili', value: languagesList, inline: true },
        { name: '⭐ Yıldızlar', value: repo.stars.toString(), inline: true },
        { name: '🍴 Fork Sayısı', value: repo.forks.toString(), inline: true }
      )
      .setURL(repo.url)
      .setTimestamp()
      .setThumbnail(userInfo.avatar_url || null)
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    // Add topics if available
    if (repo.topics && repo.topics.length > 0) {
      embed.addFields({ name: '🏷️ Konular', value: topicsText, inline: false });
    }
    
    // Add latest commit if available
    if (latestCommit) {
      embed.addFields({ 
        name: '📝 Son Commit', 
        value: `"${truncateText(latestCommit.message, 100)}" by ${latestCommit.author} • ${formatDate(latestCommit.date)}`,
        inline: false 
      });
    }
    
    // Add license if available
    if (repo.license) {
      embed.addFields({ name: '📜 Lisans', value: repo.license, inline: true });
    }
    
    // Create buttons row
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('GitHub\'da Görüntüle')
          .setStyle(ButtonStyle.Link)
          .setURL(repo.url),
        new ButtonBuilder()
          .setLabel('Profili Ziyaret Et')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://github.com/${GITHUB_USERNAME}`)
      );
    
    // Send notification
    await channel.send({ embeds: [embed], components: [row] });
    stats.recordNotification();
  } catch (error) {
    logger.error('Error sending new repository notification:', error);
    stats.recordError();
  }
}

// Send a notification for an updated repository
async function sendRepoUpdateNotification(channel, repo, userInfo) {
  try {
    // Try to get additional details if rate limit allows
    let languages = {};
    let commitActivity = null;
    
    if (githubApi.hasEnoughRateLimit(2)) {
      try {
        const [owner, repoName] = repo.fullName.split('/');
        
        // Get languages
        languages = await githubApi.getRepositoryLanguages(owner, repoName);
        
        // Try to get recent commits count
        try {
          const activity = await githubApi.getRepositoryCommitActivity(owner, repoName);
          if (activity && activity.length > 0) {
            // Son hafta commit sayısı
            commitActivity = activity[activity.length - 1].total;
          }
        } catch (error) {
          logger.warn(`Could not fetch commit activity for ${repo.fullName}:`, error);
        }
      } catch (error) {
        // Just log and continue if we can't get languages
        logger.warn(`Could not fetch languages for ${repo.fullName}:`, error);
      }
    }
    
    // Format languages for display
    const languagesList = Object.keys(languages).length > 0
      ? Object.keys(languages).join(', ')
      : repo.language || 'Belirtilmemiş';
    
    // Set color based on primary language
    const primaryLanguage = Object.keys(languages)[0] || repo.language;
    const embedColor = primaryLanguage 
      ? githubApi.getLanguageColor(primaryLanguage)
      : '#3498DB';
    
    // Format topics if available
    const topicsText = repo.topics && repo.topics.length > 0
      ? repo.topics.map(topic => `\`${topic}\``).join(' ')
      : 'Belirtilmemiş';
    
    // Create change description text
    const changesText = repo.changes && repo.changes.length > 0
      ? repo.changes.join('\n')
      : 'Detaylı değişiklikler algılanamadı';
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`🔄 Repo Güncellemesi: ${repo.name}`)
      .setDescription(`**${userInfo.name || GITHUB_USERNAME}** bir GitHub deposunu güncelledi!\n\n${repo.description || '*Açıklama yok*'}`)
      .addFields(
        { name: '📝 Değişiklikler', value: changesText, inline: false },
        { name: '🔤 Programlama Dili', value: languagesList, inline: true },
        { name: '⭐ Yıldızlar', value: repo.stars.toString(), inline: true },
        { name: '🔍 İzleyenler', value: repo.watchers.toString(), inline: true },
        { name: '🍴 Fork Sayısı', value: repo.forks.toString(), inline: true },
        { name: '🕒 Son Güncelleme', value: formatDate(repo.updatedAt), inline: true }
      )
      .setURL(repo.url)
      .setTimestamp()
      .setThumbnail(userInfo.avatar_url || null)
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    // Add commit activity if available
    if (commitActivity !== null) {
      embed.addFields({ 
        name: '📊 Son Hafta Commit', 
        value: `${commitActivity} commit son 7 günde`,
        inline: true 
      });
    }
    
    // Add topics if available
    if (repo.topics && repo.topics.length > 0) {
      embed.addFields({ name: '🏷️ Konular', value: topicsText, inline: false });
    }
    
    // Create buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('GitHub\'da Görüntüle')
          .setStyle(ButtonStyle.Link)
          .setURL(repo.url)
      );
      
    // Add commits link if available
    if (repo.fullName) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel('Commit Geçmişi')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://github.com/${repo.fullName}/commits/${repo.defaultBranch || 'main'}`)
      );
    }
    
    // Send notification
    await channel.send({ embeds: [embed], components: [row] });
    stats.recordNotification();
  } catch (error) {
    logger.error('Error sending repository update notification:', error);
    stats.recordError();
  }
}

// Format date to local string
function formatDate(date) {
  return new Date(date).toLocaleString('tr-TR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Truncate text with ellipsis
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength) + '...';
}

// Add a repository to monitor
function addRepositoryToMonitor(repoUrl) {
  // Implementation for manually adding a repository to monitor
  // This would be used by command handlers
}

// Get list of monitored repositories
function getMonitoredRepositories() {
  return [...knownRepos];
}

module.exports = {
  init,
  checkForNewRepositories,
  addRepositoryToMonitor,
  getMonitoredRepositories
}; 