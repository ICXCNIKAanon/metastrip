// Keep every media byte at its original offset: stco/co64, fragment and item
// tables can contain absolute positions. Metadata becomes zero-filled free boxes.
const METADATA_BOXES = new Set(["udta", "meta", "uuid"]);
const CONTAINERS = new Set(["moov", "trak", "mdia"]);
const IMAGE_BRANDS = new Set([
  "heic",
  "heix",
  "mif1",
  "hevc",
  "hevx",
  "avif",
  "avis",
]);

export function stripMp4(buffer: ArrayBuffer): ArrayBuffer {
  if (!isMp4(buffer)) throw new Error("Not a valid MP4/MOV file");
  const out = new Uint8Array(buffer.slice(0));
  const view = new DataView(out.buffer);
  const typeAt = (offset: number) =>
    String.fromCharCode(...out.subarray(offset, offset + 4));
  const imageContainer = typeAt(4) === "ftyp" && IMAGE_BRANDS.has(typeAt(8));
  function walk(start: number, end: number, depth = 0) {
    if (depth > 8) throw new Error("Unsupported container nesting");
    let offset = start;
    while (offset < end) {
      if (offset + 8 > end) throw new Error("Truncated media box header");
      let size = view.getUint32(offset);
      const type = typeAt(offset + 4);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) throw new Error("Truncated extended media box");
        size =
          view.getUint32(offset + 8) * 0x100000000 +
          view.getUint32(offset + 12);
        header = 16;
      } else if (size === 0) size = end - offset;
      if (!Number.isSafeInteger(size) || size < header || offset + size > end)
        throw new Error("Invalid media box size");
      if (depth === 0 && imageContainer && type === "meta") {
        throw new Error(
          "HEIC/AVIF image-item metadata cannot be cleaned safely by this browser engine. Your original file is unchanged. Use a format-aware local editor.",
        );
      }
      if (METADATA_BOXES.has(type)) {
        out.set([0x66, 0x72, 0x65, 0x65], offset + 4); // free
        out.fill(0, offset + header, offset + size);
      } else if (CONTAINERS.has(type)) {
        walk(offset + header, offset + size, depth + 1);
      }
      offset += size;
    }
  }
  walk(0, out.length);
  return out.buffer;
}

export function isMp4(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer);
  const type = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
  return ["ftyp", "moov", "mdat", "wide", "free"].includes(type);
}
