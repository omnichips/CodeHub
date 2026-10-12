// Minimal PNG writer for the art tools (8-bit RGBA).
import zlib from 'node:zlib';

export function writePng(grid) {
    const h = grid.length, w = grid[0].length, raw = Buffer.alloc((w * 4 + 1) * h);
    grid.forEach((row, y) => row.forEach((c, x) => { if (c) raw.set([c[0], c[1], c[2], c[3] ?? 255], y * (w * 4 + 1) + 1 + x * 4); }));
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
