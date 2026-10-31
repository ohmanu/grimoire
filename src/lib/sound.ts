// Sonidos mágicos generados con Web Audio: sin archivos, nada que cargar.
// Se pueden silenciar desde el menú «⋯»; la preferencia se recuerda.

const STORAGE_KEY = "grimoire.sound";

let ctx: AudioContext | null = null;
let reverb: ConvolverNode | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Sin almacenamiento local, la preferencia dura lo que la sesión.
  }
}

/** Contexto de audio y un eco de cripta (respuesta de ruido que decae). */
function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
    const length = ctx.sampleRate * 2.6;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
    }
    reverb = ctx.createConvolver();
    reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    reverb.connect(wet).connect(ctx.destination);
  }
  void ctx.resume();
  return ctx;
}

function output(ac: AudioContext, dry = 0.7): GainNode {
  const gain = ac.createGain();
  gain.gain.value = dry;
  gain.connect(ac.destination);
  if (reverb) gain.connect(reverb);
  return gain;
}

/** Campana: fundamental más parciales inarmónicos que se apagan antes. */
function bell(ac: AudioContext, freq: number, at: number, duration: number, volume: number) {
  const dest = output(ac);
  for (const [ratio, amp] of [
    [1, 1],
    [2.76, 0.35],
    [5.4, 0.12],
    [8.93, 0.05],
  ]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.value = freq * ratio;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume * amp, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration / ratio ** 0.4);
    osc.connect(gain).connect(dest);
    osc.start(at);
    osc.stop(at + duration);
  }
}

const note = (semitones: number) => 440 * 2 ** (semitones / 12);

/** Libro creado: un zumbido grave que se abre en destellos (punto de guardado). */
export function playBookCreated() {
  if (!soundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  const at = ac.currentTime + 0.02;
  const dest = output(ac, 0.8);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.18, at + 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
  gain.connect(dest);
  for (const freq of [110, 165]) {
    const osc = ac.createOscillator();
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + 1.7);
  }
  [12, 19, 24, 28, 31].forEach((s, i) => bell(ac, note(s + 3), at + 0.3 + i * 0.05, 1.4, 0.09));
}

/** Sigil añadido: una gota de maná, una nota breve que sube. */
export function playSigilAdded() {
  if (!soundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  const at = ac.currentTime + 0.01;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.setValueAtTime(note(19), at);
  osc.frequency.exponentialRampToValueAtTime(note(26), at + 0.12);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.2, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
  osc.connect(gain).connect(output(ac));
  osc.start(at);
  osc.stop(at + 0.7);
}
