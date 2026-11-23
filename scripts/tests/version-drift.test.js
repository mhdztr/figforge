const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const run = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const fixtureDir = path.join(__dirname, 'fixtures');
const script = path.join(root, 'scripts/check-version-drift.sh');
let temp, installer, trackedCurrent, trackedStale, trackedMissing;

before(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'figma drift '));
  await fs.writeFile(path.join(temp, 'payload.txt'), 'fixture');
  const nupkgName = (await fs.readFile(path.join(fixtureDir, 'nupkg-name.txt'), 'utf8')).trim();
  await run('7z', ['a', '-tzip', nupkgName, 'payload.txt'], { cwd: temp });
  installer = path.join(temp, 'setup.exe');
  await run('7z', ['a', '-tzip', installer, nupkgName], { cwd: temp });

  trackedCurrent = path.join(temp, 'TRACKED_VERSION.current');
  trackedStale = path.join(temp, 'TRACKED_VERSION.stale');
  trackedMissing = path.join(temp, 'TRACKED_VERSION.missing');
  await fs.writeFile(trackedCurrent, '126.12.7\n');
  await fs.writeFile(trackedStale, '126.11.11\n');
});

after(async () => {
  if (temp) await fs.rm(temp, { recursive: true, force: true });
});

const drift = async (trackedFile) => {
  const { stdout } = await run(script, [], {
    env: {
      ...process.env,
      FIGMA_MANIFEST_FIXTURE: path.join(fixtureDir, 'RELEASES.stale'),
      FIGMA_INSTALLER_FIXTURE: installer,
      TRACKED_VERSION_FILE: trackedFile,
    },
  });
  return JSON.parse(stdout);
};

test('recorded stale manifest does not override installer version', async () => {
  const result = await drift(trackedCurrent);
  assert.deepEqual(result, {
    manifest_version: '126.11.11',
    installer_version: '126.12.7',
    selected_version: '126.12.7',
    tracked_version: '126.12.7',
    drift: false,
  });
});

test('new installer against stale tracked version reports drift', async () => {
  const result = await drift(trackedStale);
  assert.equal(result.selected_version, '126.12.7');
  assert.equal(result.tracked_version, '126.11.11');
  assert.equal(result.drift, true);
});

test('missing tracked version file reports drift without inventing a version', async () => {
  const result = await drift(trackedMissing);
  assert.equal(result.tracked_version, '');
  assert.equal(result.drift, true);
});
