"""Strict, read-only PCjs v1 sector decoder and FAT12/16 file reader.

Original implementation of the documented sector format. No emulator or guest
code executes here. Unsupported layouts and inconsistent chains fail closed.
"""
import json, struct

MAX_DISK=64*1024*1024
def integer(value,low,high,label):
    if type(value) is not int or not low<=value<=high:raise ValueError('Invalid '+label)
    return value

def decode_pcjs(data):
    disk=json.loads(data)
    if not isinstance(disk,list) or not disk:raise ValueError('Expected PCjs cylinder array')
    cylinders=len(disk);heads=len(disk[0]);sectors=len(disk[0][0])
    if not heads or not sectors or cylinders*heads*sectors*512>MAX_DISK:raise ValueError('Unsupported disk geometry')
    raw=bytearray();counts={'dword_data':0,'byte_data':0,'pattern_only':0}
    for cylinder in disk:
        if not isinstance(cylinder,list) or len(cylinder)!=heads:raise ValueError('Inconsistent head count')
        for track in cylinder:
            if not isinstance(track,list) or len(track)!=sectors:raise ValueError('Inconsistent sector count')
            for number,sector in enumerate(track,1):
                if not isinstance(sector,dict) or integer(sector.get('sector'),1,sectors,'sector identifier')!=number or sector.get('length',512)!=512:raise ValueError('Unsupported or out-of-order sector')
                if 'data' in sector:
                    values=sector['data'];counts['dword_data']+=1
                    if not isinstance(values,list) or len(values)>128:raise ValueError('Invalid dword array')
                    pattern=integer(sector.get('pattern',0),-2**31,2**32-1,'dword fill')
                    raw.extend(b''.join(struct.pack('<I',integer(v,-2**31,2**32-1,'sector dword')&0xffffffff) for v in values))
                    raw.extend(struct.pack('<I',pattern&0xffffffff)*(128-len(values)))
                else:
                    values=sector.get('bytes',[])
                    if not isinstance(values,list) or len(values)>512:raise ValueError('Invalid byte array')
                    pattern=integer(sector.get('pattern',0),0,255,'byte fill')
                    raw.extend(bytes(integer(v,0,255,'sector byte') for v in values));raw.extend(bytes([pattern])*(512-len(values)))
                    counts['byte_data' if values else 'pattern_only']+=1
    return bytes(raw),{'cylinders':cylinders,'heads':heads,'sectors_per_track':sectors,'bytes':len(raw),'encoding_counts':counts}

