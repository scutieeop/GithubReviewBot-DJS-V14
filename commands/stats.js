const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const stats = require('../modules/stats');
const logger = require('../modules/logger');
const githubApi = require('../modules/github');
const path = require('path');
const fs = require('fs');

// GitHub API URL for profile picture
const GITHUB_AVATAR_URL = "https://github.com/scutieeop.png";

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Bot istatistiklerini görüntüle'),
  
  async execute(interaction, client) {
    try {
      await interaction.deferReply();
      
      const botStats = stats.getStats();
      const rateLimit = githubApi.getRateLimit();
      const memUsage = process.memoryUsage();
      
      // Get repo count from data file if available
      let repoCount = 0;
      const dataFile = path.join(__dirname, '..', 'data', 'repositories.json');
      try {
        if (fs.existsSync(dataFile)) {
          const repoData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
          repoCount = repoData.repositories ? repoData.repositories.length : 0;
        }
      } catch (error) {
        logger.error('Error reading repository data file:', error);
      }
      
      // Calculate uptime in readable format
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      const uptimeString = `${days > 0 ? `${days} gün, ` : ''}${hours > 0 ? `${hours} saat, ` : ''}${minutes} dakika, ${seconds} saniye`;
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor('#00bfff')
        .setTitle('📊 GitHub Monitör Bot İstatistikleri')
        .setDescription(`**scutieeop** GitHub kullanıcısının repolarını izliyorum.\n${repoCount} repo takip ediliyor.`)
        .setThumbnail(GITHUB_AVATAR_URL)
        .addFields(
          { name: '🤖 Bot Durumu', value: '```yaml\n' + 
            `Çalışma Süresi: ${uptimeString}\n` +
            `Son Kontrol: ${botStats.lastCheck ? new Date(botStats.lastCheck).toLocaleString('tr-TR') : 'Henüz kontrol yapılmadı'}\n` +
            `Bellek: ${Math.round(memUsage.rss / 1024 / 1024)} MB\n` +
            '```', inline: false },
          
          { name: '🔍 GitHub Aktivite', value: '```diff\n' + 
            `+ Yeni Repolar: ${botStats.newReposFound}\n` +
            `~ Güncellemeler: ${botStats.updatesDetected}\n` +
            `> Bildirimler: ${botStats.notificationsSent}\n` +
            '```', inline: true },
          
          { name: '⚙️ Sistem', value: '```ini\n' + 
            `[API Çağrıları] ${botStats.apiCalls}\n` +
            `[API Kalan] ${rateLimit.remaining !== null ? rateLimit.remaining : 'Bilinmiyor'}\n` +
            `[Hatalar] ${botStats.errors}\n` +
            '```', inline: true }
        )
        .setFooter({ text: `GitHub Monitör Bot • Node.js ${process.version}` })
        .setTimestamp();
      
      // Add API rate limit reset time if available
      if (rateLimit.reset) {
        const resetTime = new Date(rateLimit.reset);
        const now = new Date();
        const timeToReset = Math.max(0, Math.round((resetTime - now) / 1000 / 60));
        
        embed.addFields({
          name: '⏱️ API Limit Sıfırlama',
          value: `${resetTime.toLocaleTimeString('tr-TR')} (${timeToReset} dakika sonra)`,
          inline: false
        });
      }
      
      // Add system information if available
      if (botStats.systemMemory) {
        const memoryPercent = Math.round((1 - botStats.systemMemory.free / botStats.systemMemory.total) * 100);
        const memoryBar = createProgressBar(memoryPercent);
        
        embed.addFields({
          name: '💻 Sistem Belleği',
          value: `${memoryBar} ${memoryPercent}%\n${Math.round(botStats.systemMemory.free / 1024)} GB boş / ${Math.round(botStats.systemMemory.total / 1024)} GB toplam`,
          inline: false
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error executing stats command:', error);
      
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: 'İstatistikler alınırken bir hata oluştu.' });
      } else {
        await interaction.reply({ content: 'İstatistikler alınırken bir hata oluştu.', ephemeral: true });
      }
    }
  },
};

// Create a progress bar
function createProgressBar(percent, length = 20) {
  const filled = Math.round(percent * length / 100);
  const empty = length - filled;
  
  return '█'.repeat(filled) + '░'.repeat(empty);
} 