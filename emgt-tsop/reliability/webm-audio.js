/* EMGT audio-only WebM/Opus remux. Encoded packets are never re-encoded.
 * Unsupported structures fail closed: retain/download the original, never
 * invent a duration from wall time. RFC 6716 section 3 defines packet duration.
 */
(function (root) {
  'use strict';
  function vint(b, p, id = false) {
    if (p >= b.length || !b[p]) throw Error('Incomplete EBML header');
    let n = 1;
    while (!(b[p] & (1 << (8 - n)))) n++;
    if (n > (id ? 4 : 8) || p + n > b.length) throw Error('Invalid EBML header');
    let value = BigInt(id ? b[p] : b[p] & ((1 << (8 - n)) - 1));
    for (let i = 1; i < n; i++) value = value * 256n + BigInt(b[p + i]);
    const unknown = !id && value === (1n << BigInt(7 * n)) - 1n;
    if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Oversized EBML value');
    return { value: unknown ? null : Number(value), n };
  }
  function elements(b, start = 0, end = b.length, insideCluster = false) {
    const out = [];
    for (let p = start; p < end;) {
      const id = vint(b, p, true), size = vint(b, p + id.n), data = p + id.n + size.n;
      if (insideCluster && [0x1f43b675, 0x1549a966, 0x1654ae6b, 0x1c53bb6b].includes(id.value)) break;
      let stop = size.value === null ? end : data + size.value;
      if (stop > end) throw Error('Truncated WebM element');
      const e = { id: id.value, start: p, data, end: stop };
      if (size.value === null) {
        if (e.id === 0x1f43b675) {
          e.children = elements(b, data, end, true);
          e.end = e.children.length ? e.children[e.children.length - 1].end : data;
        } else if (e.id !== 0x18538067) throw Error('Unsupported unknown-size element');
      }
      out.push(e); p = e.end;
    }
    return out;
  }
  const concat = parts => {
    const b = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    let p = 0; for (const x of parts) { b.set(x, p); p += x.length; } return b;
  };
  function uint(n) {
    if (!Number.isSafeInteger(n) || n < 0) throw Error('Invalid integer');
    const bytes = []; do { bytes.unshift(n % 256); n = Math.floor(n / 256); } while (n);
    return Uint8Array.from(bytes);
  }
  function element(id, data) {
    let n = 1; while (data.length >= 2 ** (7 * n) - 1) n++;
    let v = BigInt(data.length) | (1n << BigInt(7 * n));
    const size = new Uint8Array(n);
    for (let i = n - 1; i >= 0; i--) { size[i] = Number(v & 255n); v >>= 8n; }
    return concat([uint(id), size, data]);
  }
  const number = (b, e) => {
    let n = 0; for (let p = e.data; p < e.end; p++) n = n * 256 + b[p];
    if (!Number.isSafeInteger(n)) throw Error('Oversized integer'); return n;
  };
  function packetMs(packet) {
    if (!packet.length) throw Error('Empty Opus packet');
    const config = packet[0] >> 3, code = packet[0] & 3;
    const frame = config < 12 ? [10,20,40,60][config % 4] : config < 16 ? [10,20][config % 2] : [2.5,5,10,20][config % 4];
    if (code === 3 && packet.length < 2) throw Error('Truncated Opus packet');
    const count = code === 0 ? 1 : code === 3 ? packet[1] & 63 : 2;
    const ms = frame * count;
    if (!count || ms > 120) throw Error('Invalid Opus frame count');
    return ms;
  }
  function normalize(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const top = elements(b), header = top.find(x => x.id === 0x1a45dfa3), segment = top.find(x => x.id === 0x18538067);
    if (!header || !segment || top.length !== 2) throw Error('Expected one WebM recording');
    const children = elements(b, segment.data, segment.end), info = children.find(x => x.id === 0x1549a966), tracks = children.find(x => x.id === 0x1654ae6b);
    if (!info || !tracks) throw Error('Missing WebM metadata');
    const entries = elements(b, tracks.data, tracks.end).filter(x => x.id === 0xae);
    if (entries.length !== 1) throw Error('Expected one audio track');
    const fields = elements(b, entries[0].data, entries[0].end), field = id => fields.find(x => x.id === id);
    const codec = field(0x86), type = field(0x83), track = field(0xd7), delay = field(0x56aa), privateData = field(0x63a2);
    if (!type || number(b,type) !== 2 || !codec || new TextDecoder().decode(b.slice(codec.data,codec.end)) !== 'A_OPUS' || !track) throw Error('Expected audio Opus');
    const trackNumber = number(b,track);
    if (!privateData || privateData.end - privateData.data < 19 || new TextDecoder().decode(b.slice(privateData.data,privateData.data+8)) !== 'OpusHead') throw Error('Missing Opus header');
    const preskip = b[privateData.data+10] + 256 * b[privateData.data+11];
    const delayMs = delay ? number(b,delay) / 1e6 : preskip / 48;
    const blocks = []; let totalMs = 0, discardMs = 0, firstTimestamp = null, lastTimestamp = 0;
    const infoFields = elements(b,info.data,info.end), scale = infoFields.find(x=>x.id===0x2ad7b1);
    const scaleMs = scale ? number(b,scale) / 1e6 : 1;
    for (const cluster of children.filter(x => x.id === 0x1f43b675)) {
      const parts = cluster.children || elements(b,cluster.data,cluster.end), tc = parts.find(x=>x.id===0xe7);
      if (!tc) throw Error('Missing cluster timestamp');
      for (const p of parts) {
        let block = p, group = null;
        if (p.id === 0xa0) {
          group = elements(b,p.data,p.end); block = group.find(x=>x.id===0xa1);
          if (!block || group.some(x=>![0xa1,0x75a2,0x9b].includes(x.id))) throw Error('Unsupported block group');
          const discard = group.find(x=>x.id===0x75a2);
          if (discard) {
            if (b[discard.data] & 128) throw Error('Unsupported negative discard padding');
            discardMs += number(b,discard) / 1e6;
          }
        } else if (p.id !== 0xa3) {
          if (![0xe7,0xec,0xbf].includes(p.id)) throw Error('Unsupported cluster metadata');
          continue;
        }
        const payload = b.slice(block.data,block.end), tr = vint(payload,0);
        if (tr.value !== trackNumber || payload.length < tr.n + 4 || (payload[tr.n+2] & 6)) throw Error('Unsupported or laced audio block');
        const ms = packetMs(payload.subarray(tr.n+3));
        const rel = new DataView(payload.buffer,payload.byteOffset+tr.n,2).getInt16(0);
        const originalMs = (number(b,tc)+rel)*scaleMs;
        if (firstTimestamp === null) firstTimestamp = originalMs;
        lastTimestamp = originalMs + ms;
        blocks.push({payload,offset:tr.n,at:totalMs,group,block}); totalMs += ms;
      }
    }
    if (!blocks.length) throw Error('No audio frames');
    const durationSeconds = (totalMs - delayMs - discardMs) / 1000;
    if (!(durationSeconds > 0) || durationSeconds > 86400) throw Error('Invalid audio duration');
    const duration = new Uint8Array(8); new DataView(duration.buffer).setFloat64(0,totalMs-discardMs);
    const newInfo = element(0x1549a966,concat([
      ...infoFields.filter(x=>![0x2ad7b1,0x4489,0xbf].includes(x.id)).map(x=>b.slice(x.start,x.end)),
      element(0x2ad7b1,uint(1000000)),element(0x4489,duration)
    ]));
    // One cluster per packet avoids signed 16-bit relative timestamp overflow.
    const clusters = blocks.map(x=>{
      new DataView(x.payload.buffer,x.payload.byteOffset+x.offset,2).setInt16(0,0);
      let encoded = element(x.group ? 0xa1 : 0xa3,x.payload);
      if (x.group) encoded = element(0xa0,concat([encoded,...x.group.filter(v=>v.id!==0xa1 && v.id!==0x9b).map(v=>b.slice(v.start,v.end))]));
      return element(0x1f43b675,concat([element(0xe7,uint(Math.round(x.at))),encoded]));
    });
    return { bytes:concat([b.slice(header.start,header.end),element(0x18538067,concat([newInfo,b.slice(tracks.start,tracks.end),...clusters]))]),
      durationSeconds, packetCount:blocks.length, timestampSpanSeconds:(lastTimestamp-firstTimestamp)/1000 };
  }
  const api = { normalize, packetMs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EMGTWebM = api;
})(typeof window !== 'undefined' ? window : globalThis);
