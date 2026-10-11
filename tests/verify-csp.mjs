// Host-only loader integration: real pinned JS/WASM with a fake DOM/XHR.
// vm.Script models an external script load; context eval/Function are forbidden.
// No browser, worker, DOS guest, input, audio or native lease is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const site=path.resolve(process.argv[2]||path.join(root,'windows-xt'));
const origin='http://127.0.0.1:8090/';
const checks=[];
function pass(name){checks.push({name,status:'PASS'});}
function environment(loader){
  const requests=[],scripts=[],errors=[];
  let context;
  function bytes(url){
    const parsed=new URL(url,origin);
    assert.equal(parsed.origin,new URL(origin).origin);
    assert.ok(/^\/vendor\/[a-z0-9.-]+$/.test(parsed.pathname));
    return fs.readFileSync(path.join(site,parsed.pathname));
  }
  class XMLHttpRequest {
    open(method,url){assert.equal(method,'GET');this.url=url;requests.push(url);}
    overrideMimeType(){}
    addEventListener(){}
    send(){queueMicrotask(()=>{
      const data=bytes(this.url);
      this.response=this.responseType==='arraybuffer'?data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength):data.toString('utf8');
      this.status=200;this.readyState=4;this.onreadystatechange?.();
    });}
  }
  const document={currentScript:{src:origin+'runtime-loader.js'},
    createElement(tag){assert.equal(tag,'script');return {remove(){}};},
    head:{append(script){
      scripts.push({url:script.src,integrity:script.integrity});
      queueMicrotask(()=>{
        try{
          const data=bytes(script.src);
          assert.equal(script.integrity,'sha384-'+crypto.createHash('sha384').update(data).digest('base64'));
          document.currentScript={src:script.src};
          new vm.Script(data.toString('utf8'),{filename:script.src}).runInContext(context);
          document.currentScript=null;
          script.onload();
        }catch(error){errors.push(error);script.onerror?.();}
      });
    }}
  };
  context=vm.createContext({document,XMLHttpRequest,URL,console,setTimeout,clearTimeout,TextDecoder,TextEncoder,
    performance,queueMicrotask},{codeGeneration:{strings:false,wasm:true}});
  context.window=context;context.self=context;
  if(loader)new vm.Script(fs.readFileSync(path.join(site,'runtime-loader.js'),'utf8'),{filename:'runtime-loader.js'}).runInContext(context);
  return {context,requests,scripts,errors};
}
function loadEmulators(env,file){new vm.Script(fs.readFileSync(file,'utf8'),{filename:file}).runInContext(env.context);env.context.emulators.pathPrefix=origin+'vendor/';}
const fixturePath=path.join(root,'tests/FIXTURE.zip');
const latest={bundles:[{path:fixturePath},{path:fixturePath}]};
const original=environment(false);
loadEmulators(original,path.join(root,'tests/original-emulators.js'));
await assert.rejects(original.context.emulators.bundleConfig(new Uint8Array(fs.readFileSync(latest.bundles[0].path))),/Code generation from strings disallowed/);
assert.equal(original.scripts.length,0);
pass('Original browser loader reproduces string-evaluation failure before guest execution');
const env=environment(true);
assert.throws(()=>new vm.Script('eval("1+1")').runInContext(env.context),/Code generation from strings disallowed/);
assert.throws(()=>new vm.Script('new Function("return 1")').runInContext(env.context),/Code generation from strings disallowed/);
pass('Harness enforces rejection of eval and Function while permitting WebAssembly');
loadEmulators(env,path.join(site,'vendor/emulators.js'));
for(const entry of latest.bundles){
  const config=await env.context.emulators.bundleConfig(new Uint8Array(fs.readFileSync(entry.path)));
  assert.equal(config.jsdosConf.version,'8');assert.ok(config.dosboxConf);
}
assert.equal(env.scripts.length,1);
assert.ok(env.requests.every(url=>url.endsWith('.wasm')));
pass('Synthetic fixture bundles decode through the actual browser branch, with strings disabled');
// Compile and define factories only; never instantiate DOSBox or run its main.
const modules=await env.context.emulators.wasmModules();
const [classic,xt]=await Promise.all([modules.dosbox(),modules.dosboxx()]);
assert.equal(typeof classic.instantiate,'function');assert.equal(typeof xt.instantiate,'function');
assert.equal(typeof env.context.WDOSBOX,'function');assert.equal(typeof env.context.WDOSBOXX,'function');
assert.equal(env.scripts.length,3);assert.equal(env.errors.length,0);
for(const module of [classic,xt])assert.ok(Object.prototype.toString.call(module.wasmModule).includes('WebAssembly.Module'));
pass('Classic and X factory scripts load and WASM compiles concurrently without string evaluation; DOS guests are not instantiated');
const before=env.scripts.length;
await env.context.__xtLoadRuntimeScript(origin+'vendor/wlibzip.js','WLIBZIP');
assert.equal(env.scripts.length,before);
for(const [url,name] of [[origin+'vendor/wdosbox.js','WLIBZIP'],['https://attacker.invalid/wlibzip.js','WLIBZIP'],[origin+'media/PRIVATE.jsdos','WLIBZIP'],[origin+'vendor/wlibzip.js?alternate=1','WLIBZIP'],[origin+'vendor/wlibzip.js','UNKNOWN']])
  await assert.rejects(env.context.__xtLoadRuntimeScript(url,name),/outside the pinned local allowlist/);
assert.equal(env.scripts.length,before);
assert.equal(Object.getOwnPropertyDescriptor(env.context,'__xtLoadRuntimeScript').writable,false);
pass('Only the exact three pinned same-origin script URLs/names load; duplicates cached and hook read-only');
const index=fs.readFileSync(path.join(site,'index.html'),'utf8');
assert.ok(index.includes("script-src 'self' 'wasm-unsafe-eval'"));
assert.ok(!index.includes("'unsafe-eval'"));
assert.ok(index.indexOf('src="runtime-loader.js"')<index.indexOf('src="vendor/emulators.js"'));
pass('Original strict script policy retained and external loader precedes embedding API');
const report={schema:1,status:'HOST CSP LOADER CHECKS PASS; ACTUAL BROWSER RETRY PENDING',site,checks,
  scripts:env.scripts,requests:env.requests,emulatorsVersion:env.context.emulators.version,
  policyChanged:false,browserUsed:false,workerCreated:false,guestExecuted:false,slotUsed:false};
fs.writeFileSync(path.join(root,'evidence/CSP-CHECKS.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,checks:checks.length,policyChanged:false,guestExecuted:false},null,2));
