// Binary editor checks. These run on the host, not a Windows guest or physical PC.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../windows-xt/fonts/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root));
const names = ['XTCSYS', 'XTCFIX', 'XTCOEM', 'XTESYS', 'XTEFIX', 'XTEOEM', 'XTTSYS',
  'CG1SYS', 'CG2SYS', 'CG1FIX', 'CG1OEM', 'CG1COUR', 'CG1HELV', 'CG2HELV'];
const context = vm.createContext({TextDecoder});
vm.runInContext(read('font.js').toString(), context);
const {parse, edit, encode, character} = context.XTFont;
const exported = editor => Buffer.from(editor.export());
const eq = (a, b, label) => assert.ok(Buffer.from(a).equals(Buffer.from(b)), label);
const own = value => JSON.parse(JSON.stringify(value));
let pixels = 0, corners = 0, histories = 0, prefixes = 0;

// This independent byte reader is intentionally separate from XTFont.parse.
function layout(data) {
  const u16 = at => data.readUInt16LE(at), u32 = at => data.readUInt32LE(at);
  const ne = u32(60), res = ne + u16(ne + 36), alignment = 2 ** u16(res);
  const resources = [];
  let table = res + 2;
  while (u16(table)) {
    const type = u16(table), count = u16(table + 2), typeAt = table;
    table += 8;
    for (let i = 0; i < count; i++, table += 12)
      resources.push({type, typeAt, entry: table, start: u16(table) * alignment, size: u16(table + 2) * alignment});
  }
  const resource = resources.find(r => r.type === 0x8008), start = resource.start;
  const first = data[start + 95], last = data[start + 96], height = u16(start + 88);
  const bits = u32(start + 113), face = u32(start + 105), size = u32(start + 2), glyphs = [];
  const masks = Buffer.alloc(data.length);
  for (let code = first; code <= last + 1; code++) {
    const entry = start + 118 + (code - first) * 4, width = u16(entry), offset = u16(entry + 2);
    glyphs[code] = {code, entry, width, offset, start: start + offset};
    if (code <= last) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
      masks[start + offset + Math.floor(x / 8) * height + y] |= 128 >> (x % 8);
  }
  return {ne, res, alignment, resources, resource, start, first, last, height, bits, face, size, glyphs, masks};
}
function pixel(layout, code, x, y) {
  return {code, x, y, at: layout.glyphs[code].start + Math.floor(x / 8) * layout.height + y, mask: 128 >> (x % 8)};
}
const bit = (bytes, p) => Number(Boolean(bytes[p.at] & p.mask));
function write(bytes, p, value) { bytes[p.at] = value ? bytes[p.at] | p.mask : bytes[p.at] & ~p.mask; }
function metadata(font) { const {glyph, ...fields} = font; return own(fields); }
function invariants(original, result, l, label) {
  assert.equal(result.length, original.length, `${label}: length`);
  for (let at = 0; at < original.length; at++)
    assert.equal((result[at] ^ original[at]) & ~l.masks[at], 0, `${label}: protected byte ${at}`);
  eq(result.subarray(l.start, l.start + l.bits), original.subarray(l.start, l.start + l.bits), `${label}: FNT header/table`);
  for (const r of l.resources) if (r.type !== 0x8008)
    eq(result.subarray(r.start, r.start + r.size), original.subarray(r.start, r.start + r.size), `${label}: other resource`);
  eq(result.subarray(l.start + l.face), original.subarray(l.start + l.face), `${label}: names/trailing resources`);
}
function viewMatches(editor, bytes, l) {
  const independentlyParsed = parse(bytes);
  assert.deepEqual(metadata(editor.font), metadata(independentlyParsed));
  let dirtyPixels = 0, dirtyGlyphs = 0;
  for (let code = l.first; code <= l.last; code++) {
    const glyph = editor.font.glyph(code), independent = independentlyParsed.glyph(code);
    assert.equal(glyph.width, l.glyphs[code].width);
    assert.deepEqual(own(glyph.rows), own(independent.rows));
    let glyphDirty = false;
    for (let y = 0; y < l.height; y++) for (let x = 0; x < glyph.width; x++) {
      const p = pixel(l, code, x, y);
      assert.equal(glyph.rows[y][x], bit(bytes, p));
      if (bit(bytes, p) !== bit(l.original, p)) { dirtyPixels++; glyphDirty = true; }
    }
    assert.equal(editor.isGlyphDirty(code), glyphDirty);
    if (glyphDirty) dirtyGlyphs++;
  }
  assert.equal(editor.dirtyPixelCount, dirtyPixels);
  assert.equal(editor.dirtyGlyphCount, dirtyGlyphs);
}

