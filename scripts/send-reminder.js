// Duolingo-style push notification sender
// - Smart timing: gui dung gio user hay hoc
// - Escalation: ngay 1/2/3+ message khac nhau
// - Frequency cap: max 1 push/ngay, dung sau 7 ngay inactive
// - Skip neu da hoc hom nay

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
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

function patchRTDB(path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(RTDB_URL + path + '.json');
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function getVNDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
}

function getVNHour() { return getVNDate().getHours(); }

// Tinh gio user hay hoc nhat tu histogram studyHours: {hour: count}
function getTypicalHour(studyHours) {
  if (!studyHours) return 18; // default 18h
  let maxCount = 0, bestHour = 18;
  for (const [h, count] of Object.entries(studyHours)) {
    if (count > maxCount) { maxCount = count; bestHour = parseInt(h); }
  }
  return bestHour;
}

// Dem so ngay lien tiep khong hoc (tinh tu hom nay)
function getDaysInactive(streakDays) {
  if (!streakDays) return 999;
  const d = new Date(getVNDate());
  let days = 0;
  for (let i = 0; i < 30; i++) {
    const key = d.toISOString().slice(0, 10);
    if (streakDays[key] && streakDays[key] > 0) break;
    days++;
    d.setDate(d.getDate() - 1);
  }
  return days;
}

