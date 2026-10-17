// Gera os ícones PNG do app (fundo preto, halter laranja) sem dependências.
// Uso: node scripts/gen-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ----- PNG encoder mínimo -----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function makePng(size, pixelAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filtro none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ----- Desenho -----
function inRect(x, y, x1, y1, x2, y2, r) {
  if (r <= 0) return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  const cx = Math.min(Math.max(x, x1 + r), x2 - r);
  const cy = Math.min(Math.max(y, y1 + r), y2 - r);
  const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2;
  if (!inside) return false;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= x1 + r && x <= x2 - r) || (y >= y1 + r && y <= y2 - r);
}

function drawIcon(S) {
  return makePng(S, (px, py) => {
    const x = px / S, y = py / S;
    // fundo: leve gradiente radial para dar profundidade
    const d = Math.hypot(x - 0.5, y - 0.5) / 0.75;
    const lerp = (a, b, t) => Math.round(a + (b - a) * Math.min(1, Math.max(0, t)));
    let r = lerp(0x1A, 0x09, d), g = lerp(0x1A, 0x09, d), b = lerp(0x1E, 0x0B, d);

    const shapes = [
      // barra do halter
      { x1: 0.285, y1: 0.468, x2: 0.715, y2: 0.532, r: 0.028, c: [0xFF, 0xA1, 0x4A] },
      // anilhas internas
      { x1: 0.235, y1: 0.365, x2: 0.315, y2: 0.635, r: 0.030, c: [0xFF, 0xB4, 0x64] },
      { x1: 0.685, y1: 0.365, x2: 0.765, y2: 0.635, r: 0.030, c: [0xFF, 0xB4, 0x64] },
      // anilhas externas
      { x1: 0.150, y1: 0.428, x2: 0.225, y2: 0.572, r: 0.024, c: [0xFF, 0x8A, 0x26] },
      { x1: 0.775, y1: 0.428, x2: 0.850, y2: 0.572, r: 0.024, c: [0xFF, 0x8A, 0x26] },
    ];

    for (const s of shapes) {
      if (inRect(x, y, s.x1, s.y1, s.x2, s.y2, s.r)) {
        r = s.c[0]; g = s.c[1]; b = s.c[2];
      }
    }
    return [r, g, b, 255];
  });
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [file, size] of targets) {
  fs.writeFileSync(path.join(outDir, file), drawIcon(size));
  console.log('✓', file, `${size}x${size}`);
}
