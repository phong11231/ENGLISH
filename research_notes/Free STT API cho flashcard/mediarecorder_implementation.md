# MediaRecorder API + STT Pipeline for Browser Flashcard App

## 1. Best Audio Format/Codec for STT

### Takeaway
`audio/webm;codecs=opus` is now the universal cross-browser choice (Chrome, Firefox, and Safari 18.4+). It produces very small files (~8 KB/sec at 64kbps) and is accepted natively by Whisper and most STT APIs without conversion.

### Cited Findings
- As of iOS 18.4 (March 2025), Safari records WebM with Opus audio and VP8/VP9 video, so `audio/webm;codecs=opus` now works on iPhone and iPad too — [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder)
- Chrome supports `audio/webm;codecs=opus`, Firefox supports both `audio/ogg;codecs=opus` and `audio/webm;codecs=opus`, Safari 18.4+ supports `audio/webm;codecs=opus` — [TestMuAI MediaRecorder Browser Support](https://www.testmuai.com/learning-hub/mediarecorder-browser-support/)
- No browser writes `audio/mpeg` (MP3) through MediaRecorder — [AddPipe Recording Guide](https://blog.addpipe.com/recording-audio-in-the-browser-using-pure-html5-and-minimal-javascript/)
- Opus supports bitrates from 6 kbit/s to 510 kbit/s; at 64 kbit/s this is ~8 KB/sec, so a 5-second clip is ~40 KB — [Wikipedia Opus](https://en.wikipedia.org/wiki/Opus_(audio_format))
- Cloudflare Workers AI Whisper accepts WAV, MP3, MP4, M4A, OGG, FLAC, and WebM natively — [Cloudflare Whisper docs](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)

### Inferences
- No browser-side audio conversion is needed for the Whisper pipeline. WebM/Opus from MediaRecorder can be sent directly.
- For a 3-5 second flashcard recording at default bitrate (~128kbps), expect 48-80 KB files, which upload nearly instantly even on mobile.
- WAV conversion is unnecessary overhead unless targeting a very old STT API that only accepts LINEAR16.

### Gaps
- Exact default bitrate used by each browser's MediaRecorder (varies by implementation, typically 128kbps for Chrome).

## 2. Cross-Browser Format Detection Pattern

### Takeaway
Always probe with `MediaRecorder.isTypeSupported()` at runtime rather than hardcoding assumptions. Prefer `audio/webm;codecs=opus` first, fall back to `audio/mp4` for older Safari.

### Cited Findings
- "Probe supported types in order of preference using `MediaRecorder.isTypeSupported(mime)`" rather than hardcoding browser assumptions — [BuildWithMatija Safari Guide](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription)
- Safari 14.5 through 18.3 only supported `audio/mp4` (AAC codec); Safari 18.4+ added `audio/webm;codecs=opus` — [WebKit Blog](https://webkit.org/blog/11353/mediarecorder-api/)
- Use prefix matching for MIME validation to handle codec specifications: `'audio/webm'.startsWith(allowedType)` accepts `audio/webm;codecs=opus` — [BuildWithMatija](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription)

### Complete Code Example

```javascript
// === AUDIO RECORDER MODULE (plain JS, no build step) ===

function createAudioRecorder() {
  let mediaRecorder = null;
  let audioChunks = [];
  let selectedMimeType = '';

  // Detect best supported format
  function detectMimeType() {
    const types = [
      'audio/webm;codecs=opus',   // Chrome, Firefox, Safari 18.4+
      'audio/webm',               // fallback webm
      'audio/mp4',                // older Safari (14.5-18.3)
      'audio/ogg;codecs=opus',    // Firefox alternative
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return ''; // let browser pick default
  }

  // Get file extension from mime type
  function getExtension(mimeType) {
    if (mimeType.startsWith('audio/webm')) return 'webm';
    if (mimeType.startsWith('audio/mp4'))  return 'm4a';
    if (mimeType.startsWith('audio/ogg'))  return 'ogg';
    return 'webm';
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,        // mono = smaller file
        sampleRate: 16000,      // 16kHz is enough for speech
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false
    });

    selectedMimeType = detectMimeType();
    const options = selectedMimeType ? { mimeType: selectedMimeType } : {};

    mediaRecorder = new MediaRecorder(stream, options);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    // Request data every 250ms for responsive UI
    mediaRecorder.start(250);
    return mediaRecorder;
  }

  function stopRecording() {
    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, {
          type: selectedMimeType || 'audio/webm'
        });
        // Stop all tracks to release microphone
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        resolve({
          blob,
          mimeType: selectedMimeType,
          extension: getExtension(selectedMimeType),
          sizeKB: Math.round(blob.size / 1024)
        });
      };
      mediaRecorder.stop();
    });
  }

  return { startRecording, stopRecording };
}
```

### Inferences
- The `channelCount: 1` and `sampleRate: 16000` constraints reduce file size significantly for speech-only recording.
- `echoCancellation` and `noiseSuppression` improve STT accuracy on mobile devices.
- Requesting data every 250ms (`start(250)`) enables real-time volume visualization without waiting for stop.

### Gaps
- Whether `sampleRate: 16000` constraint is honored by all browsers (some may ignore it and record at 48kHz).

## 3. Audio Processing: Do You Need Conversion?

### Takeaway
No conversion needed for Whisper-based STT. Whisper accepts webm/opus natively. Only convert to WAV if targeting Google Cloud Speech-to-Text with strict format requirements.

### Cited Findings
- Cloudflare Workers AI Whisper supports: WAV, MP3, MP4, M4A, OGG, FLAC, and WebM — [Cloudflare Whisper docs](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)
- Google Speech-to-Text requires explicit encoding config: use `WEBM_OPUS` encoding for webm files from MediaRecorder — [BuildWithMatija](https://www.buildwithmatija.com/blog/iphone-safari-mediarecorder-audio-recording-transcription)
- For WAV conversion in browser (if needed), `audiobuffer-to-wav` library or manual AudioContext decoding can be used — no CDN link found for a maintained library

### Inferences
- Since Whisper accepts webm natively, the pipeline is: MediaRecorder blob -> FormData -> POST to Worker -> Whisper. Zero conversion.
- File sizes for 5-second clips: webm/opus ~40-80KB, WAV 16-bit 16kHz ~160KB, WAV 16-bit 48kHz ~480KB. WebM is 4-10x smaller.

### Gaps
- No reliable CDN-hosted library for browser-side WAV conversion was found (most require npm).

## 4. Cloudflare Worker for Whisper STT

### Takeaway
Cloudflare Workers AI provides Whisper with 10,000 free neurons/day (~243 minutes of transcription), no credit card required. A Worker that receives audio and returns text is ~30 lines of code.

### Cited Findings
- Free tier: 10,000 Neurons/day, resetting at 00:00 UTC, shared across all models — [PricePerToken Cloudflare Free](https://pricepertoken.com/endpoints/cloudflare/free)
- Whisper costs 41.14 neurons per audio minute; free block covers ~243 min/day — [ToolFreebie](https://toolfreebie.com/cloudflare-workers-ai/)
- Base Whisper: $0.00045/min, Turbo: $0.00051/min beyond free tier — [Cloudflare Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/index.md)
- No credit card needed for Workers Free plan — [ToolFreebie](https://toolfreebie.com/cloudflare-workers-ai/)
- wrangler.toml needs `[ai] binding = "AI"` — [Cloudflare Workers AI Get Started](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/)
- Whisper returns `text` (full transcription), `word_count`, and `segments` with WebVTT timing — [Cloudflare Whisper docs](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)

### Complete Worker Code

```javascript
// worker.js — Cloudflare Worker for Whisper STT

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'POST only' }, { status: 405 });
    }

    try {
      // Accept raw audio blob or FormData
      let audioData;
      const contentType = request.headers.get('content-type') || '';

      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('audio');
        audioData = [...new Uint8Array(await file.arrayBuffer())];
      } else {
        // Raw binary body
        audioData = [...new Uint8Array(await request.arrayBuffer())];
      }

      // Call Whisper
      const result = await env.AI.run(
        '@cf/openai/whisper-large-v3-turbo',
        { audio: audioData }
      );

      return Response.json({
        text: result.text,
        word_count: result.word_count,
        // segments: result.segments  // uncomment if you need timestamps
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        }
      });

    } catch (err) {
      return Response.json(
        { error: err.message },
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }
  }
};
```

**wrangler.toml:**
```toml
name = "flashcard-stt"
main = "worker.js"
compatibility_date = "2025-09-27"

[ai]
binding = "AI"
```

**Deployment:**
```bash
npm create cloudflare@latest -- flashcard-stt
# Replace worker.js with the code above
# Add [ai] binding to wrangler.toml
npx wrangler dev          # test locally
npx wrangler deploy       # deploy to *.workers.dev
```

### Inferences
- Workers have a 100MB request body limit on the free plan, but audio clips of 3-5 seconds are only 40-80KB, well within limits.
- The audio data must be passed as an array of bytes (`[...new Uint8Array(buffer)]`), not as an ArrayBuffer directly, based on Workers AI API patterns.
- For a flashcard app with ~50 cards/session, each with a 5-second clip, total daily usage would be ~4 minutes = ~165 neurons, far below the 10,000 free limit.

### Gaps
- Exact maximum audio file size accepted by Workers AI Whisper is not documented (general Workers limit is 100MB for request body).

## 5. Sending Audio from Browser to Worker

### Takeaway
Use FormData for maximum compatibility (handles CORS and file metadata cleanly) or raw binary body for simplicity. Both work with the Worker above.

### Complete Client Code

```javascript
// === SEND AUDIO TO STT WORKER ===

async function transcribeAudio(audioBlob, mimeType) {
  const WORKER_URL = 'https://flashcard-stt.YOUR_SUBDOMAIN.workers.dev';

  // Option A: FormData (recommended — carries filename/type metadata)
  const formData = new FormData();
  const ext = mimeType.startsWith('audio/mp4') ? 'm4a' : 'webm';
  formData.append('audio', audioBlob, `recording.${ext}`);

  const response = await fetch(WORKER_URL, {
    method: 'POST',
    body: formData,
    // Note: do NOT set Content-Type header — browser sets it
    // with the correct multipart boundary automatically
  });

  if (!response.ok) {
    throw new Error(`STT failed: ${response.status}`);
  }

  const result = await response.json();
  return result.text;  // transcribed text
}

// Option B: Raw binary (simpler, slightly smaller request)
async function transcribeAudioRaw(audioBlob) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: audioBlob,
  });
  const result = await response.json();
  return result.text;
}
```

### Cited Findings
- "Exposing an API key in client-side JavaScript lets anyone steal and burn your quota, so you should always proxy through a backend route" — [TrySpeakeasy STT Guide](https://www.tryspeakeasy.io/blog/speech-to-text-api-javascript)
- Do NOT set Content-Type when using FormData — the browser sets the correct multipart boundary automatically — [MDN FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData)

### Inferences
- The Cloudflare Worker acts as the proxy, so no API keys are exposed client-side.
- FormData is preferred because it preserves the file extension, which helps Whisper auto-detect the audio format.

## 6. Silence Detection & Auto-Stop

### Takeaway
Use Web Audio API's AnalyserNode to compute RMS volume in real-time. When RMS stays below a threshold (0.01) for a configurable duration (e.g., 1.5 seconds for flashcards), auto-stop the recording.

### Cited Findings
- The core approach: calculate RMS of audio samples every ~50ms via `requestAnimationFrame`, stop recording when RMS < 0.01 for 3+ seconds — [Pavitra Golchha Blog](https://pavi2410.com/blog/detect-silence-using-web-audio/)
- Uses `getByteTimeDomainData()` from AnalyserNode, normalizes samples, computes `Math.sqrt(sum / data.length)` — [Pavitra Golchha Blog](https://pavi2410.com/blog/detect-silence-using-web-audio/)
- SilenceAwareRecorder library uses configurable silence threshold (-50 dB default) and minimum decibels for FFT (-100 dB) — [GitHub silence-aware-recorder](https://github.com/teunlao/silence-aware-recorder)

### Complete Code Example

```javascript
// === SILENCE DETECTION MODULE ===

function createSilenceDetector(stream, options = {}) {
  const {
    silenceThreshold = 0.01,   // RMS threshold (0-1)
    silenceDuration  = 1500,   // ms of silence before auto-stop
    onSilence        = null,   // callback when silence detected
    onVolume         = null,   // callback with current volume (0-1)
  } = options;

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.fftSize);
  let silenceStart = null;
  let running = true;

  function checkVolume() {
    if (!running) return;

    analyser.getByteTimeDomainData(dataArray);

    // Calculate RMS
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;  // -1 to 1
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);

    // Report volume for UI visualization
    if (onVolume) onVolume(rms);

    if (rms < silenceThreshold) {
      if (!silenceStart) silenceStart = Date.now();
      if (Date.now() - silenceStart >= silenceDuration) {
        if (onSilence) onSilence();
        return; // stop checking
      }
    } else {
      silenceStart = null; // reset on sound
    }

    requestAnimationFrame(checkVolume);
  }

  checkVolume();

  return {
    stop() {
      running = false;
      audioContext.close();
    }
  };
}
```

### Inferences
- For flashcards, 1.5 seconds of silence is a good auto-stop threshold (shorter than the typical 3 seconds used for dictation).
- The `onVolume` callback enables real-time waveform/level visualization in the UI.
- `requestAnimationFrame` is efficient and pauses when the tab is backgrounded, which is fine for flashcard use.

## 7. UX Patterns for Speech-in-Flashcards

### Takeaway
The best pattern for flashcards is tap-to-record with auto-stop on silence, visual volume feedback, and optimistic UI ("Processing..." shown immediately while awaiting STT result).

### Recommended UX Flow

```
Card appears
    |
    v
User taps mic button --> "Listening..." + pulsing animation
    |
    v
MediaRecorder starts + silence detector starts
    |
    v
User speaks (volume bar animates in real-time)
    |
    v
1.5s silence detected --> auto-stop recording
    |                      OR user taps stop button
    v
"Processing..." spinner shown immediately
    |
    v
Audio blob sent to Worker --> Whisper transcribes
    |
    v
Text returned --> compare with expected answer
    |
    v
Show result: correct/incorrect + user's transcription
```

### Complete Integration Example

```html
<!-- Minimal flashcard audio UI — plain HTML, no build step -->
<button id="micBtn" onclick="toggleRecording()">
  🎤 Tap to speak
</button>
<div id="volumeBar" style="width:200px;height:8px;background:#eee;border-radius:4px;">
  <div id="volumeFill" style="width:0%;height:100%;background:#E03131;border-radius:4px;transition:width 50ms;"></div>
</div>
<div id="status"></div>

<script>
const WORKER_URL = 'https://flashcard-stt.YOUR_SUB.workers.dev';

let recorder = null;
let silenceDetector = null;
let isRecording = false;

async function toggleRecording() {
  if (isRecording) {
    stopAndTranscribe();
  } else {
    startRecording();
  }
}

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    video: false
  });

  // Detect best mime type
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find(t => MediaRecorder.isTypeSupported(t)) || '';

  const options = mimeType ? { mimeType } : {};
  const mediaRecorder = new MediaRecorder(stream, options);
  const chunks = [];

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.start(250);
  isRecording = true;
  document.getElementById('micBtn').textContent = '⏹ Tap to stop';
  document.getElementById('status').textContent = 'Listening...';

  // Silence detection
  silenceDetector = createSilenceDetector(stream, {
    silenceThreshold: 0.01,
    silenceDuration: 1500,
    onSilence: () => stopAndTranscribe(),
    onVolume: (rms) => {
      const pct = Math.min(rms * 500, 100); // scale for visibility
      document.getElementById('volumeFill').style.width = pct + '%';
    }
  });

  recorder = { mediaRecorder, chunks, mimeType, stream };
}

async function stopAndTranscribe() {
  if (!recorder || !isRecording) return;
  isRecording = false;

  if (silenceDetector) silenceDetector.stop();
  document.getElementById('micBtn').textContent = '🎤 Tap to speak';
  document.getElementById('status').textContent = 'Processing...';

  const { mediaRecorder, chunks, mimeType, stream } = recorder;

  const blob = await new Promise(resolve => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
    };
    mediaRecorder.stop();
  });

  stream.getTracks().forEach(t => t.stop());

  // Send to Worker
  try {
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');
    const resp = await fetch(WORKER_URL, { method: 'POST', body: formData });
    const result = await resp.json();

    document.getElementById('status').textContent =
      'You said: "' + result.text + '"';
    // Compare result.text with expected answer here
  } catch (err) {
    document.getElementById('status').textContent = 'Error: ' + err.message;
  }
}

// createSilenceDetector function from Section 6 goes here
</script>
```

### Latency Hiding Techniques

1. **Optimistic UI**: Show "Processing..." immediately when recording stops, before the network request completes.
2. **Pre-warm**: Create the AudioContext on page load (after user gesture) so `getUserMedia` is faster on first tap.
3. **Keep-alive**: If using multiple cards in sequence, keep the `AudioContext` alive between recordings (just create new MediaRecorder instances).
4. **Streaming** (advanced): Use `timeslice` in `mediaRecorder.start(250)` and send chunks as they arrive for partial transcription — but Whisper does not support streaming, so this only helps if you switch to a streaming STT API.

### Mobile Considerations

- iOS Safari requires a user gesture (tap) to start `getUserMedia` — auto-record on card appear will NOT work on iOS.
- Android Chrome allows `getUserMedia` after the first permission grant without repeated gestures.
- Always handle permission denial gracefully with a fallback (e.g., type your answer instead).

### Inferences
- Tap-to-record is the only reliable pattern for iOS; auto-record on card appear is blocked by Safari's autoplay/permission policy.
- For a 3-5 second clip on mobile data, the full round-trip (upload + Whisper + response) typically takes 1-3 seconds.
- The volume bar animation provides essential feedback that the mic is "working" — without it, users often think the app is frozen.

## Summary: File Sizes by Format (5-second clip)

| Format | Bitrate | ~Size | Browser Support | Whisper OK? |
|--------|---------|-------|-----------------|-------------|
| webm/opus | 64 kbps | ~40 KB | All modern | Yes |
| webm/opus | 128 kbps | ~80 KB | All modern | Yes |
| mp4/aac | 128 kbps | ~80 KB | Safari <18.4 | Yes |
| WAV 16-bit 16kHz | N/A | ~160 KB | Needs conversion | Yes |
| WAV 16-bit 48kHz | N/A | ~480 KB | Needs conversion | Yes |
