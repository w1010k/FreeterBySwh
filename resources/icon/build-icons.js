/*
 * Builds every app icon file from acedeck.svg. Run from the repo root after changing the drawing:
 *
 *   yarn electron resources/icon/build-icons.js
 *
 * Electron draws the SVG (no extra dependency). Writes the Linux PNG set, the Windows .ico and the PNGs the running
 * app loads (tray at 1x and 2x, Linux window). The file and folder names still say "freeter": see docs/dev/decisions.md D86.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const linuxSizes = [16, 32, 48, 64, 128, 256, 512, 1024];
// As the icon it replaces: small sizes as bitmaps, 256 as PNG.
const icoSizes = [16, 32, 48, 256];

// Keep this run's Electron profile out of the app's data folders. One fixed folder, reused by every run: a new one
// per run could not be removed at exit (Chromium's child processes still hold it) and would pile up.
app.setPath('userData', path.join(os.tmpdir(), 'acedeck-icons-profile'));

/** One .ico image: a 32-bit bottom-up bitmap with an (empty) AND mask, or the PNG as is. */
function icoImage(size, png, rgba) {
  if (size >= 256) {
    return png;
  }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // image + mask
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = ((size - 1 - y) * size + x) * 4;
      pixels[dst] = rgba[src + 2];
      pixels[dst + 1] = rgba[src + 1];
      pixels[dst + 2] = rgba[src];
      pixels[dst + 3] = rgba[src + 3];
    }
  }
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  return Buffer.concat([header, pixels, mask]);
}

function ico(images) {
  const dir = Buffer.alloc(6 + 16 * images.length);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(images.length, 4);
  let offset = dir.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    dir[entry] = size >= 256 ? 0 : size;
    dir[entry + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, entry + 4);
    dir.writeUInt16LE(32, entry + 6);
    dir.writeUInt32LE(data.length, entry + 8);
    dir.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([dir, ...images.map(i => i.data)]);
}

async function build() {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const svg = fs.readFileSync(path.join(__dirname, 'acedeck.svg')).toString('base64');
  const sizes = [...new Set([...linuxSizes, ...icoSizes])];
  // Drawn on a canvas of the exact pixel size, so the result does not depend on the display scale.
  const drawn = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,${svg}';
    try {
      await img.decode();
    } catch {
      throw new Error('acedeck.svg could not be drawn (not a valid SVG?)');
    }
    const out = {};
    for (const size of ${JSON.stringify(sizes)}) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      out[size] = {
        png: canvas.toDataURL('image/png').split(',')[1],
        // Raw pixels only for the sizes stored as bitmaps in the .ico.
        rgba: ${JSON.stringify(icoSizes.filter(s => s < 256))}.includes(size) ? Array.from(ctx.getImageData(0, 0, size, size).data) : null
      };
    }
    return out;
  })()`);
  const png = size => Buffer.from(drawn[size].png, 'base64');

  for (const size of linuxSizes) {
    fs.writeFileSync(path.join(root, 'resources', 'linux', 'freeter-icons', `${size}x${size}.png`), png(size));
  }
  fs.writeFileSync(path.join(root, 'src', 'assets', 'app-icons', '16.png'), png(16));
  // Electron's Tray picks this one on displays scaled 150% and up, instead of stretching the 16px image.
  fs.writeFileSync(path.join(root, 'src', 'assets', 'app-icons', '16@2x.png'), png(32));
  fs.writeFileSync(path.join(root, 'src', 'assets', 'app-icons', '256.png'), png(256));
  fs.writeFileSync(
    path.join(root, 'resources', 'win32', 'freeter.ico'),
    ico(icoSizes.map(size => ({ size, data: icoImage(size, png(size), drawn[size].rgba) })))
  );
}

// A failure (a broken SVG, a locked output file) must end the run: the hidden window would keep the app alive.
app.whenReady().then(build).then(() => app.quit(), err => {
  console.error('Icons were not built:', err instanceof Error ? err.message : err);
  app.exit(1);
});
