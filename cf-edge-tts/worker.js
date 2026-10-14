const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROME_VERSION = '131.0.2903.86';
const GEC_VERSION = '1-' + CHROME_VERSION;

const VOICES_ENDPOINTS = [
  'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list',
  'https://api.msedgeservices.com/voices/list',
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function uuid() {
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
}
function rfc1123() { return new Date().toUTCString(); }
function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function secMsGec() {
  const epoch = BigInt(Math.floor(Date.now() / 1000)) + 11644473600n;
  const rounded = (epoch - epoch % 300n) * 10000000n;
  const data = new TextEncoder().encode(rounded.toString() + TOKEN);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function voiceToLang(voice) {
  if (!voice) return 'en';
  const m = voice.match(/^([a-z]{2}-[A-Z]{2,3})/);
  if (!m) return 'en';
  const locale = m[1].toLowerCase();
  const map = {
    'en-us': 'en-us', 'en-gb': 'en-gb', 'en-au': 'en-au',
    'en-in': 'en-in', 'en-ca': 'en-ca', 'en-ie': 'en-ie',
    'en-za': 'en-za', 'en-nz': 'en-nz', 'en-sg': 'en-sg',
    'en-hk': 'en-gb', 'en-ke': 'en-in', 'en-ng': 'en-gb',
    'en-ph': 'en-us', 'en-tz': 'en-in',
  };
  return map[locale] || locale.substring(0, 2);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname === '/voices') return handleVoices(url);
    if (url.pathname === '/tts') return handleTTS(url);
    return new Response('Edge TTS Worker\n/tts?text=hello&voice=en-US-JennyNeural\n/voices?lang=en', {
      headers: { ...cors, 'Content-Type': 'text/plain' }
    });
  }
};

// --- voices ---
let voicesCache = null;
let voicesCacheTime = 0;

async function handleVoices(url) {
  const lang = url.searchParams.get('lang') || '';
  const now = Date.now();

  if (!voicesCache || now - voicesCacheTime > 3600000) {
    const gec = await secMsGec();
    for (const base of VOICES_ENDPOINTS) {
      try {
        const r = await fetch(
          base + '?TrustedClientToken=' + TOKEN + '&Sec-MS-GEC=' + gec + '&Sec-MS-GEC-Version=' + GEC_VERSION,
          { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/' + CHROME_VERSION + ' Edg/' + CHROME_VERSION } }
        );
        if (r.ok) {
          voicesCache = await r.json();
          voicesCacheTime = now;
          break;
        }
      } catch (e) { /* try next */ }
    }
  }

  let list = voicesCache || [];
  if (lang) list = list.filter(v => (v.Locale || '').toLowerCase().startsWith(lang.toLowerCase()));

  const result = list.map(v => ({
    id: v.ShortName || v.Name,
    name: (v.ShortName || '').replace(/^[a-z]{2}-[A-Z]{2}-/, '').replace(/Neural$/, '').trim(),
    gender: v.Gender,
    locale: v.Locale
  }));

  return new Response(JSON.stringify(result), {
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
  });
}

// --- tts ---
async function handleTTS(url) {
  const text = url.searchParams.get('text');
  const voice = url.searchParams.get('voice') || 'en-US-JennyNeural';
  const rate = url.searchParams.get('rate') || '+0%';
  const pitch = url.searchParams.get('pitch') || '+0Hz';

  if (!text) return new Response('Missing text', { status: 400, headers: cors });

  const errors = [];

  // 1) Google Translate TTS (simple HTTP GET, reliable)
  try {
    const lang = voiceToLang(voice);
    const chunks = splitText(text.substring(0, 1000));
    const audioChunks = [];

    for (const chunk of chunks) {
      const gUrl = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=' + lang +
        '&client=tw-ob&q=' + encodeURIComponent(chunk);
      const r = await fetch(gUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + CHROME_VERSION,
          'Referer': 'https://translate.google.com/',
        }
      });
      if (r.ok) {
        const buf = await r.arrayBuffer();
        if (buf.byteLength > 50) audioChunks.push(new Uint8Array(buf));
      } else {
        throw new Error('gtts: ' + r.status);
      }
    }

    if (audioChunks.length > 0) {
      let totalLen = 0;
      for (const c of audioChunks) totalLen += c.length;
      const merged = new Uint8Array(totalLen);
      let off = 0;
      for (const c of audioChunks) { merged.set(c, off); off += c.length; }
      return new Response(merged.buffer, {
        headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' }
      });
    }
  } catch (e) {
    errors.push('google: ' + e.message);
  }

  // 2) Edge WebSocket (fallback)
  const gec = await secMsGec();
  const connId = uuid();
  for (const ep of [
    { url: 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1', tokenParam: 'TrustedClientToken' },
    { url: 'https://api.msedgeservices.com/tts/cognitiveservices/websocket/v1', tokenParam: 'Ocp-Apim-Subscription-Key' },
  ]) {
    const wsUrl = ep.url + '?' + ep.tokenParam + '=' + TOKEN +
      '&Sec-MS-GEC=' + gec + '&Sec-MS-GEC-Version=' + GEC_VERSION +
      '&ConnectionId=' + connId;
    try {
      const result = await tryWebSocket(wsUrl, text, voice, rate, pitch, connId);
      if (result) return result;
    } catch (e) {
      errors.push(ep.url.split('/')[2] + ': ' + e.message);
    }
  }

  return new Response('All endpoints failed: ' + errors.join(' | '), { status: 502, headers: cors });
}

