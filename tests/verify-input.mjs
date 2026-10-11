// Host event simulations: no real browser, worker, guest, host mouse or lock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPointerInput} from '../windows-xt/input.mjs';
import {CONFIGS} from '../windows-xt/core.mjs';
const listeners=new Map(),docListeners=new Map(),calls=[],checks=[];
const screen={addEventListener(n,f){(listeners.get(n)||listeners.set(n,[]).get(n)).push(f);},focus(){},
  setPointerCapture(){throw new Error('synthetic capture refusal');},
  getBoundingClientRect(){return {left:10,top:20,width:1280,height:960};},
  async requestPointerLock(){document.pointerLockElement=screen;emitDoc('pointerlockchange');}};
const document={pointerLockElement:null,addEventListener(n,f){docListeners.set(n,f);},exitPointerLock(){this.pointerLockElement=null;emitDoc('pointerlockchange');}};
const state={input:{mode:'absolute',errors:[]}};
let enabled=true,guest={sendMouseMotion:(...a)=>calls.push(['absolute',...a]),sendMouseRelativeMotion:(...a)=>calls.push(['relative',...a]),sendMouseButton:(...a)=>calls.push(['button',...a]),sendMouseSync:()=>calls.push(['sync'])};
const pointer=createPointerInput({screen,document,getGuest:()=>guest,enabled:()=>enabled,size:()=>[640,400],metrics:()=>state});
function emit(n,extra={}){for(const f of listeners.get(n)||[])f({clientX:650,clientY:500,pointerId:1,button:0,preventDefault(){},...extra});}
function emitDoc(n){docListeners.get(n)?.();}
function pass(name){checks.push({name,status:'PASS'});}
emit('pointermove');assert.deepEqual(calls.slice(0,2),[['absolute',.5,.5],['sync']]);
emit('pointermove',{clientX:-50,clientY:20});assert.deepEqual(calls.at(-2),['absolute',0,0]);
pass('Letterbox-aware absolute coordinates normalize and clamp to the documented API');
calls.length=0;emit('pointerdown');assert.ok(calls.some(x=>x[0]==='button'&&x[1]===0&&x[2]===true));assert.equal(state.input.errors[0].where,'setPointerCapture');
enabled=false;emit('pointerup');assert.deepEqual(calls.slice(-2),[['button',0,false],['sync']]);
pass('Pointer-capture refusal does not suppress a click; paused state still releases held buttons');
enabled=true;calls.length=0;emit('pointerdown',{button:2});emit('pointerup',{button:2});emit('pointerdown',{button:1});emit('pointerup',{button:1});
assert.deepEqual(calls.filter(x=>x[0]==='button'),[['button',1,true],['button',1,false],['button',2,true],['button',2,false]]);
pass('Left/right/middle buttons map to backend 0/1/2 without turning middle clicks into left clicks');
await pointer.capture();assert.equal(state.input.mode,'relative captured');calls.length=0;emit('pointermove',{movementX:12,movementY:-8});assert.deepEqual(calls,[['relative',6,-4],['sync']]);
emit('pointermove',{movementX:NaN,movementY:1});assert.equal(calls.length,2);
pass('Explicit capture forwards CSS movement as guest pixel deltas, with invalid movement rejected');
const errorCount=state.input.errors.length;emit('pointerdown');assert.equal(state.input.errors.length,errorCount);calls.length=0;pointer.release();assert.equal(document.pointerLockElement,null);assert.equal(state.input.mode,'absolute');assert.ok(calls.some(x=>x[0]==='button'&&x[2]===false));
pass('Release frees held buttons and browser pointer lock');
calls.length=0;enabled=false;emit('pointermove');emit('pointerdown');assert.equal(calls.length,0);enabled=true;guest=null;emit('pointermove');assert.equal(calls.length,0);
assert.ok(state.input.pointermove>=6);assert.ok(state.input.sendMouseMotion>=2);assert.equal(state.input.sendMouseRelativeMotion,1);
pass('Stopped/paused input is ignored while browser event and successful API counters remain distinguishable');
assert.ok(CONFIGS.xt.includes('[serial]\nserial1=serialmouse\n'));assert.ok(CONFIGS.xt.includes('machine=tandy'));assert.ok(CONFIGS.xt.includes('cputype=8086_prefetch'));assert.ok(CONFIGS.xt.includes('if not exist C:\\WINXT\\SHREADY.TAG call C:\\WINXT\\TSSETUP.BAT'));assert.ok(CONFIGS.xt.includes('call C:\\WINXT\\WINXT.BAT'));assert.ok(!CONFIGS.build.includes('serialmouse'));
pass('XT alone receives COM1 Microsoft serial mouse; Tandy/8088 settings and original guarded launcher remain');
const report={schema:1,status:'PASS HOST SIMULATION ONLY',checks,actualBrowserUsed:false,guestExecuted:false,sharedLockTouched:false};
fs.writeFileSync(new URL('../evidence/INPUT-CHECKS.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
