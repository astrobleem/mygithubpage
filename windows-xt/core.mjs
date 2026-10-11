export function validateProfile(profile = {}) {
  const machine = profile.machine || 'tandy';
  if (!['tandy', 'pcjr'].includes(machine)) throw new Error('Choose Tandy or the experimental PCjr profile.');
  const launcher = String(profile.launcher || '').replace(/\\/g, '/').toUpperCase();
  if (launcher && (!/^(?:[A-Z0-9_]{1,8}\/)*[A-Z0-9_]{1,8}\.BAT$/.test(launcher) || launcher.length > 120))
    throw new Error('Launcher must be a relative DOS 8.3 BAT path using letters, numbers and underscores.');
  if (machine === 'pcjr' && !launcher) throw new Error('PCjr is experimental. Supply your own verified guarded BAT launcher first.');
  return {machine, launcher};
}

export const SCHEMA = 1;
export const MAX_BUNDLE = 128 * 1024 * 1024;
export const DEFAULT_SOURCE = '#include <stdio.h>\r\n\r\nint main(void)\r\n{\r\n    printf("Hello from the Windows XT workshop!\\n");\r\n    return 0;\r\n}\r\n';
export const CONFIGS = {
  xt: '[sdl]\nfullscreen=false\n[dosbox]\nmachine=tandy\nmemsize=0\nmemsizekb=640\nallow more than 640kb base memory=false\n[cpu]\ncore=normal\ncputype=8086_prefetch\ncycles=fixed 10000\nfpu=false\n[dos]\nxms=false\nems=false\numb=false\n[mixer]\nnosound=false\nrate=44100\n[speaker]\npcspeaker=false\ntandy=on\n[serial]\nserial1=serialmouse\n[render]\naspect=false\nscaler=none\ndoublescan=false\n[autoexec]\n@echo off\nmount c .\nc:\nset PATH=C:\\WINDOWS;C:\\WINDOWS\\SYSTEM;Z:\\\nset TEMP=C:\\WINDOWS\\TEMP\nif not exist C:\\WINXT\\SHREADY.TAG call C:\\WINXT\\TSSETUP.BAT\ncall C:\\WINXT\\WINXT.BAT\n',
  build: '[sdl]\nfullscreen=false\n[dosbox]\nmachine=svga_s3\nmemsize=16\n[cpu]\ncore=normal\ncputype=386\ncycles=max\n[dos]\nxms=true\nems=false\numb=true\n[mixer]\nnosound=false\n[speaker]\ntandy=off\n[autoexec]\n@echo off\nmount c .\nc:\nset WATCOM=C:\\WATCOM\nset PATH=C:\\WATCOM\\BINW;Z:\\\nset INCLUDE=C:\\WATCOM\\H\nset WLINK_LNK=C:\\WATCOM\\BINW\\WLINK.LNK\ncd \\WORK\necho Compiler workspace ready.\necho Use the source editor and Build EXE button.\n'
};
export function dosPath(value) {
  const path = value.replace(/\\/g, '/').replace(/^\/?[cC]:\/?/, '').replace(/^\/+/, '');
  if (!path || path.split('/').some(p => !/^[A-Z0-9_$~!#%&'()@^`{}-]{1,8}(\.[A-Z0-9_$~!#%&'()@^`{}-]{1,3})?$/i.test(p))) throw new Error('Use a relative DOS 8.3 path.');
  return path.toUpperCase();
}
export function asciiSource(text) {
  if (text.length > 256 * 1024) throw new Error('Source exceeds 256 KiB.');
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(text)) throw new Error('Use ASCII C source for the DOS compiler.');
  return new TextEncoder().encode(text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n'));
}
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function verifyBytes(bytes, hash) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_BUNDLE || await sha256(bytes) !== hash) throw new Error('Recovery data failed its size or SHA-256 check. The saved workspace was preserved.');
}
export async function verifyRecord(record, kind) {
  if (!record || record.schema !== SCHEMA || record.kind !== kind || !['xt','build'].includes(kind)) throw new Error('Recovery belongs to a different workspace or unsupported format.');
  await verifyBytes(record.base, record.baseHash);
  if (record.snapshot) await verifyBytes(record.snapshot, record.snapshotHash);
  if (record.previous) await verifyBytes(record.previous, record.previousHash);
  asciiSource(record.source);
  if(kind==='xt')validateProfile(record.profile);
  if (!['dosboxWorker','dosboxXWorker'].includes(record.backend)) throw new Error('Unsupported emulator backend.');
  return record;
}
export function encode64(bytes) {
  let text=''; for(let i=0;i<bytes.length;i+=32768) text+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(text);
}
export function decode64(text) {
  if(typeof text!=='string' || text.length > Math.ceil(MAX_BUNDLE / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Invalid recovery payload.');
  return Uint8Array.from(atob(text), c=>c.charCodeAt(0));
}
export function encodeRecovery(record) {
  return JSON.stringify({...record,base:encode64(record.base),snapshot:record.snapshot?encode64(record.snapshot):null,previous:record.previous?encode64(record.previous):null});
}
export function decodeRecovery(text) {
  const r=JSON.parse(text); return {...r,base:decode64(r.base),snapshot:r.snapshot?decode64(r.snapshot):null,previous:r.previous?decode64(r.previous):null};
}
export function buildBatch(token) {
  if(!/^[a-f0-9]{24}$/.test(token)) throw new Error('Invalid build identifier.');
  return asciiSource('@echo off\nif exist HELLO.EXE del HELLO.EXE\nif exist HELLO.OBJ del HELLO.OBJ\nif exist BUILD.OK del BUILD.OK\nif exist BUILD.ERR del BUILD.ERR\nwcl -q -bt=dos -ms -0 -w4 -fe=HELLO.EXE HELLO.C > BUILD.LOG\nif errorlevel 1 goto FAIL\nif not exist HELLO.EXE goto FAIL\necho '+token+'>BUILD.OK\ngoto END\n:FAIL\nif exist HELLO.EXE del HELLO.EXE\necho '+token+'>BUILD.ERR\n:END\necho Build finished.\n');
}
export function isMZ(bytes) { return bytes.length >= 28 && bytes[0]===0x4d && bytes[1]===0x5a; }
export function flattenTree(root) {
  const files=[];
  function visit(node,prefix) { const path=(prefix+'/'+node.name).replace(/^\/+/, ''); if(node.nodes) node.nodes.forEach(n=>visit(n,path)); else files.push(path); }
  (root.nodes||[]).forEach(n=>visit(n,'')); return files;
}
export function keyCode(event) {
  const key=event.code;
  if(/^Key[A-Z]$/.test(key)) return key.charCodeAt(3);
  if(/^Digit[0-9]$/.test(key)) return key.charCodeAt(5);
  const map={Escape:256,Enter:257,Tab:258,Backspace:259,Insert:260,Delete:261,ArrowRight:262,ArrowLeft:263,ArrowDown:264,ArrowUp:265,PageUp:266,PageDown:267,Home:268,End:269,CapsLock:280,ScrollLock:281,NumLock:282,PrintScreen:283,Pause:284,ShiftLeft:340,ControlLeft:341,AltLeft:342,MetaLeft:343,ShiftRight:344,ControlRight:345,AltRight:346,MetaRight:347,Space:32,Quote:39,Comma:44,Minus:45,Period:46,Slash:47,Semicolon:59,Equal:61,BracketLeft:91,Backslash:92,BracketRight:93,Backquote:96,NumpadDecimal:330,NumpadDivide:331,NumpadMultiply:332,NumpadSubtract:333,NumpadAdd:334,NumpadEnter:335,NumpadEqual:336};
  if(/^F([1-9]|1[0-2])$/.test(key)) return 289+Number(key.slice(1));
  if(/^Numpad[0-9]$/.test(key)) return 320+Number(key.slice(6));
  return map[key];
}
