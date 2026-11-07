// Host font decoder and synthetic UI checks. No browser or DOS guest is launched.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../windows-xt/fonts/', import.meta.url);
const names = ['XTCSYS','XTCFIX','XTCOEM','XTESYS','XTEFIX','XTEOEM','XTTSYS','CG1SYS','CG1HELV','CG1COUR','CG1FIX','CG1OEM','CG2SYS','CG2HELV'];
const read = name => fs.readFileSync(new URL(name,root));
const context = vm.createContext({TextDecoder,Uint8Array,DataView});
vm.runInContext(read('font.js').toString(),context);
const fontAPI = context.XTFont;
let pixels = 0;
for (const name of names) {
  const data = read(`fonts/${name}.FON`), f = fontAPI.parse(data);
  const ne = data.readUInt32LE(60), res = ne + data.readUInt16LE(ne + 36), align = 2 ** data.readUInt16LE(res);
  let table = res + 2, start;
  while (data.readUInt16LE(table)) {
    const kind = data.readUInt16LE(table), count = data.readUInt16LE(table + 2); table += 8;
    for (let i=0;i<count;i++,table+=12) if(kind===0x8008) start=data.readUInt16LE(table)*align;
  }
  for(let code=0;code<256;code++) {
    const input=code<f.first||code>f.last?f.fallback:code;
    const entry=start+118+4*(input-f.first), width=data.readUInt16LE(entry), offset=data.readUInt16LE(entry+2);
    const glyph=f.glyph(code); assert.equal(glyph.width,width);
    for(let y=0;y<f.height;y++) for(let x=0;x<width;x++) {
      assert.equal(glyph.rows[y][x],Number(Boolean(data[start+offset+Math.floor(x/8)*f.height+y] & (128 >> (x%8))))); pixels++;
    }
  }
  assert.equal(f.height, name==='XTESYS'?12:name==='XTEFIX'?10:name.startsWith('CG')?(name.startsWith('CG2')||['CG1FIX','CG1OEM'].includes(name)?6:5):8);
  assert.equal(f.charset,name.endsWith('OEM')?255:0);
  assert.equal(fontAPI.encode('€😀',f).missing.length,2);
  assert.equal(fontAPI.encode('A\r\nB\tC',f).lines[1].join(','),'66,32,32,32,32,67');
  for(const cut of [0,1,2,60,63,64,100,128,256,512,1024,data.length-128]) assert.throws(()=>fontAPI.parse(data.subarray(0,cut)));
  const corrupt=Buffer.from(data); corrupt.writeUInt32LE(0xffffffff,60);assert.throws(()=>fontAPI.parse(corrupt));
}
assert.ok(read('fonts/XTCOEM.FON').equals(read('fonts/XTEOEM.FON')));
assert.equal(fontAPI.encode('╔═╗☺',fontAPI.parse(read('fonts/XTCOEM.FON'))).lines[0].join(','),'201,205,187,1');
const html=read('index.html').toString();
assert.match(html,/script-src 'self';/);assert.ok(!html.includes('unsafe-eval'));
assert.match(html,/href="\.\.\/"/);assert.match(html,/maxlength="1000"/);
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
class Element {
  constructor(tag='div') { this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.events={};this.style={setProperty(k,v){this[k]=v;}};this.value='';this.textContent='';this.disabled=false; }
  append(...nodes) { for(const node of nodes) if(typeof node==='string') this.textContent+=node; else { node.parentElement=this;this.children.push(node); } }
  replaceChildren(...nodes) { this.children=[];this.textContent='';this.append(...nodes); }
  setAttribute(k,v) { this.attrs[k]=v; } removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(k,v) { this.events[k]=v; } focus() { this.focused=true; }
  querySelector(s) { return this.children.find(c=>s.startsWith('.')?c.className?.split(' ').includes(s.slice(1)):c.tag===s) || this.children.map(c=>c.querySelector(s)).find(Boolean); }
  remove() { this.parentElement.children=this.parentElement.children.filter(c=>c!==this); }
  click() { this.clicked=true; }
  getBoundingClientRect() {return {left:0,top:0,width:140,height:120};}
  setPointerCapture(id) {this.pointer=id;} hasPointerCapture(id) {return this.pointer===id;} releasePointerCapture() {this.pointer=null;}
  set width(value) {this._width=value;this.draws=[];} get width() {return this._width;}
  getContext() {const element=this;return {fillRect(...args){element.draws.push([this.fillStyle,...args]);},beginPath(){},moveTo(){},lineTo(){},stroke(){}};}
}
async function ui(failed=[]) {
  const elements=new Map(ids.map(id=>[id,new Element()]));
  const get=id=>elements.get(id), buttons=['desktop','alphabet','oem'].map(sample=>{const b=new Element('button');b.dataset.sample=sample;return b;});
  get('font').options=names.map(value=>({value}));get('font').value=names[0];get('font').disabled=true;
  get('scale').value='3';get('theme').value='paper';get('sample').value='Windows XT';get('preview').parentElement=new Element();
  const downloads=[],windowEvents={};
  const document={body:new Element('body'),getElementById:get,createElement:tag=>new Element(tag),querySelectorAll:()=>buttons};
  const ctx=vm.createContext({document,XTFont:fontAPI,TextDecoder,Uint8Array,DataView,console,Blob,
    window:{addEventListener(k,fn){windowEvents[k]=fn;}},URL:{createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},setTimeout(){},
    fetch:async url=>({ok:!failed.some(n=>url.includes(n)),status:404,arrayBuffer:async()=>read(url)})});
  vm.runInContext(read('viewer.js').toString(),ctx);await new Promise(resolve=>setImmediate(resolve));
  return {get,buttons,failed,downloads,windowEvents};
}
const {get,buttons,downloads,windowEvents}=await ui();
assert.equal(get('font').disabled,false);assert.equal(get('atlas').children.length,256);assert.equal(get('comparisons').children.length,14);
for(const name of names) {get('font').value=name;get('font').events.change();assert.match(get('download').href,new RegExp(name));}
get('sample').value='€😀';get('sample').events.input();assert.match(get('missing').textContent,/Outside this encoding/);
get('font').value='XTCSYS';get('font').events.change();buttons[2].events.click();assert.equal(get('font').value,'XTCOEM');assert.match(get('missing').textContent,/All characters/);
get('byte').value='FF';get('byte').events.input();assert.match(get('glyph-name').textContent,/Fallback/);
get('byte').value='GG';get('byte').events.input();assert.equal(get('byte').attrs['aria-invalid'],'true');
get('atlas').children[255].events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(get('byte').value,'00');
get('atlas').children[0].events.keydown({key:'End',preventDefault(){}});assert.equal(get('byte').value,'FF');
get('theme').value='terminal';get('theme').events.change();assert.equal(get('preview').parentElement.style.background,'#17251b');
get('sample').value='';get('sample').events.input();assert.ok(get('preview').width>0);
get('sample').value='W'.repeat(900)+'\n'.repeat(79);get('scale').value='6';get('sample').events.input();
assert.ok(get('preview').width*get('preview').height<=4000000);assert.match(get('missing').textContent,/clipped/);
const partial=await ui(['XTESYS']);assert.equal(partial.get('font').options[3].disabled,true);assert.match(partial.get('load-status').textContent,/XTESYS/);
partial.failed.length=0;await partial.get('load-status').children[0].events.click();assert.equal(partial.get('font').options[3].disabled,false);assert.equal(partial.get('load-status').textContent,'');
const none=await ui([...names]);assert.equal(none.get('font').disabled,true);none.failed.length=0;await none.get('load-status').children[0].events.click();assert.equal(none.get('font').disabled,false);
// Keyboard editing, isolated font state, downloads, coverage, drag and cancelled pointer flows.
get('font').value='CG1SYS';get('font').events.change();get('byte').value='41';get('byte').events.input();
get('sample').value='Aé€😀';get('sample').events.input();
assert.match(get('missing').textContent,/Original placeholder boxes: é/);assert.match(get('missing').textContent,/default byte 3F/);
assert.equal(get('pixel-grid').children.length,20);assert.equal(get('undo').disabled,true);
const clickPixel=(index=0)=>get('pixel-grid').children[index].events.click({detail:0});
clickPixel();assert.match(get('edit-status').textContent,/1 changed glyph/);assert.equal(get('undo').disabled,false);
let prevented=false;windowEvents.beforeunload({preventDefault(){prevented=true;}});assert.ok(prevented);
get('export-font').events.click();assert.equal(downloads.length,1);assert.match(get('export-status').textContent,/CG1SYSE.FON/);
const edited=Buffer.from(await downloads[0].arrayBuffer()),original=read('fonts/CG1SYS.FON');assert.equal(edited.length,original.length);assert.ok(!edited.equals(original));
prevented=false;windowEvents.beforeunload({preventDefault(){prevented=true;}});assert.equal(prevented,false);
get('undo').events.click();assert.match(get('edit-status').textContent,/0 changed glyphs/);get('export-font').events.click();assert.ok(Buffer.from(await downloads[1].arrayBuffer()).equals(original));
get('redo').events.click();assert.match(get('edit-status').textContent,/1 changed glyph/);
get('font').value='CG1FIX';get('font').events.change();assert.match(get('edit-status').textContent,/0 changed glyphs/);assert.match(get('edit-status').textContent,/1 other font/);
get('font').value='CG1SYS';get('font').events.change();assert.match(get('edit-status').textContent,/1 changed glyph/);
get('reset-glyph').events.click();assert.match(get('edit-status').textContent,/0 changed glyphs/);get('undo').events.click();assert.match(get('edit-status').textContent,/1 changed glyph/);
get('reset-font').events.click();assert.match(get('edit-status').textContent,/0 changed glyphs/);
get('byte').value='E9';get('byte').events.input();assert.match(get('edit-warning').textContent,/placeholder/);clickPixel();assert.doesNotMatch(get('missing').textContent,/Original placeholder boxes/);
get('reset-glyph').events.click();assert.match(get('missing').textContent,/Original placeholder boxes/);
get('byte').value='00';get('byte').events.input();assert.ok(get('pixel-grid').children.every(b=>b.disabled));assert.match(get('edit-warning').textContent,/Preview only/);
get('byte').value='41';get('byte').events.input();
const pointer=(clientX,clientY,pointerId=1)=>({button:0,clientX,clientY,pointerId,preventDefault(){}});
get('pixel-grid').events.pointerdown(pointer(1,1));get('pixel-grid').events.pointermove(pointer(139,119));get('pixel-grid').events.pointerup(pointer(139,119));
assert.match(get('edit-status').textContent,/1 changed glyph/);get('undo').events.click();assert.match(get('edit-status').textContent,/0 changed glyphs/);
get('pixel-grid').events.pointerdown(pointer(1,1));get('pixel-grid').events.pointermove(pointer(139,119));get('pixel-grid').events.pointercancel(pointer(139,119));assert.match(get('edit-status').textContent,/0 changed glyphs/);
get('byte').value='3F';get('byte').events.input();
const fallbackTile=get('atlas').children[0].querySelector('canvas'),fallbackBefore=JSON.stringify(fallbackTile.draws);
get('pixel-grid').events.pointerdown(pointer(1,1));assert.notEqual(JSON.stringify(fallbackTile.draws),fallbackBefore);
get('pixel-grid').events.pointercancel(pointer(1,1));assert.equal(JSON.stringify(fallbackTile.draws),fallbackBefore);
get('byte').value='41';get('byte').events.input();
get('pixel-grid').children[0].events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(get('pixel-grid').children[1].tabIndex,0);
get('pixel-grid').events.pointerdown(pointer(1,1));get('font').value='CG1OEM';get('font').events.change();assert.match(get('edit-status').textContent,/0 changed glyphs/);assert.match(get('edit-status').textContent,/1 other font/);
get('sample').value='╔═╗☺';get('sample').events.input();assert.match(get('missing').textContent,/Original placeholder boxes: ☺/);assert.doesNotMatch(get('missing').textContent,/Outside this encoding/);
buttons[2].events.click();assert.equal(get('font').value,'CG1OEM');
console.log(`PASS font viewer/editor UI: ${pixels} decoded pixels, 3584 glyph advances, 14 fonts, encoding/coverage, download roundtrip, edits/undo/redo/reset, per-font state, drag/cancel/switch interruption, keyboard, bounds and failed-load retry. Synthetic UI only.`);
