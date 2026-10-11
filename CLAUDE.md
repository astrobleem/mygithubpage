# Working on the browser workshop

Read `windows-xt/README.md` and `windows-xt/THIRD-PARTY.md` first.
Keep private guest files, snapshots, diagnostics and downloaded EXEs outside
this repository. Do not commit Windows/MS-DOS/DDK/compiler media.

The application lives in `windows-xt/`; it is static and works at a subpath.
Runtime 8.5.2 is pinned locally. Reproduce loader edits with
`tools/patch-runtime.py`; verify the new SHA-384 loader allowlist and hashes.
Never add `unsafe-eval` or bypass browser CSP protections.

Use `tools/make-workspace.py` only on a separate private guest copy. The helper
does not build, install or execute software. Standard Tandy guards are kept;
an experimental PCjr profile needs your own verified guarded BAT. Reviewed
PCjr probes and guards are not supplied as safe defaults.

Run host checks before changing publication. Coordinate emulator execution
with the local operator and their exclusive guest-slot mechanism first.
Host tests establish application behavior, not emulated hardware qualification.
Capture real boot/input/audio/restart/import/export/save evidence separately.
Do not replace the accepted private preview or modify installed Windows or CF.

## Automatically prepare the referenced upstream disk privately

`tools/prepare-upstream.py` converts the exact Foxlum PCjs sector JSON into a
new private js-dos archive and applies the already accepted Windows XT fixture.
Claude can run this preparation; Chad does not need to convert a disk manually.
Python's standard library is sufficient. This command downloads data only and
does not start DOSBox, execute a guest or acquire the emulator lock.

In an isolated checkout of this repository's `gh-pages` branch, use PowerShell:

```powershell
$python = 'C:\Users\chad\Miniconda3\python.exe'
$overlay = 'E:\budmaker\WindowsXT-Browser-Prototype\revisions\input-20261010T050110Z\private-media\WINDOWS-XT-PRIVATE.jsdos'
$privateOut = Join-Path $env:TEMP ('WindowsXT-Upstream-' + (Get-Date -Format 'yyyyMMddTHHmmssfff'))
& $python tools/prepare-upstream.py --overlay $overlay --out $privateOut
```

An optional `--image-file YOUR_PRIVATE_PCJS_JSON` uses an offline copy with the
same mandatory source hash. Keep it outside this public repository. Output
must be a fresh directory outside the repository; an existing output is refused.
The approved overlay is read only and never unpacked into its owner's files.
Do not substitute another driver, guard or preview when the hash check fails.

The helper pins these inputs:

- [PCDOS320-WIN300-EGA.json at commit d2a82f69](https://raw.githubusercontent.com/Foxlum/pcjs-wiki/d2a82f69c9cbfe028020ff7d1cf3679638c5cf9d/disks/pcx86/fixed/20mb/PCDOS320-WIN300-EGA.json),
  SHA-256 `ee96645f9e9bb629c2250f11c06b72c86b31f24b164c32efef28d89ffb90a4e2`.
- Decoded raw disk: SHA-256
  `04de3664f8060d7c1a6c3046283b0c591fc11fd5df2d3c6e78ce987c8812ac2c`.
- Accepted private overlay: SHA-256
  `cb48f82f55059b559b3a5738a498318ac29757513b941244c4ffb5ce041e7b07`.

It validates 615 cylinders, 4 heads, 17 sectors per track and matching FAT16
tables. It extracts all 103 upstream Windows files, preserving the six checked
MZ/NE core modules. Eighty-five files also match the accepted fixture byte for
byte. Nine captured installed-layout files, including the glued `WIN.COM` and
INIs, come from that fixture; 101 private driver/font/helper files are added.
Root PC DOS system files are not included. This composes an approved test
fixture; it is not an installation recipe. Normal driver installation remains
Windows Setup / Other and the guarded Windows XT startup documented upstream.

The existing `READY.TAG`, `RESERVE.COM` and `WINXT.BAT` guard are preserved.
The captured `TR53216.DRV` / `XTESYS.FON` / `XTEFIX.FON` / `XTEOEM.FON` tuple and
`WIN.COM /R` are checked. No PCjr guard or probe is added. The public Tandy config
matches the app's 8086-prefetch, 640 KiB, no XMS/EMS/UMB and serial-mouse profile.
The bundle has fixed ZIP timestamps and sorted entries. Offline and automatic
download preparation produced identical 206-file, 2,417,059-byte archives with
SHA-256 `c9dba1a3ca5f133a5a534b11532d2aa6d9f697234787dbf5206c894bcadef648`.
ZIP deflate bytes can vary with a different Python/zlib version; input hashes,
file bytes and configuration remain the required checks.

Output includes `WINDOWS-XT-PRIVATE.jsdos`, the downloaded private
`PCJS-SOURCE.json`, `PREPARED.json` with provenance and static checks, and
`KEEP-PRIVATE.txt`. None may be uploaded or committed. Import the generated
bundle into **Try Windows XT** on the
[published workshop](https://astrobleem.github.io/mygithubpage/windows-xt/).
Import does not start the guest. Keep the accepted local preview unchanged.

Host parsing, archive/config checks and synthetic FAT tests passed. No native
or browser guest has been executed from this converted bundle. Actual Windows
real-mode boot, input, paging/palette, audible PSG, restart and persistence
recovery still need qualification. Supported browser inventory was empty;
both in-app-browser and Chrome creation returned unavailable in this execution
environment. Do not substitute unsupported input automation.

Before any guest run, obtain a bounded allocation from the local operator for
the shared exclusive lock at
`C:\Users\chad\Documents\Codex\2026-10-06\tandy-emulator.lock`.
Request a 600-second slot for one fresh converted fixture's guarded Tandy
real-mode boot/probe and controlled exit. No slot is allocated by preparation.
Acquire the existing lock with the approved build-kit lease mechanism; never
remove the lock, stop another process or infer an allocation from inactivity.
Browser input/audio qualification additionally requires working supported
browser controls. Keep all resulting guest evidence private.