// Tinh streak hien tai (chuoi ngay lien tiep truoc khi ngung)
function calcStreak(streakDays) {
  if (!streakDays) return 0;
  const d = new Date(getVNDate());
  d.setDate(d.getDate() - 1); // bat dau tu hom qua
  let streak = 0;
  while (streakDays[d.toISOString().slice(0, 10)] > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// Dem the can on tap
function countDueCards(userData) {
  let due = 0;
  const now = Date.now();
  const decks = userData.decks || {};
  for (const deck of Object.values(decks)) {
    (deck.cards || []).forEach(c => {
      if (c.suspended) return;
      if (c.status === 'new' || c.status === 'learning' || c.status === 'relearning' || (c.due && c.due <= now)) due++;
    });
  }
  return due;
}

// ===== ESCALATION MESSAGES (kieu Duolingo) =====
function getEscalationMessage(daysInactive, streak, dueCount) {
  // Ngay 0: da hoc -> khong gui
  // Ngay 1: nhe nhang
  if (daysInactive <= 1) {
    if (streak > 0) {
      const msgs = [
        '🔥 Streak ' + streak + ' ngay dang cho ban! ' + dueCount + ' the can on tap.',
        '💪 Giu vung streak ' + streak + ' ngay nao! Hoc chi mat vai phut.',
        '⚡ ' + dueCount + ' the dang cho — don gian thoi, giu streak ' + streak + ' ngay!'
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];
    }
    const msgs = [
      '📚 ' + dueCount + ' the dang cho ban hom nay. Bat dau nao!',
      '✨ Chi can vai phut de on tap ' + dueCount + ' the. Ban lam duoc!',
      '🎯 Hom nay chua hoc — ' + dueCount + ' the dang doi ban!'
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  // Ngay 2: canh bao streak
  if (daysInactive === 2) {
    if (streak > 0) {
      return '😰 Streak ' + streak + ' ngay sap mat! Chi con hom nay de giu lai. Vao hoc ngay!';
    }
    return '📖 Ban da nghi 2 ngay roi. Quay lai on tap ' + dueCount + ' the nhe!';
  }

  // Ngay 3: manh hon
  if (daysInactive === 3) {
    if (streak > 0) {
      return '💔 Streak ' + streak + ' ngay da mat... Bat dau lai tu hom nay — ban da lam duoc truoc, lam lai duoc!';
    }
    return '😢 FlashMind nho ban qua! 3 ngay roi chua thay ban. ' + dueCount + ' the van dang cho...';
  }

  // Ngay 4-5: guilt trip nhe (kieu Duo buon)
  if (daysInactive <= 5) {
    const msgs = [
      '🥺 ' + daysInactive + ' ngay roi... FlashMind bat dau lo roi. Quay lai nhe?',
      '😿 Nhung tu vung ban hoc sap bi quen mat. Vao on tap lai ' + dueCount + ' the!',
      '🌧️ ' + daysInactive + ' ngay khong hoc — tri nho dang phai dan. Chi 5 phut thoi!'
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  // Ngay 6-7: cuoi cung truoc khi dung
  if (daysInactive <= 7) {
    const msgs = [
      '🕊️ Day la tin nhan cuoi — ' + daysInactive + ' ngay roi. Ban quay lai bat cu luc nao nhe!',
      '👋 FlashMind se ngung nhac. Khi nao san sang, ' + dueCount + ' the van o day cho ban.'
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  // Ngay 8+: DUNG gui -> tra ve null
  return null;
}

// ===== SEND TO ALL (admin broadcast) =====
async function sendToAll(users, title, body) {
  let sent = 0, skipped = 0, noSub = 0;
  for (const [uid, userData] of Object.entries(users)) {
    if (!userData.pushSub || !userData.pushSub.endpoint) { noSub++; continue; }
    const sub = { endpoint: userData.pushSub.endpoint, keys: userData.pushSub.keys };
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, icon: '/icon.svg', url: '/' }));
      sent++;
      console.log('  ✓', uid.slice(0, 8));
    } catch(e) {
      console.log('  ✗', uid.slice(0, 8), e.statusCode || e.message);
      skipped++;
    }
  }
  return { sent, skipped, noSub };
}

// ===== PROCESS ADMIN QUEUE =====
async function processAdminQueue(users) {
  const pending = await fetchJSON(RTDB_URL + '/adminNotify.json?orderBy="sent"&equalTo=false');
  if (!pending) return false;
  const entries = Object.entries(pending);
  if (entries.length === 0) return false;

  console.log('\n=== ADMIN QUEUE: ' + entries.length + ' pending ===');
  for (const [key, notif] of entries) {
    console.log('Broadcasting:', notif.title, '-', notif.body);
    const r = await sendToAll(users, notif.title || 'FlashMind', notif.body);
    console.log('Result: sent=' + r.sent + ' failed=' + r.skipped);
    await patchRTDB('/adminNotify/' + key, { sent: true, sentCount: r.sent, sentTime: Date.now() });
  }
  return true;
}

// ===== MAIN =====
async function main() {
  console.log('FlashMind Notification System');
  console.log('VN time:', getVNDate().toLocaleString());
  console.log('VN hour:', getVNHour());

  const users = await fetchJSON(RTDB_URL + '/users.json');
  if (!users) { console.log('No users found'); return; }
  console.log('Users:', Object.keys(users).length);

  // Admin broadcast (workflow_dispatch with custom message)
  if (CUSTOM_MESSAGE) {
    console.log('\n=== ADMIN BROADCAST ===');
    console.log('Title:', CUSTOM_TITLE || 'FlashMind');
    console.log('Message:', CUSTOM_MESSAGE);
    const r = await sendToAll(users, CUSTOM_TITLE || 'FlashMind', CUSTOM_MESSAGE);
    console.log('Done! Sent:', r.sent, '| No sub:', r.noSub, '| Failed:', r.skipped);
    await processAdminQueue(users);
    return;
  }

  // Process admin queue
  await processAdminQueue(users);

  // Smart daily reminder
  console.log('\n=== SMART DAILY REMINDER ===');
  const currentHour = getVNHour();
  const today = getVNDate().toISOString().slice(0, 10);
  let sent = 0, skipped = 0, noSub = 0, studied = 0, wrongTime = 0, capped = 0, inactive = 0;

  for (const [uid, userData] of Object.entries(users)) {
    if (!userData.pushSub || !userData.pushSub.endpoint) { noSub++; continue; }

    const settings = userData.settings || {};
    const streakDays = settings.streakDays || {};

    // Skip neu da hoc hom nay
    if (streakDays[today] && streakDays[today] > 0) { studied++; continue; }

    // Smart timing: chi gui khi dung gio cua user
    const typicalHour = getTypicalHour(settings.studyHours);
    const notifyHour = Math.max(0, typicalHour - 1); // nhac truoc 1 tieng
    // Gui neu current hour = notify hour (±1) HOAC la 18h (default fallback)
    const isRightTime = Math.abs(currentHour - notifyHour) <= 1 || currentHour === 18;
    if (!isRightTime) { wrongTime++; continue; }

    // Frequency cap: da gui hom nay chua?
    const lastNotify = userData._lastNotify || '';
    if (lastNotify === today) { capped++; continue; }

    // Escalation
    const daysInactive = getDaysInactive(streakDays);
    const streak = calcStreak(streakDays);
    const dueCount = countDueCards(userData);
    const body = getEscalationMessage(daysInactive, streak, dueCount);

    // Ngay 8+: dung gui
    if (!body) { inactive++; continue; }

    const title = daysInactive <= 2 ? 'FlashMind — Nhac hoc' :
                  daysInactive <= 5 ? 'FlashMind nho ban!' :
                  'FlashMind';

    const sub = { endpoint: userData.pushSub.endpoint, keys: userData.pushSub.keys };
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, icon: '/icon.svg', url: '/' }));
      sent++;
      // Ghi lai da gui hom nay
      await patchRTDB('/users/' + uid, { _lastNotify: today });
      console.log('  ✓', uid.slice(0, 8), '| day' + daysInactive, '| streak' + streak, '| hour' + typicalHour);
    } catch(e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        console.log('  expired:', uid.slice(0, 8));
      } else {
        console.log('  ✗', uid.slice(0, 8), e.statusCode || e.message);
      }
      skipped++;
    }
  }

  console.log('\n--- Summary ---');
  console.log('Sent:', sent);
  console.log('Already studied:', studied);
  console.log('Wrong time:', wrongTime);
  console.log('Already notified today:', capped);
  console.log('Inactive 8+ days (stopped):', inactive);
  console.log('No subscription:', noSub);
  console.log('Failed:', skipped);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
