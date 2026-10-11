from pathlib import Path
import importlib.util, tempfile, unittest, zipfile
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('workspace', ROOT / 'tools/make-workspace.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class Workspace(unittest.TestCase):
    def test_private_copy_and_preservation(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); source = base / 'guest'; source.mkdir()
            for name in ['WINDOWS/WIN.COM','WINDOWS/SYSTEM/KERNEL.EXE','PCJR/STARTJR.BAT']:
                path = source / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(b'SYNTHETIC HOST FIXTURE')
            before = {p: p.read_bytes() for p in source.rglob('*') if p.is_file()}
            output = base / 'private.jsdos'
            module.make(source, output, 'xt', 'pcjr', 'PCJR/STARTJR.BAT')
            with zipfile.ZipFile(output) as archive:
                self.assertIsNone(archive.testzip()); self.assertIn('PCJR/STARTJR.BAT', archive.namelist())
            self.assertEqual(before, {p: p.read_bytes() for p in source.rglob('*') if p.is_file()})
            with self.assertRaises(ValueError): module.make(source, output, 'xt', 'pcjr', 'PCJR/STARTJR.BAT')
            with self.assertRaises(ValueError): module.make(source, source / 'out.jsdos', 'xt')
            with self.assertRaises(ValueError): module.make(source, base / 'bad.jsdos', 'xt', 'pcjr', 'PCJR/MISSING.BAT')
            with self.assertRaises(ValueError): module.make(source, base / 'bad.jsdos', 'xt', 'pcjr', '../BAD.BAT')
            with self.assertRaises(ValueError): module.make(source, ROOT / 'BAD.jsdos', 'xt')
    def test_case_collision(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'guest';source.mkdir()
            (source/'LONGFILENAME.C').write_text('synthetic')
            with self.assertRaises(ValueError):module.make(source,Path(directory)/'bad.jsdos','build')

if __name__ == '__main__': unittest.main()
