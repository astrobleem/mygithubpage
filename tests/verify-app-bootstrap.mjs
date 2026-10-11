// Synthetic application integration only: no browser, worker or DOS execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {indexedDB} from 'fake-indexeddb';
import {WorkspaceStore} from '../windows-xt/storage.mjs';
import {sha256,DEFAULT_SOURCE} from '../windows-xt/core.mjs';
globalThis.indexedDB=indexedDB;
const root=path.resolve(import.meta.dirname,'..');
createRequire(import.meta.url)(path.join(root,'windows-xt/vendor/emulators.js'));
const zipAPI=globalThis.emulators;zipAPI.pathPrefix=path.join(root,'windows-xt/vendor')+path.sep;
const fixturePath=path.join(root,'tests/FIXTURE.zip');
const latest={bundles:[{path:fixturePath},{path:fixturePath}]};
const base=new Uint8Array(fs.readFileSync(latest.bundles[0].path));
const storage=new WorkspaceStore();
await storage.put({schema:1,kind:'xt',name:'owned-test.jsdos',base,baseHash:await sha256(base),snapshot:null,source:DEFAULT_SOURCE,backend:'dosboxXWorker',savedAt:'host-test'},0);
const ids=[...fs.readFileSync(path.join(root,'windows-xt/index.html'),'utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
const elements=new Map(),draws=[],downloads=[],timers=[];
for(const id of ids)elements.set(id,{id,value:id==='boot-mode'?'prompt':id==='backend'?'dosboxWorker':id==='xt-machine'?'tandy':'',textContent:'',disabled:false,hidden:false,dataset:{},classList:{toggle(){}},setAttribute(){},addEventListener(){},focus(){},blur(){},getContext(){return {putImageData(frame){draws.push(frame);}};}});
const document={getElementById(id){assert.ok(elements.has(id),'Missing DOM id: '+id);return elements.get(id);},addEventListener(){},visibilityState:'visible',activeElement:null,
  body:{append(){}},createElement(tag){return {click(){downloads.push(this.download);},remove(){},getContext(){return {putImageData(){}};},toDataURL(){return 'synthetic test frame, not a browser screenshot';}};}};
let held=false,exits=0,neverReady=false,capturedInit,capturedConfig,keyEvents=[];
const fakeCI={events(){return {onStdout(){},onFrameSize(){},onFrame(){},onSoundPush(){},onMessage(){},onExit(){}};},
  fsReadFile:async file=>new TextEncoder().encode(file.endsWith('STAGE.TXT')?'DOS_PROMPT':'synthetic boot log'),fsWriteFile:async()=>{},fsTree:async()=>({name:'',nodes:[]}),
  getRunningProgram:async()=>'',asyncifyStats:async()=>({messageReceived:1}),config:async()=>capturedConfig,persist:async()=>new Uint8Array([1]),exit:async()=>{},
  screenshot:async()=>({width:1,height:1,data:new Uint8ClampedArray(4)}),width:()=>1,height:()=>1,soundFrequency:()=>44100,
  sendKeyEvent:(...args)=>keyEvents.push(args),sendMouseButton(){},simulateKeyPress(){}};
const emulators={version:'synthetic API',backend:async(init,transport)=>{transport.initMessageHandler(()=>{});return neverReady?new Promise(()=>{}):fakeCI;},
  bundleUpdateConfig:async(bytes,config)=>{capturedConfig=config;return zipAPI.bundleUpdateConfig(bytes,config);},
  async dosboxXWorker(init){capturedInit=init;const transport={initMessageHandler(handler){handler('ws-ready',{});handler('ws-stdout',{message:'synthetic startup stdout'});handler('ws-server-ready',{});},exit(){exits++;}};return emulators.backend(init,transport,{});}};
const navigator={locks:{request:async(name,options,task)=>{if(held)return task(null);held=true;await task({name});held=false;}}};
const context=vm.createContext({document,navigator,emulators,indexedDB,crypto,URL,TextEncoder,TextDecoder,Uint8Array,Uint8ClampedArray,ArrayBuffer,DataView,Blob,structuredClone,atob,btoa,console,
  location:{href:'http://127.0.0.1:8090/'},
  setTimeout(task,ms){if(ms===8000||ms===60000){timers.push(task);return 0;}return setTimeout(task,ms===30000?30:ms);},clearTimeout,
  addEventListener(){},ImageData:class{},},{codeGeneration:{strings:false,wasm:true}});
context.window=context;
const modules=new Map();
async function moduleFor(file){
  if(modules.has(file))return modules.get(file);
  const result=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});modules.set(file,result);
  await result.link((specifier,owner)=>moduleFor(path.resolve(path.dirname(owner.identifier),specifier)));
  return result;
}
const app=await moduleFor(path.join(root,'windows-xt/app.mjs'));await app.evaluate();
assert.equal(elements.get('guest-start').disabled,true);
await elements.get('start').onclick();
assert.ok(held);assert.ok(capturedInit.some(x=>x.path?.endsWith('STARTXT.BAT')));
const launchConfig=await zipAPI.bundleConfig(capturedInit[0]);assert.ok(launchConfig.dosboxConf.includes('machine=tandy'));assert.ok(launchConfig.dosboxConf.includes('serial1=serialmouse'));assert.ok(launchConfig.dosboxConf.includes('BOOT.BAT'));
assert.ok(elements.get('guest-log').textContent.includes('synthetic startup stdout'));
assert.equal(draws.length,1);assert.equal(elements.get('screen-placeholder').hidden,true);
assert.equal(elements.get('launch-xt').disabled,false);
assert.equal(elements.get('guest-start').disabled,false);await elements.get('guest-start').onclick();assert.deepEqual(keyEvents,[[341,true],[256,true],[256,false],[341,false]]);
elements.get('export-saved').onclick();assert.ok(downloads[0].includes('last-saved'));
// New synthetic page for a failed startup: do not use an actual worker/guest.
held=false;neverReady=true;const previous=await storage.get('xt');
// The successful fake CI exit callback is not an actual guest and is absent in
// this harness. Reload the application context instead of mutating its state.
const failureContext=vm.createContext({...context,document,navigator,emulators:{...emulators,backend:async(init,transport)=>{transport.initMessageHandler(()=>{});return new Promise(()=>{});},dosboxXWorker:async function(init){capturedInit=init;const transport={initMessageHandler(handler){handler('ws-ready',{});},exit(){exits++;}};return this.backend(init,transport,{});}},},{codeGeneration:{strings:false,wasm:true}});
failureContext.window=failureContext;
const failedModules=new Map();
async function failureModule(file){if(failedModules.has(file))return failedModules.get(file);const result=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:failureContext,identifier:file});failedModules.set(file,result);await result.link((specifier,owner)=>failureModule(path.resolve(path.dirname(owner.identifier),specifier)));return result;}
await (await failureModule(path.join(root,'windows-xt/app.mjs'))).evaluate();await elements.get('start').onclick();
assert.ok(elements.get('status').textContent.includes('Backend startup timed out'));
assert.equal(exits,1);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(held,false);
assert.equal((await storage.get('xt')).revision,previous.revision);
const wrongConfig=await zipAPI.bundleConfig(base);let rejectedGuestExited=false;
const mismatchContext=vm.createContext({...context,document,navigator,emulators:{...emulators,backend:async(init,transport)=>{transport.initMessageHandler(()=>{});return {...fakeCI,config:async()=>wrongConfig,exit:async()=>{rejectedGuestExited=true;}};},dosboxXWorker:async function(init){capturedInit=init;return this.backend(init,{initMessageHandler(){},exit(){}},{});}},},{codeGeneration:{strings:false,wasm:true}});
mismatchContext.window=mismatchContext;const mismatchModules=new Map();
async function mismatchModule(file){if(mismatchModules.has(file))return mismatchModules.get(file);const result=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:mismatchContext,identifier:file});mismatchModules.set(file,result);await result.link((specifier,owner)=>mismatchModule(path.resolve(path.dirname(owner.identifier),specifier)));return result;}
await (await mismatchModule(path.join(root,'windows-xt/app.mjs'))).evaluate();await elements.get('start').onclick();
assert.ok(elements.get('status').textContent.includes('configuration differs'));assert.ok(rejectedGuestExited);await new Promise(r=>setTimeout(r,0));assert.equal(held,false);assert.equal((await storage.get('xt')).revision,previous.revision);assert.equal(elements.get('guest-start').disabled,true);
const report={status:'PASS SYNTHETIC APPLICATION BOOTSTRAP; REAL BROWSER/GUEST PENDING',checks:['Actual app startup puts chosen serial profile and diagnostic launch inside a private archive copy','Early stdout transport capture and cached-frame rendering','Explicit last-saved export without guest query','Startup timeout disposes its own captured transport, releases browser lock and preserves saved record','Open Start guest button disabled while stopped and sends Ctrl/Escape down then Escape/Ctrl up through CI','Wrong reported startup configuration rejects its own guest and preserves saved record'],browserUsed:false,workerCreated:false,guestExecuted:false};
fs.writeFileSync(path.join(root,'evidence/APP-BOOTSTRAP-CHECKS.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,checks:report.checks.length,guestExecuted:false},null,2));