class FatVolume:
    def __init__(self,raw):
        if len(raw)<1024 or len(raw)%512 or raw[510:512]!=b'\x55\xaa':raise ValueError('Invalid MBR disk')
        entries=[]
        for i in range(4):
            entry=raw[446+i*16:462+i*16]
            start,count=struct.unpack_from('<II',entry,8)
            if entry[4] in (1,4,6):entries.append((entry[0],entry[4],start,count))
        active=[e for e in entries if e[0]==0x80]
        if len(active)!=1:raise ValueError('Expected one active FAT12/16 partition')
        _,self.partition_type,self.start,self.partition_sectors=active[0]
        if not self.start or not self.partition_sectors or self.start+self.partition_sectors>len(raw)//512:raise ValueError('Partition outside disk')
        self.volume=raw[self.start*512:(self.start+self.partition_sectors)*512]
        boot=self.volume[:512]
        self.sector_bytes=struct.unpack_from('<H',boot,11)[0];self.cluster_sectors=boot[13]
        reserved=struct.unpack_from('<H',boot,14)[0];self.fats=boot[16]
        root_entries=struct.unpack_from('<H',boot,17)[0]
        total=struct.unpack_from('<H',boot,19)[0] or struct.unpack_from('<I',boot,32)[0]
        fat_sectors=struct.unpack_from('<H',boot,22)[0]
        if self.sector_bytes!=512 or self.cluster_sectors not in (1,2,4,8,16,32,64,128) or not reserved or self.fats not in (1,2) or not root_entries or not fat_sectors:raise ValueError('Unsupported BPB')
        if not total or total>self.partition_sectors:raise ValueError('BPB total outside partition')
        root_sectors=(root_entries*32+511)//512
        self.data_sector=reserved+self.fats*fat_sectors+root_sectors
        if self.data_sector>=total:raise ValueError('No FAT data region')
        self.clusters=(total-self.data_sector)//self.cluster_sectors
        self.bits=12 if self.clusters<4085 else 16 if self.clusters<65525 else 0
        if not self.bits or self.partition_type==1 and self.bits!=12 or self.partition_type in (4,6) and self.bits!=16:raise ValueError('Partition and FAT type disagree')
        self.fat=self.volume[reserved*512:(reserved+fat_sectors)*512]
        if len(self.fat)*8<(self.clusters+2)*self.bits:raise ValueError('FAT too short')
        for i in range(1,self.fats):
            if self.volume[(reserved+i*fat_sectors)*512:(reserved+(i+1)*fat_sectors)*512]!=self.fat:raise ValueError('FAT copies disagree')
        first=(reserved+self.fats*fat_sectors)*512
        self.root=self.volume[first:first+root_entries*32]
        self.cluster_bytes=self.cluster_sectors*512;self.owners={};self.files={};self.entries=[]
        self._directory(self.root,'')

    def next_cluster(self,cluster):
        if self.bits==16:return struct.unpack_from('<H',self.fat,cluster*2)[0]
        offset=cluster+cluster//2;value=struct.unpack_from('<H',self.fat,offset)[0]
        return value>>4 if cluster&1 else value&0xfff

    def chain(self,first,owner):
        if first==0:return b''
        cluster=first;output=bytearray();visited=set()
        eoc=0xff8 if self.bits==12 else 0xfff8
        reserved=0xff0 if self.bits==12 else 0xfff0
        while cluster<eoc:
            if cluster<2 or cluster>=reserved or cluster>=self.clusters+2 or cluster in visited:raise ValueError('Invalid, cyclic or reserved cluster: '+owner)
            if cluster in self.owners:raise ValueError('Cross-linked cluster: '+owner)
            visited.add(cluster);self.owners[cluster]=owner
            start=self.data_sector*512+(cluster-2)*self.cluster_bytes
            data=self.volume[start:start+self.cluster_bytes]
            if len(data)!=self.cluster_bytes:raise ValueError('Truncated cluster')
            output.extend(data);cluster=self.next_cluster(cluster)
        return bytes(output)

    def _directory(self,data,prefix):
        if len(prefix)>240:raise ValueError('Directory nesting too deep')
        for offset in range(0,len(data),32):
            entry=data[offset:offset+32]
            if len(entry)!=32:raise ValueError('Truncated directory entry')
            if entry[0]==0:break
            if entry[0]==0xe5:continue
            attributes=entry[11]
            if attributes==0x0f:raise ValueError('Long-filename FAT is unsupported')
            if attributes&0x08:continue
            base=entry[:8].decode('ascii').rstrip();extension=entry[8:11].decode('ascii').rstrip()
            if base in ('.','..'):continue
            name=base+('.'+extension if extension else '')
            if not base or any(c in name for c in '/\\:\0') or any(ord(c)<32 for c in name):raise ValueError('Unsafe short filename')
            path=prefix+name.upper()
            first=struct.unpack_from('<H',entry,26)[0];size=struct.unpack_from('<I',entry,28)[0]
            content=self.chain(first,path)
            if attributes&0x10:
                if not first or size:raise ValueError('Invalid directory chain')
                self._directory(content,path+'/')
            else:
                if path in self.files:raise ValueError('Duplicate file path')
                if size>len(content) or len(content)-size>=self.cluster_bytes:raise ValueError('File chain/size disagreement: '+path)
                self.files[path]=content[:size]
                self.entries.append({'path':path,'bytes':size,'attributes':attributes})

    def summary(self):
        return {'type':'FAT'+str(self.bits),'partition_type':self.partition_type,'start_lba':self.start,'partition_sectors':self.partition_sectors,'cluster_bytes':self.cluster_bytes,'clusters':self.clusters,'files':len(self.files),'file_bytes':sum(len(b) for b in self.files.values()),'fat_copies_match':True}
