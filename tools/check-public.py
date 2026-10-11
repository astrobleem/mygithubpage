"""Audit public app/assets and the source archive before commit or CI delivery."""
from pathlib import Path, PurePosixPath
import hashlib, json, re, tarfile

ROOT=Path(__file__).resolve().parents[1]
SITE=ROOT/'windows-xt'
ALLOWED={'.nojekyll','index.html','style.css','core.mjs','profiles.mjs','app.mjs','storage.mjs','runtime-loader.js','diagnostics.mjs','input.mjs','shortcuts.mjs','PSG.C','THIRD-PARTY.md','README.md','LICENSE',
 'vendor/emulators.js','vendor/wdosbox.js','vendor/wdosbox.wasm','vendor/wdosbox-x.js','vendor/wdosbox-x.wasm','vendor/wlibzip.js','vendor/wlibzip.wasm','vendor/LICENSE','vendor/package.json',
 'source/emulators-8.5.2-source.tar.gz','source/MANIFEST.json','PUBLIC-MANIFEST.json'}

def check(write=False):
    found={p.relative_to(SITE).as_posix() for p in SITE.rglob('*') if p.is_file()}
    assert found-{ 'PUBLIC-MANIFEST.json' }==ALLOWED-{'PUBLIC-MANIFEST.json'}, {'unexpected':sorted(found-ALLOWED),'missing':sorted(ALLOWED-found-{'PUBLIC-MANIFEST.json'})}
    entries=[]
    for name in sorted(found-{'PUBLIC-MANIFEST.json'}):
        data=(SITE/name).read_bytes()
        if not name.startswith(('vendor/','source/')):
            assert not data.startswith(b'MZ')
            assert b'C:\\Users\\' not in data and b'E:\\budmaker' not in data, name
        entries.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    source=json.loads((SITE/'source/MANIFEST.json').read_text())
    assert hashlib.sha256((SITE/'source'/source['archive']).read_bytes()).hexdigest()==source['sha256']
    forbidden={'.exe','.com','.dll','.drv','.fon','.img','.ima','.iso','.vhd','.zip','.wasm','.a','.o','.so','.dylib','.bin','.jsdos','.xtworkspace'}
    with tarfile.open(SITE/'source'/source['archive']) as archive:
        members=archive.getmembers()
        assert all(m.isfile() and not PurePosixPath(m.name).is_absolute() and '..' not in PurePosixPath(m.name).parts for m in members)
        manifest=json.loads(archive.extractfile('SOURCE-MANIFEST.json').read())
        assert len(members)==len(manifest['files'])+1
        for member in members:
            assert PurePosixPath(member.name).suffix.lower() not in forbidden,member.name
            data=archive.extractfile(member).read();assert not data.startswith(b'MZ') and b'\0' not in data, member.name
            if member.name!='SOURCE-MANIFEST.json':assert hashlib.sha256(data).hexdigest()==manifest['files'][member.name]
        for name in ['emulators/src/impl/modules.ts','emulators/native/dosbox/src/dosbox.cpp','emulators/native/dosbox-x/src/dosbox.cpp','emulators/native/libzip/libzip-1.5/lib/zip_open.c','emulators/native/gl4es/src/gl/gl4es.c','patches/patch-runtime.py','modified/src/impl/modules.ts','modified/src/dos/dosbox/ts/worker-server.js','embedding-sources.json']:
            assert name in manifest['files'],name
        dosboxx=archive.extractfile('emulators/native/dosbox-x/src/dosbox.cpp').read()
        assert re.search(rb'mtype\s*==\s*"pcjr"',dosboxx) and b'MCH_PCJR' in dosboxx
    html=(SITE/'index.html').read_text('utf-8')
    assert "script-src 'self' 'wasm-unsafe-eval'" in html and "'unsafe-eval'" not in html
    assert 'https://www.pcjs.org/software/pcx86/sys/windows/3.00/' in html
    assert 'https://github.com/Foxlum/pcjs-wiki/blob/master/disks/pcx86/fixed/20mb/PCDOS320-WIN300-EGA.json' in html
    assert 'JRGUARD' not in (SITE/'app.mjs').read_text() and 'JRPROBE' not in (SITE/'app.mjs').read_text()
    report={'schema':1,'status':'PASS PUBLIC ALLOWLIST AND SOURCE HASHES','files':entries,'source_files':len(members),'private_media_included':False,'guest_executed':False}
    path=SITE/'PUBLIC-MANIFEST.json'
    if write:path.write_bytes((json.dumps(report,indent=2)+'\n').replace('\n','\r\n').encode())
    else:assert json.loads(path.read_text())==report,'Public manifest differs; review changes then regenerate with --write.'
    print(json.dumps({'status':report['status'],'files':len(found),'bytes':sum(e['bytes'] for e in entries),'source_files':len(members),'guest_executed':False}))

if __name__=='__main__':
    import sys
    check('--write' in sys.argv)
