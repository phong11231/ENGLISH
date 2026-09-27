// Daily push notification reminder - runs via GitHub Actions at 18:00 VN time
// Reads RTDB, checks if user studied today, sends push if not

const webpush = require('web-push');
const https = require('https');

const VAPID_PUBLIC = 'BLQTjgTjyEiYhU5z7xGW4ZaiGVmFGSwUs0EQ5nsJefKxnNVVcC-CSiVUurUQnPW6zp0vUGiTXh5_8KcONteeczw';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const RTDB_URL = 'https://flashmind-data-default-rtdb.asia-southeast1.firebasedatabase.app';

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

async function main() {
  console.log('Fetching users from RTDB...');
  const users = await fetchJSON(RTDB_URL + '/users.json');
  if (!users) { console.log('No users found'); return; }

  const today = getVNDate().toISOString().slice(0, 10);
  let sent = 0, skipped = 0, noSub = 0, studied = 0;

  for (const [uid, userData] of Object.entries(users)) {
    if (!userData.pushSub || !userData.pushSub.endpoint) { noSub++; continue; }

    const streakDays = (userData.settings && userData.settings.streakDays) || {};
    if (streakDays[today] && streakDays[today] > 0) { studied++; continue; }

    // Calculate current streak
    let streak = 0;
    const d = new Date(getVNDate());
    d.setDate(d.getDate() - 1); // check from yesterday
    while (streakDays[d.toISOString().slice(0, 10)] > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    // Count due cards
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

    const sub = {
      endpoint: userData.pushSub.endpoint,
      keys: userData.pushSub.keys
    };

    try {
      await webpush.sendNotification(sub, JSON.stringify({
        title: 'FlashMind — Nhac hoc',
        body: body,
        icon: '/icon.svg',
        url: '/'
      }));
      sent++;
      console.log('Sent to', uid.slice(0, 8) + '...');
    } catch(e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        console.log('Subscription expired for', uid.slice(0, 8) + '..., removing');
        // Could remove via RTDB REST API with auth, but skip for now
      } else {
        console.error('Failed for', uid.slice(0, 8) + '...:', e.message);
      }
      skipped++;
    }
  }

  console.log('\nDone! Sent:', sent, '| Already studied:', studied, '| No subscription:', noSub, '| Failed:', skipped);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
