/* XT Pixels viewer. MIT, Copyright (c) 2026 Windows XT contributors. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fonts = new Map();
  const names = Array.from($('font').options, option => option.value);
  const descriptions = {
    XTCSYS: ['System / 8 px', 'Proportional graphics System font. The XTC family keeps the short cells used by the 200-line profiles.'],
    XTCFIX: ['Fixed / 8 × 8', 'Fixed-width ANSI characters, with one extra pixel of external line spacing.'],
    XTCOEM: ['OEM / 8 × 8', 'CP437 characters with full-cell box drawing, shades, blocks and control pictures.'],
    XTESYS: ['System / 12 px', 'The taller proportional System strike in the XTE family.'],
    XTEFIX: ['Fixed / 8 × 10', 'The taller fixed-width ANSI strike in the XTE family.'],
    XTEOEM: ['OEM / 8 × 8', 'The XTE OEM alias contains exactly the same font bytes as XTCOEM.'],
    XTTSYS: ['Text System / 8 × 8', 'The fixed System strike supplied for text-mode use. Previewed here independently of the experimental text-mode display driver.']
  };
  const themes = {paper: ['#253325', '#fffef7'], terminal: ['#b9f68a', '#17251b'], windows: ['#ffffff', '#000080']};
  const samples = {
    desktop: 'Windows XT\nFile  Edit  View  Help\nOpen a document\nSave changes?\n[ OK ]  [ Cancel ]',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789\nIl1 O0 rn m  !?.,:;\nÀÉÎÖÜ  àéîöü  £¥¢',
    oem: '╔════════════════════╗\n║     WINDOWS XT     ║\n╠════════════════════╣\n║ ░░▒▒▓▓██  ♥ ♫ ☺    ║\n╚════════════════════╝'
  };
  let selected = 0x41;
  let current;
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
  function describeByte(byte, font) {
    const glyph = font.glyph(byte), char = XTFont.character(byte, font.charset);
    if (glyph.code !== byte) return `Fallback → ${hex(glyph.code)}`;
    if (char === null) return 'Reserved · fallback box';
    if (char === ' ') return 'Space';
    if (char === '\u00a0') return 'Nonbreaking space';
    return char;
  }
  function selectByte(byte, focus = false) {
    if (!current) return;
    selected = byte;
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
      (glyph.code !== byte ? `Outside the advertised range; uses byte ${hex(glyph.code)}.` :
        `Original bitmap in ${current}.FON.`);
    const canvas = $('glyph-preview'), scale = 8;
    canvas.width = (glyph.width + 2) * scale; canvas.height = (font.height + 2) * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fffef7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#253325'; paintGlyph(ctx, glyph, scale, scale, scale);
    ctx.strokeStyle = '#25332520'; ctx.lineWidth = 1;
    for (let x = scale; x <= (glyph.width + 1) * scale; x += scale) {
      ctx.beginPath(); ctx.moveTo(x + .5, scale); ctx.lineTo(x + .5, (font.height + 1) * scale); ctx.stroke();
    }
    for (let y = scale; y <= (font.height + 1) * scale; y += scale) {
      ctx.beginPath(); ctx.moveTo(scale, y + .5); ctx.lineTo((glyph.width + 1) * scale, y + .5); ctx.stroke();
    }
    canvas.setAttribute('aria-label', `Byte ${hex(byte)}, ${describeByte(byte, font)}, ${glyph.width} by ${font.height} bitmap pixels`);
  }
  function renderText() {
    if (!current) return;
    const font = fonts.get(current), text = $('sample').value.slice(0, 1000), encoded = XTFont.encode(text, font);
    const zoom = Number($('scale').value), colors = themes[$('theme').value];
    const result = render($('preview'), font, encoded.lines, zoom, colors);
    $('preview').parentElement.style.background = colors[1];
    $('preview').setAttribute('aria-label', `${descriptions[current][0]} preview: ${text || '(empty text)'}`);
    $('preview-size').textContent = `${result.width} × ${result.height} px / ${zoom}×`;
    $('missing').textContent = (encoded.missing.length ?
      `Not in this font: ${encoded.missing.join(' ')}. Shown as ${font.charset === 255 ? 'blank spaces' : 'fallback boxes'}.` :
      'All characters in this sample are available.') +
      (result.clipped ? ' Very long previews are clipped to keep the browser responsive.' : '');
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
    current = name;
    const font = fonts.get(name);
    $('font-title').textContent = descriptions[name][0];
    $('font-description').textContent = descriptions[name][1];
    $('download').href = `fonts/${name}.FON`; $('download').textContent = `Download ${name}.FON ↗`;
    $('metrics').replaceChildren();
    const metrics = [['Cell height', `${font.height} px`], ['Width', font.fixedWidth ? `${font.fixedWidth} px fixed` : 'Proportional'],
      ['Encoding', font.charset === 255 ? 'CP437 / OEM' : 'Win 3.0 ANSI'], ['Ascent', `${font.ascent} px`],
      ['Leading (int/ext)', `${font.internal} / ${font.external} px`], ['Resource', `FONT ${font.resourceId}`]];
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
    if (button.dataset.sample === 'oem' && fonts.has('XTCOEM')) { $('font').value = 'XTCOEM'; selectFont(); }
    else renderText();
  });
  async function load() {
    $('load-status').textContent = 'Loading the font files…';
    const failures = [];
    await Promise.all(names.map(async name => {
      if (fonts.has(name)) return;
      try {
        const response = await fetch(`fonts/${name}.FON`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        fonts.set(name, XTFont.parse(await response.arrayBuffer()));
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
