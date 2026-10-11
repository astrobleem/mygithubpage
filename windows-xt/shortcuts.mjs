// Sends directly through the emulator CI; never synthesizes host keyboard input.
export function createGuestShortcut({getGuest,enabled,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  let owner=null,held=[];
  function release(){
    const guest=owner,keys=held.splice(0).reverse();owner=null;
    for(const key of keys)try{guest?.sendKeyEvent(key,false);}catch{}
  }
  async function run(keys){
    if(owner)throw new Error('A guest shortcut is already running.');
    const guest=getGuest();if(!guest||!enabled())throw new Error('Start or resume the guest first.');
    owner=guest;
    try{
      for(const key of keys){held.push(key);guest.sendKeyEvent(key,true);}
      await wait(40);
    }finally{release();}
  }
  return {run,release};
}
