/* Archive ZIP minimale (sans compression) : de quoi livrer plusieurs fichiers d'un coup, sans bibliothèque. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Zip = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  /** CRC-32 d'un Uint8Array. */
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const u16 = (v) => [v & 255, (v >> 8) & 255];
  const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const DOS_DATE = 0x21;                                     // 1er janvier 1980 : la date n'a pas d'importance ici

  /** files : [{ name, data: Uint8Array }] -> Uint8Array de l'archive (noms en UTF-8). */
  function build(files) {
    const enc = new TextEncoder(), chunks = [], entries = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const head = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(DOS_DATE), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
      chunks.push(head, name, data);
      entries.push({ name, crc, size: data.length, offset });
      offset += head.length + name.length + data.length;
    });
    const start = offset;
    entries.forEach((e) => {
      const head = Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(DOS_DATE), ...u32(e.crc), ...u32(e.size), ...u32(e.size), ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(e.offset)]);
      chunks.push(head, e.name);
      offset += head.length + e.name.length;
    });
    chunks.push(Uint8Array.from([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(offset - start), ...u32(start), ...u16(0)]));
    const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
    let p = 0;
    chunks.forEach((c) => { out.set(c, p); p += c.length; });
    return out;
  }
  return { build, crc32 };
});
