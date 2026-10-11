/* Local compatibility adapter for the pinned js-dos 8.5.2 browser loader.
 * External same-origin scripts are permitted by the existing CSP. Imported
 * media is data: it cannot choose a script URL, factory name, or integrity.
 * This defines factories only. The worker starts only through Start guest.
 */
(() => {
  'use strict';
  const assets = {
  "WLIBZIP": {
    "file": "wlibzip.js",
    "integrity": "sha384-o3pvt2CaEki1jwAEnNHx8qx3Vpn7Lj+3I1XPnYkDdkA3BckfNQW3CCs1B7gDTzn3"
  },
  "WDOSBOX": {
    "file": "wdosbox.js",
    "integrity": "sha384-wzXVZoM2S57YZettmIWVgtpFGxVnbHoOaSAZ7j1oIvJL8ZpmtzL7/iZI6xwocg89"
  },
  "WDOSBOXX": {
    "file": "wdosbox-x.js",
    "integrity": "sha384-AzIzYtOcQiiDrq0VHCeVb+NIi7jGxqWVZzGmncZ1DYYbNfi8y3I9OY3FDb04r9dD"
  }
};
  const scriptUrl = document.currentScript?.src;
  if (!scriptUrl) throw new Error('Runtime loader must be an external script.');
  const base = new URL('./vendor/', scriptUrl);
  const loaded = new Map();
  let queue = Promise.resolve();
  function loadRuntime(url, name) {
    const asset = Object.hasOwn(assets, name) ? assets[name] : null;
    if (!asset || new URL(url, scriptUrl).href !== new URL(asset.file, base).href)
      return Promise.reject(new Error('Runtime script is outside the pinned local allowlist.'));
    if (loaded.has(name)) return loaded.get(name);
    const request = queue.then(() => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(asset.file, base).href;
      script.integrity = asset.integrity;
      script.async = false;
      script.onload = () => {
        const factory = globalThis[name];
        script.remove();
        if (typeof factory !== 'function') reject(new Error('Runtime factory missing: '+name));
        else resolve(factory);
      };
      script.onerror = () => {
        script.remove();
        reject(new Error('Local runtime script failed to load or failed its integrity check: '+asset.file));
      };
      document.head.append(script);
    }));
    loaded.set(name, request);
    queue = request.catch(() => {});
    return request;
  }
  Object.defineProperty(globalThis, '__xtLoadRuntimeScript', {value:loadRuntime});
})();
