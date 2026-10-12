
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const GUILD_ID = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || '';
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '1548173330794815599';
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DATA_FILE = process.env.RENDER ? '/tmp/ur-app-users.json' : path.join(__dirname, 'data', 'users.json');

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

function loadUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {}
  return {};
}
function saveUsers(u) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(u, null, 2)); } catch (e) { console.error(e.message); }
}

let users = loadUsers();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ultimate-rewards-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 14 * 24 * 60 * 60 * 1000 }
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    points: u.points || 0,
    diamonds: u.diamonds || 0,
    wallet: u.wallet || 0,
    invites: u.invites || 0,
    isAdmin: !!u.isAdmin,
    orders: u.orders || []
  };
}

function ensureUser(profile, isAdmin) {
  const id = profile.id;
  if (!users[id]) {
    users[id] = {
      id,
      username: profile.username,
      avatar: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${id}/${profile.avatar}.png?size=128`
        : null,
      points: 50,
      diamonds: 0,
      wallet: 0,
      invites: 0,
      isAdmin: !!isAdmin,
      orders: [],
      lastDaily: null,
      chatToday: 0,
      chatDay: ''
    };
  } else {
    users[id].username = profile.username;
    users[id].avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${id}/${profile.avatar}.png?size=128`
      : users[id].avatar;
    users[id].isAdmin = !!isAdmin;
  }
  saveUsers(users);
  return users[id];
}

async function fetchStaff(userId) {
  if (!BOT_TOKEN || !GUILD_ID) return false;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    if (!res.ok) return false;
    const m = await res.json();
    return Array.isArray(m.roles) && m.roles.includes(STAFF_ROLE_ID);
  } catch {
    return false;
  }
}

// Discord OAuth
app.get('/auth/discord', (req, res) => {
  if (!CLIENT_ID) {
    return res.status(500).send('Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in env.');
  }
  const redirect = encodeURIComponent(BASE_URL + '/auth/callback');
  const url =
    `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}` +
    `&redirect_uri=${redirect}&response_type=code&scope=identify%20guilds.members.read`;
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/?error=oauth');
  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: BASE_URL + '/auth/callback'
    });
    const tok = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    }).then((r) => r.json());
    if (!tok.access_token) return res.redirect('/?error=token');
    const profile = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    }).then((r) => r.json());
    const isAdmin = await fetchStaff(profile.id);
    const u = ensureUser(profile, isAdmin);
    req.session.userId = u.id;
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.redirect('/?error=callback');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = users[req.session.userId];
  res.json({ user: publicUser(u) });
});

app.get('/api/leaderboard', (req, res) => {
  const leaders = Object.values(users)
    .map(publicUser)
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .slice(0, 50);
  res.json({ leaders });
});

const REWARD_MAP = {
  nfa: { name: 'Minecraft NFA', cost: 500 },
  mcfa: { name: 'Minecraft MCFA', cost: 1500 },
  nitro: { name: 'Nitro Trial', cost: 3000 },
  gift100: { name: 'Gift Voucher 100', cost: 2000 }
};

app.post('/api/redeem', (req, res) => {
  const u = users[req.session.userId];
  if (!u) return res.json({ error: 'Login required' });
  const meta = REWARD_MAP[req.body?.id];
  if (!meta) return res.json({ error: 'Unknown reward' });
  if ((u.points || 0) < meta.cost) return res.json({ error: 'Not enough points' });
  u.points -= meta.cost;
  u.orders = u.orders || [];
  u.orders.push({ id: req.body.id, name: meta.name, cost: meta.cost, status: 'pending', at: Date.now() });
  saveUsers(users);
  res.json({ user: publicUser(u) });
});

app.post('/api/daily', (req, res) => {
  const u = users[req.session.userId];
  if (!u) return res.json({ error: 'Login required' });
  const today = new Date().toISOString().slice(0, 10);
  if (u.lastDaily === today) return res.json({ error: 'Already claimed today' });
  const gained = 25 + Math.floor(Math.random() * 26);
  u.points = (u.points || 0) + gained;
  u.lastDaily = today;
  saveUsers(users);
  res.json({ user: publicUser(u), gained });
});

app.post('/api/chat', async (req, res) => {
  const u = users[req.session.userId];
  if (!u) return res.json({ error: 'Login required' });
  const message = String(req.body?.message || '').trim().slice(0, 400);
  if (message.length < 2) return res.json({ error: 'Message too short' });

  const today = new Date().toISOString().slice(0, 10);
  if (u.chatDay !== today) {
    u.chatDay = today;
    u.chatToday = 0;
  }

  let reply = 'Nice message! Keep chatting to earn more points.';
  let earned = 0;
  if (message.length >= 8 && u.chatToday < 30) {
    earned = 2 + Math.min(8, Math.floor(message.length / 20));
    u.points = (u.points || 0) + earned;
    u.chatToday += 1;
  }

  // Optional AI if key present
  const key = (process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || '').trim();
  if (key) {
    try {
      const base = process.env.OPENAI_BASE_URL ||
        (/^gsk_/i.test(key) ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1');
      const model = process.env.OPENAI_MODEL ||
        (/groq\.com/i.test(base) || /^gsk_/i.test(key) ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');
      const r = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model,
          max_tokens: 200,
          messages: [
            {
              role: 'system',
              content:
                'You are Ultimate Rewards AI (DashWho-M.8.1-lb). Short friendly replies. Never mention OpenAI/Groq.'
            },
            { role: 'user', content: message }
          ]
        })
      });
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content?.trim();
      if (text) reply = text.slice(0, 500);
    } catch (_) {}
  } else if (/^is my bot working\?$/i.test(message)) {
    reply = 'Idk which bot you are talking but I am online';
  }

  saveUsers(users);
  res.json({ user: publicUser(u), reply, earned });
});

// Staff: mark order done
app.post('/api/admin/order', (req, res) => {
  const admin = users[req.session.userId];
  if (!admin?.isAdmin) return res.json({ error: 'Staff only' });
  const { userId, index, status } = req.body || {};
  const u = users[userId];
  if (!u?.orders?.[index]) return res.json({ error: 'Not found' });
  u.orders[index].status = status === 'done' ? 'done' : 'pending';
  saveUsers(users);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log('Ultimate Rewards app on', PORT);
  console.log('BASE_URL', BASE_URL);
});
