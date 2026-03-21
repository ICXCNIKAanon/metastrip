/**
 * Output validation for stripped image buffers.
 */

import { isJpeg, isPng, isWebp } from './detect';

/**
 * Validates that the output buffer is non-empty and has the correct magic
 * bytes for the expected format.
 *
 * @param buf - The buffer to validate.
 * @param expectedFormat - The image format that was stripped.
 * @returns true if valid, false otherwise.
 */
export function validateOutput(
  buf: Buffer,
  expectedFormat: 'jpeg' | 'png' | 'webp'
): boolean {
  if (buf.byteLength === 0) return false;

  switch (expectedFormat) {
    case 'jpeg':
      return isJpeg(buf);
    case 'png':
      return isPng(buf);
    case 'webp':
      return isWebp(buf);
    default:
      return false;
  }
}
