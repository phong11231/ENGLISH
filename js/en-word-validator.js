/**
 * English Word Validator
 * Dataset: dwyl/english-words (~370,000 từ tiếng Anh)
 * Tự động load khi script được include
 */
const EnWordValidator = (() => {
  let _words = null;

  function _normalize(w) { return w.trim().toLowerCase().replace(/[^a-z]/g, ''); }

  function _levenshtein(a, b) {
    if (a.length > 15 || b.length > 15) return 99;
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
  }

  // Auto-load dataset
  fetch('./datasets/en_words.txt')
    .then(r => r.text())
    .then(text => {
      _words = new Set(text.split('\n'));
      console.log('[EnWordValidator] Loaded ' + _words.size + ' words');
    })
    .catch(err => {
      console.warn('[EnWordValidator] Dataset not available:', err.message);
      _words = new Set();
    });

  return {
    isLoaded() { return _words !== null && _words.size > 0; },

    isEnglish(word) {
      if (!_words || !_words.size) return true;
      const w = _normalize(word);
      return !w ? false : _words.has(w);
    },

    checkPhrase(text) {
      if (!_words || !_words.size) return { valid: true, invalidWords: [] };
      const invalidWords = [];
      for (const token of text.trim().split(/\s+/)) {
        const w = _normalize(token);
        if (w && w.length >= 2 && !_words.has(w)) invalidWords.push(token);
      }
      return { valid: invalidWords.length === 0, invalidWords };
    },

    suggest(word, max = 5) {
      if (!_words || !_words.size) return [];
      const w = _normalize(word);
      if (!w) return [];
      if (_words.has(w)) return [w];
      const results = [];
      for (const d of _words) {
        if (Math.abs(d.length - w.length) > 2) continue;
        const dist = _levenshtein(w, d);
        if (dist <= 2) results.push({ word: d, distance: dist });
      }
      return results.sort((a, b) => a.distance - b.distance).slice(0, max).map(r => r.word);
    },

    getStats() {
      return { loaded: !!(_words && _words.size), totalWords: _words ? _words.size : 0, source: 'dwyl/english-words', license: 'MIT' };
    }
  };
})();
