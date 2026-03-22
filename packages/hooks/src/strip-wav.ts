/**
 * WAV binary metadata stripper (Node.js port).
 *
 * Removes LIST/INFO, id3, bext, JUNK, and PAD chunks from a WAV (RIFF/WAVE)
 * file. Audio data (fmt + data chunks) is NEVER modified.
 * RIFF file size header is recalculated after stripping.
 */

function fourCC(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
}

const CC_RIFF = fourCC('RIFF');
const CC_WAVE = fourCC('WAVE');
const CC_LIST = fourCC('LIST');
const CC_INFO = fourCC('INFO');

const REMOVE_CHUNKS = new Set<number>([
  fourCC('id3 '),
  fourCC('bext'),
  fourCC('JUNK'),
  fourCC('PAD '),
]);

export interface StripWavResult {
  output: Buffer;
  categories: string[];
}

export function isWav(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const view = new DataView(ab);
  return view.getUint32(0, true) === CC_RIFF && view.getUint32(8, true) === CC_WAVE;
}

export function stripWav(input: Buffer): StripWavResult {
  if (!isWav(input)) {
    throw new Error('Input is not a valid WAV: missing RIFF/WAVE header');
  }

  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  const src = new Uint8Array(ab);
  const view = new DataView(ab);

  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

  const ranges: Array<[number, number]> = [];
  ranges.push([0, 12]);

  let offset = 12;
  while (offset < ab.byteLength) {
    if (offset + 8 > ab.byteLength) break;

    const cc = view.getUint32(offset, true);
    const chunkDataSize = view.getUint32(offset + 4, true);
    const paddedDataSize = chunkDataSize + (chunkDataSize & 1);
    const chunkEnd = offset + 8 + paddedDataSize;
    const safeEnd = Math.min(chunkEnd, ab.byteLength);

    if (cc === CC_LIST) {
      if (offset + 12 <= ab.byteLength) {
        const listType = view.getUint32(offset + 8, true);
        if (listType === CC_INFO) {
          addCategory('text metadata');
          offset = safeEnd;
          continue;
        }
      }
      ranges.push([offset, safeEnd]);
    } else if (REMOVE_CHUNKS.has(cc)) {
      addCategory('ID3 tags');
      offset = safeEnd;
      continue;
    } else {
      ranges.push([offset, safeEnd]);
    }

    offset = safeEnd;
  }

  const totalSize = ranges.reduce((acc, [s, e]) => acc + (e - s), 0);
  const out = new Uint8Array(totalSize);
  let outOffset = 0;
  for (const [start, end] of ranges) {
    out.set(src.subarray(start, end), outOffset);
    outOffset += end - start;
  }

  new DataView(out.buffer).setUint32(4, totalSize - 8, true);

  return { output: Buffer.from(out.buffer, out.byteOffset, out.byteLength), categories };
}
