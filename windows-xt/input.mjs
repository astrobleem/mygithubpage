// Browser pointer adapter. Counters describe forwarding, not guest acceptance.
export function createPointerInput({screen,document,getGuest,enabled,size,metrics,changed=()=>{}}){
  const held=new Set();
  const telemetry=()=>metrics().input;
  function count(name){const t=telemetry();t[name]=(t[name]||0)+1;t.lastEvent=new Date().toISOString();}
  function error(where,value){const t=telemetry();t.errors.push({where,message:String(value?.message||value),at:new Date().toISOString()});if(t.errors.length>20)t.errors.shift();}
  function send(method,...args){try{getGuest()[method](...args);count(method);return true;}catch(e){error(method,e);return false;}}
  function viewport(){
    const r=screen.getBoundingClientRect(),[gw,gh]=size(),ratio=gw/gh;
    let w=r.width,h=w/ratio;if(h>r.height){h=r.height;w=h*ratio;}
    if(!(w>0&&h>0))return null;
    return {left:r.left+(r.width-w)/2,top:r.top+(r.height-h)/2,w,h,gw,gh};
  }
  function move(event){
    const v=viewport();if(!v)return;
    if(document.pointerLockElement===screen){
      if(!Number.isFinite(event.movementX)||!Number.isFinite(event.movementY))return;
      send('sendMouseRelativeMotion',event.movementX*v.gw/v.w,event.movementY*v.gh/v.h);
    }else{
      if(!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
      send('sendMouseMotion',Math.max(0,Math.min(1,(event.clientX-v.left)/v.w)),Math.max(0,Math.min(1,(event.clientY-v.top)/v.h)));
    }
    send('sendMouseSync');
  }
  const button=b=>({0:0,2:1,1:2})[b];
  screen.addEventListener('pointermove',event=>{count('pointermove');if(getGuest()&&enabled())move(event);});
  screen.addEventListener('pointerdown',event=>{
    count('pointerdown');if(!getGuest()||!enabled())return;
    const b=button(event.button);if(b===undefined)return;
    screen.focus();
    // Pointer capture conflicts with a browser pointer lock. The lock already
    // owns motion/buttons, so request drag capture only in absolute mode.
    if(document.pointerLockElement!==screen){try{screen.setPointerCapture(event.pointerId);}catch(e){error('setPointerCapture',e);}}
    if(document.pointerLockElement!==screen)move(event);
    if(send('sendMouseButton',b,true))held.add(b);
    send('sendMouseSync');event.preventDefault();changed();
  });
  screen.addEventListener('pointerup',event=>{
    count('pointerup');const b=button(event.button);
    if(b!==undefined&&held.has(b)){if(getGuest())send('sendMouseButton',b,false);held.delete(b);if(getGuest())send('sendMouseSync');}
  });
  function release(){
    for(const b of held)if(getGuest())send('sendMouseButton',b,false);
    held.clear();if(document.pointerLockElement===screen)document.exitPointerLock();
  }
  for(const name of ['pointercancel','lostpointercapture','blur'])screen.addEventListener(name,release);
  screen.addEventListener('contextmenu',event=>event.preventDefault());
  document.addEventListener('pointerlockchange',()=>{
    telemetry().mode=document.pointerLockElement===screen?'relative captured':'absolute';
    if(document.pointerLockElement!==screen){for(const b of held)if(getGuest())send('sendMouseButton',b,false);held.clear();}
    changed();
  });
  document.addEventListener('pointerlockerror',()=>error('pointerLock','Browser refused mouse capture'));
  async function capture(){
    if(!getGuest()||!enabled())return;
    if(document.pointerLockElement===screen){release();changed();return;}
    if(!screen.requestPointerLock)throw new Error('Mouse capture is unavailable in this browser. Normal pointer input remains available.');
    screen.focus();await screen.requestPointerLock();
  }
  return {release,capture};
}
