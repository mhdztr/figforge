const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const buildScript = fs.readFileSync(path.join(root, 'build.sh'), 'utf8');
const has = (text) => assert.ok(buildScript.includes(text), `build.sh missing: ${text}`);

// Regression guard for the Phase 1 (Figma 126.12.7) fixes.
//
// Three patches used to silently no-op because:
//   1. bare `"` inside a bash `node -e "..."` string gets stripped, so the
//      tray-window regex never matched;
//   2. Figma changed the tray right-click handler to optional chaining;
//   3. Figma added native Linux argv handling, so the legacy argv patch had
//      to recognise and skip it instead of erroring.
//
// A sed/regex that matches nothing still exits 0, so these guards make a
// future recurrence a build failure rather than a broken release.
test('native-frame patch has fail-loud sentinels before sed', () => {
	has('Patch sentinels: frame:!1=');
	has('no frameless BrowserWindow sentinel in main.js');
	has('titleBarStyle:"hidden" sentinel missing from main.js');
	has('windowsAppMenu win32 gate sentinel missing from main.js');
	has('native-frame patch left stale patterns');
});

test('patch_app_asar failure propagates to the build exit code', () => {
	has('patch_app_asar || exit 1');
});

test('shell.html injection point is asserted', () => {
	has('</head> injection point missing');
});

test('tray context menu patch supports legacy and optional-chaining shapes', () => {
	has('const legacyPattern = /this\\.electronTray');
	has('this\\.electronTray\\?\\.popUpContextMenu');
	has('Tray context menu patched: added setContextMenu() for Linux (modern pattern)');
	has('ERROR: Tray context menu pattern not found');
});

test('tray window patch survives bash double-quote stripping', () => {
	has('setAlwaysOnTop\\(!0,\\"pop-up-menu\\"\\)');
	has('webContents\\.on\\(\\"will-navigate\\"');
	has('ERROR: Tray window pattern not found');
});

test('argv patch recognises Figma native Linux handling and fails loud otherwise', () => {
	has('process\\.platform===\\"linux\\"');
	has('already handles Linux argv upstream - skipping patch');
	has('ERROR: handleCommandLineArgs pattern not found');
});

test('every patching node block is fatal on failure', () => {
	// The three JS patch blocks that used to warn-and-continue must now abort.
	const blocks = [
		/handleCommandLineArgs patched for Linux argv[\s\S]*?\n" \|\| exit 1/,
		/Tray context menu patched[\s\S]*?\n" \|\| exit 1/,
		/Tray notification CSS fixes[\s\S]*?\n" \|\| exit 1/,
	];
	for (const pattern of blocks) assert.match(buildScript, pattern);
});
