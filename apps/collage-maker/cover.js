// Where to draw a photo so it always covers its cell, whatever the zoom, rotation and drag.
// iw/ih: photo size. cw/ch: cell size. t: { scale (1 = smallest that covers), rotate (degrees),
// offsetX/offsetY (photo centre from cell centre, in cell widths/heights) }.
// Returns { s: pixels per photo pixel, dx, dy: the offset in pixels, pulled back so no gap shows }.
export function fit(iw, ih, cw, ch, t) {
  const r = (t.rotate * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  // Seen from the photo's own axes the cell is a tilted rectangle; this is half of its bounding box.
  const hx = (cw * Math.abs(cos) + ch * Math.abs(sin)) / 2, hy = (cw * Math.abs(sin) + ch * Math.abs(cos)) / 2;
  const s = Math.max((2 * hx) / iw, (2 * hy) / ih) * Math.max(1, t.scale);
  // The offset turned into the photo's axes, limited to the slack the photo has there, and turned back.
  const mx = (s * iw) / 2 - hx, my = (s * ih) / 2 - hy;
  const px = Math.min(mx, Math.max(-mx, t.offsetX * cw * cos + t.offsetY * ch * sin));
  const py = Math.min(my, Math.max(-my, -t.offsetX * cw * sin + t.offsetY * ch * cos));
  return { s, dx: px * cos - py * sin, dy: px * sin + py * cos };
}
