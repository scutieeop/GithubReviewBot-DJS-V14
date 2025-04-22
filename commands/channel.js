const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('../modules/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Bildirim kanalı ayarlarını yönet')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Bildirim gönderilecek kanalı ayarla')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Bildirim kanalı')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('get')
        .setDescription('Mevcut bildirim kanalını göster'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      switch (subcommand) {
        case 'set':
          await handleSetChannel(interaction);
          break;
        case 'get':
          await handleGetChannel(interaction, client);
          break;
      }
    } catch (error) {
      logger.error(`Error executing channel ${subcommand} command:`, error);
      
      const errorMessage = 'Komut çalıştırılırken bir hata oluştu.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};

// Handle set channel subcommand
async function handleSetChannel(interaction) {
  const channel = interaction.options.getChannel('channel');
  
  await interaction.deferReply();
  
  try {
    // Check if bot has permissions to send messages in this channel
    const permissions = channel.permissionsFor(interaction.client.user);
    if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
      return await interaction.editReply(`Bot'un ${channel} kanalında bildirim gönderme izni yok. Lütfen bot izinlerini kontrol edin.`);
    }
    
    // Update .env file
    const envPath = path.join(__dirname, '..', '.env');
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    
    // Update the NOTIFICATION_CHANNEL_ID value
    envConfig.NOTIFICATION_CHANNEL_ID = channel.id;
    
    // Convert to string
    const newEnvContent = Object.entries(envConfig)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Write back to .env file
    fs.writeFileSync(envPath, newEnvContent);
    
    // Update process.env
    process.env.NOTIFICATION_CHANNEL_ID = channel.id;
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor('#4CAF50')
      .setTitle('✅ Bildirim Kanalı Ayarlandı')
      .setDescription(`GitHub bildirimleri artık ${channel} kanalına gönderilecek.`)
      .setTimestamp()
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    await interaction.editReply({ embeds: [embed] });
    
    // Send a test message to the channel
    const testEmbed = new EmbedBuilder()
      .setColor('#03A9F4')
      .setTitle('🔔 Bildirim Kanalı Test')
      .setDescription('Bu kanal GitHub bildirimlerini almak için ayarlandı. GitHub repo bildirimleri burada görünecek.')
      .setTimestamp()
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    await channel.send({ embeds: [testEmbed] });
    
    logger.info(`Bildirim kanalı #${channel.name} (${channel.id}) olarak ayarlandı`);
  } catch (error) {
    logger.error(`Error setting notification channel to #${channel?.name}:`, error);
    await interaction.editReply('Bildirim kanalı ayarlanırken bir hata oluştu.');
  }
}

// Handle get channel subcommand
async function handleGetChannel(interaction, client) {
  await interaction.deferReply();
  
  try {
    const channelId = process.env.NOTIFICATION_CHANNEL_ID;
    
    if (!channelId) {
      return await interaction.editReply('Henüz bir bildirim kanalı ayarlanmamış.');
    }
    
    // Get channel information
    const channel = client.channels.cache.get(channelId);
    
    if (!channel) {
      return await interaction.editReply(`Bildirim kanalı (ID: ${channelId}) bulunamadı. Kanal silinmiş olabilir.`);
    }
    
    // Check permissions for the channel
    const permissions = channel.permissionsFor(client.user);
    const hasPermissions = permissions.has('SendMessages') && permissions.has('EmbedLinks');
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(hasPermissions ? '#2196F3' : '#F44336')
      .setTitle('ℹ️ Bildirim Kanalı')
      .setDescription(`GitHub bildirimleri ${channel} kanalına gönderiliyor.`)
      .addFields(
        { name: 'Kanal ID', value: channelId, inline: true },
        { name: 'İzinler', value: hasPermissions ? '✅ Tamam' : '❌ Eksik', inline: true },
        { name: 'Kontrol Aralığı', value: `${process.env.CHECK_INTERVAL || '30'} dakika`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'GitHub Monitör Bot' });
    
    if (!hasPermissions) {
      embed.addFields({
        name: '⚠️ İzin Hatası', 
        value: 'Bot\'un bu kanalda bildirim gönderme izni yok. Lütfen bot izinlerini kontrol edin.'
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error getting notification channel info:', error);
    await interaction.editReply('Bildirim kanalı bilgileri alınırken bir hata oluştu.');
  }
}