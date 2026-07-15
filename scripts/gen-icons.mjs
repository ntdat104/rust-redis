// Generates placeholder app icons (a red database cylinder on a rounded red
// panel) as PNGs, with zero dependencies. Replace later with `tauri icon`.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "src-tauri/icons");
fs.mkdirSync(OUT, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // rest 0 (compression, filter, interlace)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function draw(N) {
  const rgba = Buffer.alloc(N * N * 4);
  const cx = N / 2;
  const rx = N * 0.27; // cylinder radius
  const ry = N * 0.075; // disk vertical radius
  const topY = N * 0.32;
  const botY = N * 0.68;
  const panelR = N * 0.22;

  const set = (x, y, [r, g, b, a]) => {
    const i = (y * N + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  const inPanel = (x, y) => {
    // rounded square covering the whole canvas
    const minX = panelR, maxX = N - panelR, minY = panelR, maxY = N - panelR;
    if (x >= minX && x <= maxX) return true;
    if (y >= minY && y <= maxY) return true;
    const cxr = x < minX ? minX : maxX;
    const cyr = y < minY ? minY : maxY;
    return Math.hypot(x - cxr, y - cyr) <= panelR;
  };

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!inPanel(x + 0.5, y + 0.5)) {
        set(x, y, [0, 0, 0, 0]);
        continue;
      }
      // panel gradient red (top -> bottom)
      const t = y / N;
      let color = [lerp(0xe8, 0xa8, t), lerp(0x45, 0x1c, t), lerp(0x3d, 0x14, t), 255];

      const dx = x + 0.5 - cx;
      const dy = y + 0.5;
      const insideBody = Math.abs(dx) <= rx && dy >= topY && dy <= botY;
      const inTopCap = (dx / rx) ** 2 + ((dy - topY) / ry) ** 2 <= 1;
      const inBotCap = dy >= botY && (dx / rx) ** 2 + ((dy - botY) / ry) ** 2 <= 1;

      if (insideBody || inTopCap || inBotCap) {
        color = [0xf6, 0xf6, 0xf6, 255]; // database body: off-white
        // disk separation lines
        for (const ly of [topY + (botY - topY) * 0.34, topY + (botY - topY) * 0.68]) {
          const onLine = Math.abs((dx / rx) ** 2 + ((dy - ly) / ry) ** 2 - 1) < 0.18;
          if (onLine && dy < ly) color = [0xd8, 0x2c, 0x20, 255];
        }
      }
      set(x, y, color);
    }
  }
  return encodePNG(N, N, rgba);
}

const sizes = { "32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256, "icon.png": 1024 };
for (const [name, size] of Object.entries(sizes)) {
  fs.writeFileSync(path.join(OUT, name), draw(size));
  console.log("wrote", name, `(${size}x${size})`);
}
