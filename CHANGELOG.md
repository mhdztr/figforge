# Changelog

All notable changes to **figforge** are documented here. Each entry tracks one Figma Desktop client release; the app itself remains Figma Desktop, with Figma's name, icon and interface unchanged.

## [126.12.7] — 2026-11-23

First tracked release of the maintained fork. The `RELEASES` manifest still advertised `126.11.11`, so the build used the installer-embedded NuGet package as the version authority (see [MAINTENANCE.md](MAINTENANCE.md)).

### Client versions

| Component | Version |
| --- | --- |
| Figma Desktop | `126.12.7` |
| Electron | `44.11.3` (auto-detected from `Figma.exe`) |
| Chromium | `152.0.7977.169` |
| `@electron/asar` (build pin) | `4.2.0` |

### Added

- Continuous-development documentation: [ROADMAP.md](ROADMAP.md), [MAINTENANCE.md](MAINTENANCE.md), [ATTRIBUTION.md](ATTRIBUTION.md).
- Fail-loud patch sentinels for the native-frame, title-bar, Linux menu and `shell.html` injection targets.
- `scripts/tests/patch-sentinels.test.js` — 7 regression tests that guard the guards.
- Linux argv handling is now detected upstream; the legacy patch is skipped automatically when Figma ships native support.
- Tray context-menu patch now accepts both the legacy null-check and the modern `this.electronTray?.popUpContextMenu(...)` shape.

### Fixed

- Bare `"` characters inside bash `node -e "..."` blocks were stripped by the shell, so the tray-window and selector regexes never matched. Embedded quotes are now escaped.
- The tray-window, argv and tray-context patch blocks warned and continued on no-match. They now call `process.exit(1)` and the build propagates failure with `|| exit 1`.
- `patch_app_asar` failure now aborts the build instead of producing a silently broken client.

### Test matrix

| Check | Result |
| --- | --- |
| Clean AppImage build (`--clean yes`) | Pass — `figma-desktop-126.12.7-amd64.AppImage`, 115 MB |
| AppImage SHA-256 | `c4c9e4e37f514186fe26d4887b1790089344c79bd5d93cc8394e756bfbd22d91` |
| deb SHA-256 | `f2fb4afbcea69d040e66bf28b9e6799d75542f0f0412ae789b557b3f8a2e4dfe` |
| rpm SHA-256 | `4fcc87a6a52316ac0c5f018427023d650bfe1312e82e51324dff72eab6a3b27e` |
| Automated suite | 69 tests: 67 pass, 0 fail, 2 skipped (deb/rpm packaging tools absent on this host) |
| `bash -n` on all shell scripts | Pass |
| `shellcheck -x` on build/version/launcher scripts | Pass |
| AppImage runtime smoke | Pass |
| X11 launch | Pass (partial) — native-framed `Untitled - Figma` window, non-blank render, 4 renderers, empty stderr |
| Native Wayland launch | Pass (partial) — `--ozone-platform=wayland`, 4 renderers, empty stderr |
| `.deb` build + install/purge | Pass — built in `debian:bookworm-slim`, installed and purged in a fresh container |
| `.rpm` build + install/remove | Pass — built in `fedora:41`, installed and removed in a fresh container |
| `SHA256SUMS` | Verified — all three artifacts `OK` |

### Known issues

- Interactive sign-in/logout, fonts, `figma://`, MCP, tray menu and drag-and-drop need a human session; not covered by automated checks.
- Wayland visual regressions #29 (tab bar) and #34 (app-view blanking) were not visually confirmed — no working screenshot portal in the test context.
- Issue #23 (canvas corruption on Fedora 44 / Mesa 26) expected to be resolved by Chromium 152, not yet verified.
- Users on builds older than June 2026 should upgrade before Figma's **15 December** support cutoff. This release tracks the current client; the December notice shown by older builds is a real server-side version gate, so it is deliberately not hidden by a UI patch.

[126.12.7]: https://github.com/mhdztr/figforge/releases/tag/v126.12.7