function splitText(text) {
  if (text.length <= 200) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 200) { parts.push(remaining); break; }
    let idx = remaining.lastIndexOf('.', 200);
    if (idx < 50) idx = remaining.lastIndexOf(' ', 200);
    if (idx < 50) idx = 200;
    parts.push(remaining.substring(0, idx + 1).trim());
    remaining = remaining.substring(idx + 1).trim();
  }
  return parts;
}

// --- WebSocket TTS ---
async function tryWebSocket(wsUrl, text, voice, rate, pitch, connId) {
  const wsResp = await fetch(wsUrl, {
    headers: {
      'Upgrade': 'websocket',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/' + CHROME_VERSION + ' Edg/' + CHROME_VERSION,
    }
  });

  const ws = wsResp.webSocket;
  if (!ws) throw new Error('upgrade failed (' + wsResp.status + ')');
  ws.accept();

  ws.send('X-Timestamp:' + rfc1123() + '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
    '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}');

  const ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="' + voice + '"><prosody pitch="' + pitch + '" rate="' + rate + '" volume="+0%">' + escXml(text.substring(0, 2000)) + '</prosody></voice></speak>';
  ws.send('X-RequestId:' + connId + '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' + rfc1123() + '\r\nPath:ssml\r\n\r\n' + ssml);

  const audioMarker = new TextEncoder().encode('Path:audio\r\n');
  const chunks = [];

  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => {
      try { ws.close(); } catch(_){}
      if (chunks.length > 0) resolve(buildAudioResponse(chunks));
      else reject(new Error('timeout'));
    }, 15000);

    ws.addEventListener('message', ev => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { ws.close(); } catch(_){} resolve(buildAudioResponse(chunks)); }, 5000);

      if (typeof ev.data === 'string') {
        if (ev.data.includes('Path:turn.end')) {
          clearTimeout(timer);
          try { ws.close(); } catch(_){}
          resolve(buildAudioResponse(chunks));
        }
      } else {
        const data = new Uint8Array(ev.data);
        const idx = indexOf(data, audioMarker);
        if (idx !== -1) chunks.push(data.slice(idx + audioMarker.length));
      }
    });

    ws.addEventListener('error', () => {
      clearTimeout(timer);
      try { ws.close(); } catch(_){}
      if (chunks.length > 0) resolve(buildAudioResponse(chunks));
      else reject(new Error('ws error'));
    });

    ws.addEventListener('close', () => {
      clearTimeout(timer);
      if (chunks.length > 0) resolve(buildAudioResponse(chunks));
      else reject(new Error('closed without audio'));
    });
  });
}

function buildAudioResponse(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  if (len === 0) return null;
  const merged = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return new Response(merged.buffer, {
    headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' }
  });
}

function indexOf(hay, needle) {
  for (let i = 0; i <= hay.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}
