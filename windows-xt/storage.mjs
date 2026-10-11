// One IndexedDB record per guest: atomic commits retain the previous good save.
export class WorkspaceStore {
  constructor(database='windows-xt-workspaces-v1') { this.database=database; }
  async open() {
    if(this.db) return this.db;
    this.db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open(this.database,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('workspaces',{keyPath:'kind'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Close other tabs using this workspace, then retry.'));
    });
    this.db.onversionchange=()=>{this.db.close();this.db=null;}; return this.db;
  }
  async get(kind) {
    const db=await this.open();
    return new Promise((resolve,reject)=>{const t=db.transaction('workspaces','readonly');const r=t.objectStore('workspaces').get(kind);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});
  }
  async put(record,expectedRevision=0) {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const t=db.transaction('workspaces','readwrite'),objectStore=t.objectStore('workspaces');
      let next,conflict;
      const current=objectStore.get(record.kind);
      current.onsuccess=()=>{
        const revision=current.result?.revision||0;
        if(revision!==expectedRevision){conflict=new Error('Another tab changed this saved workspace. Export a recovery file from this tab before reopening it.');t.abort();return;}
        next={...record,revision:revision+1};objectStore.put(next);
      };
      t.oncomplete=()=>resolve(next); t.onerror=()=>reject(t.error);t.onabort=()=>reject(conflict||t.error||new Error('Save aborted. Your previous save is intact.'));
    });
  }
}
