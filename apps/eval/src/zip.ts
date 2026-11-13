import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

async function range(url: string, start: number, end: number) {
  const res = await fetch(url, { headers: { range: `bytes=${start}-${end - 1}` } });
  if (res.status !== 206) throw new Error(`range request failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function size(url: string) {
  const res = await fetch(url, { method: 'HEAD' });
  const length = Number(res.headers.get('content-length'));
  if (!res.ok || !length) throw new Error(`cannot size ${url}: ${res.status}`);
  return { url: res.url, length };
}

function findSignature(buf: Buffer, sig: number) {
  for (let i = buf.length - 4; i >= 0; i--) if (buf.readUInt32LE(i) === sig) return i;
  return -1;
}

export async function remoteZip(source: string) {
  const { url, length } = await size(source);
  const tailStart = Math.max(0, length - 65_557);
  const tail = await range(url, tailStart, length);
  const eocd = findSignature(tail, 0x06054b50);
  if (eocd === -1) throw new Error('not a zip file');

  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const locator = findSignature(tail, 0x07064b50);
    if (locator === -1) throw new Error('zip64 locator missing');
    const z64At = Number(tail.readBigUInt64LE(locator + 8));
    const z64 = await range(url, z64At, z64At + 56);
    cdSize = Number(z64.readBigUInt64LE(40));
    cdOffset = Number(z64.readBigUInt64LE(48));
  }

  const cd = await range(url, cdOffset, cdOffset + cdSize);
  const entries = new Map<string, ZipEntry>();
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
    const entry: ZipEntry = {
      name,
      method: cd.readUInt16LE(p + 10),
      compressedSize: cd.readUInt32LE(p + 20),
      size: cd.readUInt32LE(p + 24),
      offset: cd.readUInt32LE(p + 42),
    };
    let x = p + 46 + nameLen;
    const extraEnd = x + extraLen;
    while (x + 4 <= extraEnd) {
      const id = cd.readUInt16LE(x);
      const len = cd.readUInt16LE(x + 2);
      if (id === 0x0001) {
        let f = x + 4;
        for (const key of ['size', 'compressedSize', 'offset'] as const) {
          if (entry[key] === 0xffffffff) {
            entry[key] = Number(cd.readBigUInt64LE(f));
            f += 8;
          }
        }
      }
      x += 4 + len;
    }
    entries.set(name, entry);
    p = extraEnd + commentLen;
  }

  async function read(entry: ZipEntry) {
    const header = await range(url, entry.offset, entry.offset + 30);
    const dataAt = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const data = await range(url, dataAt, dataAt + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRawSync(data);
    throw new Error(`unsupported compression ${entry.method} for ${entry.name}`);
  }

  return { entries, read };
}