for (const name of names) {
  const source = read(`fonts/${name}.FON`), original = Buffer.from(source), l = layout(source);
  l.original = original;
  const editor = edit(source), f = editor.font, reference = parse(source), glyphCount = l.last - l.first + 1;
  assert.equal(f.first, l.first); assert.equal(f.last, l.last); assert.equal(f.height, l.height);
  assert.deepEqual(metadata(f), metadata(reference));
  assert.equal(editor.dirtyPixelCount, 0); assert.equal(editor.dirtyGlyphCount, 0);
  assert.equal(editor.isSaved, true); assert.equal(editor.canUndo, false); assert.equal(editor.canRedo, false);
  assert.equal(editor.undo(), false); assert.equal(editor.redo(), false);
  assert.equal(editor.cancelStroke(), false); assert.equal(editor.commitStroke(), false);
  assert.equal(editor.resetAll(), false); assert.equal(editor.resetGlyph(l.first), false);
  eq(exported(editor), original, `${name}: no-change export`);
  assert.ok(Object.isFrozen(editor)); assert.ok(Object.isFrozen(f));
  assert.ok(Object.isFrozen(f.glyph(l.first))); assert.ok(Object.isFrozen(f.glyph(l.first).rows));
  assert.ok(Object.isFrozen(f.glyph(l.first).rows[0]));
  assert.throws(() => { f.height = 99; }, TypeError);
  assert.throws(() => { f.glyph(l.first).rows[0][0] ^= 1; }, TypeError);
  const detachedExport = new Uint8Array(editor.export()); detachedExport.fill(0);
  eq(exported(editor), original, `${name}: detached export`);
  source.fill(0);
  eq(exported(editor), original, `${name}: detached input`);
  // Both an exact ArrayBuffer and a sliced, nonzero-offset Uint8Array work.
  const exact = original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength);
  eq(exported(edit(exact)), original, `${name}: ArrayBuffer`);
  const padded = Buffer.concat([Buffer.alloc(13, 0xa5), original, Buffer.alloc(17, 0x5a)]);
  eq(exported(edit(new Uint8Array(padded.buffer, padded.byteOffset + 13, original.length))), original, `${name}: sliced view`);
  assert.equal(padded[0], 0xa5); assert.equal(padded.at(-1), 0x5a);
  // A decoder result cannot change the editor, and editor writes cannot change it.
  reference.glyph(l.first).rows[0][0] ^= 1;
  eq(exported(editor), original, `${name}: independent decoder`);

  const expected = Buffer.from(original), cornersEditor = edit(original);
  let expectedPixels = 0;
  for (let code = l.first; code <= l.last; code++) {
    const glyph = f.glyph(code), width = glyph.width, stableGlyph = glyph;
    const xs = [...new Set([0, width - 1, 7, 8].filter(x => x < width))];
    for (const y of [0, l.height - 1]) for (const x of xs) {
      const p = pixel(l, code, x, y), value = 1 - bit(original, p), single = Buffer.from(original);
      write(single, p, value);
      assert.equal(cornersEditor.setPixel(code, x, y, value), true);
      eq(exported(cornersEditor), single, `${name}:${code} boundary ${x},${y}`);
      assert.equal(cornersEditor.dirtyPixelCount, 1); assert.equal(cornersEditor.dirtyGlyphCount, 1);
      assert.equal(cornersEditor.undo(), true); eq(exported(cornersEditor), original);
      assert.equal(cornersEditor.redo(), true); eq(exported(cornersEditor), single);
      assert.equal(cornersEditor.undo(), true); eq(exported(cornersEditor), original);
      corners++;
    }
    assert.equal(editor.beginStroke(), true); assert.equal(editor.beginStroke(), false);
    assert.equal(editor.strokeActive, true);
    const retainedRows = glyph.rows, retainedFirstRow = glyph.rows[0], retainedFirst = glyph.rows[0][0];
    for (let y = 0; y < l.height; y++) for (let x = 0; x < width; x++) {
      const p = pixel(l, code, x, y), value = 1 - bit(original, p);
      assert.equal(editor.setPixel(code, x, y, value), true);
      assert.equal(editor.setPixel(code, x, y, value), false);
      write(expected, p, value);
      assert.equal(f.glyph(code).rows[y][x], value);
      pixels++; expectedPixels++;
    }
    assert.equal(editor.commitStroke(), true); assert.equal(editor.commitStroke(), false);
    assert.equal(editor.strokeActive, false); assert.equal(f.glyph(code), stableGlyph);
    assert.notEqual(glyph.rows, retainedRows); assert.equal(retainedRows[0], retainedFirstRow);
    assert.equal(retainedFirstRow[0], retainedFirst);
    assert.equal(editor.dirtyGlyphCount, code - l.first + 1);
    assert.equal(editor.dirtyPixelCount, expectedPixels);
  }
  eq(exported(editor), expected, `${name}: every advertised pixel inverted`);
  invariants(original, expected, l, name); viewMatches(editor, expected, l);
  assert.deepEqual(own(encode('Aé\t╔😀\r\nB', f)), own(encode('Aé\t╔😀\r\nB', parse(original))));
  for (let code = 0; code < 256; code++) {
    assert.equal(character(code, f.charset), character(code, reference.charset));
    assert.equal(f.glyph(code).width, reference.glyph(code).width);
  }
  for (let i = 0; i < glyphCount; i++) assert.equal(editor.undo(), true);
  assert.equal(editor.undo(), false); eq(exported(editor), original); assert.equal(editor.isSaved, true);
  viewMatches(editor, original, l);
  for (let i = 0; i < glyphCount; i++) assert.equal(editor.redo(), true);
  assert.equal(editor.redo(), false); eq(exported(editor), expected);
  editor.markSaved(); assert.equal(editor.isSaved, true); assert.equal(editor.dirtyGlyphCount, glyphCount);
  assert.equal(editor.resetGlyph(l.first), true); assert.equal(editor.isSaved, false);
  assert.equal(editor.dirtyGlyphCount, glyphCount - 1); assert.equal(editor.isGlyphDirty(l.first), false);
  const firstReset = exported(editor); invariants(original, firstReset, l, `${name}: reset glyph`);
  assert.equal(editor.resetGlyph(l.first), false);
  assert.equal(editor.undo(), true); eq(exported(editor), expected); assert.equal(editor.isSaved, true);
  assert.equal(editor.redo(), true); eq(exported(editor), firstReset);
  assert.equal(editor.resetAll(), true); eq(exported(editor), original); assert.equal(editor.dirtyPixelCount, 0);
  assert.equal(editor.isSaved, false); assert.equal(editor.resetAll(), false);
  assert.equal(editor.undo(), true); eq(exported(editor), firstReset);
  assert.equal(editor.undo(), true); eq(exported(editor), expected);
  assert.equal(editor.redo(), true); assert.equal(editor.redo(), true); eq(exported(editor), original);
  editor.markSaved(); assert.equal(editor.isSaved, true);

  // Atomic changes, branch preservation, cancel, active-stroke undo/export/reset.
  const e = edit(original), a = pixel(l, l.first, 0, 0), b = pixel(l, l.last, l.glyphs[l.last].width - 1, l.height - 1);
  const toggle = p => e.setPixel(p.code, p.x, p.y, 1 - e.font.glyph(p.code).rows[p.y][p.x]);
  assert.equal(toggle(a), true); assert.equal(e.undo(), true); assert.equal(e.canRedo, true);
  assert.equal(e.beginStroke(), true); toggle(b); toggle(b);
  assert.equal(e.commitStroke(), false); assert.equal(e.canRedo, true); eq(exported(e), original);
  e.beginStroke(); toggle(a); toggle(b); assert.equal(e.canRedo, false); assert.equal(e.dirtyGlyphCount, 2);
  assert.equal(e.cancelStroke(), true); assert.equal(e.canRedo, true); eq(exported(e), original);
  e.beginStroke(); assert.equal(e.cancelStroke(), false);
  assert.equal(e.redo(), true); e.markSaved(); assert.equal(e.isSaved, true); assert.equal(e.dirtyPixelCount, 1);
  toggle(a); assert.equal(e.dirtyPixelCount, 0); assert.equal(e.isSaved, false);
  assert.equal(e.undo(), true); assert.equal(e.isSaved, true);
  assert.equal(e.undo(), true); assert.equal(e.isSaved, false); assert.equal(e.dirtyPixelCount, 0);
  assert.equal(e.redo(), true); assert.equal(e.isSaved, true);
  assert.equal(e.undo(), true); toggle(b); assert.equal(e.canRedo, false); assert.equal(e.redo(), false);
  assert.equal(e.undo(), true); eq(exported(e), original);
  e.beginStroke(); toggle(a); assert.equal(e.undo(), true); assert.equal(e.strokeActive, false);
  assert.equal(e.redo(), true); assert.equal(e.resetAll(), true);
  e.beginStroke(); toggle(a); exported(e); assert.equal(e.strokeActive, false); assert.equal(e.undo(), true);
  e.beginStroke(); toggle(a); e.markSaved(); assert.equal(e.strokeActive, false); assert.equal(e.isSaved, true);
  assert.equal(e.resetGlyph(l.first), true); assert.equal(e.isSaved, false);
  assert.equal(e.undo(), true); assert.equal(e.isSaved, true); assert.equal(e.undo(), true);
  e.beginStroke(); toggle(b); assert.equal(e.resetAll(), true); eq(exported(e), original);
  assert.equal(e.undo(), true); assert.equal(e.dirtyPixelCount, 1); assert.equal(e.undo(), true); eq(exported(e), original);

  // Every invalid coordinate is rejected before any fallback glyph can change.
  const beforeInvalid = exported(e);
  const invalidCodes = [l.first - 1, l.last + 1, -1, 256, 65.5, NaN, Infinity, '65', null, undefined, {}, 65n];
  for (const code of invalidCodes) {
    assert.throws(() => e.setPixel(code, 0, 0, 1), /Character/);
    assert.throws(() => e.resetGlyph(code), /Character/);
    assert.throws(() => e.isGlyphDirty(code), /Character/);
  }
  for (const x of [-1, l.glyphs[l.first].width, 0.5, NaN, Infinity, '0', null, undefined, 0n])
    assert.throws(() => e.setPixel(l.first, x, 0, 1), /Pixel/);
  for (const y of [-1, l.height, 0.5, NaN, Infinity, '0', null, undefined, 0n])
    assert.throws(() => e.setPixel(l.first, 0, y, 1), /Pixel/);
  for (const value of [-1, 2, 0.5, NaN, Infinity, true, false, '1', null, undefined, 1n])
    assert.throws(() => e.setPixel(l.first, 0, 0, value), /value/);
  eq(exported(e), beforeInvalid, `${name}: invalid input leaves state unchanged`);
  // Validation during a live stroke must not accidentally commit/cancel it.
  e.beginStroke(); toggle(a);
  assert.throws(() => e.resetGlyph(l.first - 1)); assert.equal(e.strokeActive, true);
  assert.throws(() => e.setPixel(l.first, -1, 0, 1)); assert.equal(e.strokeActive, true);
  assert.equal(e.cancelStroke(), true); eq(exported(e), beforeInvalid);

  // A long deterministic history crosses byte columns, glyphs and saved states.
  const long = edit(original), wanted = Buffer.from(original), actions = [];
  let seed = 0x6c8e9cf5;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const count = name === 'XTESYS' ? 12001 : 2049;
  for (let i = 0; i < count; i++) {
    const code = l.first + random(glyphCount), x = random(l.glyphs[code].width), y = random(l.height);
    const p = pixel(l, code, x, y), before = bit(wanted, p);
    assert.equal(long.setPixel(code, x, y, 1 - before), true); write(wanted, p, 1 - before);
    actions.push({...p, before});
    if (i === Math.floor(count / 2)) long.markSaved();
  }
  eq(exported(long), wanted); invariants(original, wanted, l, `${name}: long history`);
  viewMatches(long, wanted, l);
  for (let i = count - 1; i >= 0; i--) {
    assert.equal(long.undo(), true); write(wanted, actions[i], actions[i].before);
    if (i % 511 === 0) eq(exported(long), wanted);
  }
  assert.equal(long.undo(), false); eq(exported(long), original); viewMatches(long, original, l);
  for (let i = 0; i < count; i++) {
    assert.equal(long.redo(), true); write(wanted, actions[i], 1 - actions[i].before);
    if (i % 511 === 0) eq(exported(long), wanted);
  }
  assert.equal(long.redo(), false); eq(exported(long), wanted);
  for (let i = 0; i < Math.floor(count / 2); i++) assert.equal(long.undo(), true);
  long.beginStroke();
  const atBranch = exported(long); // export commits an empty stroke, preserving redo.
  assert.equal(long.canRedo, true); long.beginStroke();
  const branchValue = long.font.glyph(l.first).rows[0][0];
  long.setPixel(l.first, 0, 0, 1 - branchValue); long.cancelStroke();
  eq(exported(long), atBranch); assert.equal(long.canRedo, true);
  long.setPixel(l.first, 0, 0, 1 - branchValue); assert.equal(long.canRedo, false);
  assert.equal(long.undo(), true); eq(exported(long), atBranch);
  histories += count;

  // All truncated byte prefixes fail cleanly for both reading and editing.
  for (let cut = 0; cut < original.length; cut++) {
    assert.throws(() => parse(original.subarray(0, cut)));
    assert.throws(() => edit(original.subarray(0, cut))); prefixes++;
  }
  const reject = (change, both = true, label = '') => {
    const corrupt = Buffer.from(original); change(corrupt);
    if (both) assert.throws(() => parse(corrupt), `${name}: decoder ${label}`);
    else assert.doesNotThrow(() => parse(corrupt), `${name}: decoder remains compatible ${label}`);
    assert.throws(() => edit(corrupt), `${name}: editor ${label}`);
  };
  reject(d => d.writeUInt16LE(0, 0));
  reject(d => d.writeUInt32LE(0xffffffff, 60));
  reject(d => d.writeUInt16LE(0, l.ne));
  reject(d => d.writeUInt16LE(17, l.res));
  reject(d => d.writeUInt16LE(0xffff, l.resources[0].typeAt + 2));
  reject(d => d.writeUInt16LE(0x300, l.start));
  reject(d => d.writeUInt32LE(117, l.start + 2));
  reject(d => d.writeUInt32LE(l.resource.size + 1, l.start + 2));
  reject(d => d.writeUInt16LE(1, l.start + 66));
  reject(d => d.writeUInt16LE(0, l.start + 88));
  reject(d => d.writeUInt16LE(33, l.start + 88));
  reject(d => { d[l.start + 95] = 255; d[l.start + 96] = 1; });
  reject(d => { d[l.start + 97] = 255; });
  reject(d => d.writeUInt32LE(l.bits, l.start + 105));
  reject(d => d.writeUInt32LE(l.size, l.start + 105));
  reject(d => d.writeUInt32LE(118, l.start + 113));
  reject(d => d.fill(65, l.start + l.face, l.start + l.size));
  reject(d => d.writeUInt16LE(0, l.glyphs[l.first].entry));
  reject(d => d.writeUInt16LE(65, l.glyphs[l.first].entry));
  reject(d => d.writeUInt16LE(l.bits - 1, l.glyphs[l.first].entry + 2));
  reject(d => d.writeUInt16LE(l.face, l.glyphs[l.first].entry + 2));
  reject(d => d.writeUInt16LE(0x8008, l.resources.at(-1).typeAt));
  reject(d => d.writeUInt16LE(l.glyphs[l.first].offset, l.glyphs[l.first + 1].entry + 2), false, 'shared glyph');
  reject(d => d.writeUInt16LE(l.glyphs[l.first].offset + 1, l.glyphs[l.first + 1].entry + 2), false, 'partial shared glyph');
  reject(d => d.writeUInt16LE(l.glyphs[l.first].offset, l.glyphs[l.last + 1].entry + 2), false, 'shared sentinel');
  reject(d => d.writeUInt16LE(65, l.glyphs[l.last + 1].entry), false, 'invalid sentinel width');
  reject(d => d.writeUInt16LE(l.face, l.glyphs[l.last + 1].entry + 2), false, 'sentinel outside bits');
  reject(d => d.writeUInt32LE(l.glyphs[l.first].offset, l.start + 101), false, 'device shares bitmap');
  reject(d => d.writeUInt32LE(l.size, l.start + 101), false, 'invalid device pointer');
  reject(d => d.writeUInt16LE(1, l.ne + 28), false, 'code segment');
  reject(d => d.writeUInt16LE(1, l.ne + 30), false, 'imported module');
  reject(d => d.writeUInt16LE(1, 18), false, 'MZ checksum');
  reject(d => d.writeUInt32LE(1, l.ne + 8), false, 'NE checksum');
  reject(d => d.writeUInt16LE(l.glyphs[l.first].start - l.ne, l.ne + 4), false, 'entry table in glyph');
  reject(d => d.writeUInt16LE(l.glyphs[l.first].start - l.res, l.resources.at(-1).entry + 6), false, 'resource name in glyph');
  reject(d => {
    d.writeUInt16LE(Math.floor(l.glyphs[l.first].start / l.alignment), l.resources[0].entry);
    d.writeUInt16LE(1, l.resources[0].entry + 2);
  }, false, 'FONTDIR overlaps bitmap');
  const validDevice = Buffer.from(original); validDevice.writeUInt32LE(l.face, l.start + 101);
  eq(exported(edit(validDevice)), validDevice, `${name}: non-overlapping device name`);
}
for (const input of [null, undefined, 10, 'font', [], {}, new Uint16Array(10), new DataView(new ArrayBuffer(10))])
  assert.throws(() => edit(input));
console.log(`PASS FON editor: ${names.length} fonts, ${pixels} individually edited pixels, ${corners} boundary edits, ${histories} history steps, ${prefixes} truncated inputs, isolated exports, exact protected bytes, metrics, undo/redo/reset/save/branch/cancel and malformed-storage checks. Host binary checks only; no Windows/native runtime qualification.`);
