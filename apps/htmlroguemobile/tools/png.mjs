// Minimal PNG read/write for the art tools: 8-bit RGBA (or RGB / palette), not interlaced.
import zlib from 'node:zlib';

export function readPng(buf) {
    let pos = 8, w, h, type, palette, trns, idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos), name = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
        if (name === 'IHDR') {
            w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9];
            if (data[8] !== 8 || data[12] !== 0) throw new Error('only 8-bit, non-interlaced PNGs');
        } else if (name === 'PLTE') palette = data;
        else if (name === 'tRNS') trns = data;
        else if (name === 'IDAT') idat.push(data);
        pos += 12 + len;
    }
    const bpp = { 6: 4, 2: 3, 3: 1, 4: 2, 0: 1 }[type];
    const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? px[y * stride + i - bpp] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = y && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
            const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
            px[y * stride + i] = (src[i] + pred) & 255;
        }
    }
    // Grid of [r,g,b,a] or null for transparent.
    return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
        const o = y * stride + x * bpp;
        let c;
        if (type === 6) c = [px[o], px[o + 1], px[o + 2], px[o + 3]];
        else if (type === 2) c = [px[o], px[o + 1], px[o + 2], 255];
        else if (type === 3) c = [palette[px[o] * 3], palette[px[o] * 3 + 1], palette[px[o] * 3 + 2], trns && px[o] < trns.length ? trns[px[o]] : 255];
        else if (type === 4) c = [px[o], px[o], px[o], px[o + 1]];
        else c = [px[o], px[o], px[o], 255];
        return c[3] < 128 ? null : [c[0], c[1], c[2], 255];
    }));
}

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
