/* XT Pixels viewer. MIT, Copyright (c) 2026 Windows XT contributors. */
(function (root) {
  'use strict';
  function decode(buffer) {
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
    const resourceTable = ne + u16(ne + 36);
    let table = resourceTable;
    const shift = u16(table);
    if (shift > 16) throw new Error('Invalid resource alignment.');
    table += 2;
    let start, length, resourceId;
    const resources = [], resourceNames = [];
    while (u16(table)) {
      const type = u16(table), count = u16(table + 2);
      if (!(type & 0x8000)) resourceNames.push(type);
      table += 8;
      need(table, count * 12);
      for (let i = 0; i < count; i++, table += 12) {
        const offset = u16(table) * 2 ** shift;
        const size = u16(table + 2) * 2 ** shift;
        need(offset, size);
        const id = u16(table + 6);
        resources.push({offset, size});
        if (!(id & 0x8000)) resourceNames.push(id);
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
    const font = {
      face, first, last, fallback, height, resourceId,
      ascent: u16(start + 74), internal: u16(start + 76), external: u16(start + 78),
      fixedWidth: u16(start + 86), maxWidth: u16(start + 93), charset: bytes[start + 85],
      glyph: code => glyphs[code] || glyphs[fallback]
    };
    return {font, bytes, glyphs, ne, start, length, size, bitsAt, faceAt,
      resourceTable, resourceEnd: table + 2, resources, resourceNames, need, u16, u32};
  }
  function parse(buffer) { return decode(buffer).font; }

  // The editor never rewrites FNT/NE structures. Every change is one existing
  // bitmap bit; names, metrics, sentinel glyph, unused bits and padding survive.
  function edit(buffer) {
    const kind = Object.prototype.toString.call(buffer);
    if (kind !== '[object ArrayBuffer]' && kind !== '[object Uint8Array]')
      throw new TypeError('Expected an ArrayBuffer or Uint8Array.');
    const info = decode(new Uint8Array(buffer));
    const {font, bytes, glyphs, ne, start, size, bitsAt, faceAt,
      resourceTable, resourceEnd, resources, resourceNames, need, u16, u32} = info;
    need(ne, 64);
    if (ne < 64 || resourceTable < ne + 64 || u16(ne + 28) || u16(ne + 30))
      throw new Error('Editing requires a resource-only NE font.');
    if (u16(18) || u32(ne + 8))
      throw new Error('Editing checksummed font containers is not supported.');
    let metadataEnd = Math.max(ne + 64, resourceEnd);
    function protect(at, count) {
      need(at, count);
      metadataEnd = Math.max(metadataEnd, at + count);
    }
    protect(ne + u16(ne + 4), u16(ne + 6));
    const nonresident = u32(ne + 44), nonresidentSize = u16(ne + 32);
    if (nonresidentSize) protect(nonresident, nonresidentSize);
    let resident = ne + u16(ne + 38);
    if (resident > ne) {
      for (;;) {
        need(resident, 1);
        const count = bytes[resident];
        protect(resident, count ? count + 3 : 1);
        if (!count) break;
        resident += count + 3;
      }
    }
    const imports = u16(ne + 42);
    if (imports) {
      protect(ne + imports, 1);
      if (bytes[ne + imports]) throw new Error('Unexpected imported names in font.');
    }
    for (const offset of resourceNames) {
      const at = resourceTable + offset;
      need(at, 1); protect(at, 1 + bytes[at]);
    }
    const sortedResources = [...resources].sort((a, b) => a.offset - b.offset);
    let resourceLimit = metadataEnd;
    for (const resource of sortedResources) {
      if (resource.offset < resourceLimit)
        throw new Error('Overlapping font resources or NE metadata.');
      resourceLimit = resource.offset + resource.size;
    }
    const spans = [], positions = [];
    for (let code = font.first; code <= font.last + 1; code++) {
      const at = start + 118 + (code - font.first) * 4;
      const width = u16(at), offset = u16(at + 2);
      const count = Math.ceil(width / 8) * font.height;
      if (width > 64 || offset < bitsAt || offset + count > faceAt)
        throw new Error('Invalid bitmap storage.');
      if (count) spans.push({start: offset, end: offset + count});
      if (code <= font.last) positions[code] = start + offset;
    }
    const device = u32(start + 101);
    if (device) {
      if (device >= size) throw new Error('Invalid device name.');
      let end = device;
      while (end < size && bytes[start + end]) end++;
      if (end === size) throw new Error('Missing device name terminator.');
      spans.push({start: device, end: end + 1});
    }
    spans.sort((a, b) => a.start - b.start);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i].start < spans[i - 1].end)
        throw new Error('Overlapping glyph bitmap storage or font names.');
    }

    const original = bytes.slice(), dirty = new Uint16Array(256), rowViews = [];
    let saved = bytes.slice(), dirtyPixels = 0, dirtyGlyphs = 0, unsavedPixels = 0;
    const history = [];
    let cursor = 0, stroke = null;
    for (let code = font.first; code <= font.last; code++) {
      const glyph = glyphs[code];
      const state = {rows: Object.freeze(glyph.rows.map(row => Object.freeze(row)))};
      rowViews[code] = state;
      Object.defineProperty(glyph, 'rows', {get: () => state.rows});
      Object.freeze(glyph);
    }
    Object.freeze(font);
    function checkedGlyph(code) {
      if (!Number.isInteger(code) || code < font.first || code > font.last)
        throw new RangeError('Character is outside this font.');
      return glyphs[code];
    }
    function location(code, x, y) {
      const glyph = checkedGlyph(code);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= glyph.width ||
          y < 0 || y >= font.height) throw new RangeError('Pixel is outside this glyph.');
      return {at: positions[code] + Math.floor(x / 8) * font.height + y, mask: 128 >> (x % 8)};
    }
    function apply(pixel, value) {
      const {code, x, y, at, mask} = pixel;
      const before = Number(Boolean(bytes[at] & mask));
      if (before === value) return false;
      const delta = value === Number(Boolean(original[at] & mask)) ? -1 : 1;
      if (!dirty[code]) dirtyGlyphs++;
      dirty[code] += delta;
      if (!dirty[code]) dirtyGlyphs--;
      dirtyPixels += delta;
      unsavedPixels += value === Number(Boolean(saved[at] & mask)) ? -1 : 1;
      bytes[at] = value ? bytes[at] | mask : bytes[at] & ~mask;
      const rows = rowViews[code].rows.slice(), row = rows[y].slice();
      row[x] = value; rows[y] = Object.freeze(row);
      rowViews[code].rows = Object.freeze(rows);
      return true;
    }
    function beginStroke() {
      if (stroke) return false;
      stroke = new Map(); return true;
    }
    function commitStroke() {
      if (!stroke) return false;
      const changes = [...stroke.values()];
      stroke = null;
      if (!changes.length) return false;
      history.splice(cursor);
      history.push(changes); cursor++;
      return true;
    }
    function setPixel(code, x, y, value) {
      const {at, mask} = location(code, x, y);
      if (value !== 0 && value !== 1) throw new TypeError('Pixel value must be 0 or 1.');
      const before = Number(Boolean(bytes[at] & mask));
      if (before === value) return false;
      const atomic = !stroke;
      if (atomic) beginStroke();
      const key = at * 8 + x % 8;
      const pixel = stroke.get(key) || {code, x, y, at, mask, before, after: value};
      pixel.after = value;
      apply(pixel, value);
      if (pixel.before === value) stroke.delete(key); else stroke.set(key, pixel);
      if (atomic) commitStroke();
      return true;
    }
    function cancelStroke() {
      if (!stroke) return false;
      const changed = Boolean(stroke.size);
      for (const pixel of stroke.values()) apply(pixel, pixel.before);
      stroke = null; return changed;
    }
    function undo() {
      commitStroke();
      if (!cursor) return false;
      for (const pixel of history[--cursor]) apply(pixel, pixel.before);
      return true;
    }
    function redo() {
      commitStroke();
      if (cursor === history.length) return false;
      for (const pixel of history[cursor++]) apply(pixel, pixel.after);
      return true;
    }
    function reset(first, last) {
      commitStroke(); beginStroke();
      for (let code = first; code <= last; code++) {
        if (!dirty[code]) continue;
        const glyph = glyphs[code];
        for (let y = 0; y < font.height; y++) for (let x = 0; x < glyph.width; x++) {
          const {at, mask} = location(code, x, y);
          setPixel(code, x, y, Number(Boolean(original[at] & mask)));
        }
      }
      return commitStroke();
    }
    return Object.freeze({
      font, setPixel, beginStroke, commitStroke, cancelStroke, undo, redo,
      resetGlyph(code) { checkedGlyph(code); return reset(code, code); },
      resetAll() { return reset(font.first, font.last); },
      isGlyphDirty(code) { checkedGlyph(code); return Boolean(dirty[code]); },
      export() { commitStroke(); return bytes.slice().buffer; },
      markSaved() { commitStroke(); saved = bytes.slice(); unsavedPixels = 0; },
      get dirtyGlyphCount() { return dirtyGlyphs; },
      get dirtyPixelCount() { return dirtyPixels; },
      get isSaved() { return unsavedPixels === 0; },
      get canUndo() { return Boolean(stroke && stroke.size) || cursor > 0; },
      get canRedo() { return !(stroke && stroke.size) && cursor < history.length; },
      get strokeActive() { return stroke !== null; }
    });
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
  const api = {parse, character, encode, edit};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XTFont = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
