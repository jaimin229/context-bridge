/**
 * Generates the ContextBridge application icon (PNG + ICO) with no external
 * dependencies: a hand-rolled PNG encoder (zlib + CRC32) and a PNG-in-ICO
 * container, both deterministic. Run: node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'apps', 'desktop', 'build');
const SUPER = 4; // supersampling factor for anti-aliasing
const FINAL = 256;

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256 -> 0
  entry[1] = 0; // height 256 -> 0
  entry[2] = 0; // palette
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // data offset
  return Buffer.concat([header, entry, png]);
}

// --- shape coverage in FINAL-space coordinates (0..256) ---------------------
function inRoundedRect(x, y, rx, ry, rw, rh, r) {
  if (x < rx || y < ry || x >= rx + rw || y >= ry + rh) return false;
  const qx = x < rx + r ? rx + r : x > rx + rw - r ? rx + rw - r : x;
  const qy = y < ry + r ? ry + r : y > ry + rh - r ? ry + rh - r : y;
  const dx = x - qx;
  const dy = y - qy;
  return dx * dx + dy * dy <= r * r;
}

function inTriangle(x, y, p1, p2, p3) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p1, p2, [x, y]);
  const d2 = d(p2, p3, [x, y]);
  const d3 = d(p3, p1, [x, y]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

const SLATE = [100, 116, 139, 255]; // bar color
const SKY = [56, 189, 248, 255]; // arrow color
const BG = [15, 23, 42, 255]; // slate-900 tile

function sampleColor(x, y) {
  // Tile: rounded square with margin
  if (!inRoundedRect(x, y, 8, 8, 240, 240, 56)) return [0, 0, 0, 0];
  // Left bar
  if (inRoundedRect(x, y, 52, 68, 36, 120, 18)) return SLATE;
  // Right bar
  if (inRoundedRect(x, y, 168, 68, 36, 120, 18)) return SLATE;
  // Arrow shaft
  if (inRoundedRect(x, y, 92, 116, 56, 24, 6)) return SKY;
  // Arrowhead
  if (inTriangle(x, y, [140, 96], [176, 128], [140, 160])) return SKY;
  return BG;
}

function render() {
  const size = FINAL * SUPER;
  const accum = new Float64Array(FINAL * FINAL * 4);
  const samples = SUPER * SUPER;
  for (let py = 0; py < FINAL; py += 1) {
    for (let px = 0; px < FINAL; px += 1) {
      for (let sy = 0; sy < SUPER; sy += 1) {
        for (let sx = 0; sx < SUPER; sx += 1) {
          const x = ((px * SUPER + sx + 0.5) * FINAL) / size;
          const y = ((py * SUPER + sy + 0.5) * FINAL) / size;
          const [r, g, b, a] = sampleColor(x, y);
          const idx = (py * FINAL + px) * 4;
          accum[idx] += (r * a) / 255;
          accum[idx + 1] += (g * a) / 255;
          accum[idx + 2] += (b * a) / 255;
          accum[idx + 3] += a;
        }
      }
    }
  }
  const rgba = Buffer.alloc(FINAL * FINAL * 4);
  for (let i = 0; i < FINAL * FINAL; i += 1) {
    const accumA = accum[i * 4 + 3];
    const alpha = accumA / samples;
    if (accumA <= 0) continue;
    // Un-premultiply: color = sum(color * a) / sum(a).
    rgba[i * 4] = Math.round((accum[i * 4] * 255) / accumA);
    rgba[i * 4 + 1] = Math.round((accum[i * 4 + 1] * 255) / accumA);
    rgba[i * 4 + 2] = Math.round((accum[i * 4 + 2] * 255) / accumA);
    rgba[i * 4 + 3] = Math.round(alpha);
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });
const png = encodePng(FINAL, FINAL, render());
writeFileSync(path.join(OUT_DIR, 'icon.png'), png);
writeFileSync(path.join(OUT_DIR, 'icon.ico'), encodeIco(png));
console.log(`wrote ${path.join(OUT_DIR, 'icon.png')} and icon.ico (${png.length} bytes)`);
