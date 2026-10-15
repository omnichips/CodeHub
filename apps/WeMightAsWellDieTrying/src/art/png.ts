import { crc32, deflateSync } from 'node:zlib';

/** A plain RGBA PNG. */
export function png(width: number, height: number, rgba: Uint8Array) {
  const raw = Buffer.alloc((width * 4 + 1) * height); // each row starts with filter type 0
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8), body = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([head.subarray(0, 4), body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
