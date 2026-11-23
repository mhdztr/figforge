const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const buildScript = fs.readFileSync(path.join(root, 'build.sh'), 'utf8');
const fixtureDir = path.join(__dirname, 'fixtures');
const mainJs = fs.readFileSync(path.join(fixtureDir, 'main-js-126.12.7.txt'), 'utf8');
const shellHtml = fs.readFileSync(path.join(fixtureDir, 'shell-html-126.12.7.txt'), 'utf8');

// Pull the actual regex literal out of build.sh so this test fails if a future
// edit changes a pattern in a way that no longer matches the recorded client.
function patternFromBuild(name) {
  const match = buildScript.match(new RegExp(`^const ${name} = (/.+/);\\s*$`, 'm'));
  assert.ok(match, `build.sh has no regex literal named ${name}`);
  // eslint-disable-next-line no-eval
  return eval(match[1]);
}

test('recorded main.js contains every patch sentinel asserted by the build', () => {
  for (const sentinel of [
    'frame:!1',
    'titleBarStyle:"hidden"',
    'process.platform==="win32"&&(this.windowsAppMenu=',
  ]) {
    assert.ok(mainJs.includes(sentinel), `fixture missing sentinel: ${sentinel}`);
  }
  assert.ok(shellHtml.includes('</head>'));
});

test('native argv, legacy tray, modern tray and tray-window regexes match recorded 126.12.7 code', () => {
  for (const name of ['nativePattern', 'legacyPattern', 'modernPattern', 'trayVarPattern']) {
    assert.match(mainJs, patternFromBuild(name), `${name} no longer matches the recorded client`);
  }
});

test('modern tray snippet is the one selected when optional chaining is present', () => {
  const modern = patternFromBuild('modernPattern');
  assert.match(mainJs, modern);
  assert.ok(buildScript.includes("} else if (modern) {"));
  assert.ok(buildScript.includes('Tray context menu patched: added setContextMenu() for Linux (modern pattern)'));
});
