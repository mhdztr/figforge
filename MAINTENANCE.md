# fig-forge — Per-Version Maintenance Runbook

> This is the **evergreen procedure**. Execute it top-to-bottom for every new Figma Desktop version. Strategy and phase context live in [`ROADMAP.md`](ROADMAP.md).

---

## 0. Before you start

- Work from a clean `master`: `git switch master && git pull --ff-only`.
- Confirm you are on the newest client (§1). Never build from a remembered version number.
- Budget ~4 GB disk and a stable connection (~160 MB installer + ~160 MB nupkg + Electron dist).
- Keep a scratch build location outside the repo (e.g. `/tmp/opencode/fig-forge-build-<version>`).

---

## 1. Watch — detect the current version

```bash
./figma-version-tool.sh --json
# Example observed 2026-11-23:
# Warning: RELEASES (126.11.11) and installer (126.12.7) differ; selecting installer version.
# {"manifest_version":"126.11.11","installer_version":"126.12.7","selected_version":"126.12.7"}
```

**Rule:** `installer_version` is authoritative. A mismatch with `manifest_version` is expected when CloudFront hasn't refreshed; log it, do not "fix" it.

Cross-check manually when in doubt:

```bash
curl -sSL https://desktop.figma.com/win/RELEASES
curl -sSIL https://desktop.figma.com/win/FigmaSetup.exe | grep -i last-modified
```

If `selected_version` already matches the latest release tag (`git tag --sort=-v:refname | head -1`), there is nothing to do — close the tracking issue with a "no new version" note.

---

## 2. Branch

```bash
git switch master
git pull --ff-only
git switch -c release/<version>      # e.g. release/126.12.7
```

---

## 3. Pre-flight inspection (before building)

Download and unpack the nupkg in a scratch dir, then record:

| Item | Command | Expected / action |
| --- | --- | --- |
| Electron version | `strings lib/net45/Figma.exe \| grep -oE 'Electron/[0-9]+\.[0-9]+\.[0-9]+' \| head -1` | e.g. `Electron/44.11.3`; build will auto-detect |
| Chromium version | `strings lib/net45/Figma.exe \| grep -oE 'Chrome/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \| head -1` | Record for issue triage (Mesa/Wayland bugs are Chromium-specific) |
| asar version | `grep -m1 '"version"' app.asar.contents/package.json` | Must equal selected version |
| extraction count | Build log `Extracted: N files, Skipped: M` | Baseline 99 / 6; investigate drift |

---

## 4. Patch sentinel table — CHECK THESE EVERY VERSION

These are the literal strings the build's `sed` patches operate on. If any count is `0`, the patch is a silent no-op and **must** be repaired before releasing.

| File | Pattern | Baseline count (126.12.7) | Purpose |
| --- | --- | --- | --- |
| `main.js` | `frame:!1` | 6 | Force native window frames |
| `main.js` | `frame:!0` | 0 | Alternative minified false (informational) |
| `main.js` | `frame:false` | 0 | Alternative literal false (informational) |
| `main.js` | `titleBarStyle:"hidden"` | 1 | Restore default title bar |
| `main.js` | `process.platform==="win32"&&(this.windowsAppMenu=` | 1 | Enable app menu on Linux |
| `desktop_shell.js` | `frame:!1` / `frame:!0` / `frame:false` | 0 / 0 / 0 | Same as above if present |
| `shell.html` | `</head>` | 1 | Injection point for CSS patch |

Quick check:

```bash
cd <staging>/app.asar.contents
for p in 'frame:!1' 'frame:!0' 'frame:false' 'titleBarStyle:"hidden"' \
         'process.platform==="win32"&&(this.windowsAppMenu='; do
  printf '%-55s ' "$p"; grep -oF "$p" main.js | wc -l
done
```

Also re-read `scripts/frame-fix-wrapper.js` and `scripts/figma-native-stub.js` against any Chromium major bump; internal Electron APIs there can change without the literal patterns moving.

---

## 5. Build

```bash
# In a scratch copy of the repo
./build.sh --build appimage --clean yes 2>&1 | tee build-<version>.log

# Also produce the other formats
make build-deb
make build-rpm
```

Assert from the log:

- `Detected Electron version from Figma.exe: <expected>` — never the fallback `39.8.6`.
- `Extracted: 99 files, Skipped: 6` (or explained drift).
- `selected_version: <expected>`.
- Patch steps report success, not just "Patched …" unconditionally.

If `npm install electron@<version>` fails (prerelease/mirror issue), set `FIGMA_ELECTRON_VERSION` explicitly **only** to the detected version and record why.

---

## 6. Automated verification

```bash
# Unit tests (baseline: 62 passing)
node --test scripts/tests/*.test.js scripts/font-enum/tests/*.test.js

# Shell syntax
for s in build.sh figma-version-tool.sh scripts/*.sh scripts/tests/*.sh; do bash -n "$s"; done

# ShellCheck on the critical scripts
shellcheck -x figma-version-tool.sh scripts/figma-version-common.sh scripts/launcher-common.sh

# AppImage smoke (no FUSE)
bash scripts/tests/appimage-smoke.sh
```

