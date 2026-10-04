# Cloud-Based Free Speech-to-Text APIs for Browser Flashcard App

Use case: static site on GitHub Pages, no traditional backend (Cloudflare Workers OK). Users speak short English phrases (1-5 words, ~3-5 seconds audio).

---

## 1. Cloudflare Workers AI (@cf/openai/whisper)

### Takeaway
Best overall choice for a static site. Truly free daily allocation, no credit card, you control the Worker (so CORS is yours to set), and ~243 minutes/day of free transcription is far more than a flashcard app needs.

### Cited Findings
- Free tier: 10,000 Neurons/day per account, resets at 00:00 UTC. No credit card, no waitlist. Beyond that, $0.011 per 1,000 Neurons. — [Cloudflare Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/index.md)
- `@cf/openai/whisper` costs 41.14 neurons/audio-minute; `@cf/openai/whisper-large-v3-turbo` costs 46.63 neurons/audio-minute. — [Cloudflare Docs: whisper-large-v3-turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)
- At 41 neurons/min, 10,000 neurons ~= 243 minutes/day of free transcription. — [ToolFreebie](https://toolfreebie.com/cloudflare-workers-ai/)
- Price per audio minute: $0.00045 (base Whisper), $0.00051 (Turbo). — [Cloudflare Docs](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)
- For short 3-5 second clips, each request uses roughly 2-4 neurons (minimum 1 second billing), so 10,000 neurons covers thousands of short-phrase requests per day.

### CORS & Browser Integration
- Since YOU write the Cloudflare Worker, you fully control CORS headers. Set `Access-Control-Allow-Origin` to your GitHub Pages domain.
- No API key exposed to the browser -- the Worker acts as a proxy between your static site and the AI model.

### Setup Complexity
- Low-medium. Create a free Cloudflare account, deploy a Worker (~20 lines of code), done. No service account keys, no billing setup.

### Code Example

**Worker (deployed to Cloudflare):**
```javascript
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "https://yourusername.github.io",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const audioBlob = await request.arrayBuffer();
    const result = await env.AI.run("@cf/openai/whisper", {
      audio: [...new Uint8Array(audioBlob)],
    });

    return new Response(JSON.stringify({ text: result.text }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://yourusername.github.io",
      },
    });
  },
};
```

**Browser (static site):**
```javascript
async function transcribeAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  const chunks = [];

  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: "audio/webm" });

    const res = await fetch("https://your-worker.your-subdomain.workers.dev", {
      method: "POST",
      body: blob,
    });
    const { text } = await res.json();
    console.log("Transcribed:", text);
  };

  recorder.start();
  setTimeout(() => recorder.stop(), 4000); // 4 seconds
}
```

### Latency
- Cloudflare runs inference on edge GPUs close to the user. For 3-5 second clips, expect ~1-3 seconds total round-trip (network + inference).

### Gaps
- Exact latency benchmarks for short clips not found in official docs.
- Supported input audio formats not explicitly listed (webm/ogg/wav/mp3 all work in practice based on community reports).

---

## 2. Groq Whisper API

### Takeaway
Extremely fast (LPU hardware), generous free tier (28,800 audio-seconds/day = 480 min), but API key would be exposed in a static site -- needs a proxy (Cloudflare Worker) to be safe.

### Cited Findings
- Free tier (no credit card): 20 requests/min, 2,000 requests/day, 7,200 audio-seconds/hour, 28,800 audio-seconds/day. — [Groq Free Tier](https://pricepertoken.com/endpoints/groq/free); [Groq Docs](https://console.groq.com/docs/speech-to-text)
- Models available: `whisper-large-v3`, `whisper-large-v3-turbo`. — [Groq Docs](https://console.groq.com/docs/speech-to-text)
- File size limit: 25 MB (free tier). — [Spokenly](https://spokenly.app/blog/free-speech-to-text-apis)
- Groq runs on custom LPU (Language Processing Unit) hardware, making it one of the fastest inference providers. — [CloudZero](https://www.cloudzero.com/blog/groq-pricing/)

### CORS & Browser Integration
- No information found confirming CORS headers on Groq's API. SDKs are available for Python, Node.js, C#, PHP but not browser JS.
- API key required in header -- **cannot safely call from browser without a proxy**.

### Setup Complexity
- Medium. Get free API key from console.groq.com. If using from static site, need a Cloudflare Worker or similar proxy to hide the key and handle CORS.

### Code Example (via Cloudflare Worker proxy)
```javascript
// Worker proxy
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "https://yourusername.github.io",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const formData = new FormData();
    const audioBlob = await request.blob();
    formData.append("file", audioBlob, "audio.webm");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "en");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: formData,
    });
    const data = await res.json();

    return new Response(JSON.stringify({ text: data.text }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://yourusername.github.io",
      },
    });
  },
};
```

### Latency
- Groq is known for extremely low inference latency. For short clips, expect sub-second inference time (plus network round-trip).

### Gaps
- No official CORS documentation found.
- Whether Groq's free tier is truly permanent or promotional is unclear from sources.

---

## 3. Web Speech API (Browser Built-in)

### Takeaway
Zero setup, zero cost, no backend needed at all. Works well for short English phrases in Chrome/Edge. The simplest option if you accept the browser-support limitations.

### Cited Findings
- Built into browsers using `SpeechRecognition` (or `webkitSpeechRecognition`). No API key, no cost, no backend. — [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- Browser support: Chrome, Edge, Opera have full support. Safari 14.1+ (macOS) and 14.5+ (iOS) via `webkitSpeechRecognition` prefix. Firefox has it implemented but disabled by default. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- In Chrome, audio is sent to Google's servers for processing (not offline). — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- Real-time streaming results with `interim_results` support. — [F22 Labs](https://www.f22labs.com/blogs/web-speech-api-a-beginners-guide/)

### CORS & Browser Integration
- No CORS issues -- it IS the browser. No external API calls needed from your code.

### Setup Complexity
- Minimal. ~10 lines of JavaScript. No accounts, no keys, no proxy.

### Code Example
```javascript
function recognizeSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition not supported in this browser");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    console.log("Heard:", text);
  };

  recognition.onerror = (event) => {
    console.error("Error:", event.error);
  };

  recognition.start();
  // Automatically stops after silence or call recognition.stop()
}
```

### Latency
- Very low for short phrases. Results typically arrive within 1-2 seconds of speech ending.

### Gaps
- No official rate limits documented, but Google may throttle heavy usage from Chrome.
- Accuracy for non-native English speakers compared to Whisper models is not benchmarked.
- Firefox support remains disabled by default with no clear timeline for enabling it.

---

## 4. Google Cloud Speech-to-Text

### Takeaway
60 free minutes/month is decent for a flashcard app but requires GCP setup with billing account. Cannot call directly from browser (API key exposure + no CORS). Overkill for this use case when simpler options exist.

### Cited Findings
- Free tier: 60 minutes/month for both standard and enhanced models (V1 API only; V2 has no free allowance). — [Google Cloud Pricing](https://cloud.google.com/speech-to-text/pricing)
- New customers also get $300 free credit valid for 90 days. — [Google Cloud Pricing](https://cloud.google.com/speech-to-text/pricing)
- Beyond free tier: $0.006/15 seconds (standard), $0.009/15 seconds (enhanced). — [ConvertAudioToText](https://convertaudiototext.com/blog/google-cloud-speech-to-text-pricing-2026)

### CORS & Browser Integration
- Google Cloud APIs require an API key or OAuth token in the request. Exposing API keys in browser code is a security risk.
- No CORS headers provided for direct browser calls -- a server-side proxy is required.

### Setup Complexity
- High. Requires: Google Cloud account, enabling the API, creating credentials, setting up billing (even for free tier), and a proxy for browser use.

### Latency
- Well-optimized for short clips. Typically 1-2 seconds for 3-5 second audio.

### Gaps
- Whether the 60-min/month free tier will persist in future is not guaranteed.

---

## 5. Deepgram

### Takeaway
$200 free credit (no expiry, no credit card) is extremely generous and covers ~25,000+ minutes. Has a browser-capable WebSocket API. Best for real-time streaming use cases, but API key exposure in browser is a concern.

### Cited Findings
- Free tier: $200 credit, no credit card required, credits don't expire. — [Deepgram Pricing](https://deepgram.com/pricing)
- At pay-as-you-go rates, $200 covers ~25,000+ minutes of transcription. — [TextToLab](https://texttolab.com/blog/deepgram-pricing)
- Nova-3 model available. WebSocket API for real-time streaming. — [Deepgram Docs](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)
- JavaScript SDK available: `@deepgram/sdk`. — [GitHub](https://github.com/deepgram/deepgram-js-sdk)
- Browser WebSocket connection possible: `wss://api.deepgram.com/v1/listen` with API key as WebSocket protocol header. — [Deepgram Blog](https://deepgram.com/learn/live-transcription-mic-browser)

### CORS & Browser Integration
- WebSocket API can be used directly from the browser (WebSocket connections don't have CORS restrictions the same way HTTP does).
- However, the API key is exposed in the WebSocket connection protocol header, which is visible in browser dev tools. For production, Deepgram recommends generating short-lived API keys from a backend.

### Setup Complexity
- Low-medium. Create free account, get API key. For a prototype/personal project, direct browser WebSocket works. For production, need a proxy for key management.

### Code Example (direct browser WebSocket)
```javascript
async function transcribeRealtime() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

  const socket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=nova-3&language=en",
    ["token", "YOUR_DEEPGRAM_API_KEY"]
  );

  socket.onopen = () => {
    recorder.ondataavailable = (e) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(e.data);
      }
    };
    recorder.start(250); // send chunks every 250ms
  };

  socket.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.channel?.alternatives?.[0]?.transcript) {
      console.log("Heard:", data.channel.alternatives[0].transcript);
    }
  };

  // Stop after 4 seconds
  setTimeout(() => {
    recorder.stop();
    stream.getTracks().forEach(t => t.stop());
    socket.close();
  }, 4000);
}
```

### Gaps
- Whether $200 credit is a one-time signup bonus or refreshes is not entirely clear (most sources say one-time, non-expiring).

---

## 6. AssemblyAI

### Takeaway
$50 free credit (~185 hours pre-recorded, ~333 hours streaming) is generous but one-time. Good accuracy, but requires a proxy for browser use. Better suited for longer audio than short flashcard phrases.

### Cited Findings
- Free tier: $50 in credits for new users. Covers ~185 hours pre-recorded or ~333 hours streaming. One-time, not recurring monthly. — [AssemblyAI Pricing](https://www.assemblyai.com/pricing); [CostBench](https://costbench.com/software/ai-transcription-apis/assemblyai/free-plan/)
- Pre-recorded and streaming are separate allowances. — [CompareTiers](https://comparetiers.com/tools/assemblyai)
- Streaming: max 5 new connections per minute on free plan. — [AssemblyAI Pricing](https://www.assemblyai.com/pricing)

### CORS & Browser Integration
- API key required in headers. No direct browser CORS support documented.
- Needs a proxy for browser usage.

### Setup Complexity
- Medium. Create account, get API key. Need proxy for browser.

### Gaps
- Whether free credits have an expiration date is not documented in sources found.

---

## 7. Hugging Face Inference API

### Takeaway
Effectively unusable for this use case in 2026. Free tier reduced to $0.10/month of credit, which covers very few Whisper requests. Not recommended.

### Cited Findings
- Free tier changed to $0.10 of Inference Providers credit per month (not a request count). — [Klymentiev](https://klymentiev.com/blog/huggingface-inference-api)
- Credit is spent at partner providers' own prices. — [TheNeuralBase](https://theneuralbase.com/huggingface-api/learn/beginner/free-tier-limits/)
- Rate limits for free accounts: ~10-20 requests/min for text models, stricter for audio. — [HuggingFace Docs](https://huggingface.co/docs/hub/en/rate-limits)
- Free and anonymous rate limits "change depending on platform health." — [HuggingFace Forums](https://discuss.huggingface.co/t/api-limits-on-free-inference-api/57711/4)

### CORS & Browser Integration
- Inference API does support CORS headers (can be called from browser).
- However, API token exposed in browser.

### Setup Complexity
- Low setup, but the $0.10/month limit makes it impractical.

### Gaps
- Exact number of Whisper requests $0.10 covers is unclear.

---

## 8. Microsoft Azure Speech (F0 Free Tier)

### Takeaway
5 hours/month free is reasonable but Azure account setup is complex. Better for server-side apps than static sites.

### Cited Findings
- F0 (free) tier: 5 audio hours per month, real-time standard transcription only. — [Spokenly](https://spokenly.app/blog/free-speech-to-text-apis)
- Has a JavaScript SDK that can run in the browser. — Microsoft Docs (not directly fetched)

### Setup Complexity
- High. Requires Azure account, resource group, Speech resource creation.

### Gaps
- Whether the browser SDK handles CORS and key exposure gracefully was not confirmed in sources.

---

## Recommendation Matrix for Static Flashcard App

| Service | Free Limit | Recurring? | Needs Proxy? | Setup | Best For |
|---------|-----------|------------|-------------|-------|----------|
| **Web Speech API** | Unlimited | Yes | No | Minimal | Quick MVP, Chrome-only OK |
| **Cloudflare Workers AI** | ~243 min/day | Yes (daily) | N/A (IS the proxy) | Low | Production static site |
| **Groq** | 480 min/day | Yes (daily) | Yes | Medium | Speed-critical, via CF Worker |
| **Deepgram** | $200 one-time | No | Optional* | Low | Real-time streaming |
| **AssemblyAI** | $50 one-time | No | Yes | Medium | Long audio (overkill here) |
| **Google Cloud STT** | 60 min/month | Yes | Yes | High | Enterprise apps |
| **Azure Speech** | 5 hr/month | Yes | Yes | High | Azure-committed orgs |
| **Hugging Face** | $0.10/month | Yes | Optional | Low | Not recommended |

*Deepgram WebSocket works from browser but exposes API key.

### Top Recommendation

**For a static flashcard app on GitHub Pages:**

1. **Start with Web Speech API** -- zero setup, works immediately in Chrome/Edge, perfect for short English phrases. Use as primary with fallback.

2. **Add Cloudflare Workers AI as fallback/upgrade** -- deploy a tiny Worker (free), get reliable Whisper-quality transcription with no API key exposure. The Worker IS your backend, and Cloudflare's free tier (10,000 neurons/day) covers thousands of short-phrase recognitions daily.

3. **Consider Groq via the same CF Worker** -- if you want the fastest inference, route through your CF Worker to Groq's API. 2,000 requests/day free is plenty for personal use.
