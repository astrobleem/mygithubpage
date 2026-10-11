"""Synthetic ZIP data only: no OS, compiler, driver, ROM or guest execution."""
from pathlib import Path
import zipfile
ROOT = Path(__file__).resolve().parents[1]
(ROOT / 'evidence').mkdir(exist_ok=True)
with zipfile.ZipFile(ROOT / 'tests/FIXTURE.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('.jsdos/dosbox.conf', '[dosbox]\nmachine=tandy\n[autoexec]\n@echo off\n')
    archive.writestr('.jsdos/jsdos.json', '{"version":"8"}')
    archive.writestr('PCJR/STARTJR.BAT', '@echo off\r\necho Synthetic host fixture only\r\n')
