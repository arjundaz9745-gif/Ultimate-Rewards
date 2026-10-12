
const INVITE = 'https://discord.gg/TC2SZf2C5';
const REWARDS = [
  { id: 'nfa', name: 'Minecraft NFA', cost: 500 },
  { id: 'mcfa', name: 'Minecraft MCFA', cost: 1500 },
  { id: 'nitro', name: 'Nitro Trial', cost: 3000 },
  { id: 'gift100', name: 'Gift Voucher 100', cost: 2000 }
];

let me = null;

function toast(t) {
  const el = document.getElementById('toast');
  el.textContent = t;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function go(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  document.querySelectorAll('.nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-page') === name);
  });
  if (name === 'ranking') loadLb();
  if (name === 'redeem') renderRedeem();
}

function nav(e, name) {
  e.preventDefault();
  go(name);
  return false;
}

async function api(path, opts) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return res.json();
}

function renderUser() {
  if (!me) return;
  document.getElementById('login').classList.add('hide');
  document.getElementById('app').classList.remove('hide');
  document.getElementById('uname').textContent = me.username || 'User';
  document.getElementById('urole').textContent = me.isAdmin ? 'Staff Admin' : 'Member';
  document.getElementById('pts').textContent = me.points ?? 0;
  document.getElementById('gems').textContent = me.diamonds ?? 0;
  document.getElementById('wallet').textContent = (me.wallet ?? 0).toFixed(2);
  document.getElementById('profName').textContent = me.username;
  document.getElementById('profId').textContent = me.id;
  document.getElementById('inviteCount').textContent = (me.invites || 0) + ' invites';
  document.getElementById('invitePts').textContent = '+' + ((me.invites || 0) * 100);
  const ad = document.getElementById('adminBadge');
  if (me.isAdmin) ad.classList.remove('hide');
  else ad.classList.add('hide');
  if (me.avatar) {
    const img = document.getElementById('avatar');
    img.src = me.avatar;
    img.classList.remove('hide');
    document.getElementById('avatarPh').classList.add('hide');
  }
}

function renderRedeem() {
  const grid = document.getElementById('redeemGrid');
  grid.innerHTML = REWARDS.map(r => `
    <div class="r-card" onclick="redeem('${r.id}')">
      <h4>${r.name}</h4>
      <div class="cost">${r.cost} pts</div>
    </div>
  `).join('');
  const orders = me?.orders || [];
  const list = document.getElementById('ordersList');
  if (!orders.length) {
    list.innerHTML = '<div class="row"><div class="grow" style="color:var(--muted)">No redeems yet. Tap a reward above.</div></div>';
    return;
  }
  list.innerHTML = orders.slice().reverse().map(o => `
    <div class="row">
      <div class="grow">
        <strong>${o.name}</strong>
        <div style="font-size:11px;color:var(--muted)">${o.cost} pts · ${new Date(o.at).toLocaleString()}</div>
        <span class="badge ${o.status}">${o.status}</span>
      </div>
    </div>
  `).join('');
}

async function redeem(id) {
  const r = REWARDS.find(x => x.id === id);
  if (!r) return;
  if ((me.points || 0) < r.cost) return toast('Not enough points');
  const data = await api('/api/redeem', { method: 'POST', body: JSON.stringify({ id }) });
  if (data.error) return toast(data.error);
  me = data.user;
  renderUser();
  renderRedeem();
  toast('Redeem requested — pending staff');
}

async function dailyClaim() {
  const data = await api('/api/daily', { method: 'POST', body: '{}' });
  if (data.error) return toast(data.error);
  me = data.user;
  renderUser();
  toast('+' + data.gained + ' points (daily)');
}

async function sendChat() {
  const input = document.getElementById('chatIn');
  const text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  const box = document.getElementById('chatBox');
  box.innerHTML += `<div class="msg user"><b>You:</b> ${escapeHtml(text)}</div>`;
  const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: text }) });
  if (data.error) {
    box.innerHTML += `<div class="msg bot">${escapeHtml(data.error)}</div>`;
  } else {
    me = data.user;
    renderUser();
    const earn = data.earned ? ` <span class="earn">+${data.earned} pts</span>` : '';
    box.innerHTML += `<div class="msg bot"><b>UR AI:</b> ${escapeHtml(data.reply)}${earn}</div>`;
  }
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function copyInvite() {
  navigator.clipboard.writeText(INVITE).then(() => toast('Invite copied')).catch(() => toast(INVITE));
}

async function loadLb() {
  const data = await api('/api/leaderboard');
  const list = document.getElementById('lbList');
  const rows = data.leaders || [];
  if (!rows.length) {
    list.innerHTML = '<div class="row"><div class="grow" style="color:var(--muted)">No rankings yet — chat & earn!</div></div>';
    return;
  }
  list.innerHTML = rows.map((u, i) => `
    <div class="row">
      <div class="rank">#${i + 1}</div>
      <div class="grow"><strong>${escapeHtml(u.username)}</strong>${u.isAdmin ? ' <span class="admin-tag">STAFF</span>' : ''}</div>
      <div class="pts">${u.points} pts</div>
    </div>
  `).join('');
}

async function logout() {
  await api('/auth/logout', { method: 'POST', body: '{}' });
  location.href = '/';
}

async function boot() {
  try {
    const data = await api('/api/me');
    if (data.user) {
      me = data.user;
      renderUser();
      renderRedeem();
    }
  } catch (_) {}
}

document.getElementById('chatIn')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
});

boot();
                                                             
