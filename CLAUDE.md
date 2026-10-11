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
