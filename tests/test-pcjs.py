"""Synthetic sectors/FAT tables only; no Windows or bootable code fixture."""
from pathlib import Path
import importlib.util, json, struct, sys, unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from pcjs_disk import decode_pcjs, FatVolume
spec=importlib.util.spec_from_file_location('prepare_upstream',ROOT/'tools/prepare-upstream.py');prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)

def synthetic_fat16():
    start=1;clusters=4096;fat_sectors=17;root_sectors=4;total=1+2*fat_sectors+root_sectors+clusters
    raw=bytearray((start+total)*512);raw[510:512]=b'\x55\xaa'
    raw[446]=0x80;raw[450]=4;struct.pack_into('<II',raw,454,start,total)
    boot=start*512;struct.pack_into('<H',raw,boot+11,512);raw[boot+13]=1;struct.pack_into('<H',raw,boot+14,1);raw[boot+16]=2
    struct.pack_into('<H',raw,boot+17,64);struct.pack_into('<H',raw,boot+19,total);raw[boot+21]=0xf8;struct.pack_into('<H',raw,boot+22,fat_sectors)
    for index in range(2):
        fat=(start+1+index*fat_sectors)*512
        struct.pack_into('<HHHH',raw,fat,0xfff8,0xffff,0xffff,0xffff)
    root=(start+1+2*fat_sectors)*512;raw[root:root+11]=b'WINDOWS    ';raw[root+11]=0x10;struct.pack_into('<H',raw,root+26,2)
    data=(start+1+2*fat_sectors+root_sectors)*512
    raw[data:data+11]=b'HELLO   TXT';raw[data+11]=0x20;struct.pack_into('<H',raw,data+26,3);struct.pack_into('<I',raw,data+28,3)
    raw[data+512:data+515]=b'ABC'
    return raw,{'fat0':(start+1)*512,'fat1':(start+1+fat_sectors)*512,'root':root,'data':data,'total':total}

def synthetic_fat12():
    start=1;fat_sectors=4;total=1+2*fat_sectors+1+1024
    raw=bytearray((total+1)*512);raw[510:512]=b'\x55\xaa';raw[446]=0x80;raw[450]=1;struct.pack_into('<II',raw,454,start,total)
    boot=512;struct.pack_into('<H',raw,boot+11,512);raw[boot+13]=1;struct.pack_into('<H',raw,boot+14,1);raw[boot+16]=2
    struct.pack_into('<H',raw,boot+17,16);struct.pack_into('<H',raw,boot+19,total);struct.pack_into('<H',raw,boot+22,fat_sectors)
    for index in range(2):
        fat=(2+index*fat_sectors)*512
        for cluster,value in [(0,0xff8),(1,0xfff),(2,0xfff),(3,0xfff)]:
            offset=fat+cluster+cluster//2;old=struct.unpack_from('<H',raw,offset)[0]
            struct.pack_into('<H',raw,offset,(old&0xf)|value<<4 if cluster&1 else (old&0xf000)|value)
    root=(start+1+2*fat_sectors)*512;raw[root:root+11]=b'HELLO   TXT';raw[root+11]=0x20;struct.pack_into('<H',raw,root+26,3);struct.pack_into('<I',raw,root+28,3)
    data=(start+1+2*fat_sectors+1)*512;raw[data+512:data+515]=b'ABC'
    return raw

class PCjs(unittest.TestCase):
    def test_signed_dwords_and_fill(self):
        raw,geometry=decode_pcjs(json.dumps([[[{'sector':1,'data':[-1,0x12345678],'pattern':0x01020304}]]]))
        self.assertEqual(raw[:8],b'\xff\xff\xff\xff\x78\x56\x34\x12');self.assertEqual(raw[8:],b'\x04\x03\x02\x01'*126)
        self.assertEqual(geometry['bytes'],512)
    def test_legacy_byte_fill(self):
        raw,_=decode_pcjs(json.dumps([[[{'sector':1,'bytes':[1,2],'pattern':0x5a}]]]))
        self.assertEqual(raw,b'\x01\x02'+b'Z'*510)
    def test_bad_sector_layouts(self):
        for sector in [{'sector':2,'data':[]},{'sector':1,'length':256,'data':[]},{'sector':1,'data':[2**40]},{'sector':1,'bytes':[256]},{'sector':1,'data':[True]}]:
            with self.assertRaises(ValueError):decode_pcjs(json.dumps([[[sector]]]))
    def test_valid_fat16(self):
        raw,_=synthetic_fat16();volume=FatVolume(bytes(raw));self.assertEqual(volume.files,{'WINDOWS/HELLO.TXT':b'ABC'});self.assertEqual(volume.bits,16)
    def test_valid_fat12_even_and_odd(self):
        volume=FatVolume(bytes(synthetic_fat12()));self.assertEqual(volume.files,{'HELLO.TXT':b'ABC'});self.assertEqual(volume.bits,12);self.assertEqual(volume.next_cluster(2),0xfff)
    def test_mismatched_fat(self):
        raw,info=synthetic_fat16();raw[info['fat1']+6]=0
        with self.assertRaisesRegex(ValueError,'copies disagree'):FatVolume(bytes(raw))
    def test_cycle_and_bad_cluster(self):
        for next_cluster in [3,0,0xfff7,4098]:
            raw,info=synthetic_fat16()
            for key in ['fat0','fat1']:struct.pack_into('<H',raw,info[key]+6,next_cluster)
            with self.assertRaises(ValueError):FatVolume(bytes(raw))
    def test_cross_link(self):
        raw,info=synthetic_fat16();root=info['root'];raw[root+32:root+43]=b'OTHER   TXT';raw[root+43]=0x20;struct.pack_into('<H',raw,root+58,3);struct.pack_into('<I',raw,root+60,3)
        with self.assertRaisesRegex(ValueError,'Cross-linked'):FatVolume(bytes(raw))
    def test_chain_size_mismatch(self):
        raw,info=synthetic_fat16();struct.pack_into('<I',raw,info['data']+28,1024)
        with self.assertRaisesRegex(ValueError,'size disagreement'):FatVolume(bytes(raw))
    def test_partition_bounds(self):
        raw,info=synthetic_fat16();struct.pack_into('<I',raw,458,info['total']+1)
        with self.assertRaisesRegex(ValueError,'outside disk'):FatVolume(bytes(raw))
    def test_private_boundaries_and_source_pins(self):
        with self.assertRaises(ValueError):prepare.safe_output(ROOT/'private-test')
        with self.assertRaises(ValueError):prepare.compose(b'wrong source',{})
        with self.assertRaises(ValueError):prepare.overlay_files(ROOT/'README.md')
    def test_launch_profile_static_preflight(self):
        config=(ROOT/'tools/TANDY.CNF').read_text()
        for line in ['machine=tandy','memsizekb=640','cputype=8086_prefetch','xms=false','ems=false','umb=false','serial1=serialmouse','call C:\\WINXT\\WINXT.BAT']:
            self.assertIn(line,config)
        self.assertNotIn('machine=pcjr',config)

if __name__=='__main__':unittest.main()
