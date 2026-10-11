# Runtime sources, licenses and modifications

The workshop embeds the official npm `emulators@8.5.2` release of js-dos.
Its package license is GPL-2.0. The unchanged license is in
[vendor/LICENSE](vendor/LICENSE), and the original application/tools are
distributed under [the same license](LICENSE).

Pinned sources and browser-worker build materials accompany the runtime:

- [Source archive](source/emulators-8.5.2-source.tar.gz)
- [Source pins and archive SHA-256](source/MANIFEST.json)
- [All deployed file SHA-256 hashes](PUBLIC-MANIFEST.json)
- [Official source repository](https://github.com/js-dos/emulators)
- [Official embedding API documentation](https://js-dos.com/emulators.html)

The npm gitHead is `6bbf0925d221a7304ea8e0dda1e89b8dc01569b2`.
DOSBox is pinned at `528578d5a6f76afd4d5ef4e722b5670826f1183a`;
DOSBox-X at `788fde99d3d451eab3621009186e5abe516f2b9c`;
Sokol at `fa3d7cbe9ca85b8b87824ac366c724cb0e33a6af`;
GL4ES at `a744af14d4afbda77bf472bc53f43b9ceba39cc0`.
Original source/header notices, library licenses, CMake/Gulp scripts,
`yarn.lock`, and embedding dependency source-map contents are preserved.
Optional upstream games, binary benchmark fixtures and prebuilt DOS4GW
arrays are omitted. The archive documents the selected worker build targets
and official Node 22 / Emscripten 5.0.2 build environment. No rebuild or
bit-for-bit compiler reproducibility is claimed.

The local compatibility adaptation changes the embedding browser loader's
text fetch/eval into an external same-origin script loader. `runtime-loader.js`
allows exactly three pinned script URLs/factory names with SHA-384 integrity.
Two worker initialization rejection handlers also forward their existing
failure into the ordinary protocol error channel. The strict CSP retains
`script-src 'self' 'wasm-unsafe-eval'`; it does not permit `unsafe-eval`.
`../tools/patch-runtime.py` reproduces the three exact modified JS assets
from an unpacked official npm package. The WASM assets are byte-identical
to the official release. This adaptation is not an upstream-supported CSP build.

Only the regular DOSBox and DOSBox-X worker backends plus libzip are invoked.
Debug, JSPI, remote disk/networking and externally hosted media services are
not enabled by this app. Their implementations may exist in the API/runtime,
but the application never invokes them. Nothing starts a DOS guest on page load.

The original Foxlum/PCjs Windows 3.0 disk and current PCjs demo are external
links. No PCjs runtime, ROM or Microsoft disk is copied into this release.
No Microsoft Windows, MS-DOS, compiler, DDK, Open Watcom compiler media,
private driver/font candidate, private save or private screenshot is included.
