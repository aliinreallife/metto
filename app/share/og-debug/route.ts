import { deflateSync, inflateSync } from "node:zlib";
import { GET as getOg } from "../og/route";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Temporary preview-only raster verifier. Removed before merge.
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuf.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 8 + data.length);
  return out;
}

function decodeRgbaPng(png: Buffer) {
  if (png.subarray(1, 4).toString("ascii") !== "PNG") throw new Error("not png");
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (pos + 12 <= png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.subarray(pos + 4, pos + 8).toString("ascii");
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("unsupported png");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[src++];
      const left = x >= 4 ? pixels[rowStart + x - 4] : 0;
      const up = y > 0 ? pixels[rowStart - stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[rowStart - stride + x - 4] : 0;
      let decoded = value;
      if (filter === 1) decoded = (value + left) & 255;
      else if (filter === 2) decoded = (value + up) & 255;
      else if (filter === 3) decoded = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        decoded = (value + pr) & 255;
      } else if (filter !== 0) throw new Error("bad filter");
      pixels[rowStart + x] = decoded;
    }
  }
  return { width, height, pixels };
}

function encodeRgbaPng(width: number, height: number, pixels: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function cropScalePng(png: Buffer, mode: string): Buffer {
  const src = decodeRgbaPng(png);
  const crop = mode === "route"
    ? { x: 620, y: 0, w: 580, h: 460, outW: 290, outH: 230 }
    : mode === "bottom"
      ? { x: 0, y: 430, w: 760, h: 200, outW: 380, outH: 100 }
      : { x: 0, y: 0, w: 1200, h: 630, outW: 150, outH: 79 };
  const out = Buffer.alloc(crop.outW * crop.outH * 4);
  for (let y = 0; y < crop.outH; y++) {
    const sy = Math.min(src.height - 1, crop.y + Math.floor((y * crop.h) / crop.outH));
    for (let x = 0; x < crop.outW; x++) {
      const sx = Math.min(src.width - 1, crop.x + Math.floor((x * crop.w) / crop.outW));
      const from = (sy * src.width + sx) * 4;
      const to = (y * crop.outW + x) * 4;
      src.pixels.copy(out, to, from, from + 4);
    }
  }
  return encodeRgbaPng(crop.outW, crop.outH, out);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ogUrl = new URL("/share/og", url.origin);
  const ogParams = new URLSearchParams(url.searchParams);
  ogParams.delete("mode");
  ogUrl.search = ogParams.toString();

  const response = await getOg(new Request(ogUrl));
  const bytes = Buffer.from(await response.arrayBuffer());
  const preview = cropScalePng(bytes, url.searchParams.get("mode") || "thumb");
  return new Response(preview.toString("base64"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Preview-Bytes": String(preview.length),
    },
  });
}
