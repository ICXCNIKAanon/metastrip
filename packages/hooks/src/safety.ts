/**
 * Output validation for stripped file buffers.
 * Validates magic bytes for all 20 supported formats.
 */

import {
  isJpeg, isPng, isWebp, isGif, isSvg, isPdf,
  isMp3, isWav, isFlac, isMp4, isHeic, isAvif, isM4a,
  isAvi, isMkv, isEpub, isZip,
  type FormatType,
} from './detect';

/**
 * Validates that the output buffer is non-empty and has the correct magic
 * bytes for the expected format.
 *
 * For formats that share a container (HEIC/AVIF/M4A/MOV all use ftyp/MP4),
 * we validate using the more general isMp4 check. Office formats validate
 * as ZIP. SVG and EPUB rely on content checks which are slightly heavier.
 *
 * @param buf - The buffer to validate.
 * @param expectedFormat - The format that was stripped.
 * @returns true if valid, false otherwise.
 */
export function validateOutput(buf: Buffer, expectedFormat: FormatType): boolean {
  if (buf.byteLength === 0) return false;

  switch (expectedFormat) {
    case 'jpeg':  return isJpeg(buf);
    case 'png':   return isPng(buf);
    case 'webp':  return isWebp(buf);
    case 'gif':   return isGif(buf);
    case 'svg':   return isSvg(buf);
    case 'pdf':   return isPdf(buf);
    case 'mp3':   return isMp3(buf);
    case 'wav':   return isWav(buf);
    case 'flac':  return isFlac(buf);
    case 'mp4':
    case 'mov':   return isMp4(buf);
    case 'heic':  return isHeic(buf);
    case 'avif':  return isAvif(buf);
    case 'm4a':   return isM4a(buf);
    case 'avi':   return isAvi(buf);
    case 'mkv':   return isMkv(buf);
    case 'epub':  return isEpub(buf);
    case 'docx':
    case 'xlsx':
    case 'pptx':  return isZip(buf);
    default:      return false;
  }
}
