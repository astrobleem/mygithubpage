import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {bootstrap,inspectGuest,probe,traceDirectory} from '../windows-xt/diagnostics.mjs';
import {CONFIGS} from '../windows-xt/core.mjs';
const root=path.resolve(import.meta.dirname,'..'),checks=[];
function pass(name){checks.push({name,status:'PASS'});}
const stalled=await probe('stalled',()=>new Promise(()=>{}),30);
assert.equal(stalled.status,'failed or timed out');assert.ok(stalled.elapsedMs<1000);
assert.equal((await probe('throw',()=>{throw Error('worker died');},30)).error,'worker died');
assert.equal((await probe('alive',()=>42,30)).value,42);
pass('Never-resolving and synchronously failing guest requests produce bounded diagnostics');
const guarded=bootstrap(CONFIGS.xt,'xt','guarded','XTD12345');
const prompt=bootstrap(CONFIGS.xt,'xt','prompt','XTD12345');
const decode=b=>new TextDecoder().decode(b);
assert.equal(guarded.config.split('[autoexec]')[0],CONFIGS.xt.split('[autoexec]')[0]);
assert.ok(guarded.config.includes('mount c .'));assert.ok(guarded.config.includes('call C:\\XTD12345\\BOOT.BAT'));
assert.ok(decode(guarded.files[0].contents).includes('call C:\\WINXT\\WINXT.BAT>>'));
assert.ok(!decode(guarded.files[0].contents).includes('WIN.COM /R'));
assert.ok(!decode(prompt.files[0].contents).includes('call C:\\WINXT'));
assert.ok(decode(prompt.files[1].contents).includes('call C:\\WINXT\\TSSETUP.BAT>>'));
assert.ok(decode(prompt.files[1].contents).includes('call C:\\WINXT\\WINXT.BAT>>'));
assert.equal(bootstrap(CONFIGS.build,'build').config,CONFIGS.build);
assert.throws(()=>bootstrap(CONFIGS.xt,'xt','guarded','../WINDOWS'));
pass('Bootstrap preserves hardware/mount configuration and existing safety launchers; prompt path does not launch Windows');
function central(names){
  const chunks=names.map(name=>{const b=Buffer.from(name);const h=Buffer.alloc(46);h.writeUInt32LE(0x02014b50);h.writeUInt16LE(b.length,28);return Buffer.concat([h,b]);});
  const directory=Buffer.concat(chunks),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(names.length,10);end.writeUInt32LE(directory.length,12);
  return new Uint8Array(Buffer.concat([directory,end]));
}
assert.equal(traceDirectory(central(['xtd12345/MY.C','XTD12346','WORK/FILE.C']),'12345'),'XTD12347');
assert.throws(()=>traceDirectory(new Uint8Array([1,2,3]),'12345'));
const fixturePath=path.join(root,'tests/FIXTURE.zip');
const latest={bundles:[{path:fixturePath},{path:fixturePath}]};
const actual=traceDirectory(new Uint8Array(fs.readFileSync(latest.bundles[0].path)),'12345');assert.equal(actual,'XTD12345');
pass('New diagnostic directory avoids existing case-insensitive root files/folders; actual synthetic ZIP parses');
const partial=await inspectGuest({getRunningProgram:()=>Promise.resolve('RESERVE.COM'),asyncifyStats:()=>new Promise(()=>{}),config:()=>Promise.resolve({dosboxConf:CONFIGS.xt}),fsReadFile:()=>Promise.reject(Error('not present'))},'XTD12345',30);
assert.equal(partial.queries[0].value,'RESERVE.COM');assert.equal(partial.queries[1].status,'failed or timed out');assert.equal(partial.queries.length,5);
pass('Partial worker responses preserve current program/config while exposing timeout and missing boot files');
for(const [file,name] of [['wdosbox.js','WDOSBOX'],['wdosbox-x.js','WDOSBOXX']]){
  const sent=[];
  const context=vm.createContext({console:{log(){},error(){}},setTimeout,clearTimeout,URL,TextDecoder,TextEncoder,importScripts(){throw Error('Unexpected importScripts');},postMessage:value=>sent.push(value)}, {codeGeneration:{strings:false,wasm:true}});
  context.self=context;
  new vm.Script(fs.readFileSync(path.join(root,'windows-xt/vendor',file),'utf8'),{filename:file}).runInContext(context);
  context[name]=()=>Promise.reject(Error('synthetic initialization failure'));
  context.onmessage({data:{name:'wc-install',props:{sessionId:'host-test'}}});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(sent.some(x=>x.name==='ws-err'&&x.props.tag==='runtime-init'&&x.props.message.includes('synthetic initialization failure')));
}
pass('Both real worker wrappers forward a simulated initialization rejection without instantiating WASM or a DOS guest');
const report={status:'PASS HOST BOOTSTRAP/DIAGNOSTICS CHECKS; REAL GUEST BOOT PENDING',checks,guestExecuted:false,browserUsed:false,nativeSlotUsed:false};
fs.writeFileSync(path.join(root,'evidence/DIAGNOSTIC-CHECKS.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,checks:checks.length,guestExecuted:false},null,2));
