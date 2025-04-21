# GitHub Monitör Discord Bot

Bu Discord botu, belirli bir GitHub kullanıcısının (scutieeop) yeni depo paylaştığında veya var olan depoları güncellediğinde Discord kanalınızda duyuru yapan bir bottur.

## Özellikler

- GitHub kullanıcısının yeni repo oluşturduğunda bildirim
- Repo güncellendiğinde bildirim
- Güzel görünümlü embed mesajlar
- Belirli aralıklarla otomatik kontrol

## Kurulum

1. Bu repoyu klonlayın:
```bash
git clone <repo-url>
cd github-monitor-bot
```

2. Gerekli paketleri yükleyin:
```bash
npm install
```

3. `.env` dosyasını düzenleyin:
```
TOKEN=your_discord_bot_token_here
NOTIFICATION_CHANNEL_ID=your_channel_id_here
GITHUB_USERNAME=scutieeop
CHECK_INTERVAL=30
```

4. Botu çalıştırın:
```bash
node index.js
```

## Botu Discord'a Eklemek

1. [Discord Developer Portal](https://discord.com/developers/applications)'a gidin
2. Yeni bir application oluşturun
3. Bot sekmesine gidin ve bir bot oluşturun
4. TOKEN'i kopyalayıp `.env` dosyasına yapıştırın
5. OAuth2 > URL Generator'a gidin ve aşağıdaki izinleri seçin:
   - bot
   - Permissions: 
     - Send Messages
     - Embed Links
     - Read Message History
6. Oluşturulan URL ile botu Discord sunucunuza ekleyin

## Bildirim Kanalı Ayarlama

1. Discord sunucunuzda bildirim göndermek istediğiniz kanalın ID'sini alın
   - Kanal üzerine sağ tıklayın > ID'yi Kopyala (Discord'da Geliştirici Modu açık olmalıdır)
2. Bu ID'yi `.env` dosyasındaki `NOTIFICATION_CHANNEL_ID` alanına yapıştırın 