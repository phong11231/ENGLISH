# Local/In-Browser Speech-to-Text Solutions for Flashcard App

## 1. Transformers.js with Whisper

### Takeaway
Transformers.js is the most mature and actively maintained option for client-side Whisper inference in the browser. The whisper-tiny model is ~40MB (quantized) to ~120MB (hybrid fp32 encoder + quantized decoder), processes short phrases faster than real-time on desktop, but has notable latency on mobile and no WebGPU on iOS Safari.

### Cited Findings
- Whisper-tiny model download is approximately 39-40MB for the fully quantized ONNX version — [AssemblyAI Blog](https://www.assemblyai.com/blog/offline-speech-recognition-whisper-browser-node-js)
- With hybrid quantization (fp32 encoder + quantized decoder), sizes are: Tiny ~120MB, Base ~210MB, Small ~590MB — [OfflineTTS Guide](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)
- The `whisper-tiny.en` model (English-only) is hosted on Hugging Face and loadable via CDN — [HuggingFace Model Card](https://huggingface.co/Xenova/whisper-tiny.en)
- WebGPU provides "5-10x speedup over WASM for Whisper inference" according to the OfflineTTS guide — [OfflineTTS Guide](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)
- However, real benchmarks on Mac Mini M2 showed WASM was actually FASTER than WebGPU for Whisper (4.9s vs 9.6s for 60s audio with fp32+fp32 config) — [GitHub Issue #894](https://github.com/huggingface/transformers.js/issues/894)
- WebGPU browser support: Chrome/Edge 113+; Safari: not supported as of 2026; Firefox: experimental only; Linux Chrome requires special flags — [OfflineTTS Guide](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)
- iOS Safari lacks WebGPU support entirely, making WASM fallback essential for Apple devices — [OfflineTTS Guide](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)
- Processing speed with WebGPU: Tiny model = 10-15x real-time factor (i.e., 1 second of audio processed in ~0.07-0.1 seconds) — [OfflineTTS Guide](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)
- Audio must be resampled to 16kHz mono PCM before processing — [AssemblyAI Blog](https://www.assemblyai.com/blog/offline-speech-recognition-whisper-browser-node-js)
- A 22M parameter model in INT8 uses about 25-30MB for weights alone; total runtime allocation is higher — [SitePoint WebGPU vs WebASM Benchmarks](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/)
- "Browser-based inference is significantly slower than server-based processing, especially on lower-powered devices" — [AssemblyAI Blog](https://www.assemblyai.com/blog/offline-speech-recognition-whisper-browser-node-js)
- Recommended architecture: run inference in a dedicated Web Worker to keep the main thread responsive — [OfflineTTS Guide](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)
- Moonshine-tiny (alternative to Whisper-tiny, 27M parameters, ~50MB) was used in a browser STT demo with 800ms polling intervals — [Blog: rasc.ch](https://blog.rasc.ch/2025/01/transformers-js-speech.html)

### CDN Loading

Load transformers.js from CDN (no bundler needed):
```html
<script type="module">
  import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
  const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  // transcriber(audioData) returns {text: "..."}
</script>
```
Models are fetched from Hugging Face CDN automatically on first use and cached in the browser (IndexedDB/Cache API). Configuration:
```javascript
window.env = { TRANSFORMERS_CACHE: undefined, USE_REMOTE_MODELS: true };
```

### Code Example (Record + Transcribe)
```javascript
import { pipeline } from '@huggingface/transformers';

// 1. Load model (cached after first download)
const transcriber = await pipeline(
  'automatic-speech-recognition',
  'Xenova/whisper-tiny.en',
  { device: 'wasm' } // or 'webgpu' if supported
);

// 2. Record audio via MediaRecorder
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream);
const chunks = [];
recorder.ondataavailable = e => chunks.push(e.data);
recorder.start();

// 3. Stop after user finishes speaking
setTimeout(() => recorder.stop(), 3000); // or use VAD

recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const arrayBuffer = await blob.arrayBuffer();

  // 4. Decode to PCM 16kHz mono
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const float32 = audioBuffer.getChannelData(0);

  // 5. Transcribe
  const result = await transcriber(float32);
  console.log(result.text); // "hello world"
};
```

### Real-Time vs Batch
- Whisper processes audio AFTER recording stops (batch mode). It cannot do streaming/real-time partial results.
- For short phrases (1-5 words, ~1-3 seconds), the tiny model processes in under 1 second on modern desktop hardware via WASM.

### Inferences
- For a flashcard app with 1-5 word answers, whisper-tiny.en (English-only, ~40MB) is the sweet spot: small enough for mobile download, accurate enough for short phrases.
- WASM is the safer default backend because WebGPU support is fragmented (no Safari, experimental Firefox). On Apple Silicon Macs, WASM may actually be faster than WebGPU.
- On mobile (Android Chrome), expect 1-3 second processing time for a 2-3 second recording with the tiny model via WASM. Acceptable for flashcard use.
- The ~40MB initial download is a one-time cost (cached in browser). Show a progress bar during first load.

### Gaps
- No published latency benchmarks specifically for Android Chrome on mid-range phones.
- Exact memory usage on mobile devices (peak RAM during inference) not documented in sources found.
- Whether Safari on iOS can run WASM-based Whisper at acceptable speed is unclear — WASM works but performance data for iOS is sparse.


## 2. Vosk (vosk-browser)

### Takeaway
Vosk-browser provides real-time streaming speech recognition in the browser via WASM with very small English models (~40MB). The original vosk-browser package appears lightly maintained, but Vosklet (a modern fork/rewrite) is actively maintained and impressively lightweight at 614KB runtime.

### Cited Findings
- vosk-browser provides in-browser speech recognition of microphone input or audio files in 13 languages — [vosk-browser npm](https://www.npmjs.com/package/vosk-browser)
- vosk-model-small-en-us-0.15 is only 40MB — [Vosk Models](https://alphacephei.com/vosk/models)
- Vosk provides "zero-latency response with streaming API" — [VideoSDK Vosk Guide](https://www.videosdk.live/developer-hub/stt/vosk-speech-recognition)
- Vosklet is a "fast, lightweight, actively maintained speech recognizer in the browser with total brotlied size of under a megabyte (614 KB)" — [GitHub Vosklet](https://github.com/msqr1/Vosklet)
- Vosk models are small (50 MB) but provide continuous large vocabulary transcription — [VideoSDK Vosk Guide](https://www.videosdk.live/developer-hub/stt/vosk-speech-recognition)
- CDN usage: vosk-browser can be loaded via jsdelivr CDN, accessible via the global variable `Vosk` — [vosk-browser npm](https://www.npmjs.com/package/vosk-browser)
- Live demo available at ccoreilly.github.io/vosk-browser — [Vosk-Browser Demo](https://ccoreilly.github.io/vosk-browser/)

### Inferences
- Vosk is the best option for REAL-TIME (streaming) recognition in the browser. Unlike Whisper, it can give partial results as the user speaks.
- The 40MB English model is comparable in download size to Whisper-tiny but with real-time streaming capability.
- Vosklet (614KB WASM binary + 40MB model) is a promising modern alternative to the original vosk-browser.
- Accuracy for short English phrases is likely good enough for flashcard use, though Whisper generally has lower word error rates on benchmarks.

### Gaps
- No direct accuracy comparison (WER) between Vosk small English model and Whisper-tiny for short phrases.
- vosk-browser npm page returned 403; last publish date and maintenance status could not be confirmed directly.
- Mobile (Android Chrome) performance benchmarks for vosk-browser not found.


## 3. Sherpa-ONNX / onnxruntime-web

### Takeaway
Sherpa-onnx has full WASM/browser support for streaming and non-streaming ASR with multiple model options. It is actively maintained (v1.13.8, September 2026) and supports a wide range of models, but model sizes tend to be larger (80MB+) and setup is more complex than transformers.js.

### Cited Findings
- Sherpa-onnx supports WebAssembly deployment for speech-to-text, text-to-speech, VAD, speaker diarization, and more — [GitHub sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
- The streaming zipformer bilingual zh-en model is approximately 80MB — [DeepWiki sherpa-onnx](https://deepwiki.com/k2-fsa/sherpa-onnx/6.3-webassembly-deployment)
- X-ASR runtime files total 169MB for INT8 or 615MB for FP32 — [GitHub PR moeru-ai/sherpaw](https://github.com/moeru-ai/sherpaw/pull/15)
- Initial WASM heap size can be set to 512MB for large models, with memory growth allowed — [DeepWiki sherpa-onnx](https://deepwiki.com/k2-fsa/sherpa-onnx/6.3-webassembly-deployment)
- Latest version 1.13.8, last published 16 days ago (as of September 2026) — [npm sherpa-onnx](https://www.npmjs.com/package/sherpa-onnx)
- Supports streaming ASR models (Paraformer, Zipformer) that can give results as audio arrives — [GitHub sherpa-onnx wasm](https://github.com/k2-fsa/sherpa-onnx/tree/master/wasm)

### Inferences
- Sherpa-onnx is more feature-rich than vosk-browser (VAD, speaker ID, etc.) but also heavier.
- For a simple flashcard app, the complexity and model sizes may be overkill compared to transformers.js or Vosk.
- The streaming capability with Paraformer/Zipformer models is valuable if real-time feedback is needed.
- The 80MB+ model sizes are a concern for mobile users on slower connections.

### Gaps
- No browser-specific benchmark data found (latency, memory usage on mobile).
- Exact English-only small model sizes for browser WASM deployment not documented in sources found.
- Browser compatibility matrix not found in documentation.


## 4. Mozilla DeepSpeech / Coqui STT

### Takeaway
Both Mozilla DeepSpeech and Coqui STT are discontinued and should not be used for new projects. Whisper has effectively replaced both.

### Cited Findings
- Mozilla formally discontinued DeepSpeech in June 2025, archiving the GitHub repository — [GitHub DeepSpeech Issues](https://github.com/MainRo/deepspeech-server/issues/41)
- Coqui STT is no longer actively maintained; Coqui ended operations fully in early 2024 — [GitHub Coqui STT](https://github.com/coqui-ai/STT)
- "OpenAI Whisper emerged as the leading open-source alternative after DeepSpeech's discontinuation" — [Picovoice Blog](https://picovoice.ai/blog/top-transcription-engines/)

### Inferences
- Do not consider DeepSpeech or Coqui STT for new projects in 2026. Both are abandoned.
- Any existing browser implementations of these tools will have unpatched security/compatibility issues.

### Gaps
- None significant; the conclusion is clear.


## 5. Picovoice Leopard/Cheetah

### Takeaway
Picovoice Leopard (batch) and Cheetah (streaming) both have browser/Web SDKs with good accuracy, but the free tier was discontinued on June 30, 2026, replaced by a 7-day free trial. This makes them unsuitable for a free/hobby project unless you pay.

### Cited Findings
- Leopard offers browser-based speech-to-text with 11% WER; Cheetah streaming has 14.34% WER — [Picovoice Docs](https://picovoice.ai/docs/leopard/)
- Leopard supports Chrome, Chromium-based browsers, Edge, Firefox, and Safari — [Picovoice Docs](https://picovoice.ai/docs/leopard/)
- Picovoice discontinued its Free Tier, moving to a 7-day Free Trial as of June 30, 2026 — [Hacker News](https://news.ycombinator.com/item?id=48248969)
- The previous free tier allowed up to 3 active users per month, not based on hours — [SpotSaaS Picovoice Pricing](https://www.spotsaas.com/product/picovoice/pricing)
- Requires an AccessKey from Picovoice Console — [Picovoice Docs](https://picovoice.ai/docs/leopard/)
- Supports 8 languages: English, French, German, Italian, Japanese, Korean, Portuguese, Spanish — [Picovoice Docs](https://picovoice.ai/docs/leopard/)

### Inferences
- Without a free tier (as of mid-2026), Picovoice is not viable for a free static GitHub Pages flashcard app.
- The AccessKey requirement means it's not truly "serverless" — Picovoice servers validate the key.
- If budget allows, Cheetah's streaming capability and cross-browser support (including Safari) make it a strong commercial option.

### Gaps
- Exact model download sizes for the browser SDK not found.
- Pricing details for paid tiers not investigated in depth.


## 6. Web Speech API Workarounds

### Takeaway
The Web Speech API (SpeechRecognition) is the simplest option requiring zero downloads, but it has critical limitations: Chrome sends audio to Google servers (not local), Firefox has no support at all, Safari is partial/inconsistent on iOS, and Chrome has undocumented rate limiting. For a flashcard app with short phrases, the 60-second timeout is irrelevant, but the server dependency and browser gaps are dealbreakers if "fully client-side" is required.

### Cited Findings
- Chrome has a 60 second timeout in the Web Speech API with no way to increase it — [Chromium Discussion](https://groups.google.com/a/chromium.org/g/chromium-html5/c/s2XhT-Y5qAc)
- Firefox: no support for Web Speech API recognition (desktop or mobile) — [VocaFuse Blog](https://vocafuse.com/blog/web-speech-api-vs-cloud-apis/)
- Safari desktop: full support. Safari mobile (iOS): limited, "inconsistent on iOS (especially in background tabs)" — [VocaFuse Blog](https://vocafuse.com/blog/web-speech-api-vs-cloud-apis/)
- Chrome's Web Speech API has "undocumented rate limiting from Google" creating "unpredictable user experience" — [VocaFuse Blog](https://vocafuse.com/blog/web-speech-api-vs-cloud-apis/)
- Feature detection and fallbacks needed for ~30-40% of users — [VocaFuse Blog](https://vocafuse.com/blog/web-speech-api-vs-cloud-apis/)
- Auto-restart in the `onend` handler can work around the 60-second timeout for continuous listening — [VocaFuse Blog](https://vocafuse.com/blog/web-speech-api-vs-cloud-apis/)
- W3C held a "New Features & Future Directions" meeting for Web Speech API in November 2025, suggesting ongoing standardization work — [W3C Minutes](https://www.w3.org/2025/11/12-web-speech-api-minutes.html)

### Rate Limiting Workarounds
- **For flashcards specifically:** The rate limiting is unlikely to be a problem because users make discrete, short requests with natural pauses between cards. Rate limiting primarily affects continuous/long-running sessions.
- **Auto-restart pattern:** Call `recognition.start()` again in the `onend` handler. This works for the timeout but doesn't help with rate limiting.
- **No known workaround** for avoiding Google's server-side rate limiting in Chrome. The audio IS sent to Google servers — this is NOT a local solution.

### Inferences
- The Web Speech API is NOT a local/client-side solution in Chrome — it sends audio to Google servers. Only Safari's implementation runs locally (via Siri).
- For a flashcard app targeting Android Chrome primarily, the Web Speech API is the easiest "just works" option if you accept the server dependency and rate-limiting risk.
- The 60-second timeout is irrelevant for 1-5 word phrases.
- Consider using Web Speech API as a fast fallback, with transformers.js/Whisper as the primary "truly local" option.

### Gaps
- Exact rate-limiting thresholds for Chrome's Web Speech API are undocumented and could not be determined.
- Whether Android Chrome's Web Speech API implementation differs from desktop Chrome's regarding rate limits is unknown.


## Recommendation Summary for Flashcard App

| Solution | Download | Real-time | Truly Local | Mobile OK | Maintained | Best For |
|----------|----------|-----------|-------------|-----------|------------|----------|
| **transformers.js + Whisper-tiny.en** | ~40MB | No (batch) | Yes | Yes (WASM) | Yes | Best accuracy, simple setup |
| **Vosk-browser / Vosklet** | ~40MB model + <1MB runtime | Yes (streaming) | Yes | Likely | Vosklet: yes | Real-time feedback while speaking |
| **Sherpa-onnx WASM** | 80MB+ | Yes (streaming) | Yes | Possible | Yes | Advanced features (VAD, etc.) |
| **DeepSpeech / Coqui** | N/A | N/A | N/A | N/A | **Dead** | Nothing (discontinued) |
| **Picovoice** | Unknown | Yes (Cheetah) | Inference yes, key validation no | Yes | Yes | Commercial projects with budget |
| **Web Speech API** | 0 | Yes | **No** (Chrome sends to Google) | Yes | Browser-dependent | Quick prototype, accept server dependency |

**Top recommendation for the flashcard use case:** transformers.js with `Xenova/whisper-tiny.en`. The 40MB one-time download is acceptable, batch processing is fine for short phrases (user presses stop, gets result in <1s on desktop, 1-3s on mobile), it's truly local/private, works on Android Chrome via WASM, and the library is well-maintained by Hugging Face. Use a Web Worker to keep the UI responsive during inference.

**Runner-up:** Vosklet for real-time streaming feedback (show partial text as user speaks), with the caveat of less community documentation.
