import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stripJpeg } from "../strip-jpeg";
import { stripWebp } from "../strip-webp";
import { stripMp4 } from "../strip-mp4";
import { stripPdf } from "../strip-pdf";
import { isSvg } from "../strip-svg";
import { injectFakeMetadataJpeg } from "../inject-jpeg";
import { injectFakeMetadataWebp } from "../inject-webp";
import { analyzeBuffer } from "../metadata";
import { validateFiles, uniqueDownloadNames } from "../file-input";

function box(type: string, data: Uint8Array, extended = false) {
  const header = extended ? 16 : 8;
  const bytes = new Uint8Array(header + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, extended ? 1 : bytes.length);
  bytes.set(new TextEncoder().encode(type), 4);
  if (extended) view.setBigUint64(8, BigInt(bytes.length));
  bytes.set(data, header);
  return bytes;
}
function join(...chunks: Uint8Array[]): ArrayBuffer {
  const bytes = new Uint8Array(
    chunks.reduce((size, chunk) => size + chunk.length, 0),
  );
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.length;
  }
  return bytes.buffer;
}
const text = (value: string) => new TextEncoder().encode(value);
const fake = {
  gps: { lat: 48.8584, lon: 2.2945, name: "Test" },
  device: { make: "Test", model: "Fixture" },
  dateTime: "2026:01:01 12:00:00",
};

