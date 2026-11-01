/**
 * Generate sample review log data (simulating open-revlog format)
 * Format giống dataset open-spaced-repetition/anki-revlogs-10k
 */

function generateSampleRevlog(numCards = 200, reviewsPerCard = 25) {
  const revlogs = [];
  const defaultW = [0.4072,1.1829,3.1262,15.4722,7.2102,0.5316,1.0651,0.0589,1.5747,0.1280,1.0507,29.8148,0.2800,0.2093,2.7849,0.5188,0.8511,2.5790,0.0990];

  for (let c = 0; c < numCards; c++) {
    const cardId = 1000 + c;
    let S = defaultW[Math.floor(Math.random() * 4)];
    let D = defaultW[4] - Math.exp(defaultW[5] * (3 - 1)) + 1;
    D = Math.max(1, Math.min(10, D));
    let dayOffset = 0;
    let lastReview = 0;

    for (let r = 0; r < reviewsPerCard; r++) {
      const elapsedDays = r === 0 ? 0 : Math.max(1, Math.round(S * 0.9 * (0.5 + Math.random())));
      dayOffset += elapsedDays;
      const t = elapsedDays;
      const R = Math.pow(1 + t / (9 * S), -0.5);

      // Simulate rating based on R
      const remembered = Math.random() < R;
      let rating;
      if (!remembered) {
        rating = 1; // Again
      } else {
        const roll = Math.random();
        if (roll < 0.15) rating = 2; // Hard
        else if (roll < 0.85) rating = 3; // Good
        else rating = 4; // Easy
      }

      const state = r === 0 ? 0 : (rating === 1 ? 3 : 2);
      const duration = Math.floor(2000 + Math.random() * 15000);

      revlogs.push({
        card_id: cardId,
        day_offset: dayOffset,
        rating: rating,
        state: state, // 0=new, 2=review, 3=relearn
        duration: duration,
        elapsed_days: elapsedDays,
        elapsed_seconds: Math.floor(duration / 1000)
      });

      // Update S and D for next review
      if (rating >= 2) {
        S = S * (1 + Math.exp(defaultW[8]) * (11 - D) * Math.pow(S, -defaultW[9]) * (Math.exp(defaultW[10] * (1 - R)) - 1));
      } else {
        S = defaultW[11] * Math.pow(D, -defaultW[12]) * (Math.pow(S + 1, defaultW[13]) - 1) * Math.exp(defaultW[14] * (1 - R));
      }
      S = Math.max(0.1, Math.min(365 * 10, S));

      const newD0 = defaultW[4] - Math.exp(defaultW[5] * (rating - 1)) + 1;
      D = defaultW[7] * newD0 + (1 - defaultW[7]) * (D - defaultW[6] * (rating - 3));
      D = Math.max(1, Math.min(10, D));

      lastReview = dayOffset;
    }
  }

  return revlogs;
}

// Export for both Node and browser
if (typeof module !== 'undefined') {
  const data = generateSampleRevlog(200, 25);
  const fs = require('fs');
  // Save as CSV
  const header = 'card_id,day_offset,rating,state,duration,elapsed_days,elapsed_seconds';
  const rows = data.map(r => `${r.card_id},${r.day_offset},${r.rating},${r.state},${r.duration},${r.elapsed_days},${r.elapsed_seconds}`);
  fs.writeFileSync(__dirname + '/sample_revlog.csv', header + '\n' + rows.join('\n'));
  console.log(`Generated ${data.length} review logs for ${200} cards`);
  console.log(`Saved to datasets/sample_revlog.csv`);

  // Save as JSON too
  fs.writeFileSync(__dirname + '/sample_revlog.json', JSON.stringify(data));
  console.log(`Saved to datasets/sample_revlog.json`);
}
