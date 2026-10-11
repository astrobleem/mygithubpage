import {CONFIGS,validateProfile} from './core.mjs';

export function windowsConfig(profile) {
  const checked = validateProfile(profile);
  let config = CONFIGS.xt.replace('machine=tandy\n', 'machine=' + checked.machine + '\n');
  if (checked.launcher) config = config.replace(
    'if not exist C:\\WINXT\\SHREADY.TAG call C:\\WINXT\\TSSETUP.BAT\ncall C:\\WINXT\\WINXT.BAT\n',
    'call C:\\' + checked.launcher.replace(/\//g, '\\') + '\n');
  return config;
}

export function requireLauncher(zip, profile) {
  const launcher = validateProfile(profile).launcher;
  if (!launcher) return;
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === zip.length) { end = i; break; }
  if (end < 0) throw new Error('Cannot inspect the private ZIP launcher.');
  let offset = view.getUint32(end + 16, true);
  let found = false;
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    if (offset + 46 > zip.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const length = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
    if (offset + 46 + length + extra + comment > zip.length) throw new Error('Truncated ZIP directory.');
    const name = new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + length)).replace(/\\/g, '/').toUpperCase();
    if (name === launcher) found = true;
    offset += 46 + length + extra + comment;
  }
  if (!found) throw new Error('Custom guarded launcher is missing from the imported bundle: ' + launcher);
}

export {validateProfile};