describe("real media and privacy regressions", () => {
  it("preserves real WebP transparency, ICC profile and decoded pixels while removing XMP", async () => {
    const original = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 4,
        background: { r: 40, g: 80, b: 120, alpha: 0.3 },
      },
    })
      .webp({ lossless: true })
      .withIccProfile("srgb")
      .toBuffer();
    const injected = injectFakeMetadataWebp(
      new Uint8Array(original).buffer,
      fake,
    );
    const cleaned = stripWebp(injected);
    const before = await sharp(original).ensureAlpha().raw().toBuffer();
    expect(
      await sharp(Buffer.from(cleaned)).ensureAlpha().raw().toBuffer(),
    ).toEqual(before);
    const metadata = await sharp(Buffer.from(cleaned)).metadata();
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.icc).toBeDefined();
    expect(metadata.xmp).toBeUndefined();
    expect(new Uint8Array(cleaned)[20] & 0x30).toBe(0x30); // ICC 0x20 + alpha 0x10
    expect(new Uint8Array(cleaned)[20] & 0x0c).toBe(0); // EXIF 0x08 + XMP 0x04
  });

  it("inspects XMP in a worker environment and escapes custom XML values", async () => {
    const original = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#123456" },
    })
      .jpeg()
      .toBuffer();
    const replacement = {
      ...fake,
      device: { make: 'A&B "Camera"', model: "<Fixture>" },
    };
    const injected = injectFakeMetadataJpeg(
      new Uint8Array(original).buffer,
      replacement,
    );
    const analysis = await analyzeBuffer(injected, "example.jpg");
    expect(analysis.riskScore).toBeGreaterThan(0);
    expect(analysis.entries.find((entry) => entry.key === "Make")?.value).toBe(
      replacement.device.make,
    );
    expect(analysis.entries.find((entry) => entry.key === "Model")?.value).toBe(
      replacement.device.model,
    );
    expect(analysis.gps?.lat).toBeCloseTo(fake.gps.lat, 3);
    expect(analysis.gps?.lon).toBeCloseTo(fake.gps.lon, 3);
  });

  it("preserves JPEG display orientation while removing private EXIF", async () => {
    const original = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#123456' } }).jpeg().withMetadata({ orientation: 6 }).withExifMerge({ IFD0: { Make: 'Private Camera' } }).toBuffer();
    const cleaned = stripJpeg(new Uint8Array(original).buffer);
    expect((await sharp(Buffer.from(cleaned)).metadata()).orientation).toBe(6);
    const analysis = await analyzeBuffer(cleaned, 'rotated.jpg');
    expect(analysis.entries.some(entry => entry.key === 'Make')).toBe(false);
    expect(await sharp(Buffer.from(cleaned)).raw().toBuffer()).toEqual(await sharp(original).raw().toBuffer());
  });

  it("updates ICC flag when the profile is explicitly removed", async () => {
    const input = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "#123456" },
    })
      .webp()
      .withIccProfile("srgb")
      .toBuffer();
    const result = stripWebp(new Uint8Array(input).buffer, {
      preserveIcc: false,
    });
    expect(new Uint8Array(result)[20] & 0x20).toBe(0);
    expect((await sharp(Buffer.from(result)).metadata()).icc).toBeUndefined();
  });

  it("Chrome and Firefox extension copies preserve the correct WebP bits", () => {
    const bytes = new Uint8Array(30);
    bytes.set(text("RIFF"));
    new DataView(bytes.buffer).setUint32(4, 22, true);
    bytes.set(text("WEBP"), 8);
    bytes.set(text("VP8X"), 12);
    new DataView(bytes.buffer).setUint32(16, 10, true);
    bytes[20] = 0x3e;
    for (const extension of ["browser-extension", "firefox-extension"]) {
      const context = vm.createContext({
        Uint8Array,
        DataView,
        ArrayBuffer,
        Set,
        window: {},
      });
      vm.runInContext(
        readFileSync(`../${extension}/strip-webp.js`, "utf8"),
        context,
      );
      const cleaned = context.window.__metastrip.stripWebp(
        bytes.buffer,
      ) as ArrayBuffer;
      expect(new Uint8Array(cleaned)[20]).toBe(0x32); // keep ICC, alpha, animation
    }
  });

  it("refuses truncated WebP metadata instead of retaining it as clean", () => {
    const bytes = new Uint8Array(23);
    bytes.set(text("RIFF"));
    bytes.set(text("WEBP"), 8);
    bytes.set(text("EXIF"), 12);
    new DataView(bytes.buffer).setUint32(4, 15, true);
    new DataView(bytes.buffer).setUint32(16, 100, true);
    expect(() => stripWebp(bytes.buffer)).toThrow(/Truncated/);
  });

  it("keeps real MP4 media offsets and extended box sizes unchanged", () => {
    const ftyp = box("ftyp", text("isom0000"));
    const metadata = box("udta", text("PRIVATE GPS AND AUTHOR"), true);
    const offsetTable = new Uint8Array(12);
    const table = box("stco", offsetTable);
    const moov = box("moov", new Uint8Array(join(table, metadata)), true);
    const mdat = box("mdat", new Uint8Array([1, 2, 3, 4]));
    const original = join(ftyp, moov, mdat);
    const mediaOffset = ftyp.length + moov.length + 8;
    new DataView(original).setUint32(ftyp.length + 16 + 8 + 8, mediaOffset);
    const result = stripMp4(original);
    expect(result.byteLength).toBe(original.byteLength);
    expect(new Uint8Array(result).slice(mediaOffset)).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(new DataView(result).getUint32(ftyp.length + 16 + 8 + 8)).toBe(
      mediaOffset,
    );
    expect(new DataView(result).getBigUint64(ftyp.length + 8)).toBe(
      BigInt(moov.length),
    );
    expect(new TextDecoder().decode(result)).not.toContain("PRIVATE");
    expect(new Uint8Array(original)).toContain(80); // original not mutated
  });

  it("refuses destructive generic stripping of a real AVIF image", async () => {
    const avif = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#abcdef" },
    })
      .avif()
      .toBuffer();
    const input = new Uint8Array(avif).buffer;
    expect(() => stripMp4(input)).toThrow(/HEIC\/AVIF/);
    expect(await sharp(Buffer.from(input)).metadata()).toMatchObject({
      format: "heif",
      width: 2,
      height: 2,
    });
  });

  it("preserves PDF offsets with arbitrary whitespace, escaped and nested strings", () => {
    const input = text(
      "%PDF-1.4\n1 0 obj\n<< /Author\t\n(Alice \\(Private\\) (Team)) /Title<536563726574> /CreationDate(D:20260101) >>\nendobj\n%%EOF",
    ).buffer;
    const result = stripPdf(input);
    expect(result.byteLength).toBe(input.byteLength);
    const output = new TextDecoder().decode(result);
    expect(output).not.toContain("Alice");
    expect(output).not.toContain("Private");
    expect(output).not.toContain("Team");
    expect(output.indexOf("endobj")).toBe(
      new TextDecoder().decode(input).indexOf("endobj"),
    );
    expect(output).toContain("/Author\t\n(");
  });

  it("does not redact visible PDF content that resembles an information field", () => {
    const input = text(
      "%PDF-1.4\n1 0 obj\n<< /Length 41 >>\nstream\nBT (/Author (Visible instruction)) Tj ET\nendstream\nendobj\n%%EOF",
    ).buffer;
    expect(new Uint8Array(stripPdf(input))).toEqual(new Uint8Array(input));
  });

  it("rejects arbitrary XML and labels SVG inspection limits", async () => {
    expect(
      isSvg(text('<?xml version="1.0"?><document>private</document>').buffer),
    ).toBe(false);
    const result = await analyzeBuffer(
      text(
        '<svg xmlns="http://www.w3.org/2000/svg"><title>Private</title></svg>',
      ).buffer,
      "drawing.svg",
    );
    expect(result.inspectionNote).toMatch(/limited/);
    await expect(
      analyzeBuffer(text("this is not a PNG").buffer, "photo.png"),
    ).rejects.toThrow(/contents/);
  });
});

describe("file batch safeguards", () => {
  it("accepts uppercase images without MIME types and rejects empty/oversized batches", () => {
    expect(validateFiles([{ name: "PHOTO.JPG", size: 5 }])).toBeNull();
    expect(validateFiles([{ name: "empty.png", size: 0 }])).toMatch(/empty/);
    expect(
      validateFiles(
        Array.from({ length: 51 }, () => ({ name: "photo.png", size: 2 })),
      ),
    ).toMatch(/50/);
    expect(
      validateFiles([
        { name: "a.mp4", size: 300 * 1024 * 1024 },
        { name: "b.mp4", size: 300 * 1024 * 1024 },
      ]),
    ).toMatch(/500 MB/);
    expect(validateFiles([{ name: "audio.aac", size: 100 }])).toMatch(
      /not a supported/,
    );
  });
  it("keeps every duplicate filename in a batch download without ZIP paths", () => {
    const names = uniqueDownloadNames([
      "photo.jpg",
      "photo.jpg",
      "PHOTO.jpg",
      "../private.jpg",
    ]);
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(4);
    expect(names.every((name) => !name.includes("/"))).toBe(true);
  });
});
