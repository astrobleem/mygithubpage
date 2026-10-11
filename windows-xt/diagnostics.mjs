// Read-only guest queries are bounded separately from save/build operations.
export async function probe(label, task, ms=4000) {
  let timer;
  const started=Date.now();
  try {
    const value=await Promise.race([Promise.resolve().then(task),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('No response within '+ms+' ms')),ms);
    })]);
    return {label,status:'responded',elapsedMs:Date.now()-started,value};
  } catch(error) {
    return {label,status:'failed or timed out',elapsedMs:Date.now()-started,error:String(error?.message||error)};
  } finally {clearTimeout(timer);}
}
export function traceDirectory(zip,seed) {
  // Check existing ZIP root names before injecting a diagnostic batch.
  if(!(zip instanceof Uint8Array))throw new Error('Guest filesystem is not a ZIP byte array.');
  const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
  let end=-1;
  for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--)
    if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===zip.length){end=i;break;}
  if(end<0)throw new Error('Cannot safely inspect saved ZIP for diagnostic folder conflicts.');
  const occupied=new Set(),count=view.getUint16(end+10,true);
  let offset=view.getUint32(end+16,true);
  for(let i=0;i<count;i++) {
    if(offset+46>zip.length||view.getUint32(offset,true)!==0x02014b50)throw new Error('Invalid guest ZIP directory.');
    const size=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);
    if(offset+46+size+extra+comment>zip.length)throw new Error('Truncated guest ZIP directory.');
    const name=new TextDecoder().decode(zip.subarray(offset+46,offset+46+size));
    occupied.add(name.replace(/\\/g,'/').split('/')[0].toUpperCase());
    offset+=46+size+extra+comment;
  }
  const start=parseInt(seed.replace(/[^a-f0-9]/gi,'').slice(0,5)||'0',16);
  for(let n=0;n<0x100000;n++) {
    const name='XTD'+((start+n)%0x100000).toString(16).padStart(5,'0').toUpperCase();
    if(!occupied.has(name))return name;
  }
  throw new Error('No unused diagnostic folder available; saved files preserved.');
}
export function bootstrap(config,kind,mode='guarded',directory='XTDIAG',launcher='') {
  if(kind!=='xt')return {config,files:[],directory:null};
  if(!/^[A-Z0-9]{1,8}$/.test(directory)||!['guarded','prompt'].includes(mode))throw new Error('Invalid diagnostic bootstrap.');
  if(launcher&&!/^(?:[A-Z0-9_]{1,8}\/)*[A-Z0-9_]{1,8}\.BAT$/.test(launcher))throw new Error('Invalid custom guarded launcher.');
  const dir='C:\\'+directory;
  const lines=['@echo off','echo BOOTSTRAP_ENTERED>'+dir+'\\STAGE.TXT',
    'echo Windows XT diagnostic bootstrap>'+dir+'\\BOOT.LOG',
    'ver>>'+dir+'\\BOOT.LOG','mem>>'+dir+'\\BOOT.LOG',
    'echo DOS mount ready. Diagnostics: '+dir,
    'echo PREFLIGHT_COMPLETE>'+dir+'\\STAGE.TXT'];
  if(mode==='guarded'&&launcher)lines.push('echo CUSTOM_GUARD_ENTERED>'+dir+'\\STAGE.TXT','call C:\\'+launcher.replace(/\//g,'\\')+'>>'+dir+'\\BOOT.LOG','echo CUSTOM_GUARD_RETURNED>'+dir+'\\STAGE.TXT','type '+dir+'\\BOOT.LOG');
  else if(mode==='guarded')lines.push(
    'if exist C:\\WINXT\\SHREADY.TAG goto READY',
    'echo TSSETUP_ENTERED>'+dir+'\\STAGE.TXT',
    'call C:\\WINXT\\TSSETUP.BAT>>'+dir+'\\BOOT.LOG',
    'echo TSSETUP_RETURNED>'+dir+'\\STAGE.TXT',
    ':READY','echo WINXT_ENTERED>'+dir+'\\STAGE.TXT',
    'call C:\\WINXT\\WINXT.BAT>>'+dir+'\\BOOT.LOG',
    'echo WINXT_RETURNED>'+dir+'\\STAGE.TXT',
    'type '+dir+'\\BOOT.LOG',
    'echo Guarded launcher returned to DOS. Inspect diagnostics before retrying.');
  else lines.push('echo DOS_PROMPT>'+dir+'\\STAGE.TXT','type '+dir+'\\BOOT.LOG',
    'echo Diagnostic DOS prompt. Guarded Windows launcher: C:\\WINXT\\WINXT');
  // Keep the mount, CPU/video/audio and safety guards unchanged. Interpose
  // a fresh diagnostic batch only around the same guarded launch sequence.
  const marker=launcher?'call C:\\'+launcher.replace(/\//g,'\\')+'\n':'if not exist C:\\WINXT\\SHREADY.TAG call C:\\WINXT\\TSSETUP.BAT\ncall C:\\WINXT\\WINXT.BAT\n';
  if(!config.includes(marker))throw new Error('Pinned Windows XT bootstrap changed unexpectedly.');
  const text=lines.join('\r\n')+'\r\n';
  const files=[{path:directory+'/BOOT.BAT',contents:new TextEncoder().encode(text)}];
  if(mode==='prompt')files.push({path:directory+'/STARTXT.BAT',contents:bootstrap(config,kind,'guarded',directory,launcher).files[0].contents});
  return {directory,config:config.replace(marker,'call '+dir+'\\BOOT.BAT\n'),files};
}
export async function inspectGuest(ci,directory,ms=4000) {
  const tasks=[['runningProgram',()=>ci.getRunningProgram()],['workerStats',()=>ci.asyncifyStats()],['activeConfig',()=>ci.config()]];
  if(directory)for(const file of ['STAGE.TXT','BOOT.LOG'])tasks.push([file,async()=>{
    const bytes=await ci.fsReadFile(directory+'/'+file);
    return {bytes:bytes.length,text:new TextDecoder().decode(bytes.subarray(0,32768)),truncated:bytes.length>32768};
  }]);
  return {at:new Date().toISOString(),queries:await Promise.all(tasks.map(([name,task])=>probe(name,task,ms))),
    interpretation:'Program, stats and file replies show the worker handled those requests. Config and screenshot can be read from the client cache. An unchanged frame or silent PCM alone does not establish a CPU stall.'};
}
