const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('../modules/logger');
const githubApi = require('../modules/github');
const guild = require('../modules/guild');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('monitor')
    .setDescription('GitHub kullanıcı izleme ayarlarını yönet')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('İzlenecek GitHub kullanıcısını ayarla')
        .addStringOption(option =>
          option.setName('username')
            .setDescription('GitHub kullanıcı adı')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('get')
        .setDescription('Şu anda izlenen GitHub kullanıcısını göster'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Yeni repo kontrolünü şimdi başlat'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('İzlenen repoları listele'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      switch (subcommand) {
        case 'set':
          await handleSetUser(interaction);
          break;
        case 'get':
          await handleGetUser(interaction);
          break;
        case 'check':
          await handleCheckNow(interaction, client);
          break;
        case 'list':
          await handleListRepositories(interaction);
          break;
      }
    } catch (error) {
      logger.error(`Error executing monitor ${subcommand} command:`, error);
      
      const errorMessage = 'Komut çalıştırılırken bir hata oluştu.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};

// Handle set user subcommand
async function handleSetUser(interaction) {
  const username = interaction.options.getString('username');
  
  await interaction.deferReply();
  
  try {
    // Check if user exists
    const userInfo = await githubApi.getUserInfo(username);
    
    if (!userInfo) {
      return await interaction.editReply(`GitHub kullanıcısı "${username}" bulunamadı.`);
    }
    
    // Update .env file
    const envPath = path.join(__dirname, '..', '.env');
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    
    // Update the GITHUB_USERNAME value
    envConfig.GITHUB_USERNAME = username;
    
    // Convert to string
    const newEnvContent = Object.entries(envConfig)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Write back to .env file
    fs.writeFileSync(envPath, newEnvContent);
    
    // Update process.env
    process.env.GITHUB_USERNAME = username;
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor('#4CAF50')
      .setTitle('✅ GitHub Kullanıcısı Güncellendi')
      .setDescription(`İzlenen GitHub kullanıcısı **${username}** olarak ayarlandı.`)
      .addFields(
        { name: 'İsim', value: userInfo.name || 'Belirtilmemiş', inline: true },
        { name: 'Açık Repo Sayısı', value: userInfo.public_repos.toString(), inline: true },
        { name: 'Hesap Oluşturulma', value: new Date(userInfo.created_at).toLocaleDateString('tr-TR'), inline: true }
      )
      .setThumbnail(userInfo.avatar_url)
      .setTimestamp()
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    await interaction.editReply({ embeds: [embed] });
    
    logger.info(`GitHub monitör kullanıcısı "${username}" olarak değiştirildi`);
  } catch (error) {
    logger.error(`Error setting GitHub user to "${username}":`, error);
    await interaction.editReply('GitHub kullanıcısı ayarlanırken bir hata oluştu.');
  }
}

// Handle get user subcommand
async function handleGetUser(interaction) {
  await interaction.deferReply();
  
  try {
    const username = process.env.GITHUB_USERNAME;
    
    if (!username) {
      return await interaction.editReply('Henüz bir GitHub kullanıcısı ayarlanmamış.');
    }
    
    // Get user information
    const userInfo = await githubApi.getUserInfo(username);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor('#2196F3')
      .setTitle('ℹ️ İzlenen GitHub Kullanıcısı')
      .setDescription(`Şu anda **${username}** kullanıcısı izleniyor.`)
      .addFields(
        { name: 'İsim', value: userInfo.name || 'Belirtilmemiş', inline: true },
        { name: 'Açık Repo Sayısı', value: userInfo.public_repos.toString(), inline: true },
        { name: 'Takipçiler', value: userInfo.followers.toString(), inline: true },
        { name: 'Hesap Oluşturulma', value: new Date(userInfo.created_at).toLocaleDateString('tr-TR'), inline: true },
        { name: 'Kontrol Aralığı', value: `${process.env.CHECK_INTERVAL || '30'} dakika`, inline: true },
        { name: 'Profil', value: userInfo.html_url, inline: false }
      )
      .setThumbnail(userInfo.avatar_url)
      .setTimestamp()
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error getting GitHub user info:', error);
    await interaction.editReply('GitHub kullanıcı bilgileri alınırken bir hata oluştu.');
  }
}

// Handle check now subcommand
async function handleCheckNow(interaction, client) {
  await interaction.deferReply();
  
  try {
    await interaction.editReply('GitHub repolarını kontrol etmeye başlıyorum...');
    
    // Trigger a manual check
    await guild.checkForNewRepositories(client);
    
    await interaction.editReply('GitHub repo kontrolü tamamlandı!');
  } catch (error) {
    logger.error('Error during manual repository check:', error);
    await interaction.editReply('GitHub repo kontrolü sırasında bir hata oluştu.');
  }
}

// Handle list repositories subcommand
async function handleListRepositories(interaction) {
  await interaction.deferReply();
  
  try {
    const repos = guild.getMonitoredRepositories();
    const username = process.env.GITHUB_USERNAME;
    
    if (!repos || repos.length === 0) {
      return await interaction.editReply('Henüz izlenen repo bulunmuyor.');
    }
    
    // Sort repos by updated date
    const sortedRepos = [...repos].sort((a, b) => b.updatedAt - a.updatedAt);
    
    // Limit to 10 repos for the embed
    const displayRepos = sortedRepos.slice(0, 10);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor('#9C27B0')
      .setTitle('📚 İzlenen GitHub Repoları')
      .setDescription(`**${username}** kullanıcısına ait ${repos.length} repo izleniyor.${repos.length > 10 ? ' (Son güncellenen 10 repo gösteriliyor)' : ''}`)
      .setTimestamp()
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    // Add repositories to the embed
    displayRepos.forEach((repo, index) => {
      embed.addFields({
        name: `${index + 1}. ${repo.name}`,
        value: `${repo.description ? `📝 ${repo.description}\n` : ''}🔤 ${repo.language || 'Belirtilmemiş'} | ⭐ ${repo.stars} | 🔄 ${new Date(repo.updatedAt).toLocaleDateString('tr-TR')}\n🔗 [Repo'yu Görüntüle](${repo.url})`
      });
    });
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error listing repositories:', error);
    await interaction.editReply('Repo listesi oluşturulurken bir hata oluştu.');
  }
} 