const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../modules/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Bot hakkında yardım ve komut bilgilerini gösterir'),
  
  async execute(interaction, client) {
    try {
      // Create help embed
      const embed = new EmbedBuilder()
        .setColor('#FF9800')
        .setTitle('📘 GitHub Monitör Bot Yardım')
        .setDescription('GitHub kullanıcısı scutieeop\'un repo aktivitelerini izleyip Discord üzerinden bildirim gönderen bot.')
        .addFields(
          { 
            name: '📊 Bot Durumu', 
            value: '/stats - Bot durumu ve çalışma istatistiklerini gösterir'
          },
          { 
            name: '❓ Yardım', 
            value: '/help - Bu yardım mesajını gösterir'
          }
        )
        .addFields({ 
          name: '⚙️ Nasıl Çalışır', 
          value: 'Bot, GitHub kullanıcısı scutieeop\'un repo aktivitelerini düzenli olarak kontrol eder ve yeni repo veya güncellemeler bulduğunda Discord\'da bildirim gönderir.'
        })
        .setFooter({ text: 'GitHub Monitör Bot v1.0' });
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error executing help command:', error);
      await interaction.reply({ content: 'Yardım bilgileri gösterilirken bir hata oluştu.', ephemeral: true });
    }
  },
}; 