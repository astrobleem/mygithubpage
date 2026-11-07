/* XT Pixels viewer. MIT, Copyright (c) 2026 Windows XT contributors. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fonts = new Map(), editors = new Map();
  const names = Array.from($('font').options, option => option.value);
  const descriptions = {
    XTCSYS: ['System / 8 px', 'Corrected capital M and W use 7-pixel ink and 9-pixel advances. I, J, C, E and S have one extra blank advance pixel to preserve Windows’ 8 × 8 dialog base units. The short System strike for XTC graphics profiles.'],
    XTCFIX: ['Fixed / 8 × 8', 'Fixed-width ANSI characters, with one extra pixel of external line spacing.'],
    XTCOEM: ['OEM / 8 × 8', 'CP437 characters with full-cell box drawing, shades, blocks and control pictures.'],
    XTESYS: ['System / 12 px', 'The taller proportional System strike in the XTE family.'],
    XTEFIX: ['Fixed / 8 × 10', 'The taller fixed-width ANSI strike in the XTE family.'],
    XTEOEM: ['OEM / 8 × 8', 'The XTE OEM alias contains exactly the same font bytes as XTCOEM.'],
    XTTSYS: ['Text System / 8 × 8', 'The fixed System strike supplied for text-mode use. Previewed independently of experimental text-mode display.'],
    CG1SYS: ['Compact System / 5 px', 'Proportional 5-row CGA System, averaging 3 pixels wide. ASCII artwork; extended bytes have placeholder boxes.'],
    CG1HELV: ['Compact Helv / 5 px', 'Proportional 5-row CGA Helv, averaging 3 pixels wide. The smallest UI strike in the current CGA packet.'],
    CG1COUR: ['Compact Courier / 4 × 5', 'Four-pixel fixed advance and five bitmap rows. Original compact CGA ASCII artwork.'],
    CG1FIX: ['Compact Fixed / 4 × 6', 'Four-pixel fixed advance and six rows, including room for descenders. ASCII artwork with extended placeholders.'],
    CG1OEM: ['Compact OEM / 4 × 6', 'ASCII plus full-cell CP437 box drawing, shades and blocks. Other extended and control-picture bytes are placeholder boxes.'],
    CG2SYS: ['Compact System / 6 px', 'Six-row proportional CGA System. Average width 4 px, with wider M/W forms.'],
    CG2HELV: ['Compact Helv / 6 px', 'Six-row proportional CGA Helv. ASCII artwork and the original fixed dialog metrics.'],
    CG6HELV: ['Helv / 8 px', 'The existing proportional CGA640 Helv. Full XT Pixels ANSI artwork, with blank side bearings removed and its original widths preserved.'],
    T1P8: ['Tandy I / 8 px', 'XT Tandy I: classic Tandy 1000 Video I artwork, with true proportional spacing. Optional application font; system defaults stay unchanged.'],
    T1P12: ['Tandy I / 12 px', 'XT Tandy I at 12 rows, using a deliberate vertical row map and the same proportional advances as its 8-row companion.'],
    T2P8: ['Tandy II / 8 px', 'XT Tandy II: classic Tandy 1000 Video II artwork, with true proportional spacing. Optional application font; system defaults stay unchanged.'],
    T2P12: ['Tandy II / 12 px', 'XT Tandy II at 12 rows, using a deliberate vertical row map and the same proportional advances as its 8-row companion.'],
    TKP8: ['Tandy 2K / 8 px', 'XT Tandy 2K: lighter Tandy 2000 graphics artwork, trimmed to proportional advances with one pixel of spacing.'],
    TKP12: ['Tandy 2K / 12 px', 'XT Tandy 2K at 12 rows: lighter artwork, a deliberate vertical row map and the same proportional advances as its 8-row companion.']
  };
  const installableFonts = new Set(['CG1HELV', 'CG2HELV', 'CG6HELV', 'T1P8', 'T1P12', 'T2P8', 'T2P12', 'TKP8', 'TKP12']);
  const fontURL = name => `fonts/${name}.FON${name === 'XTCSYS' ? '?rev=cap5' : installableFonts.has(name) ? '?rev=fontres1' : ''}`;
  const themes = {paper: ['#253325', '#fffef7'], terminal: ['#b9f68a', '#17251b'], windows: ['#ffffff', '#000080']};
  const samples = {
    desktop: 'Windows XT\nFile  Edit  View  Help\nOpen a document\nSave changes?\n[ OK ]  [ Cancel ]',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789\nIl1 O0 rn m  !?.,:;\nÀÉÎÖÜ  àéîöü  £¥¢',
    oem: '╔════════════════════╗\n║     WINDOWS XT     ║\n╠════════════════════╣\n║ ░░▒▒▓▓██  ♥ ♫ ☺    ║\n╚════════════════════╝'
  };
  let selected = 0x41;
  let current, pointer = null, pixelFocus = 0;
  const hex = byte => byte.toString(16).toUpperCase().padStart(2, '0');
  function paintGlyph(ctx, glyph, x, y, zoom) {
    glyph.rows.forEach((row, gy) => row.forEach((ink, gx) => {
      if (ink) ctx.fillRect(x + gx * zoom, y + gy * zoom, zoom, zoom);
    }));
  }
  function render(canvas, font, lines, zoom, colors = themes.paper, padding = 4) {
    // Keep even pathological pasted text within browser canvas limits.
    const maxWidth = 2400, maxLines = 80;
    let width = Math.max(1, ...lines.slice(0, maxLines).map(line => line.reduce((w, code) => w + font.glyph(code).width, 0)));
    const tooWide = width > maxWidth;
    width = Math.min(width, maxWidth);
    const lineLimit = Math.max(1, Math.min(maxLines, Math.floor(
      (4000000 / ((width + padding * 2) * zoom * zoom) - padding * 2) / (font.height + font.external))));
    const visible = lines.slice(0, lineLimit), clipped = lines.length > lineLimit;
    const height = Math.max(font.height, visible.length * (font.height + font.external) - font.external);
    canvas.width = (width + padding * 2) * zoom;
    canvas.height = (height + padding * 2) * zoom;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colors[1]; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors[0];
    visible.forEach((line, index) => {
      let x = padding * zoom;
      for (const code of line) {
        const glyph = font.glyph(code);
        if (x + glyph.width * zoom > (width + padding) * zoom) break;
        paintGlyph(ctx, glyph, x, (padding + index * (font.height + font.external)) * zoom, zoom);
        x += glyph.width * zoom;
      }
    });
    return {width, height, clipped: clipped || tooWide};
  }
  function originalPlaceholder(name, byte, font) {
    if (!name.startsWith('CG1') && !name.startsWith('CG2')) return XTFont.character(byte, font.charset) === null;
    return !(byte >= 32 && byte <= 126 || font.charset === 255 && byte >= 176 && byte <= 223);
  }
  function describeByte(byte, font) {
    const glyph = font.glyph(byte), char = XTFont.character(byte, font.charset);
    if (glyph.code !== byte) return `Fallback → ${hex(glyph.code)}`;
    if (char === null) return 'Reserved byte';
    if (char === ' ') return 'Space';
    if (char === '\u00a0') return 'Nonbreaking space';
    return char;
  }
  function repaintTile(byte) {
    const font = fonts.get(current), tile = $('atlas').children[byte];
    render(tile.querySelector('canvas'), font, [[byte]], 2, themes.paper, 0);
  }
  function updateEditor() {
    if (!current) return;
    const editor = editors.get(current), font = editor.font, glyph = font.glyph(selected);
    const editable = glyph.code === selected;
    $('undo').disabled = !editor.canUndo && !editor.strokeActive;
    $('redo').disabled = !editor.canRedo || editor.strokeActive;
    $('reset-glyph').disabled = !editable || !editor.isGlyphDirty(selected);
    $('reset-font').disabled = editor.dirtyGlyphCount === 0;
    $('export-font').disabled = false;
    $('export-font').textContent = `Download ${current}E.FON`;
    if (!editor.isSaved && $('export-status').textContent.startsWith('Download requested:'))
      $('export-status').textContent = 'New edits since the last download. Download again to keep them.';
    const other = [...editors.values()].filter(e => e !== editor && e.dirtyGlyphCount).length;
    $('edit-status').textContent = `${editor.dirtyGlyphCount} changed glyph${editor.dirtyGlyphCount === 1 ? '' : 's'} · ${editor.dirtyPixelCount} pixel${editor.dirtyPixelCount === 1 ? '' : 's'} different from original.` +
      (other ? ` Edits also kept in ${other} other font${other === 1 ? '' : 's'}.` : '');
    $('edit-warning').textContent = !editable ? `Preview only: byte ${hex(selected)} is outside this font’s range. Select ${hex(glyph.code)} to edit its shared default glyph.` :
      editor.isGlyphDirty(selected) ? 'Custom glyph. Reset restores its original pixels.' :
      originalPlaceholder(current, selected, font) ? 'Original placeholder box. You can draw a character in this byte’s cell.' : '';
    for (const button of $('pixel-grid').children) {
      const x = Number(button.dataset.x), y = Number(button.dataset.y), ink = glyph.rows[y][x];
      button.setAttribute('aria-pressed', String(Boolean(ink))); button.disabled = !editable;
    }
  }
  function finishStroke(cancel = false) {
    if (!pointer) return;
    const previous = pointer; pointer = null;
    if (cancel) editors.get(previous.font).cancelStroke();
    else editors.get(previous.font).commitStroke();
    if ($('pixel-grid').hasPointerCapture(previous.id)) $('pixel-grid').releasePointerCapture(previous.id);
    refreshEdits();
  }
  function refreshEdits() {
    updateEditor();
    // Out-of-range tiles may share the edited default glyph.
    for (let byte = 0; byte < 256; byte++) repaintTile(byte);
    renderText();
  }
  function selectByte(byte, focus = false) {
    if (!current) return;
    finishStroke(); selected = byte;
    const font = fonts.get(current), glyph = font.glyph(byte);
    for (const tile of $('atlas').children) {
      const active = Number(tile.dataset.byte) === byte;
      tile.setAttribute('aria-pressed', String(active)); tile.tabIndex = active ? 0 : -1;
      if (active && focus) tile.focus();
    }
    $('byte').value = hex(byte); $('byte').removeAttribute('aria-invalid');
    $('glyph-byte').textContent = `BYTE ${hex(byte)} / DEC ${byte}`;
    $('glyph-name').textContent = describeByte(byte, font);
    $('glyph-info').textContent = `${glyph.width} × ${font.height} pixels. Advance ${glyph.width} px. ` +
      (glyph.code !== byte ? `Outside the advertised range; uses byte ${hex(glyph.code)}.` : `${current}.FON · dimensions locked.`);
    const grid = $('pixel-grid'); grid.replaceChildren(); grid.style.setProperty('--columns', glyph.width);
    grid.setAttribute('aria-label', `Edit byte ${hex(byte)}, ${describeByte(byte, font)}, ${glyph.width} by ${font.height} pixels`);
    pixelFocus = Math.min(pixelFocus, glyph.width * font.height - 1);
    for (let y = 0; y < font.height; y++) for (let x = 0; x < glyph.width; x++) {
      const button = document.createElement('button'), index = y * glyph.width + x;
      button.type = 'button'; button.dataset.x = x; button.dataset.y = y;
      button.setAttribute('aria-label', `Column ${x + 1}, row ${y + 1}`); button.tabIndex = index === pixelFocus ? 0 : -1;
      button.addEventListener('click', event => {
        if (event.detail !== 0 || glyph.code !== selected) return; // Pointer strokes are handled on the grid.
        editors.get(current).setPixel(selected, x, y, 1 - font.glyph(selected).rows[y][x]); refreshEdits();
      });
      button.addEventListener('keydown', event => {
        const moves = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -glyph.width, ArrowDown: glyph.width};
        let next = index;
        if (event.key in moves) next = (index + moves[event.key] + grid.children.length) % grid.children.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = grid.children.length - 1;
        else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault(); finishStroke(); event.shiftKey ? editors.get(current).redo() : editors.get(current).undo(); refreshEdits(); return;
        } else return;
        event.preventDefault(); pixelFocus = next;
        for (let i = 0; i < grid.children.length; i++) grid.children[i].tabIndex = i === next ? 0 : -1;
        grid.children[next].focus();
      });
      grid.append(button);
    }
    updateEditor();
  }
  function renderText() {
    if (!current) return;
    const font = fonts.get(current), text = $('sample').value.slice(0, 1000), encoded = XTFont.encode(text, font);
    const zoom = Number($('scale').value), colors = themes[$('theme').value];
    const result = render($('preview'), font, encoded.lines, zoom, colors);
    $('preview').parentElement.style.background = colors[1];
    $('preview').setAttribute('aria-label', `${descriptions[current][0]} preview: ${text || '(empty text)'}`);
    $('preview-size').textContent = `${result.width} × ${result.height} px / ${zoom}×`;
    const placeholders = new Set();
    for (const line of encoded.lines) for (const byte of line) {
      if (originalPlaceholder(current, byte, font) && !editors.get(current).isGlyphDirty(byte)) {
        const char = XTFont.character(byte, font.charset); if (char) placeholders.add(char);
      }
    }
    const warnings = [];
    if (encoded.missing.length) warnings.push(`Outside this encoding: ${encoded.missing.join(' ')}. Uses default byte ${hex(font.fallback)} (${describeByte(font.fallback, font)}).`);
    if (placeholders.size) warnings.push(`Original placeholder boxes: ${[...placeholders].join(' ')}. Edit those bytes to draw them.`);
    if (!warnings.length) warnings.push('All characters in this sample have drawn glyphs.');
    if (result.clipped) warnings.push('Very long previews are clipped to keep the browser responsive.');
    $('missing').textContent = warnings.join(' ');
    const firstLine = text.replace(/\r/g, '').split('\n')[0];
    for (const card of $('comparisons').children) {
      const name = card.dataset.font, comparisonFont = fonts.get(name);
      if (!comparisonFont) continue;
      render(card.querySelector('canvas'), comparisonFont, XTFont.encode(firstLine, comparisonFont).lines, 2);
      card.querySelector('canvas').setAttribute('aria-label', `${name}: ${firstLine || '(empty text)'}`);
    }
  }
  function selectFont() {
    const name = $('font').value;
    if (!fonts.has(name)) return;
    finishStroke(); current = name; $('export-status').textContent = '';
    const font = fonts.get(name);
    $('font-title').textContent = descriptions[name][0];
    $('font-description').textContent = descriptions[name][1];
    const license = $('font-license'); license.replaceChildren();
    const tandy = /^(T1P|T2P|TKP)/.test(name);
    license.append(tandy ? 'VileR Tandy artwork · CC BY-SA 4.0; additional XT Pixels artwork · MIT. ' : 'Original XT Pixels artwork · MIT. ');
    const notice = document.createElement('a'); notice.href = tandy ? 'fonts/TANDYLIC.TXT' : 'fonts/LICENSE.TXT';
    notice.textContent = tandy ? 'Tandy license' : 'MIT notice'; notice.download = ''; license.append(notice);
    if (tandy) {
      license.append(' · '); const mit = document.createElement('a'); mit.href = 'fonts/LICENSE.TXT'; mit.textContent = 'MIT notice'; mit.download = ''; license.append(mit);
    }
    $('download').href = fontURL(name); $('download').textContent = `Original ${name}.FON ↗`;
    $('metrics').replaceChildren();
    const metrics = [['Cell height', `${font.height} px`], ['Width', font.fixedWidth ? `${font.fixedWidth} px fixed` : 'Proportional'],
      ['Encoding', font.charset === 255 ? 'CP437 / OEM' : 'Win 3.0 ANSI'], ['Ascent', `${font.ascent} px`],
      ['Leading (int/ext)', `${font.internal} / ${font.external} px`], ['Resource', `FONT ${font.resourceId}`], ['Default byte', hex(font.fallback)], ['Byte range', `${hex(font.first)}–${hex(font.last)}`]];
    for (const [label, value] of metrics) {
      const group = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; group.append(dt, dd); $('metrics').append(group);
    }
    for (const tile of $('atlas').children) {
      const byte = Number(tile.dataset.byte);
      render(tile.querySelector('canvas'), font, [[byte]], 2, themes.paper, 0);
      tile.setAttribute('aria-label', `Byte ${hex(byte)}: ${describeByte(byte, font)}`);
    }
    selectByte(selected); renderText();
  }
  for (let byte = 0; byte < 256; byte++) {
    const tile = document.createElement('button'), canvas = document.createElement('canvas'), label = document.createElement('span');
    tile.type = 'button'; tile.className = 'glyph-tile'; tile.dataset.byte = byte; tile.tabIndex = -1;
    canvas.setAttribute('aria-hidden', 'true'); label.textContent = hex(byte); tile.append(canvas, label);
    tile.addEventListener('click', () => selectByte(byte));
    tile.addEventListener('keydown', event => {
      const moves = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16};
      if (event.key in moves) { event.preventDefault(); selectByte((byte + moves[event.key] + 256) % 256, true); }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); selectByte(event.key === 'Home' ? 0 : 255, true);
      }
    });
    $('atlas').append(tile);
  }
  for (const name of names) {
    const card = document.createElement('div'), heading = document.createElement('div'), title = document.createElement('strong');
    const label = document.createElement('span'), scroll = document.createElement('div'), canvas = document.createElement('canvas');
    card.className = 'compare-card'; card.dataset.font = name; heading.className = 'compare-heading';
    title.textContent = name + '.FON'; label.textContent = descriptions[name][0]; heading.append(title, label);
    scroll.className = 'compare-scroll'; scroll.tabIndex = 0; scroll.setAttribute('aria-label', `${name} comparison; scroll for long lines`);
    canvas.setAttribute('role', 'img'); scroll.append(canvas); card.append(heading, scroll); $('comparisons').append(card);
  }
  $('font').addEventListener('change', selectFont);
  $('sample').addEventListener('input', renderText); $('scale').addEventListener('change', renderText); $('theme').addEventListener('change', renderText);
  $('byte').addEventListener('input', () => {
    if (/^[0-9a-f]{1,2}$/i.test($('byte').value)) {
      // Preserve the user's partially entered byte while updating the selection.
      const input = $('byte').value; selectByte(parseInt(input, 16)); $('byte').value = input;
    } else $('byte').setAttribute('aria-invalid', 'true');
  });
  for (const button of document.querySelectorAll('[data-sample]')) button.addEventListener('click', () => {
    $('sample').value = samples[button.dataset.sample];
    if (button.dataset.sample === 'oem' && fonts.has('XTCOEM')) { $('font').value = /^CG[12]/.test(current) && fonts.has('CG1OEM') ? 'CG1OEM' : 'XTCOEM'; selectFont(); }
    else renderText();
  });
  function gridPoint(event) {
    const rect = $('pixel-grid').getBoundingClientRect(), font = fonts.get(current), glyph = font.glyph(selected);
    const x = Math.floor((event.clientX - rect.left) * glyph.width / rect.width);
    const y = Math.floor((event.clientY - rect.top) * font.height / rect.height);
    return x >= 0 && y >= 0 && x < glyph.width && y < font.height ? {x, y} : null;
  }
  function paintTo(point) {
    if (!point || !pointer) return;
    const editor = editors.get(current);
    let {x, y} = pointer.last; const dx = Math.abs(point.x - x), dy = -Math.abs(point.y - y);
    const sx = x < point.x ? 1 : -1, sy = y < point.y ? 1 : -1; let error = dx + dy;
    for (;;) {
      editor.setPixel(selected, x, y, pointer.ink);
      if (x === point.x && y === point.y) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
    pointer.last = point; refreshEdits();
  }
  $('pixel-grid').addEventListener('pointerdown', event => {
    if (!current || pointer || event.button !== 0 || fonts.get(current).glyph(selected).code !== selected) return;
    const point = gridPoint(event); if (!point) return;
    event.preventDefault();
    const editor = editors.get(current); editor.beginStroke();
    pointer = {id: event.pointerId, font: current, last: point, ink: 1 - editor.font.glyph(selected).rows[point.y][point.x]};
    $('pixel-grid').setPointerCapture(event.pointerId);
    pixelFocus = point.y * editor.font.glyph(selected).width + point.x;
    for (let i = 0; i < $('pixel-grid').children.length; i++) $('pixel-grid').children[i].tabIndex = i === pixelFocus ? 0 : -1;
    $('pixel-grid').children[pixelFocus].focus({preventScroll: true}); paintTo(point);
  });
  $('pixel-grid').addEventListener('pointermove', event => { if (pointer?.id === event.pointerId) { event.preventDefault(); paintTo(gridPoint(event)); } });
  $('pixel-grid').addEventListener('pointerup', event => { if (pointer?.id === event.pointerId) finishStroke(); });
  $('pixel-grid').addEventListener('pointercancel', event => { if (pointer?.id === event.pointerId) finishStroke(true); });
  $('pixel-grid').addEventListener('lostpointercapture', () => finishStroke());
  for (const [id, method] of [['undo', 'undo'], ['redo', 'redo'], ['reset-glyph', 'resetGlyph'], ['reset-font', 'resetAll']]) {
    $(id).addEventListener('click', () => {
      if (!current) return; finishStroke(); editors.get(current)[method](selected); refreshEdits();
      $('export-status').textContent = '';
    });
  }
  $('export-font').addEventListener('click', () => {
    if (!current) return; finishStroke();
    let url;
    try {
      const editor = editors.get(current), bytes = editor.export(); XTFont.parse(bytes);
      url = URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'}));
      const link = document.createElement('a'); link.href = url; link.download = `${current}E.FON`;
      document.body.append(link); link.click(); link.remove(); editor.markSaved();
      $('export-status').textContent = `Download requested: ${current}E.FON. Keep it as a copy; test it before replacing a Windows font.`;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      $('export-status').textContent = 'Download failed. Your edits are still in this tab; try again.';
    }
  });
  window.addEventListener('beforeunload', event => {
    if ([...editors.values()].some(editor => !editor.isSaved)) { event.preventDefault(); event.returnValue = ''; }
  });
  async function load() {
    $('load-status').textContent = 'Loading the font files…';
    const failures = [];
    await Promise.all(names.map(async name => {
      if (fonts.has(name)) return;
      try {
        const response = await fetch(fontURL(name));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const editor = XTFont.edit(await response.arrayBuffer()); editors.set(name, editor); fonts.set(name, editor.font);
      } catch (error) { failures.push(name); }
    }));
    for (const option of $('font').options) option.disabled = !fonts.has(option.value);
    $('font').disabled = fonts.size === 0;
    if (!fonts.has($('font').value) && fonts.size) $('font').value = names.find(name => fonts.has(name));
    selectFont();
    for (const card of $('comparisons').children) {
      const failed = !fonts.has(card.dataset.font); let warning = card.querySelector('.load-warning');
      if (failed && !warning) { warning = document.createElement('p'); warning.className = 'load-warning small'; warning.textContent = 'Font unavailable. Retry loading above.'; card.append(warning); }
      if (!failed && warning) warning.remove();
    }
    $('load-status').replaceChildren();
    if (failures.length) {
      $('load-status').append(`Could not load ${failures.join(', ')}. `);
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry loading'; retry.addEventListener('click', load); $('load-status').append(retry);
    }
  }
  load();
})();
