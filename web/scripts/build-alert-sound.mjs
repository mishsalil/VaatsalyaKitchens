/**
 * Generates the urgent-order alert tone the Android app plays.
 *
 * WHY GENERATED, NOT DOWNLOADED. The alert has to be distinctive enough that
 * counter staff know what it is without looking, and it has to be ours to
 * ship — a ringtone lifted from somewhere else is a licensing problem on an
 * app you distribute. So it is synthesized here: a triple beep, then a gap,
 * which loops into an unmistakable "beep-beep-beep … beep-beep-beep".
 *
 * Loud without being harsh: a 1318 Hz tone (E6) sits in the range a phone
 * speaker reproduces best and carries across a noisy kitchen, and each beep is
 * enveloped so it does not click at the edges.
 *
 * Run: node scripts/build-alert-sound.mjs
 * Out: android/app/src/main/res/raw/order_alert.wav
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const FREQ = 1318;      // E6
const BEEP_MS = 130;
const GAP_MS = 70;      // between beeps in a burst
const TAIL_MS = 620;    // silence before the burst repeats
const BEEPS = 3;
const ENVELOPE_MS = 8;  // fade in/out, so each beep starts and ends clean

function samples(ms) {
  return Math.round((ms / 1000) * RATE);
}

const total = BEEPS * samples(BEEP_MS) + (BEEPS - 1) * samples(GAP_MS) + samples(TAIL_MS);
const pcm = new Int16Array(total);

let cursor = 0;
for (let b = 0; b < BEEPS; b++) {
  const n = samples(BEEP_MS);
  const env = samples(ENVELOPE_MS);
  for (let i = 0; i < n; i++) {
    // Fade the first and last few milliseconds to avoid an audible click.
    let gain = 1;
    if (i < env) gain = i / env;
    else if (i > n - env) gain = (n - i) / env;
    const t = i / RATE;
    pcm[cursor + i] = Math.round(Math.sin(2 * Math.PI * FREQ * t) * 32767 * 0.9 * gain);
  }
  cursor += n;
  if (b < BEEPS - 1) cursor += samples(GAP_MS); // gap stays zeroed
}
// TAIL_MS remains zeroed — the pause that makes the loop read as a pattern.

const dataBytes = pcm.length * 2;
const buf = Buffer.alloc(44 + dataBytes);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);          // PCM header size
buf.writeUInt16LE(1, 20);           // format = PCM
buf.writeUInt16LE(1, 22);           // mono
buf.writeUInt32LE(RATE, 24);
buf.writeUInt32LE(RATE * 2, 28);    // byte rate
buf.writeUInt16LE(2, 32);           // block align
buf.writeUInt16LE(16, 34);          // bits per sample
buf.write('data', 36);
buf.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < pcm.length; i++) {
  buf.writeInt16LE(pcm[i], 44 + i * 2);
}

const out = fileURLToPath(new URL('../android/app/src/main/res/raw/order_alert.wav', import.meta.url));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(
  `build-alert-sound: wrote ${out} — ${(buf.length / 1024).toFixed(1)} KB, ` +
    `${(total / RATE).toFixed(2)}s loop, ${BEEPS} beeps at ${FREQ} Hz`
);
