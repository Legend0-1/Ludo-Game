/**
 * Web Audio sound effects for LUDO.
 * Lazy-instantiated AudioContext — survives React re-renders.
 * The dice roll uses the user-supplied MP3 sample; the rest are synthesized.
 */

let audioCtx: AudioContext | null = null;
let diceAudioBuffer: AudioBuffer | null = null;
let diceBufferLoading: Promise<AudioBuffer | null> | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Preload the dice MP3 into an AudioBuffer for low-latency playback. */
async function loadDiceBuffer(): Promise<AudioBuffer | null> {
  const ac = getCtx();
  if (!ac) return null;
  if (diceAudioBuffer) return diceAudioBuffer;
  if (diceBufferLoading) return diceBufferLoading;
  diceBufferLoading = (async () => {
    try {
      const res = await fetch("/sounds/dice.mp3");
      const arr = await res.arrayBuffer();
      diceAudioBuffer = await ac.decodeAudioData(arr);
      return diceAudioBuffer;
    } catch {
      return null;
    }
  })();
  return diceBufferLoading;
}

/** Play the user-supplied dice MP3 sample. Falls back to synth on failure. */
function playDiceSample(): void {
  const ac = getCtx();
  if (!ac) return;
  if (diceAudioBuffer) {
    try {
      const src = ac.createBufferSource();
      src.buffer = diceAudioBuffer;
      const gain = ac.createGain();
      gain.gain.value = 0.7;
      src.connect(gain);
      gain.connect(ac.destination);
      src.start();
      return;
    } catch {
      // fall through to synth
    }
  }
  playDiceSynth();
}

/** Synthesized dice fallback (used if MP3 fails to load). */
function playDiceSynth(): void {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(200, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.1);
  gain.gain.setValueAtTime(0.08, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.12);
}

export type SoundType = "dice" | "move" | "capture" | "home" | "win";

export function playSound(type: SoundType): void {
  const ac = getCtx();
  if (!ac) return;
  try {
    switch (type) {
      case "dice": {
        playDiceSample();
        break;
      }
      case "move": {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, ac.currentTime);
        gain.gain.setValueAtTime(0.04, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + 0.06);
        break;
      }
      case "capture": {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(400, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ac.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + 0.3);
        break;
      }
      case "home": {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(523, ac.currentTime);
        osc.frequency.setValueAtTime(659, ac.currentTime + 0.1);
        osc.frequency.setValueAtTime(784, ac.currentTime + 0.2);
        gain.gain.setValueAtTime(0.08, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + 0.35);
        break;
      }
      case "win": {
        [523, 659, 784, 1047].forEach((freq, i) => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.connect(g);
          g.connect(ac.destination);
          o.type = "sine";
          o.frequency.setValueAtTime(freq, ac.currentTime + i * 0.15);
          g.gain.setValueAtTime(0.08, ac.currentTime + i * 0.15);
          g.gain.exponentialRampToValueAtTime(
            0.001,
            ac.currentTime + i * 0.15 + 0.4,
          );
          o.start(ac.currentTime + i * 0.15);
          o.stop(ac.currentTime + i * 0.15 + 0.4);
        });
        break;
      }
    }
  } catch {
    // no-op — audio is best-effort
  }
}

/** Prime the AudioContext + preload the dice sample after a user gesture. */
export function primeAudio(): void {
  getCtx();
  loadDiceBuffer();
}
