# Windows XT browser workshop

[Open the published workshop](https://astrobleem.github.io/mygithubpage/windows-xt/).

Two browser workspaces: Windows XT and a separate DOS compiler/editor.
The app and emulator sources are public; Windows and compiler media stay private.
The workshop also links the existing upstream PCjs Windows 3.0 demo directly.

See [workspace instructions](windows-xt/README.md),
[runtime sources and licenses](windows-xt/THIRD-PARTY.md), and
[Claude instructions](CLAUDE.md).

Host verification: `npm ci --ignore-scripts` then `npm test`.
Tests use synthetic files and instantiate libzip only, with no DOS guest.
The site is served from the existing `gh-pages` branch. CI uploads only
the explicitly audited application directory as its public artifact.
