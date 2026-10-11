"""Build a private Windows XT browser fixture from the exact upstream PCjs disk.

Uses the already-approved private preview as a verified overlay. No guest runs,
no installed Windows is edited, and no media is published. Python stdlib only.
"""
from pathlib import Path
import argparse, configparser, hashlib, io, json, struct, urllib.request, zipfile
from pcjs_disk import decode_pcjs, FatVolume

REPO=Path(__file__).resolve().parents[1]
UPSTREAM='https://raw.githubusercontent.com/Foxlum/pcjs-wiki/d2a82f69c9cbfe028020ff7d1cf3679638c5cf9d/disks/pcx86/fixed/20mb/PCDOS320-WIN300-EGA.json'
SOURCE_SHA='ee96645f9e9bb629c2250f11c06b72c86b31f24b164c32efef28d89ffb90a4e2'
RAW_SHA='04de3664f8060d7c1a6c3046283b0c591fc11fd5df2d3c6e78ce987c8812ac2c'
OVERLAY_SHA='cb48f82f55059b559b3a5738a498318ac29757513b941244c4ffb5ce041e7b07'
MUTABLE={'WINDOWS/SYSTEM/SETUP.INF','WINDOWS/WIN.INI','WINDOWS/SYSTEM.INI','WINDOWS/WIN.COM','WINDOWS/PROGMAN.INI','WINDOWS/MAIN.GRP','WINDOWS/ACCESSOR.GRP','WINDOWS/GAMES.GRP','WINDOWS/_DEFAULT.PIF'}
CORE=['WINDOWS/SYSTEM/KERNEL.EXE','WINDOWS/SYSTEM/GDI.EXE','WINDOWS/SYSTEM/USER.EXE','WINDOWS/SYSTEM/SYSTEM.DRV','WINDOWS/SYSTEM/KEYBOARD.DRV','WINDOWS/SYSTEM/MOUSE.DRV']

def sha(data):return hashlib.sha256(data).hexdigest()
def safe_output(path):
    path=Path(path).resolve()
    if path.is_relative_to(REPO):raise ValueError('Keep private output outside the public repository.')
    if path.exists():raise ValueError('Output already exists. Choose a fresh directory.')
    return path

def overlay_files(path):
    path=Path(path).resolve();data=path.read_bytes()
    if sha(data)!=OVERLAY_SHA:raise ValueError('Overlay is not the pinned accepted private preview. Do not substitute an unreviewed driver/guard.')
    files={}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if archive.testzip() is not None:raise ValueError('Overlay ZIP CRC failed')
        for entry in archive.infolist():
            if entry.is_dir():continue
            name=entry.filename.replace('\\','/').upper()
            if not name.startswith(('WINDOWS/','WINXT/','WORK/')):continue
            if name.startswith('/') or '..' in name.split('/') or ':' in name or name in files:raise ValueError('Unsafe or duplicate overlay path')
            files[name]=archive.read(entry)
    return path,data,files

def module_header(data):
    if len(data)<64 or data[:2]!=b'MZ':raise ValueError('Missing MZ Windows core header')
    offset=struct.unpack_from('<I',data,60)[0]
    if offset+64>len(data) or data[offset:offset+2]!=b'NE':raise ValueError('Missing NE Windows core header')
    return {'bytes':len(data),'sha256':sha(data),'ne_offset':offset,'target_os':data[offset+54],'expected_windows_version':struct.unpack_from('<H',data,offset+62)[0]}

