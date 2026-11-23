const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const run = promisify(execFile);
const root = path.resolve(__dirname, '../..');
let temp, desktopFile, iconSource, baseEnv;

before(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'figma-desktop-integration-'));
  await fs.mkdir(path.join(temp, 'data'), { recursive: true });
  await fs.mkdir(path.join(temp, 'cache'), { recursive: true });
  iconSource = path.join(temp, 'io.github.nickvdp.figma-desktop-linux.png');
  await fs.writeFile(iconSource, 'icon bytes');
  desktopFile = path.join(temp, 'data/applications/figma-desktop-appimage.desktop');
  baseEnv = {
    ...process.env,
    ROOT: root,
    APPDIR: temp,
    APPIMAGE_PATH: '/opt/figma/figma-desktop-126.12.7-amd64.AppImage',
    XDG_DATA_HOME: path.join(temp, 'data'),
    XDG_CACHE_HOME: path.join(temp, 'cache'),
  };
});

after(async () => {
  if (temp) await fs.rm(temp, { recursive: true, force: true });
});

const integrate = (extraEnv = {}) => run('bash', ['-c', `
  source "$ROOT/scripts/launcher-common.sh"
  setup_logging
  integrate_appimage_desktop "$APPDIR" "$APPIMAGE_PATH"
`], { env: { ...baseEnv, ...extraEnv } });

test('first launch creates a marked desktop entry with the AppImage path', async () => {
  await integrate();
  const content = await fs.readFile(desktopFile, 'utf8');
  assert.match(content, /^Exec="\/opt\/figma\/figma-desktop-126\.12\.7-amd64\.AppImage" %u$/m);
  assert.match(content, /^X-Figforge-AppImage=\/opt\/figma\/figma-desktop-126\.12\.7-amd64\.AppImage$/m);
  assert.match(content, /^MimeType=x-scheme-handler\/figma;$/m);
});

test('later launches do not overwrite user-added Exec flags', async () => {
  const custom = 'Exec="/opt/figma/figma-desktop-126.12.7-amd64.AppImage" '
    + '--enable-features=Vulkan,WebGPU --enable-unsafe-webgpu %u';
  const original = (await fs.readFile(desktopFile, 'utf8'))
    .replace(/^Exec=.*$/m, custom);
  await fs.writeFile(desktopFile, original);

  await integrate();
  assert.equal(await fs.readFile(desktopFile, 'utf8'), original);
});

test('a moved AppImage is recorded while custom Exec flags are preserved', async () => {
  await integrate({ APPIMAGE_PATH: '/opt/figma/renamed.AppImage' });
  const content = await fs.readFile(desktopFile, 'utf8');
  assert.match(content, /^Exec="\/opt\/figma\/renamed\.AppImage" --enable-features=Vulkan,WebGPU --enable-unsafe-webgpu %u$/m);
  assert.match(content, /^X-Figforge-AppImage=\/opt\/figma\/renamed\.AppImage$/m);
});

test('a desktop entry without our marker is treated as user-managed', async () => {
  const external = '[Desktop Entry]\nName=Figma Custom\nExec=/usr/bin/custom-figma %u\n';
  await fs.writeFile(desktopFile, external);
  await integrate();
  assert.equal(await fs.readFile(desktopFile, 'utf8'), external);
});

test('a legacy generated entry is migrated instead of staying on the old path', async () => {
  const legacy = `[Desktop Entry]
Name=Figma
Exec="/opt/figma/previous.AppImage" --enable-features=Vulkan %u
Icon=figma-desktop
Type=Application
Terminal=false
Categories=Graphics;
Comment=Figma Desktop for Linux (AppImage)
MimeType=x-scheme-handler/figma;
StartupWMClass=Figma
`;
  await fs.writeFile(desktopFile, legacy);
  await integrate();
  const content = await fs.readFile(desktopFile, 'utf8');
  assert.match(content, /^Exec="\/opt\/figma\/figma-desktop-126\.12\.7-amd64\.AppImage" --enable-features=Vulkan %u$/m);
  assert.match(content, /^X-Figforge-AppImage=\/opt\/figma\/figma-desktop-126\.12\.7-amd64\.AppImage$/m);
});
