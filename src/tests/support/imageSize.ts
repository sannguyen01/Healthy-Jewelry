/**
 * The intrinsic size of a JPEG or PNG, read from its own bytes.
 *
 * A hero record declares the `width` and `height` of the file it names, and `next/image` and the
 * subject arithmetic both trust them. A declaration is only as good as a test that compares it with the
 * file, so this reads the file. JPEG and PNG only: those are the formats the record's `src` accepts,
 * and a format added there needs its reader added here, in the same change.
 */
export type ImageSize = { width: number; height: number }

/** SOF0–SOF15 carry the frame size; 0xC4 (DHT), 0xC8 (JPG) and 0xCC (DAC) share the range and do not. */
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

export function imageSize(bytes: Uint8Array): ImageSize {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // PNG: the 8-byte signature, then the IHDR chunk whose first two fields are width and height.
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }

  // JPEG: walk the marker segments until a start-of-frame.
  if (bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let i = 2
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) throw new Error(`corrupt JPEG: expected a marker at byte ${i}`)
      let marker = bytes[i + 1]
      while (marker === 0xff) marker = bytes[++i + 1] // fill bytes
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2 // standalone markers carry no length
        continue
      }
      if (isStartOfFrame(marker)) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) }
      }
      i += 2 + view.getUint16(i + 2)
    }
    throw new Error('corrupt JPEG: no start-of-frame segment')
  }

  throw new Error('unsupported image: not a PNG or a JPEG')
}