def compose(source,overlay):
    if sha(source)!=SOURCE_SHA:raise ValueError('Upstream image SHA-256 changed; expected exact referenced revision.')
    raw,geometry=decode_pcjs(source)
    if sha(raw)!=RAW_SHA:raise ValueError('PCjs sector decoding does not match the verified raw disk.')
    volume=FatVolume(raw)
    if geometry['cylinders']!=615 or geometry['heads']!=4 or geometry['sectors_per_track']!=17 or volume.bits!=16:raise ValueError('Unexpected source geometry/FAT type')
    files={name:data for name,data in volume.files.items() if name.startswith('WINDOWS/')}
    if len(files)!=103:raise ValueError('Unexpected upstream Windows file count')
    matched=[];changed=[];added=[]
    for name,data in overlay.items():
        if name in files:
            if files[name]==data:matched.append(name);continue
            if name not in MUTABLE:raise ValueError('Microsoft core/source mismatch in overlay: '+name)
            changed.append({'path':name,'source_sha256':sha(files[name]),'overlay_sha256':sha(data)})
        else:added.append(name)
        files[name]=data
    if len(matched)!=85 or {e['path'] for e in changed}!=MUTABLE:raise ValueError('Overlay does not match the captured source/layout contract')
    for name in CORE:
        if name not in files or name not in overlay or files[name]!=volume.files[name] or files[name]!=overlay[name]:raise ValueError('Required Windows core differs: '+name)
    core={name:module_header(files[name]) for name in CORE}
    required=['WINXT/READY.TAG','WINXT/RESERVE.COM','WINXT/TSSETUP.BAT','WINXT/WINXT.BAT','WINXT/TINST.EXE','WINXT/TSHELL.EXE','WINXT/TSINPUT.DLL','WINDOWS/SYSTEM/TR53216.DRV','WINDOWS/SYSTEM/XTESYS.FON','WINDOWS/SYSTEM/XTEFIX.FON','WINDOWS/SYSTEM/XTEOEM.FON','WORK/PSG.EXE']
    if any(name not in files for name in required):raise ValueError('Incomplete accepted private overlay')
    launch=files['WINXT/WINXT.BAT'].decode('ascii')
    if 'C:\\WINXT\\RESERVE.COM' not in launch or 'WIN.COM /R' not in launch or 'IF ERRORLEVEL 1 GOTO FAILED' not in launch:raise ValueError('Accepted Tandy reservation/real-mode launcher missing')
    # Windows 3.0 legitimately repeats device= in [386Enh]. It is not consulted
    # by this real-mode fixture; validate only the captured [boot] tuple.
    ini=configparser.ConfigParser(interpolation=None,strict=False);ini.read_string(files['WINDOWS/SYSTEM.INI'].decode('ascii'))
    expected={'display.drv':'TR53216.DRV','fonts.fon':'XTESYS.FON','fixedfon.fon':'XTEFIX.FON','oemfonts.fon':'XTEOEM.FON'}
    if any(ini.get('boot',key).upper()!=value for key,value in expected.items()):raise ValueError('Captured Tandy display/font tuple differs')
    if any('JRGUARD' in p or 'JRPROBE' in p or 'T2PROBE' in p for p in files):raise ValueError('Unsafe PCjr probe/guard unexpectedly included')
    report={'status':'HOST PREPARATION PASS; GUEST NOT EXECUTED','geometry':geometry,'filesystem':volume.summary(),'source_windows_files':103,'identical_source_files':len(matched),'installed_layout_replacements':changed,'private_overlay_additions':len(added),'core_ne_headers':core,'guard_preserved':True,'forced_real_mode_launcher_present':True,'source_raw_sha256':sha(raw),'guest_executed':False,'qualification':'Parsing, hashes and static preflight only; no browser/native compatibility pass.'}
    return files,report

def prepare(out,overlay_path,image_file=None):
    out=safe_output(out)
    overlay_path,overlay_bytes,overlay=overlay_files(overlay_path)
    if image_file:
        image_path=Path(image_file).resolve();source=image_path.read_bytes()
    else:
        request=urllib.request.Request(UPSTREAM,headers={'User-Agent':'WindowsXT-private-fixture-preparation'})
        with urllib.request.urlopen(request,timeout=45) as response:source=response.read(12*1024*1024)
        image_path=None
    files,report=compose(source,overlay)
    config=(REPO/'tools/TANDY.CNF').read_bytes()
    if b'memsizekb=640' not in config or b'cputype=8086_prefetch' not in config or b'serial1=serialmouse' not in config:raise ValueError('Public Tandy configuration preflight failed')
    if sha(overlay_path.read_bytes())!=sha(overlay_bytes) or image_path and sha(image_path.read_bytes())!=SOURCE_SHA:raise ValueError('Read-only input changed during preparation')
    out.mkdir(parents=True,exist_ok=False)
    (out/'PCJS-SOURCE.json').write_bytes(source)
    target=out/'WINDOWS-XT-PRIVATE.jsdos'
    # Fixed timestamps/order make identical inputs produce identical archives.
    with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED) as archive:
        contents={**files,'.jsdos/dosbox.conf':config,'.jsdos/jsdos.json':b'{"version":"8","windowsXt":{"machine":"tandy","launcher":""}}'}
        for name,data in sorted(contents.items()):
            entry=zipfile.ZipInfo(name,(1980,1,1,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o100600<<16;archive.writestr(entry,data)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None or len(archive.namelist())!=len(contents):raise ValueError('Generated bundle CRC/count failed')
    report.update({'upstream_url':UPSTREAM,'source_json_sha256':SOURCE_SHA,'private_overlay_sha256':OVERLAY_SHA,'original_inputs_unchanged':True,'bundle_files':len(contents),'bundle_bytes':target.stat().st_size,'bundle_sha256':sha(target.read_bytes()),'private_output':str(out),'bundle':str(target)})
    (out/'PREPARED.json').write_text(json.dumps(report,indent=2))
    (out/'KEEP-PRIVATE.txt').write_text('This folder contains Windows/private overlay media. Do not upload or commit it.\nNo guest was executed. Open the public workshop and import WINDOWS-XT-PRIVATE.jsdos.\n')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',required=True);parser.add_argument('--overlay',required=True);parser.add_argument('--image-file',help='Optional offline copy of the exact pinned upstream JSON')
    args=parser.parse_args();r=prepare(args.out,args.overlay,args.image_file)
    print(json.dumps({k:r[k] for k in ['status','bundle','bundle_bytes','bundle_sha256','source_windows_files','identical_source_files','original_inputs_unchanged','guest_executed']},indent=2))