CI equivalent: `.github/workflows/installer-update-tests.yml` and `font-enum-tests.yml`.

---

## 7. Manual smoke matrix

Run the produced AppImage on a real desktop. Record ✅/❌/N-A per row in the release issue.

| # | Check | X11 | Wayland native | Wayland XWayland |
| --- | --- | --- | --- | --- |
| 1 | Launch to login screen | | | |
| 2 | Sign in (fresh browser flow) | | | |
| 3 | Open a file; canvas renders | | | |
| 4 | Canvas on Fedora 44 / Mesa 26 (issue #23) | | | |
| 5 | Native window frames + resize | | | |
| 6 | Tab bar visible/opaque (issue #29) | | | |
| 7 | App view does not blank (issue #34) | | | |
| 8 | Tray icon + context menu (issues #35/#36) | | | |
| 9 | Local fonts enumerated correctly (issue #15) | | | |
| 10 | `figma://` protocol handler | | | |
| 11 | Offline file open | | | |
| 12 | MCP server starts | | | |
| 13 | DevTools shortcuts | | | |
| 14 | Logout and re-login | | | |
| 15 | Drag-and-drop / pinch zoom (issues #12/#11) | | | |
| 16 | Direct NVIDIA hardware rendering | | | |

Known-failing rows are acceptable **only** if already tracked in the backlog (ROADMAP §8) and noted in release notes. Anything new gets an issue before release.

---

## 8. Package verification

```bash
# Debian/Ubuntu
sudo apt install ./figma-desktop_<version>_amd64.deb
figma-desktop --version 2>/dev/null || true   # launch once
sudo apt remove figma-desktop

# Fedora/RHEL
sudo dnf install ./figma-desktop-<version>.x86_64.rpm
figma-desktop
sudo dnf remove figma-desktop

# Checksums
sha256sum figma-desktop-* > SHA256SUMS
```

Also verify the `.desktop` file is not rewritten on every launch (issue #32).

---

## 9. Release

```bash
git add -A
git commit -m "chore: release v<version> (Figma <version>, Electron <electron>)"
git tag -a v<version> -m "fig-forge v<version>"
git push origin master --follow-tags
gh release create v<version> figma-desktop-* SHA256SUMS \
  --title "fig-forge v<version>" \
  --notes-file RELEASE_NOTES_<version>.md
```

Release notes template:

```markdown
## What's in this release
- Figma Desktop: <version>
- Electron: <electron> (Chromium <chromium>)

## Fixed since <previous>
- ...

## Test matrix
- Unit tests: <N>/<N> passed
- ShellCheck: clean
- AppImage smoke: passed
- Manual smoke: see release issue #<n>

## Known issues
- ... (link to backlog IDs)

## Upgrade note
Users on Figma versions older than six months should upgrade before their
server-side support cutoff. This build reports version <version>.
```

---

## 10. Monitor and roll back

- Watch the tracker for 72 hours; pin a "release <version>" discussion.
- On confirmed regression:
  1. Open a `fix/*` branch, patch, run §6 + relevant §7 rows.
  2. Commit as `fix: <description>`.
  3. Publish `v<version>-r1` rather than deleting the original; mark the original with a known-issue note.
- Never silently replace release assets.

---

## 11. Failure signatures and first response

| Symptom | Likely cause | First response |
| --- | --- | --- |
| `selected_version` is old | CDN cached installer | Re-run; if persistent, download installer directly and use `--exe` |
| `Could not detect Electron version` | Binary string format changed | Inspect `strings Figma.exe`; extend regex; set `FIGMA_ELECTRON_VERSION` temporarily |
| `Extracted: 0 files` / asar error | Header format change / asar version drift | Confirm pin 4.2.0; diff `getRawHeader` output |
| Patch count `0` | Minifier changed the literal | Add new sentinel + patch; keep old as no-op-safe |
| Auth fails at login | Electron/Figma major mismatch | Verify detected Electron equals embedded; do not proceed with fallback |
| Canvas shredded | Chromium/Mesa combo | Compare with issue #23; try XWayland; record |

---

## 12. Quick reference

| Thing | Value / command |
| --- | --- |
| Repo | `mhdztr/fig-forge` |
| Upstream | `IliyaBrook/figma-linux` (archived) |
| Version tool | `./figma-version-tool.sh --json` |
| Build | `./build.sh --build appimage --clean yes` |
| Tests | `node --test scripts/tests/*.test.js scripts/font-enum/tests/*.test.js` |
| Smoke | `bash scripts/tests/appimage-smoke.sh` |
| asar pin | `@electron/asar@4.2.0` (do not bump blindly) |
| Version authority | installer nupkg, not `RELEASES` |
| Commit style | `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`, `build:`, `refactor:` |
