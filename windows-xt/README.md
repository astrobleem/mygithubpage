# Windows XT browser workshop

The two workspaces run locally in your browser: **Try Windows XT** uses the
DOSBox-X Tandy profile; **Build something** uses a separate DOS compiler guest.
The application is static, with no account, upload endpoint or telemetry.
Imported media, source and explicit saves remain in browser storage.

## Start with the existing image

The original [Foxlum/pcjs-wiki repository](https://github.com/Foxlum/pcjs-wiki)
contains [PCDOS320-WIN300-EGA.json](https://github.com/Foxlum/pcjs-wiki/blob/master/disks/pcx86/fixed/20mb/PCDOS320-WIN300-EGA.json).
Its machine definition is an IBM AT with EGA and PC DOS 3.20. Open the
[existing PCjs Windows 3.0 demo](https://www.pcjs.org/software/pcx86/sys/windows/3.00/)
to use that original route directly. The upstream image is linked, not copied.
Its PCjs JSON disk format is not a js-dos archive; selecting it as a media
bundle here will not work. It does not include this project's Windows XT
driver, fonts or guarded Tandy startup.

Claude can prepare that exact upstream disk automatically with the private
fixture helper in [CLAUDE.md](../CLAUDE.md#automatically-prepare-the-referenced-upstream-disk-privately).
It validates the pinned disk and accepted private Windows XT overlay, then
writes a new private bundle outside the public repository. No guest is started
by preparation. Host conversion passed; guest qualification remains pending.

The Foxlum code license is GPLv3; current PCjs code is MIT. Neither establishes
a Microsoft license grant for the contained Windows/PC DOS media. No Microsoft
media is mirrored by this site. This distinction does not prevent linking the
existing upstream demo.

## Use your private Windows XT workspace

Use your already prepared private `.jsdos` bundle with **Import media bundle**,
then **Start guest**. The app makes an in-memory launch copy with a fixed Tandy,
8086-prefetch, 640 KiB profile, no XMS/EMS/UMB, serial mouse and Tandy sound.
It preserves the existing `WINXT/TSSETUP.BAT` and `WINXT/WINXT.BAT` startup.
The guarded launcher remains responsible for the guest's safe video reservation.

If you have an existing private guest directory, the original Python helper
at `../tools/make-workspace.py` packages a new copy without editing the input.
Keep both the directory and output outside this public repository:

```text
python tools/make-workspace.py --kind xt --root YOUR_PRIVATE_GUEST --output YOUR_PRIVATE_OUTPUT.jsdos
```

Click the canvas to focus input. **Capture mouse** uses browser pointer lock;
Escape releases it. **Open Start (guest)** sends Ctrl+Escape through the guest
API. **Enable sound** starts browser audio only after your click.

## Compiler and files

Import a private DOS-hosted Open Watcom bundle containing `WATCOM/BINW`, `H`,
`LIB286`, and `WORK/HELLO.C`, or package your existing directory with
`--kind build`. The host compiler profile uses a 386 and 16 MiB, while
`wcl -bt=dos -ms -0` targets 8086/8088 output. Import/edit C, save source,
build, inspect the log, run and download the newly verified MZ EXE explicitly.
Return to the DOS prompt before moving files through `C:\WORK`.
This is not a replacement for the MSC6/DDK recipes and original toolchain.

## Saves and recovery

**Save workspace** commits a complete filesystem snapshot and editor draft
to IndexedDB, retaining one previous snapshot. **Save & stop/restart** performs
that save before stopping. **Export recovery file** includes private media;
keep it private. **Export last saved recovery** needs no guest response.
**Recover previous save** verifies the old hash before committing it.
An interrupted or stale-tab save preserves the previous committed record.
Browser data clearing or eviction can remove local saves: export a separate
recovery file before relying on persistence. GitHub Pages and a loopback
preview have separate browser origins and therefore separate save stores.

## PCjr experiments

Pinned DOSBox-X recognizes `machine=pcjr` and contains its paging/video and
PSG implementations. The advanced machine field exposes that backend option;
it does not qualify Windows operation, hardware fidelity or the PCjr driver.
A PCjr selection requires an existing custom guarded BAT launcher in your
private bundle. The app checks the path and presence, not reservation safety.
It does not include or run JRGUARD, JRPROBE or T2PROBE. Their reviewed branch
has unresolved reservation/mapping issues and must not serve as safe defaults.

For your own independently verified experimental payload, package a separate
private copy using `--machine pcjr --launcher PCJR/STARTJR.BAT`, select the same
machine and launcher in the advanced fields, and start explicitly. The app
traces only the supplied guarded BAT. Driver installation and reservation
validation are separate work. Use **Diagnostic DOS prompt** to inspect files
before any guarded launch. Coordinate the exclusive guest slot with the local
operator before starting a browser or native emulator.

## What has been observed

A user observed the private Windows XT desktop, working mouse and Solitaire
on the earlier accepted preview. The exact running revision was not independently
captured. Public release host checks cover configuration archive ordering,
input forwarding, bounded diagnostics, save/recovery corruption handling and
strict CSP loading. They create no DOS guest and are not browser qualification.
Targeted real-mode, paging, palette, audible PSG, compiler build/download,
browser restart and persistence recovery remain to be tested. Diagnostic
downloads contain actual guest data and screens; keep them private.

## Local serving and source

Serve the public application directory over loopback, for example:
`python -m http.server 8090 --bind 127.0.0.1 --directory windows-xt`.
Keep private bundles outside the served directory and import them with the
file picker. The existing accepted private preview has its own restricted
loopback launcher and is preserved independently.

The complete application source is in this repository. See
[THIRD-PARTY.md](THIRD-PARTY.md) for pinned emulator sources, modifications,
licenses and build inputs. No Windows, DOS, compiler or DDK media is distributed.
