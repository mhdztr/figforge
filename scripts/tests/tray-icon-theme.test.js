const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const buildScript = fs.readFileSync(path.join(root, 'build.sh'), 'utf8');
const mainJs = fs.readFileSync(
  path.join(__dirname, 'fixtures/main-js-126.12.7.txt'), 'utf8');

// Read the regex literals straight out of build.sh: if a future edit changes a
// pattern so it no longer matches recorded 126.12.7 code, this test fails.
function patternFromBuild(name) {
  const match = buildScript.match(new RegExp(`^const ${name} = (/.*/[gimsuy]*);\\s*$`, 'm'));
  assert.ok(match, `build.sh has no regex literal named ${name}`);
  // eslint-disable-next-line no-eval
  return eval(match[1]);
}

test('recorded main.js exposes the Windows-only dark-mode probe', () => {
  const dark = patternFromBuild('darkPattern').exec(mainJs);
  assert.ok(dark, 'darkPattern no longer matches the recorded client');
  assert.equal(dark[1], 'Xz');
  assert.equal(dark[2], '_e');
});

test('recorded main.js exposes both Windows-only theme listeners', () => {
  const listeners = mainJs.match(patternFromBuild('listenerPattern')) || [];
  assert.equal(listeners.length, 2);
});

test('theme patch drops the platform gate but keeps listener registration', () => {
  const darkPattern = patternFromBuild('darkPattern');
  const listenerPattern = patternFromBuild('listenerPattern');
  const [, fnName, binding] = darkPattern.exec(mainJs);

  const patchedDark = `function ${fnName}(){return ${binding}.isSystemDarkMode()}`;
  assert.equal(patchedDark, 'function Xz(){return _e.isSystemDarkMode()}');

  const patchedListeners = mainJs.replace(
    listenerPattern,
    (full, flag, electron, method) =>
      `this.themeCallback&&${electron}.nativeTheme.${method}("updated",this.themeCallback)`,
  );
  assert.match(patchedListeners,
    /this\.themeCallback&&Bs\.nativeTheme\.addListener\("updated",this\.themeCallback\)/);
  assert.match(patchedListeners,
    /this\.themeCallback&&Bs\.nativeTheme\.removeListener\("updated",this\.themeCallback\)/);
  assert.doesNotMatch(patchedListeners,
    /tt&&this\.themeCallback&&Bs\.nativeTheme\./);
});

test('missing patch targets are fatal', () => {
  assert.ok(buildScript.includes('ERROR: Tray dark-mode probe pattern not found'));
  assert.ok(buildScript.includes('ERROR: Tray theme listener pattern not found'));
});
