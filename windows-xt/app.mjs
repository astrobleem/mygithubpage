import {SCHEMA,MAX_BUNDLE,DEFAULT_SOURCE,CONFIGS,dosPath,asciiSource,sha256,verifyBytes,verifyRecord,encodeRecovery,decodeRecovery,buildBatch,isMZ,flattenTree,keyCode} from './core.mjs';
import {WorkspaceStore} from './storage.mjs';
import {bootstrap,inspectGuest,probe,traceDirectory} from './diagnostics.mjs';
import {createPointerInput} from './input.mjs';
import {createGuestShortcut} from './shortcuts.mjs';
import {validateProfile,windowsConfig,requireLauncher} from './profiles.mjs';
const $=id=>document.getElementById(id);
const store=new WorkspaceStore();
let kind='xt',record=null,ci=null,busy=false,paused=false,dirty=false,audio=null,unlock=null,readOnlyError=null;
let source=DEFAULT_SOURCE,built=null,pressed=new Set(),nodes=new Set(),audioCursor=0,muted=true;
let metrics=freshMetrics();
let activeTransport=null,diagnosticBusy=false,diagnosticTimer=null;
async function bounded(promise,label,ms=15000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out. The previous saved workspace is preserved.`)),ms);})]);}
  finally{clearTimeout(timer);}
}
function freshMetrics(){return {started:null,ready:null,frames:0,lastFrame:null,width:0,height:0,audioSamples:0,lastAudio:null,nonzeroAudioSamples:0,audioPeak:0,audioDropped:0,builds:[],messages:[],stdout:[],workerMessages:{},clientMessages:{},input:{mode:'absolute',errors:[],scope:'Browser events and API forwarding only; clientMessages counts transport sends, not guest acceptance.'},phases:[],browserErrors:[],observations:[],bootDirectory:null,bootMode:null};}
function addLine(list,value,limit=120){list.push(value);if(list.length>limit)list.shift();}
function addStdout(text){addLine(metrics.stdout,{at:new Date().toISOString(),text:String(text).slice(0,2000)});$('guest-log').textContent=metrics.stdout.map(x=>x.text).join('\n');}
function observeTransport(transport){
  activeTransport=transport;
  if(transport.sendMessageToServer){const send=transport.sendMessageToServer.bind(transport);transport.sendMessageToServer=(name,...args)=>{metrics.clientMessages[name]=(metrics.clientMessages[name]||0)+1;return send(name,...args);};}
  const install=transport.initMessageHandler.bind(transport);
  transport.initMessageHandler=handler=>install((name,props)=>{
    metrics.workerMessages[name]=(metrics.workerMessages[name]||0)+1;
    if(['ws-ready','ws-server-ready','ws-exit'].includes(name))addLine(metrics.phases,{at:new Date().toISOString(),name});
    if(name==='ws-stdout')addStdout(props.message);
    if(['ws-log','ws-warn','ws-err'].includes(name))addLine(metrics.messages,{at:new Date().toISOString(),type:name,text:String(props.message||props.log||JSON.stringify(props)).slice(0,2000)});
    handler(name,props);
  });
}
// The pinned embedding API calls this documented transport boundary before
// awaiting backend readiness. Observe it without changing guest messages.
if(window.emulators){const backend=emulators.backend.bind(emulators);emulators.backend=(init,transport,options)=>{observeTransport(transport);return backend(init,transport,options);};}
async function diagnose(includeScreen=false){
  if(diagnosticBusy)return;diagnosticBusy=true;$('diagnostics').disabled=true;
  try{
    const running=ci;
    if(running){const observed=await inspectGuest(running,metrics.bootDirectory);addLine(metrics.observations,observed,6);
      const program=observed.queries.find(x=>x.label==='runningProgram');
      $('diagnostic-state').textContent=program?.status==='responded'?'Worker responded. Running program: '+(program.value||'(none)'):'Guest query did not respond within four seconds. Download the report; this alone does not locate a CPU stall.';
      if(includeScreen){const screenResult=await probe('observedGuestScreen',async()=>{
        const frame=await running.screenshot(),canvas=document.createElement('canvas');canvas.width=frame.width;canvas.height=frame.height;
        canvas.getContext('2d').putImageData(frame,0,0);return {width:frame.width,height:frame.height,pngDataUrl:canvas.toDataURL('image/png'),source:'Actual cached emulator frame'};
      });addLine(metrics.observations,{at:new Date().toISOString(),screen:screenResult},6);}
    }
    if(includeScreen)download(JSON.stringify(report(),null,2),`${kind}-diagnostic-${Date.now()}.json`,'application/json');
  }finally{diagnosticBusy=false;$('diagnostics').disabled=false;}
}
window.addEventListener('error',event=>addLine(metrics.browserErrors,{at:new Date().toISOString(),type:'error',message:String(event.message),file:event.filename,line:event.lineno,stack:String(event.error?.stack||'').slice(0,2000)}));
window.addEventListener('unhandledrejection',event=>addLine(metrics.browserErrors,{at:new Date().toISOString(),type:'unhandledrejection',message:String(event.reason?.stack||event.reason).slice(0,2000)}));
document.addEventListener('securitypolicyviolation',event=>addLine(metrics.browserErrors,{at:new Date().toISOString(),type:'CSP',directive:event.violatedDirective,blocked:event.blockedURI,file:event.sourceFile,line:event.lineNumber}));
function status(message,error=false){$('status').textContent=message;$('status').dataset.error=String(error);}
function activeBackend(){return kind==='xt'?'dosboxXWorker':$('backend').value;}
function update(){
  $('workspace-title').textContent=kind==='xt'?'Try Windows XT':'Build something';
  $('choose-xt').setAttribute('aria-pressed',String(kind==='xt'));$('choose-build').setAttribute('aria-pressed',String(kind==='build'));
  $('choose-xt').classList.toggle('active',kind==='xt');$('choose-build').classList.toggle('active',kind==='build');
  $('editor-panel').hidden=kind!=='build';$('backend-field').hidden=kind!=='build';
  $('profile-field').hidden=kind!=='xt';$('xt-machine').disabled=busy||!!ci;$('xt-launcher').disabled=busy||!!ci;
  $('boot-field').hidden=kind!=='xt';$('boot-mode').disabled=busy||!!ci;
  $('launch-xt').disabled=busy||!ci||kind!=='xt'||paused||metrics.bootMode!=='prompt';
  $('media-title').textContent=kind==='xt'?'Your Windows XT media':'Your compiler tools';
  $('media-help').textContent=kind==='xt'?'Use your owned Windows 3.0 files in a prepared .jsdos or ZIP bundle. This preview includes no Windows or MS-DOS distribution.':'Import a prepared DOS-hosted Open Watcom bundle. It needs WATCOM\\BINW, H, LIB286 and a WORK folder.';
  $('proof-note').textContent=kind==='xt'?'A user observed the private desktop, working mouse and Solitaire. Tandy paging, palette and audible PSG still need targeted qualification. PCjr is experimental. A rendered frame or nonzero audio signal alone is not a compatibility pass.':'The compiler guest uses a 386 and 16 MB. Browser builds, EXE downloads and guest recovery are pending qualification.';
  $('media-info').textContent=record?`${record.name} · ${(record.base.length/1048576).toFixed(1)} MiB\nSaved: ${record.savedAt}\nBase SHA-256: ${record.baseHash}`:'No bundle imported.';
  $('guest-state').textContent=busy?'Working…':ci?(paused?'Paused':'Running'):'Stopped';
  $('start').disabled=busy||!!ci||!record||!!readOnlyError;
  for(const id of ['pause','stop','restart','sound','escape','enter','capture','mouse-capture','guest-start','guest-tab','save']) $(id).disabled=busy||!ci;
  $('guest-start').disabled=busy||!ci||paused;$('guest-tab').disabled=busy||!ci||paused;
  $('mouse-capture').disabled=busy||!ci||paused;
  $('mouse-capture').textContent=document.pointerLockElement===$('screen')?'Release mouse':'Capture mouse';
  $('pause').textContent=paused?'Resume':'Pause';$('sound').textContent=muted?'Enable sound':'Mute sound';
  for(const id of ['choose-xt','choose-build','media','recovery','backend','recover','export']) $(id).disabled=busy || (['media','recovery','backend','recover'].includes(id)&&!!ci);
  $('export').disabled=busy||!record;$('recover').disabled=busy||!!ci||!record?.previous;
  $('export-saved').disabled=!record;
  for(const id of ['source-save','build']) $(id).disabled=busy||!ci||kind!=='build'||paused;
  for(const id of ['guest-import','refresh-files','file-download']) $(id).disabled=busy||!ci||paused;
  for(const id of ['run','exe']) $(id).disabled=busy||!ci||kind!=='build'||!built||paused;
  for(const id of ['source','source-import','source-download']) $(id).disabled=busy;
}
async function act(task){
  if(busy)return;
  busy=true;update();
  try{await task();}catch(error){status(error?.message||String(error),true);console.error(error);}finally{busy=false;update();}
}
function download(bytes,name,type='application/octet-stream'){
  const url=URL.createObjectURL(new Blob([bytes],{type})); const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function load(kindToLoad){
  readOnlyError=null;record=null;built=null;source=DEFAULT_SOURCE;
  record=await store.get(kindToLoad);source=record?.source||DEFAULT_SOURCE;
  if(record){
    try{await verifyBytes(record.base,record.baseHash);asciiSource(source);}catch(error){readOnlyError=error.message;status(readOnlyError,true);return;}
    if(record.snapshot){
      try{await verifyBytes(record.snapshot,record.snapshotHash);}catch(error){
        // Do not overwrite the damaged record: verify the previous snapshot first.
        if(record.previous){await verifyBytes(record.previous,record.previousHash);record={...record,snapshot:record.previous,snapshotHash:record.previousHash,previous:null,previousHash:null};status('Latest guest save is damaged. Previous guest files recovered in memory; export a recovery file or save after checking them.',true);}
        else{readOnlyError=error.message;status('Saved guest files are damaged. Import a valid recovery file. The original saved record is preserved.',true);return;}
      }
    }
  }
  $('source').value=source;dirty=false;
  const profile=validateProfile(record?.profile);$('xt-machine').value=profile.machine;$('xt-launcher').value=profile.launcher;
  if(kindToLoad==='build'&&record?.backend)$('backend').value=record.backend;
}
async function validateBundle(bytes){
  if(!window.emulators)throw new Error('Local emulator assets are missing. See the workspace README.');
  if(!bytes.length||bytes.length>MAX_BUNDLE)throw new Error('Media must be between 1 byte and 128 MiB.');
  const config=await emulators.bundleConfig(bytes);
  if(!config?.dosboxConf)throw new Error('This is not a prepared .jsdos / ZIP bundle with .jsdos/dosbox.conf.');
}
async function importMedia(file){
  if(!file)return;if(ci)throw new Error('Save and stop the guest before importing media.');
  const base=new Uint8Array(await file.arrayBuffer());await validateBundle(base);
  const next={schema:SCHEMA,kind,name:file.name,base,baseHash:await sha256(base),snapshot:null,snapshotHash:null,previous:null,previousHash:null,source:DEFAULT_SOURCE,backend:activeBackend(),savedAt:new Date().toISOString()};
  record=await store.put(next,record?.revision||0);source=DEFAULT_SOURCE;$('source').value=source;built=null;readOnlyError=null;dirty=false;
  status('Media imported and saved locally. Start guest when ready.');
}
async function claimBrowserGuest(){
  if(!navigator.locks)throw new Error('This browser lacks Web Locks. Use a recent browser to prevent competing guest tabs.');
  return new Promise((resolve,reject)=>{
    navigator.locks.request('windows-xt-browser-guest',{ifAvailable:true},async lock=>{
      if(!lock){reject(new Error('Another Windows XT tab is running a guest. Save and stop it first.'));return;}
      await new Promise(release=>{unlock=release;resolve();});
    }).catch(reject);
  });
}
async function start(){
  if(!record||ci)return;if(readOnlyError)throw new Error(readOnlyError);
  await verifyBytes(record.base,record.baseHash);if(record.snapshot)await verifyBytes(record.snapshot,record.snapshotHash);
  const profile=kind==='xt'?validateProfile({machine:$('xt-machine').value,launcher:$('xt-launcher').value}):null;
  if(profile){requireLauncher(record.snapshot||record.base,profile);if(JSON.stringify(profile)!==JSON.stringify(validateProfile(record.profile)))record=await store.put({...record,profile},record.revision||0);}
  await claimBrowserGuest();metrics=freshMetrics();metrics.started=new Date().toISOString();
  try{
    status('Starting guest…');
    emulators.pathPrefix=new URL('./vendor/',location.href).href;
    // Our two profiles are separate. Imported config cannot silently change the CPU target.
    // persist(false) captures the complete filesystem. Restore it as the
    // filesystem, not as an overlay on base: deleted base files must stay deleted.
    const filesystem=record.snapshot||record.base;
    const directory=kind==='xt'?traceDirectory(filesystem,crypto.randomUUID()):'XTDIAG';
    const trace=bootstrap(kind==='xt'?windowsConfig(profile):CONFIGS.build,kind,$('boot-mode').value,directory,profile?.launcher);
    metrics.machine=profile?.machine||'svga_s3';metrics.customLauncher=profile?.launcher||null;
    metrics.bootDirectory=trace.directory;metrics.bootMode=kind==='xt'?$('boot-mode').value:null;
    // The worker extracts bundle bytes after processing InitFile/config entries,
    // overwriting a separately sent .jsdos/dosbox.conf. Update only a private
    // launch copy, so the first archive contains the intended profile itself.
    const launch=await emulators.bundleUpdateConfig(filesystem,{dosboxConf:trace.config,jsdosConf:{version:'8'}});
    const init=[launch,...trace.files];
    metrics.profile={expectedHash:await sha256(new TextEncoder().encode(trace.config)),launchHash:await sha256(launch),matches:null};
    ci=await bounded(emulators[activeBackend()](init,{audioWorklet:false}),'Backend startup',30000);
    metrics.ready=new Date().toISOString();
    const effective=await bounded(ci.config(),'Read launch profile',4000);
    metrics.profile.reportedHash=await sha256(new TextEncoder().encode(effective.dosboxConf));
    metrics.profile.matches=effective.dosboxConf.replace(/\r\n/g,'\n')===trace.config.replace(/\r\n/g,'\n');
    if(!metrics.profile.matches)throw new Error('Guest startup configuration differs from the selected profile. The saved workspace was preserved. Download diagnostics.');
    // Bound filesystem/control requests while retaining the backend's actual CI.
    for(const name of ['fsReadFile','fsWriteFile','fsTree','getRunningProgram','persist','exit']){
      const original=ci[name].bind(ci);ci[name]=(...args)=>bounded(original(...args),name,name==='persist'?60000:15000);
    }
    const events=ci.events();
    // The API buffers startup stdout until this subscription. Raw transport
    // observation above also sees it before the backend is ready.
    events.onStdout(text=>{if(!metrics.stdout.some(x=>x.text===String(text)))addStdout(text);});
    events.onFrameSize((w,h)=>{metrics.width=w;metrics.height=h;$('screen').width=w;$('screen').height=h;});
    events.onFrame((rgb,rgba)=>{
      if(!ci||!metrics.width||!metrics.height||(!rgb&&!rgba))return;
      const data=new Uint8ClampedArray(metrics.width*metrics.height*4);
      if(rgba)data.set(rgba);else for(let i=0,j=0;i<rgb.length;i+=3,j+=4){data[j]=rgb[i];data[j+1]=rgb[i+1];data[j+2]=rgb[i+2];data[j+3]=255;}
      $('screen').getContext('2d',{alpha:false}).putImageData(new ImageData(data,metrics.width,metrics.height),0,0);metrics.frames++;
      metrics.lastFrame=new Date().toISOString();$('screen-placeholder').hidden=true;
    });
    // The documented CI emits mono PCM. Count samples independently of audible output.
    events.onSoundPush(samples=>{
      metrics.audioSamples+=samples.length;metrics.lastAudio=new Date().toISOString();
      for(const value of samples){if(Math.abs(value)>1e-6)metrics.nonzeroAudioSamples++;metrics.audioPeak=Math.max(metrics.audioPeak,Math.abs(value));}
      if(!audio||muted||paused||audio.state!=='running'||!ci)return;
      const rate=ci.soundFrequency();if(!rate||!samples.length)return;
      if(audioCursor>audio.currentTime+.35){metrics.audioDropped+=samples.length;return;}
      const buffer=audio.createBuffer(1,samples.length,rate);buffer.copyToChannel(samples,0);
      const node=audio.createBufferSource();node.buffer=buffer;node.connect(audio.destination);nodes.add(node);node.onended=()=>nodes.delete(node);
      audioCursor=Math.max(audioCursor,audio.currentTime+.025);node.start(audioCursor);audioCursor+=buffer.duration;
    });
    events.onMessage((type,...args)=>{const message={type,text:args.map(String).join(' ').slice(0,2000)};metrics.messages.push(message);if(metrics.messages.length>100)metrics.messages.shift();if(type==='error')status(message.text,true);});
    events.onExit(()=>{releaseInput();ci=null;activeTransport=null;clearTimeout(diagnosticTimer);paused=false;flushAudio();unlock?.();unlock=null;update();status('Guest exited. The last explicit save is available.');});
    metrics.width=ci.width();metrics.height=ci.height();if(metrics.width&&metrics.height){$('screen').width=metrics.width;$('screen').height=metrics.height;}
    paused=false;dirty=true;built=null;status('Guest running. Click its screen for input; enable sound for playback.');
    // Render the cached frame as well: assigning canvas dimensions clears it,
    // and a static DOS screen need not emit another changed-frame event.
    const image=await ci.screenshot().catch(()=>null);if(image){$('screen').width=image.width;$('screen').height=image.height;$('screen').getContext('2d').putImageData(image,0,0);$('screen-placeholder').hidden=true;}
    clearTimeout(diagnosticTimer);diagnosticTimer=setTimeout(()=>{if(ci)diagnose().catch(console.error);},8000);
  }catch(error){addLine(metrics.browserErrors,{at:new Date().toISOString(),type:'startup',message:String(error?.stack||error).slice(0,2000)});if(ci){await bounded(ci.exit(),'Failed startup cleanup',3000).catch(()=>activeTransport?.exit?.());ci=null;}else activeTransport?.exit?.();activeTransport=null;unlock?.();unlock=null;throw error;}
}
function flushAudio(){for(const node of nodes){try{node.stop();}catch{}}nodes.clear();audioCursor=0;}
function releaseInput(){guestShortcut.release();if(ci)for(const code of pressed)ci.sendKeyEvent(code,false);pressed.clear();pointerInput.release();}
async function captureRecord(){
  if(!record)return;
  source=$('source').value;asciiSource(source);
  const snapshot=ci?await ci.persist(false):record.snapshot;
  if(ci&&!snapshot)throw new Error('The backend did not return a full filesystem snapshot. Your previous save was preserved.');
  if(snapshot&&snapshot.length>MAX_BUNDLE)throw new Error('The guest snapshot exceeds 128 MiB. Export individual work files first.');
  const snapshotHash=snapshot?await sha256(snapshot):null;
  const changed=snapshotHash!==record.snapshotHash;
  const next={...record,source,backend:activeBackend(),snapshot,snapshotHash,previous:changed?record.snapshot:record.previous,previousHash:changed?record.snapshotHash:record.previousHash,savedAt:new Date().toISOString()};
  return next;
}
async function save(){
  const next=await captureRecord();if(!next)return;
  record=await store.put(next,record.revision||0);dirty=false;status('Workspace saved in this browser. Download a recovery file for a separate backup.');
}
async function stop(){
  if(!ci)return;await save();releaseInput();flushAudio();const running=ci;await running.exit();ci=null;paused=false;unlock?.();unlock=null;
  if(audio){await audio.close();audio=null;}muted=true;status('Saved and stopped. Start guest to reopen saved files.');
}
async function choose(nextKind){
  if(kind===nextKind)return;await stop();kind=nextKind;await load(kind);$('screen-placeholder').hidden=false;
  if(!readOnlyError)status(record?'Saved workspace loaded. Start guest when ready.':kind==='xt'?'Import your local Windows XT bundle. Files stay in this browser.':'Import a local DOS compiler bundle to begin.');
}
async function atPrompt(){
  const program=(await ci.getRunningProgram()).toUpperCase().replace(/\\/g,'/').split('/').pop();
  if(program&&!/^(COMMAND(\.COM)?|CMD)$/.test(program))throw new Error(`Return to the DOS prompt first. Currently running: ${program}`);
}
async function typeCommand(text){
  // User-facing DOS command buttons; no host keyboard or process control.
  releaseInput();
  for(const char of text){
    let code=char.toUpperCase().charCodeAt(0),shift=false;
    if(char===':'){code=59;shift=true;}
    if(shift)ci.sendKeyEvent(340,true);ci.simulateKeyPress(code);if(shift)ci.sendKeyEvent(340,false);
    await new Promise(resolve=>setTimeout(resolve,22));
  }
  ci.simulateKeyPress(257);
}
async function saveSource(){
  if(!ci||kind!=='build')throw new Error('Start the compiler guest first.');
  await atPrompt();source=$('source').value;await ci.fsWriteFile(dosPath('WORK/HELLO.C'),asciiSource(source));dirty=true;built=null;
  await save();status('HELLO.C written to the guest and the workspace saved.');
}
async function readIfPresent(path){
  const files=flattenTree(await ci.fsTree()).map(p=>p.toUpperCase());
  if(!files.includes(path.toUpperCase()))return null;
  return ci.fsReadFile(path);
}
async function refreshFiles(){
  const paths=flattenTree(await ci.fsTree()).filter(path=>/^WORK\/[^/]+$/i.test(path));
  $('work-files').replaceChildren(...paths.map(path=>{const option=document.createElement('option');option.value=path;option.textContent=path;return option;}));
}
async function build(){
  await saveSource();const token=crypto.randomUUID().replace(/-/g,'').slice(0,24);
  const files=flattenTree(await ci.fsTree()).map(p=>p.toUpperCase());
  for(const marker of ['WORK/BUILD.OK','WORK/BUILD.ERR'])if(files.includes(marker))await bounded(ci.fsDeleteFile(marker),'Clear previous build marker');
  const started=new Date().toISOString();await ci.fsWriteFile('WORK/BUILD.BAT',buildBatch(token));
  await typeCommand('C:');await typeCommand('CD \\WORK');await typeCommand('BUILD.BAT');status('Compiling HELLO.C…');
  const deadline=Date.now()+90000;let ok=false,done=false;
  while(Date.now()<deadline){
    for(const [file,succeeded] of [['BUILD.OK',true],['BUILD.ERR',false]]){
      const bytes=await readIfPresent('WORK/'+file);
      if(bytes&&new TextDecoder().decode(bytes).trim()===token){done=true;ok=succeeded;break;}
    }
    if(done)break;await new Promise(resolve=>setTimeout(resolve,500));
  }
  const log=await readIfPresent('WORK/BUILD.LOG');$('build-log').textContent=log?new TextDecoder().decode(log):'No compiler output was found.';
  if(!done){metrics.builds.push({token,started,status:'timeout'});throw new Error('Build timed out. Wait for the DOS prompt, then inspect BUILD.LOG. No EXE is offered for download.');}
  if(!ok){metrics.builds.push({token,started,status:'failed'});await save();throw new Error('Compilation failed. Review the build output, fix the source, and build again.');}
  const bytes=await ci.fsReadFile('WORK/HELLO.EXE');if(!isMZ(bytes))throw new Error('The build output is not a DOS MZ executable.');
  built={sha256:await sha256(bytes),sourceHash:await sha256(asciiSource(source)),token,bytes:bytes.length};
  metrics.builds.push({...built,started,status:'built, guest execution not yet checked'});await save();status(`Built HELLO.EXE (${bytes.length} bytes). Run it or download your EXE.`);
}
async function verifyBuilt(){
  if(!built||built.sourceHash!==await sha256(asciiSource($('source').value)))throw new Error('The source has changed. Build again before running or downloading an EXE.');
  const bytes=await ci.fsReadFile('WORK/HELLO.EXE');if(await sha256(bytes)!==built.sha256)throw new Error('The guest EXE changed after the build. Build again.');return bytes;
}
async function recoverPrevious(){
  if(ci)throw new Error('Save and stop the guest before recovery.');
  if(!record?.previous)throw new Error('No previous guest save is available.');
  await verifyBytes(record.base,record.baseHash);await verifyBytes(record.previous,record.previousHash);
  const next={...record,snapshot:record.previous,snapshotHash:record.previousHash,previous:record.snapshot,previousHash:record.snapshotHash,savedAt:new Date().toISOString()};
  record=await store.put(next,record.revision||0);readOnlyError=null;status('Previous guest files recovered. The latest editor draft is retained. Start guest to inspect them.');
}
async function importRecovery(file){
  if(!file)return;if(ci)throw new Error('Save and stop the guest before importing recovery.');
  if(file.size>540*1048576)throw new Error('Recovery file exceeds 540 MiB.');
  const next=await verifyRecord(decodeRecovery(await file.text()),kind);
  await validateBundle(next.base);
  // Complete filesystem ZIPs need not include .jsdos config: InitFs applies
  // our explicit profile after the verified full snapshot.
  await store.put(next,record?.revision||0);await load(kind);dirty=false;status('Recovery file imported, checked, and saved locally. Start guest to inspect it.');
}
function report(){
  return {schema:2,revision:'config-and-guest-shortcuts-20261010',kind,backend:activeBackend(),emulatorsVersion:window.emulators?.version||'not loaded',baseHash:record?.baseHash||null,snapshotHash:record?.snapshotHash||null,guestState:{ready:!!ci,paused,busy,muted,visibility:document.visibilityState,focused:document.activeElement?.id||null},metrics,compatibility:{windows30RealMode:'pending visual/runtime verification',tandyPaging:'pending targeted comparison',palette:'pending targeted comparison',psg:'pending waveform and listening verification',input:'pending browser interaction',restart:'pending browser verification',persistence:'pending browser verification'},scope:'Observed session counters and bounded query responses are not hardware qualification. A static frame or silent PCM does not establish a CPU stall. The diagnostic download can include the actual guest screen and local boot logs.',generated:new Date().toISOString()};
}
$('choose-xt').onclick=()=>act(()=>choose('xt'));$('choose-build').onclick=()=>act(()=>choose('build'));
$('media').onchange=()=>act(async()=>{await importMedia($('media').files[0]);$('media').value='';});
$('recovery').onchange=()=>act(async()=>{await importRecovery($('recovery').files[0]);$('recovery').value='';});
$('start').onclick=()=>act(start);$('save').onclick=()=>act(save);$('stop').onclick=()=>act(stop);$('restart').onclick=()=>act(async()=>{await stop();await start();});
$('pause').onclick=()=>act(async()=>{releaseInput();flushAudio();paused=!paused;if(paused)ci.pause();else ci.resume();status(paused?'Guest paused.':'Guest resumed.');});
$('sound').onclick=()=>act(async()=>{
  if(!audio){audio=new AudioContext({latencyHint:'interactive'});await audio.resume();}
  else if(audio.state==='suspended')await audio.resume();muted=!muted;flushAudio();status(muted?'Playback muted.':'Audio playback enabled.');
});
$('escape').onclick=()=>{ci?.simulateKeyPress(256);};$('enter').onclick=()=>{ci?.simulateKeyPress(257);};
$('capture').onclick=()=>act(async()=>{
  const image=await ci.screenshot();if(!image?.width||!image?.height)throw new Error('No guest frame available.');
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').putImageData(image,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve));if(!blob)throw new Error('Screen encoding failed.');download(blob,`${kind}-guest-${Date.now()}.png`,'image/png');
});
$('diagnostics').onclick=()=>diagnose(true).catch(error=>status(error.message,true));
$('launch-xt').onclick=()=>act(async()=>{await atPrompt();await typeCommand('C:');await typeCommand('CD \\');await typeCommand('C:\\'+metrics.bootDirectory+'\\STARTXT.BAT');dirty=true;status('Guarded Windows XT bootstrap launched. Download diagnostics if the screen stops changing.');});
$('export').onclick=()=>act(async()=>{const captured=await captureRecord();download(encodeRecovery(captured),`${kind}-${Date.now()}.xtworkspace`,'application/json');status('Recovery file downloaded with the current guest files. It contains private imported media. Use Save workspace to commit a browser save.');});
$('export-saved').onclick=()=>{if(record){download(encodeRecovery(record),`${kind}-last-saved-${Date.now()}.xtworkspace`,'application/json');status('Last explicitly saved recovery downloaded. Current unsaved guest changes are not included.');}};
$('recover').onclick=()=>act(recoverPrevious);
$('source').oninput=()=>{source=$('source').value;built=null;dirty=true;update();};
$('source-import').onchange=()=>act(async()=>{const file=$('source-import').files[0];if(!file)return;if(file.size>256*1024)throw new Error('Source exceeds 256 KiB.');const text=await file.text();asciiSource(text);source=text;$('source').value=text;built=null;dirty=true;$('source-import').value='';status('Source imported into the editor. Save source to guest or build to commit it.');});
$('source-download').onclick=()=>act(async()=>download(asciiSource($('source').value),'HELLO.C','text/plain'));
$('source-save').onclick=()=>act(saveSource);$('build').onclick=()=>act(build);
$('run').onclick=()=>act(async()=>{await verifyBuilt();await atPrompt();await typeCommand('C:');await typeCommand('CD \\WORK');await typeCommand('HELLO.EXE');dirty=true;status('HELLO.EXE launched. Check its output on the guest screen.');});
$('exe').onclick=()=>act(async()=>{const bytes=await verifyBuilt();download(bytes,'HELLO.EXE');status(`HELLO.EXE downloaded. SHA-256: ${built.sha256}`);});
$('refresh-files').onclick=()=>act(refreshFiles);
$('guest-import').onchange=()=>act(async()=>{
  const file=$('guest-import').files[0];if(!file)return;
  await atPrompt();if(file.size>4*1048576)throw new Error('Individual guest files are limited to 4 MiB.');
  if(file.name.toUpperCase()==='HELLO.C')throw new Error('Use Import C source in the editor for HELLO.C.');
  const path=dosPath('WORK/'+file.name);await ci.fsWriteFile(path,new Uint8Array(await file.arrayBuffer()));built=null;dirty=true;
  await save();await refreshFiles();$('guest-import').value='';status(`${path} imported and saved in this guest.`);
});
$('file-download').onclick=()=>act(async()=>{
  const path=$('work-files').value;if(!/^WORK\/[^/]+$/i.test(path))throw new Error('Refresh work files and select a file first.');
  const bytes=await ci.fsReadFile(path);download(bytes,path.split('/').pop());status(`Guest file exported. SHA-256: ${await sha256(bytes)}`);
});
const screen=$('screen');
const pointerInput=createPointerInput({screen,document,getGuest:()=>ci,enabled:()=>!busy&&!paused,size:()=>[metrics.width||640,metrics.height||400],metrics:()=>metrics,changed:()=>{dirty=true;update();}});
const guestShortcut=createGuestShortcut({getGuest:()=>ci,enabled:()=>!paused});
$('guest-start').onclick=()=>act(async()=>{await guestShortcut.run([341,256]);dirty=true;status('Ctrl+Escape sent directly to the guest.');});
$('guest-tab').onclick=()=>act(async()=>{await guestShortcut.run([258]);dirty=true;status('Tab sent directly to the guest.');});
$('mouse-capture').onclick=()=>pointerInput.capture().catch(error=>status(error.message,true));
screen.addEventListener('keydown',event=>{
  if(!ci||paused||busy||event.code==='Tab')return;
  if(event.code==='Escape'){releaseInput();screen.blur();status('Screen focus released. Use Send Escape to pass Escape to the guest.');return;}
  const code=keyCode(event);if(code===undefined)return;event.preventDefault();pressed.add(code);ci.sendKeyEvent(code,true);dirty=true;
});
screen.addEventListener('keyup',event=>{const code=keyCode(event);if(ci&&code!==undefined){ci.sendKeyEvent(code,false);pressed.delete(code);}});
screen.addEventListener('blur',releaseInput);window.addEventListener('blur',releaseInput);
window.addEventListener('pointercancel',releaseInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseInput();flushAudio();}});
window.addEventListener('beforeunload',event=>{if(ci||dirty){event.preventDefault();event.returnValue='';}});
if(window.emulators)emulators.pathPrefix=new URL('./vendor/',location.href).href;
await act(async()=>{await load('xt');if(record&&!readOnlyError)status('Saved Windows XT workspace loaded. Start guest when ready.');});
