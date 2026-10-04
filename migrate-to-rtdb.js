/**
 * Migrate Firestore → Realtime Database
 *
 * Buoc 1: Bat Realtime Database tren Firebase Console
 *   https://console.firebase.google.com/project/flashmind-8b1bc/database
 *   Bam "Create Database" > chon region > "Start in test mode"
 *
 * Buoc 2: Tai service account key
 *   https://console.firebase.google.com/project/flashmind-8b1bc/settings/serviceaccounts/adminsdk
 *   Bam "Generate new private key" > luu file JSON vao cung thu muc voi file nay
 *   Doi ten file thanh: serviceAccountKey.json
 *
 * Buoc 3: Chay script
 *   cd C:\Users\yosua\Downloads\anki-web
 *   npm install firebase-admin
 *   node migrate-to-rtdb.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://flashmind-8b1bc-default-rtdb.firebaseio.com'
  // Neu region khac, doi URL. Xem trong Firebase Console > Realtime Database
});

const firestore = admin.firestore();
const rtdb = admin.database();

async function migrate() {
  console.log('=== BAT DAU MIGRATE ===\n');

  // 1. Migrate sharedDecks
  console.log('1. Migrate sharedDecks...');
  const sharedSnap = await firestore.collection('sharedDecks').get();
  let sharedCount = 0;
  for (const doc of sharedSnap.docs) {
    await rtdb.ref('sharedDecks/' + doc.id).set(doc.data());
    sharedCount++;
  }
  console.log('   -> ' + sharedCount + ' shared decks\n');

  // 2. Migrate users
  console.log('2. Migrate users...');
  const usersSnap = await firestore.collection('users').get();
  let userCount = 0;
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const userData = userDoc.data();
    console.log('   User: ' + uid);

    // User settings
    await rtdb.ref('users/' + uid + '/settings').set(userData.settings || {});

    // User decks
    const decksSnap = await firestore.collection('users/' + uid + '/decks').get();
    let deckCount = 0;
    for (const deckDoc of decksSnap.docs) {
      await rtdb.ref('users/' + uid + '/decks/' + deckDoc.id).set(deckDoc.data());
      deckCount++;
    }
    console.log('     -> ' + deckCount + ' decks');

    // User reviewLog (moi nhat truoc, gioi han 1000)
    const logsSnap = await firestore.collection('users/' + uid + '/reviewLog')
      .orderBy('date', 'desc').limit(1000).get();
    if (!logsSnap.empty) {
      const logs = {};
      logsSnap.forEach(d => { logs[d.id] = d.data(); });
      await rtdb.ref('users/' + uid + '/reviewLog').set(logs);
      console.log('     -> ' + logsSnap.size + ' review logs');
    }

    userCount++;
  }
  console.log('\n   -> ' + userCount + ' users total\n');

  console.log('=== MIGRATE XONG! ===');
  console.log('Gio doi code trong fm-shared.js tu Firestore sang Realtime Database.');
  process.exit(0);
}

migrate().catch(e => { console.error('LOI:', e); process.exit(1); });
