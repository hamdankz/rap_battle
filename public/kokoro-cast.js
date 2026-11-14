// Robo Rhyme Royale: optional browser-side Kokoro preset voice cast.
// Load as a classic script before the game code that uses window.KokoroCast.
(() => {
  'use strict';

  const ids = [
    'af_heart', 'af_bella', 'af_nicole', 'af_kore', 'af_sarah',
    'am_fenrir', 'am_michael', 'am_puck',
    'bf_emma', 'bf_alice', 'bf_isabella',
    'bm_george', 'bm_fable', 'bm_lewis'
  ];

  const CAST = Object.freeze(ids.map((id) => {
    const [accent, ...parts] = id.split('_');
    const name = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    const region = accent.startsWith('a') ? 'American' : 'British';
    const voiceType = accent.endsWith('f') ? 'female' : 'male';
    return Object.freeze({ id, name, label: `${name} (${region} ${voiceType})` });
  }));

  let tts = null;
  let loading = null;
  let loadError = null;
  const statusListeners = new Set();

  function notify(status) {
    for (const listener of statusListeners) {
      try { listener(status); } catch (error) { console.warn('Kokoro status listener failed:', error); }
    }
  }

  function voiceFor(index) {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError('Voice index must be a non-negative integer');
    }
    return CAST[index % CAST.length];
  }

  async function ensure(onStatus) {
    if (typeof onStatus === 'function') statusListeners.add(onStatus);
    try {
      if (loadError) throw loadError;
      if (tts) return tts;
      if (!loading) {
        loading = (async () => {
          notify({ status: 'loading', message: 'Loading Kokoro voice engine' });
          // Some Safari/browser +esm dependency builds fail with
          // `self is not an Object (evaluating '"caches" in self')`.
          // Try a separately bundled CDN if the first route fails.
          const sources = [
            'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
            'https://esm.sh/kokoro-js@1.2.1?bundle'
          ];
          let instance, lastError;
          for (const source of sources) {
            try {
              notify({ status: 'loading', message: 'Loading voice engine from ' + new URL(source).host });
              const { KokoroTTS } = await import(source);
              if (!KokoroTTS) throw new Error('KokoroTTS export missing');
              instance = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
                dtype: 'q8',
                device: 'wasm',
                progress_callback: (progress) => notify(progress)
              });
              break;
            } catch (error) {
              lastError = error;
              console.warn('Kokoro loading attempt failed:', source, error);
            }
          }
          if (!instance) throw new Error('Both browser model loaders failed: ' + (lastError?.message || 'unknown error'));
          tts = instance;
          notify({ status: 'ready', message: 'Kokoro voices ready' });
          return instance;
        })().catch((error) => {
          loadError = error instanceof Error ? error : new Error(String(error));
          notify({ status: 'error', message: loadError.message });
          throw loadError;
        });
      }
      return await loading;
    } finally {
      if (typeof onStatus === 'function') statusListeners.delete(onStatus);
    }
  }

  async function speakWav(text, voiceId) {
    if (!CAST.some((voice) => voice.id === voiceId)) {
      throw new RangeError(`Unknown Kokoro voice: ${voiceId}`);
    }
    const engine = await ensure();
    const audio = await engine.generate(String(text ?? '').slice(0, 400), {
      voice: voiceId,
      speed: 1
    });
    if (typeof audio.toBlob === 'function') {
      const blob = audio.toBlob();
      if (blob instanceof Blob) return blob;
    }
    if (typeof audio.toWav === 'function') {
      return new Blob([audio.toWav()], { type: 'audio/wav' });
    }
    throw new Error('Kokoro returned audio in an unsupported format');
  }

  window.KokoroCast = Object.freeze({ CAST, voiceFor, ensure, speakWav });
})();
