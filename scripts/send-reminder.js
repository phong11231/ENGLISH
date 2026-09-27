// Push notification sender - daily reminder + admin broadcast
// Runs via GitHub Actions (cron 18:00 VN or manual trigger)

const webpush = require('web-push');
const https = require('https');

const VAPID_PUBLIC = 'BLQTjgTjyEiYhU5z7xGW4ZaiGVmFGSwUs0EQ5nsJefKxnNVVcC-CSiVUurUQnPW6zp0vUGiTXh5_8KcONteeczw';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const RTDB_URL = 'https://flashmind-data-default-rtdb.asia-southeast1.firebasedatabase.app';
const CUSTOM_TITLE = process.env.CUSTOM_TITLE || '';
const CUSTOM_MESSAGE = process.env.CUSTOM_MESSAGE || '';

webpush.setVapidDetails('mailto:flashmind@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

function getVNDate() {
  return new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Ho_Chi_Minh'}));
}

async function sendToAll(users, title, body) {
  let sent = 0, skipped = 0, noSub = 0;
  for (const [uid, userData] of Object.entries(users)) {
    if (!userData.pushSub || !userData.pushSub.endpoint) { noSub++; continue; }
    const sub = { endpoint: userData.pushSub.endpoint, keys: userData.pushSub.keys };
    try {
      await webpush.sendNotification(sub, JSON.stringify({
        title: title, body: body, icon: '/icon.svg', url: '/'
      }));
      sent++;
      console.log('Sent to', uid.slice(0, 8) + '...');
    } catch(e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        console.log('Sub expired:', uid.slice(0, 8) + '...');
      } else {
        console.error('Failed:', uid.slice(0, 8) + '...:', e.message);
      }
      skipped++;
    }
  }
  return { sent, skipped, noSub };
}

async function main() {
  console.log('Fetching users from RTDB...');
  const users = await fetchJSON(RTDB_URL + '/users.json');
  if (!users) { console.log('No users found'); return; }

  // Mode 1: Admin custom message (from workflow_dispatch or RTDB queue)
  if (CUSTOM_MESSAGE) {
    console.log('=== ADMIN BROADCAST ===');
    console.log('Title:', CUSTOM_TITLE || 'FlashMind');
    console.log('Message:', CUSTOM_MESSAGE);
    const r = await sendToAll(users, CUSTOM_TITLE || 'FlashMind', CUSTOM_MESSAGE);
    console.log('\nDone! Sent:', r.sent, '| No sub:', r.noSub, '| Failed:', r.skipped);
    // Also process any pending admin notifications from RTDB
    await processAdminQueue(users);
    return;
  }

  // Mode 2: Check RTDB for pending admin notifications first
  const hadPending = await processAdminQueue(users);

  // Mode 3: Daily auto reminder - only send to users who haven't studied today
  console.log('\n=== DAILY REMINDER ===');
  const today = getVNDate().toISOString().slice(0, 10);
  let sent = 0, skipped = 0, noSub = 0, studied = 0;

  for (const [uid, userData] of Object.entries(users)) {
    if (!userData.pushSub || !userData.pushSub.endpoint) { noSub++; continue; }

    const streakDays = (userData.settings && userData.settings.streakDays) || {};
    if (streakDays[today] && streakDays[today] > 0) { studied++; continue; }

    let streak = 0;
    const d = new Date(getVNDate());
    d.setDate(d.getDate() - 1);
    while (streakDays[d.toISOString().slice(0, 10)] > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    let dueCount = 0;
    const now = Date.now();
    const decks = userData.decks || {};
    for (const deck of Object.values(decks)) {
      (deck.cards || []).forEach(c => {
        if (c.suspended) return;
        if (c.status === 'new' || c.status === 'learning' || c.status === 'relearning' || (c.due && c.due <= now)) dueCount++;
      });
    }

    let body;
    if (streak > 0) {
      body = '🔥 Streak ' + streak + ' ngay sap mat! Ban co ' + dueCount + ' the can on tap. Vao hoc ngay!';
    } else {
      body = '📚 Hom nay ban chua hoc. ' + (dueCount > 0 ? 'Co ' + dueCount + ' the dang cho ban!' : 'Bat dau streak moi nao!');
    }

    const sub = { endpoint: userData.pushSub.endpoint, keys: userData.pushSub.keys };
    try {
      await webpush.sendNotification(sub, JSON.stringify({
        title: 'FlashMind — Nhac hoc', body: body, icon: '/icon.svg', url: '/'
      }));
      sent++;
      console.log('Sent to', uid.slice(0, 8) + '...');
    } catch(e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        console.log('Sub expired:', uid.slice(0, 8) + '...');
      } else {
        console.error('Failed:', uid.slice(0, 8) + '...:', e.message);
      }
      skipped++;
    }
  }

  console.log('\nDaily done! Sent:', sent, '| Studied:', studied, '| No sub:', noSub, '| Failed:', skipped);
}

async function processAdminQueue(users) {
  const pending = await fetchJSON(RTDB_URL + '/adminNotify.json?orderBy="sent"&equalTo=false');
  if (!pending) return false;

  const entries = Object.entries(pending);
  if (entries.length === 0) return false;

  console.log('\n=== ADMIN QUEUE: ' + entries.length + ' pending ===');
  for (const [key, notif] of entries) {
    console.log('Processing:', notif.title, '-', notif.body);
    const r = await sendToAll(users, notif.title || 'FlashMind', notif.body);
    console.log('Result: sent=' + r.sent + ' noSub=' + r.noSub + ' failed=' + r.skipped);
    // Mark as sent via RTDB REST PATCH
    await patchRTDB('/adminNotify/' + key, { sent: true, sentCount: r.sent, sentTime: Date.now() });
  }
  return true;
}

function patchRTDB(path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(RTDB_URL + path + '.json');
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
