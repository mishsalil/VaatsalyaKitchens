/**
 * Turns receipt text into the bytes an ESC/POS printer understands.
 *
 * WHY NON-ASCII IS REPLACED RATHER THAN SENT. The PT-210, like most 58mm
 * printers, decodes bytes through a CP437-ish code page: it has no idea what
 * UTF-8 is. A Devanagari letterhead sent raw prints as a run of random glyphs,
 * which looks like a broken printer rather than a wrong encoding. A question
 * mark is honest.
 */

const ESC = 0x1b;
const LF = 0x0a;

/** A run of text at one size. Blocks exist because a kitchen ticket mixes a
 *  normal-size header with double-height items. */
export interface Block {
  text: string;
  size?: 'normal' | 'double';
}

/** ESC ! n — bit 4 sets double height. Width is untouched, so a double block
 *  still fits the same column count. */
const SIZE_DOUBLE = [ESC, 0x21, 0x10];
const SIZE_NORMAL = [ESC, 0x21, 0x00];

export function encode(blocks: Block[]): Uint8Array {
  const bytes: number[] = [ESC, 0x40]; // ESC @ — clear any state a previous job left

  for (const block of blocks) {
    if (block.size === 'double') bytes.push(...SIZE_DOUBLE);

    // for..of walks code points, so a surrogate pair is one iteration and
    // cannot be split into two stray bytes.
    for (const ch of block.text) {
      if (ch === '\n') {
        bytes.push(LF);
        continue;
      }
      const code = ch.codePointAt(0) ?? 0x3f;
      bytes.push(code >= 0x20 && code <= 0x7e ? code : 0x3f);
    }

    bytes.push(LF);
    if (block.size === 'double') bytes.push(...SIZE_NORMAL);
  }

  // Feed the last line past the tear bar. This printer has no cutter, so there
  // is no cut command to send.
  bytes.push(LF, LF, LF, LF);

  return new Uint8Array(bytes);
}

/**
 * Base64 for the Capacitor bridge, which is JSON — a byte array would cross as
 * a list of numbers and cost several times the size.
 *
 * Chunked because String.fromCharCode(...bytes) on a whole receipt can exceed
 * the JavaScript engine's argument limit and throw.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
