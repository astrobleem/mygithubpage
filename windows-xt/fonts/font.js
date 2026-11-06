/* XT Pixels viewer. MIT, Copyright (c) 2026 Windows XT contributors. */
(function (root) {
  'use strict';
  function parse(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function need(at, size) {
      if (!Number.isSafeInteger(at) || at < 0 || size < 0 || at + size > bytes.length)
        throw new Error('Truncated or invalid font data.');
    }
    const u16 = at => { need(at, 2); return view.getUint16(at, true); };
    const u32 = at => { need(at, 4); return view.getUint32(at, true); };
    if (u16(0) !== 0x5a4d) throw new Error('Expected a Windows FON file.');
    const ne = u32(60);
    if (u16(ne) !== 0x454e) throw new Error('Missing Windows NE resources.');
    let table = ne + u16(ne + 36);
    const shift = u16(table);
    if (shift > 16) throw new Error('Invalid resource alignment.');
    table += 2;
    let start, length, resourceId;
    while (u16(table)) {
      const type = u16(table), count = u16(table + 2);
      table += 8;
      need(table, count * 12);
      for (let i = 0; i < count; i++, table += 12) {
        const offset = u16(table) * 2 ** shift;
        const size = u16(table + 2) * 2 ** shift;
        need(offset, size);
        if (type === 0x8008) {
          if (start !== undefined) throw new Error('Expected one font strike.');
          start = offset; length = size; resourceId = u16(table + 6) & 0x7fff;
        }
      }
    }
    if (start === undefined || length < 118 || u16(start) !== 0x200)
      throw new Error('Expected a bitmap FNT 2.0 resource.');
    const size = u32(start + 2);
    if (size < 118 || size > length || u16(start + 66) !== 0)
      throw new Error('Invalid bitmap font header.');
    const height = u16(start + 88), first = bytes[start + 95], last = bytes[start + 96];
    const fallback = first + bytes[start + 97];
    const faceAt = u32(start + 105), bitsAt = u32(start + 113);
    if (!height || height > 32 || first > last || fallback > last ||
        118 + (last - first + 2) * 4 > bitsAt || bitsAt >= faceAt || faceAt >= size)
      throw new Error('Invalid character table.');
    let end = start + faceAt;
    while (end < start + size && bytes[end]) end++;
    if (end === start + size) throw new Error('Missing font name terminator.');
    const face = String.fromCharCode(...bytes.slice(start + faceAt, end));
    const glyphs = [];
    for (let code = first; code <= last; code++) {
      const at = start + 118 + (code - first) * 4;
      const width = u16(at), offset = u16(at + 2);
      if (!width || width > 64 || offset < bitsAt || offset + Math.ceil(width / 8) * height > faceAt)
        throw new Error('Glyph outside bitmap data.');
      const rows = Array.from({length: height}, (_, y) =>
        Array.from({length: width}, (_, x) =>
          (bytes[start + offset + Math.floor(x / 8) * height + y] >> (7 - x % 8)) & 1));
      glyphs[code] = {code, width, rows};
    }
    return {
      face, first, last, fallback, height, resourceId,
      ascent: u16(start + 74), internal: u16(start + 76), external: u16(start + 78),
      fixedWidth: u16(start + 86), maxWidth: u16(start + 93), charset: bytes[start + 85],
      glyph: code => glyphs[code] || glyphs[fallback]
    };
  }
  const reserved = new Set([0x7f, 0x80, 0x81, 0x8d, 0x8e, 0x8f, 0x90, 0x9d, 0x9e]);
  const controls = Array.from('\u0000☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼');
  const highOEM = Array.from('ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0');
  const ansiDecoder = new TextDecoder('windows-1252');
  function character(code, charset) {
    if (charset === 255) return code < 32 ? controls[code] : code === 127 ? '⌂' :
      code >= 128 ? highOEM[code - 128] : String.fromCharCode(code);
    return reserved.has(code) ? null : ansiDecoder.decode(Uint8Array.of(code));
  }
  function encode(text, font) {
    const lookup = new Map();
    for (let code = font.first; code <= font.last; code++) {
      const char = character(code, font.charset);
      if (char !== null) lookup.set(char, code);
    }
    const missing = new Set();
    const lines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').map(line =>
      Array.from(line, char => {
        if (!lookup.has(char)) missing.add(char);
        return lookup.get(char) ?? font.fallback;
      }));
    return {lines, missing: Array.from(missing)};
  }
  const api = {parse, character, encode};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XTFont = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
