"""Reproduce release-byte patches from an unpacked official emulators@8.5.2."""
from pathlib import Path
import argparse, base64, hashlib, json

ROOT = Path(__file__).resolve().parents[1]
def patch(package, output):
    package, output = Path(package).resolve(), Path(output).resolve()
    assert json.loads((package / 'package.json').read_text())['version'] == '8.5.2'
    output.mkdir(parents=True, exist_ok=True)
    data = (package / 'dist/emulators.js').read_text('utf-8')
    old = 'h=(0,s.httpRequest)(e,{progress:(e,t)=>{i("Resolving DosBox",e,t)}})'
    execute = 'eval.call(window,p),n.host.globals.exports[t]=n.host.globals.module.exports'
    assert data.count(old) == data.count(execute) == 1
    (output / 'emulators.js').write_bytes(data.replace(old, 'h=window.__xtLoadRuntimeScript(e,t)').replace(execute,'n.host.globals.exports[t]=p').encode())
    for name in ['wdosbox.js','wdosbox-x.js']:
        text=(package / 'dist' / name).read_text('utf-8'); assert text.count('.catch(console.error);') == 1
        (output / name).write_bytes(text.replace('.catch(console.error);',".catch(error => { console.error(error); self.postMessage({name:'ws-err',props:{tag:'runtime-init',message:String(error && error.stack || error).slice(0,8000)}}); });").encode())
    for name in ['wdosbox.wasm','wdosbox-x.wasm','wlibzip.js','wlibzip.wasm']:
        (output / name).write_bytes((package / 'dist' / name).read_bytes())
    return {name:'sha384-'+base64.b64encode(hashlib.sha384((output/name).read_bytes()).digest()).decode() for name in ['wlibzip.js','wdosbox.js','wdosbox-x.js']}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--package',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args();print(json.dumps(patch(args.package,args.output),indent=2))
