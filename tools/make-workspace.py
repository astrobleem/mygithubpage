"""Package your own private guest directory. Does not install or execute software."""
from pathlib import Path
import argparse, json, re, zipfile

REPO = Path(__file__).resolve().parents[1]
DOS = re.compile(r"^[A-Z0-9_$~!#&'()@^`{}-]{1,8}(\.[A-Z0-9_$~!#&'()@^`{}-]{1,3})?$", re.I)
BAT = re.compile(r'^(?:[A-Z0-9_]{1,8}/)*[A-Z0-9_]{1,8}\.BAT$')

def make(root, output, kind, machine='tandy', launcher=''):
    root, output = Path(root).resolve(), Path(output).resolve()
    launcher = launcher.replace('\\', '/').upper()
    if not root.is_dir() or root.is_relative_to(REPO): raise ValueError('Choose your private guest directory outside the public repository.')
    if output.is_relative_to(REPO) or output.is_relative_to(root): raise ValueError('Output must be outside the public repository and input directory.')
    if output.exists(): raise ValueError('Output already exists; use a new filename.')
    if machine not in ('tandy', 'pcjr'): raise ValueError('Unsupported machine.')
    if launcher and not BAT.fullmatch(launcher): raise ValueError('Use a DOS 8.3 BAT launcher path.')
    if kind == 'xt' and machine == 'pcjr' and not launcher: raise ValueError('PCjr requires your own verified guarded launcher; no driver/guard is supplied.')
    files, names, total = [], set(), 0
    for file in sorted(root.rglob('*')):
        if file.is_symlink(): raise ValueError('Symlinks are not accepted.')
        if not file.is_file(): continue
        name = file.relative_to(root).as_posix().upper()
        if name.startswith('.JSDOS/'): continue
        if any(not DOS.fullmatch(p) for p in name.split('/')): raise ValueError('Use DOS 8.3 names: ' + name)
        if name in names: raise ValueError('Case-insensitive filename collision: ' + name)
        names.add(name); total += file.stat().st_size
        if total > 128 * 1024 * 1024: raise ValueError('Input exceeds 128 MiB.')
        files.append((file, name))
    if launcher and launcher not in names: raise ValueError('Custom guarded launcher missing: ' + launcher)
    required = ['WINDOWS/WIN.COM', 'WINDOWS/SYSTEM/KERNEL.EXE'] if kind == 'xt' else ['WATCOM/BINW/WCL.EXE', 'WATCOM/H/STDIO.H', 'WORK/HELLO.C']
    if any(name not in names for name in required): raise ValueError('Missing required guest files: ' + ', '.join(n for n in required if n not in names))
    if kind == 'xt' and not launcher and 'WINXT/WINXT.BAT' not in names: raise ValueError('Standard Tandy bundle needs your existing WINXT/WINXT.BAT guard.')
    config = ('[dosbox]\nmachine=' + machine + '\n[cpu]\ncputype=8086_prefetch\n[autoexec]\nmount c .\nc:\n') if kind == 'xt' else '[dosbox]\nmachine=svga_s3\n[cpu]\ncputype=386\n[autoexec]\nmount c .\nc:\n'
    metadata = {'version': '8', 'windowsXt': {'machine': machine, 'launcher': launcher}, 'note': 'Private user media; do not publish this archive.'}
    # Mode x guarantees that even a concurrent output creation is preserved.
    with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED) as archive:
        for file, name in files: archive.write(file, name)
        archive.writestr('.jsdos/dosbox.conf', config)
        archive.writestr('.jsdos/jsdos.json', json.dumps(metadata))
    return {'files': len(files), 'bytes': output.stat().st_size, 'private': True}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--kind', choices=['xt', 'build'], required=True)
    parser.add_argument('--machine', choices=['tandy', 'pcjr'], default='tandy')
    parser.add_argument('--launcher', default='')
    args = parser.parse_args()
    print(json.dumps(make(args.root, args.output, args.kind, args.machine, args.launcher)))
