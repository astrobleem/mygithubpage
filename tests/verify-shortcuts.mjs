// Mock CI only; never presses a host key or runs a guest.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGuestShortcut} from '../windows-xt/shortcuts.mjs';
const calls=[],guest={sendKeyEvent:(key,pressed)=>calls.push([key,pressed])};let done,enabled=true;
const control=createGuestShortcut({getGuest:()=>guest,enabled:()=>enabled,wait:()=>new Promise(r=>done=r)});
let running=control.run([341,256]);assert.deepEqual(calls,[[341,true],[256,true]]);done();await running;assert.deepEqual(calls,[[341,true],[256,true],[256,false],[341,false]]);
calls.length=0;running=control.run([341,256]);control.release();assert.deepEqual(calls,[[341,true],[256,true],[256,false],[341,false]]);done();await running;assert.equal(calls.length,4);
enabled=false;calls.length=0;await assert.rejects(control.run([341,256]),/resume/);assert.equal(calls.length,0);
const faulty=[],broken=createGuestShortcut({getGuest:()=>({sendKeyEvent(k,p){faulty.push([k,p]);if(k===256&&p)throw new Error('synthetic failure');}}),enabled:()=>true});
await assert.rejects(broken.run([341,256]),/synthetic/);assert.deepEqual(faulty,[[341,true],[256,true],[256,false],[341,false]]);
const result={schema:1,status:'PASS MOCK CI ONLY',checks:4,sequence:['Ctrl down (341)','Escape down (256)','Escape up (256)','Ctrl up (341)'],cancelAndBlurRelease:true,disabledWhileStoppedOrPaused:true,hostKeysSynthesized:false,guestExecuted:false};
fs.writeFileSync(new URL('../evidence/SHORTCUT-CHECKS.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
