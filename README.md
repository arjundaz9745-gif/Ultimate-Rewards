# Ultimate Rewards App (PWA)

Mobile-first web app (installable). Discord login only. Aurora theme.

## Features
- Login with Discord
- Points + Diamonds
- Chat & Earn (∞ style)
- OfferPro → invite https://discord.gg/TC2SZf2C5
- Redeem gifts (pending / done)
- Leaderboard
- Staff role `1548173330794815599` = admin in app

## Run
```bash
npm install
cp .env.example .env
# fill Discord OAuth + bot token + guild id
npm start
```

## Discord Developer Portal
1. OAuth2 redirect: `https://YOUR_DOMAIN/auth/callback`
2. Scopes: identify, guilds.members.read
3. Bot must be in the guild to detect staff role

## APK later
Wrap this PWA with Capacitor or PWABuilder → Android APK.
