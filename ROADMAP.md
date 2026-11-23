# figforge — Continuous Development Roadmap

| Field | Value |
| --- | --- |
| **Status** | Active — Phase 0 complete, Phase 1 ready to begin |
| **Owner** | `mhdztr` |
| **Created** | 2026-11-23 |
| **Last updated** | 2026-11-23 |
| **Source of truth** | This file for strategy; [`MAINTENANCE.md`](MAINTENANCE.md) for the per-version runbook |
| **Target client (current)** | Figma Desktop **126.12.7** (Electron **44.11.3**, Chromium **152.0.7977.169**) |
| **Hard deadline** | Before Figma's **15 December** support cutoff for the version in the wild |

---

## 1. Why this project exists

### 1.1 Upstream is archived

`IliyaBrook/figma-linux` was archived on **2026-11-07** with an explicit notice: no further releases, no bug fixes, no security updates, no support. Its last release was **126.10.10** (2026-10-16), built against Electron **43.7.11**. Users were invited to fork and self-maintain. `mhdztr/figma-linux` was that fork; it is now **figforge** (`mhdztr/figforge`), with `upstream` retained as a remote for provenance.

### 1.2 The "will no longer work on 15 Dec" banner — evidence-based diagnosis

This is the most important finding and it determines the entire strategy.

**Evidence gathered 2026-11-23:**

1. The full current Figma Windows package (`Figma-126.12.7-full.nupkg`) was downloaded, its `app.asar` unpacked (99/105 files; 6 unpacked/special), and every shipped text source was searched: `main.js`, `desktop_shell.js`, all `i18n/*.json`, `shell.html`, `build.json`, `package.json`. **The banner string is not present in the client binary.**
2. Figma's own Help Center — *Guide to the Figma desktop app* (article `5601429983767`, updated **2026-11-22**) states:
   > "We recommend keeping the desktop app updated to the latest available version. If you are not on the latest version, a message will display in the app prompting you to update… **Support for previous versions is removed six months after release.**"

**Conclusion:** the banner is a **server-side, client-version-gated notice**. Figma reads the version the app reports at handshake; once that version is ~6 months old, it warns and then refuses service. Therefore:

- ❌ **Wrong fix:** string-patching or hiding the banner in the Linux client. The server will still cut the connection off.
- ✅ **Right fix:** ship a client whose reported version is inside Figma's support window, and **keep doing so on every Figma release** (at minimum before each 6-month cutoff).

Maintenance is therefore a **continuous release train**, not a one-time port. That is what this roadmap formalizes.

### 1.3 Version authority — a real edge case already observed

On 2026-11-23 the two upstream version sources disagreed:

| Source | Version | Last-modified | Detail |
| --- | --- | --- | --- |
| `https://desktop.figma.com/win/RELEASES` | 126.11.11 | 2026-11-17T00:40:54Z | CloudFront-served, cached (`age ~29365s`, `max-age=86400`) |
| `https://desktop.figma.com/win/FigmaSetup.exe` | **126.12.7** | 2026-11-18T21:36:09Z | Embedded nupkg `Figma-126.12.7-full.nupkg`, 161,210,936 bytes |

The installer is newer and authoritative. `scripts/figma-version-common.sh` + `build.sh` already implement exactly the right policy: parse both, warn on mismatch, **select the installer version**. This behaviour must be preserved and covered by a regression test (Phase 3).

---

## 2. Product definition

### 2.1 What figforge is

A maintained fork of the archived figma-linux project. It downloads the official Figma Desktop Windows installer, extracts the real Electron application, patches Linux compatibility seams, bundles a version-matched Electron runtime, and produces **AppImage / .deb / .rpm** packages. It is not a browser wrapper and not a web app.

### 2.2 Goals

- **G1 — Currency.** Every released figforge build tracks the newest full Figma desktop version, with a maximum lag of one Figma release cycle.
- **G2 — Continuity.** No user is left stranded by a server-side support cutoff; a supported build exists before every 6-month boundary.
- **G3 — Fidelity.** The patched app behaves like the official desktop client: auth, preload/native bindings, tray, `figma://` protocol, MCP, local fonts, offline files.
- **G4 — Verifiability.** Every release is gated by automated tests plus a documented manual smoke matrix.
- **G5 — Provenance.** Upstream authorship and the original license terms are preserved; `mhdztr` is clearly credited as maintainer.

### 2.3 Non-goals

- Faking or spoofing version strings to defeat the server gate (would break preload/native compatibility and violate trust).
- Reimplementing Figma's renderer or editor.
- Official Figma support — Figma Desktop remains proprietary and governed by Figma's ToS.
- x86_64-only scope is unchanged; ARM64 is out of scope until upstream provides an ARM64 Windows package.

### 2.4 Operating principles

1. **Match Electron exactly.** Figma's preload and native bindings are compiled against its Electron major; a mismatch breaks auth. Detect from `Figma.exe`, never hard-code except as a last-resort fallback.
2. **Installer wins on version conflict** (see §1.3).
3. **No silent patch drift.** Every `sed`/wrapper patch must have a "sentinel" assertion that fails loudly when its target disappears in a new Figma build.
4. **Conventional commits everywhere** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:`).
5. **License is inherited, not replaced.**

---

## 3. Operating model — the continuous release train

### 3.1 Triggers

| Trigger | Detection | Action |
| --- | --- | --- |
| New full Figma version | `RELEASES` manifest or installer nupkg name changes (poll daily via CI cron) | Open a `release/x.y.z` branch, run the runbook |
| Support cutoff approaching | Version age ≥ 5 months | Emergency release even if no new Figma version |
| Upstream/ distro breakage | Issue report (Wayland, Mesa, packaging) | `fix/*` branch, patch, backport to latest release |
| Security-relevant Electron update | Electron advisory affecting bundled runtime | Rebuild against patched Electron **only if it still matches Figma's major**; otherwise wait for Figma |

### 3.2 Cadence

- **Daily (automated, Phase 3):** version watch; open/refresh a tracking issue when the version moves.
- **On every new full version:** build → test → release. Target ≤ 72 hours from Figma publication.
- **Monthly:** known-issue triage and dependency/toolchain refresh.
- **Quarterly:** review this roadmap, risk register, and success metrics.

### 3.3 Branch and tag model

```
master                     # stable, always equals the latest released build
release/126.12.7           # cut from master; only release-prep commits
fix/<short-topic>          # bugfixes, merged to master, cherry-picked to release
ci/<short-topic>           # automation work
docs/<short-topic>         # documentation
```

Tags: `v<figma-version>` (e.g. `v126.12.7`), optionally `v126.12.7-r1` for a rebuild. GitHub Releases carry generated notes + the test matrix summary.

### 3.4 Commit convention

| Type | Use |
| --- | --- |
| `feat:` | new user-visible capability or new automation |
| `fix:` | bug fix, including patch-sentinel repairs |
| `chore:` | maintenance, renames, dependency bumps, CI plumbing |
| `docs:` | documentation only |
| `test:` | tests only |
| `ci:` | workflow changes |
| `build:` | build script / packaging changes |
| `refactor:` | behaviour-preserving code change |

Breaking changes use `!` (e.g. `feat!: drop Electron 43 fallback`).

---

## 4. Phase 0 — Foundation and rebrand

**Status: COMPLETE (2026-11-23)**

| ID | Task | Verification | Status |
| --- | --- | --- | --- |
| 0.1 | Rename GitHub repo `mhdztr/figma-linux` → `mhdztr/figforge` | `gh repo view mhdztr/figforge` resolves | ✅ |
| 0.2 | Move working copy to `~/Projects/figforge`, repoint `origin`, add `upstream` remote | `git remote -v` | ✅ |
| 0.3 | Preserve original license notice and add explicit `mhdztr` maintainer credit | README §License + `ATTRIBUTION.md` | ✅ |
| 0.4 | Diagnose Dec 15 banner from primary sources | §1.2 above | ✅ |
| 0.5 | Identify newest client and verify Electron/patch targets against it | §1.3 + §5.2 below | ✅ |
| 0.6 | Write this roadmap + maintenance runbook into the repo | These files | ✅ |
| 0.7 | Finalize project name as `figforge` while keeping the app itself branded as Figma Desktop | README note + repo metadata | ✅ |

---

## 5. Phase 1 — Prove the build against Figma 126.12.7

**Status: COMPLETE with two environment caveats (2026-11-23).** See §5.7 for the full results. The build, Electron 44 verification, fail-loud sentinels, automated suite, and X11 + native-Wayland launch smoke all pass. `.deb`/`.rpm` builds and interactive login/canvas checks could not be completed on this host (no `dpkg-deb`/`rpmbuild`, no passwordless sudo; no Wayland screenshot portal). Those are carried into Phase 2, not waived.

### 5.1 Objectives

- Produce a working AppImage/.deb/.rpm from the newest Figma client.
- Confirm Electron 44.11.3 compatibility (the first major bump since the fork's last known-good build on 43.7.11).
- Turn every implicit assumption in `build.sh` into an explicit, failing-loud assertion.

### 5.2 Pre-flight facts already established

| Check | Result |
| --- | --- |
| Newest client | 126.12.7 (installer authoritative; manifest stale at 126.11.11) |
| Embedded Electron | `Electron/44.11.3` |
| Embedded Chromium | `Chrome/152.0.7977.169` |
| `app.asar` extraction with pinned `@electron/asar@4.2.0` | 99 extracted / 6 skipped — works |
| `package.json` version in asar | 126.12.7 |
| `frame:!1` in `main.js` | 6 occurrences |
| `titleBarStyle:"hidden"` in `main.js` | 1 |
| `process.platform==="win32"&&(this.windowsAppMenu=` in `main.js` | 1 |
| Electron auto-detect regex | Generic `Electron/[0-9]+\.[0-9]+\.[0-9]+` — picks up 44.11.3 |

### 5.3 Toolchain preconditions

- Node **≥ 22.12** (`build.sh` installs 22.23.1 locally if system Node is older).
- `@electron/asar` pinned to **4.2.0** — 4.2.1+ rejects Figma's header (`/.codesign` has size `-1000`).
- `7z` (p7zip-full), `shellcheck`, `rpm`, `imagemagick`, `appimagetool` 1.9.1 + Type-2 runtime `20251108` (fetched by `scripts/appimage-toolchain.sh`).
- Disk: budget ~4 GB for installer, nupkg, Electron dist, staging, and outputs.

### 5.4 Task breakdown

| ID | Task | Command / action | Expected result | Failure signal |
| --- | --- | --- | --- | --- |
| 1.1 | Clean scratch build | `./build.sh --build appimage --clean yes` from a scratch copy (never the working tree) | AppImage produced at `figma-desktop-126.12.7-x86_64.AppImage` | Any non-zero exit; capture full log |
| 1.2 | Verify version resolution | `./figma-version-tool.sh --json` | `selected_version: 126.12.7`, warning about manifest mismatch | Different version → investigate CDN/installer drift |
| 1.3 | Verify Electron selection | grep build log for `Detected Electron version from Figma.exe: 44.11.3` | Exactly 44.11.3 | Fallback `39.8.6` used → regex/format change |
| 1.4 | Asar extraction integrity | Build log line `Extracted: 99 files, Skipped: 6` | Matches pre-flight | Count drift → header format change |
| 1.5 | Patch sentinels | Add assertions for the three patterns in §5.2 before each `sed` | Build aborts if any count is 0 | Count 0 → patch engine must be updated |
| 1.6 | Run unit tests | `node --test scripts/tests/*.test.js scripts/font-enum/tests/*.test.js` | All pass (baseline 62) | Any failure |
| 1.7 | Lint | `shellcheck -x figma-version-tool.sh scripts/figma-version-common.sh scripts/launcher-common.sh` + `bash -n` on all shell scripts | Clean | Any warning |
| 1.8 | AppImage smoke | `bash scripts/tests/appimage-smoke.sh` | Mounts/runs without FUSE | Failure |
| 1.9 | Manual smoke (X11) | Launch AppImage, sign in, open a file, check tray, protocol handler, fonts, devtools | All features work | Blank view / auth failure / missing tray |
| 1.10 | Manual smoke (Wayland) | Repeat with native Wayland + XWayland; check tab bar and canvas | No blanking/transparency | Known issues #29/#34 reproduce |
| 1.11 | Packaging | `make build-deb`, `make build-rpm`; clean install + upgrade on Debian/Ubuntu and Fedora | Install, launch, uninstall clean | See backlog §8 |
| 1.12 | Document results | Append a `Phase 1 results` section to this file with pass/fail per task | Reproducible record | — |

### 5.5 Acceptance criteria (definition of done)

- [x] A build from 126.12.7 produces all three package formats — AppImage, deb and rpm; deb/rpm verified in Debian/Fedora containers (§5.7, §6.1).
- [x] Version resolution selects 126.12.7 despite the stale manifest.
- [x] Electron 44.11.3 is auto-detected and used.
- [x] All patch sentinels pass; no silent no-op patches.
- [x] Automated suite: 0 failures.
- [ ] Manual smoke: auth, canvas, tray, fonts, protocol, MCP all functional on X11 — **partial**: launch, native frames, non-blank render and process health verified; interactive sign-in/MCP/font checks need a human session.
- [x] Wayland status documented (§5.7): native Wayland launches cleanly; visual #29/#34 checks not captured.
- [x] Results appended to this roadmap and a `Release v126.12.7` issue opened — results in §5.7; tracker at [mhdztr/figforge#1](https://github.com/mhdztr/figforge/issues/1).

### 5.6 Risks / mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Electron 44 native ABI breaks font stub | Medium | High | Run font-enum integration tests; inspect `bindings.node` load path |
| Frame wrapper internal patches break on new Chromium | Medium | Medium | Verify native frames + tab drag manually; revert per-patch if needed |
| Wayland app-view blanking (#34) persists | High | Medium | Document; fall back to XWayland in launcher; track upstream |
| Mesa 26 canvas corruption (#23) | Low on Chromium 152 | High | Verify on Fedora 44; issue reported fixed by newer Chromium |
| Manifest/installer mismatch flips mid-release | Low | Medium | Installer-authoritative logic already handles it; assert in tests |
| 7z/asar header change | Low | High | Pinned asar 4.2.0; custom extractor with explicit skip counting |

### 5.7 Phase 1 results (2026-11-23)

Environment: `EndeavourOS` (Arch-based), Node v26.8.1, X11 `:0` + Hyprland Wayland `wayland-1`, Electron 44.11.3 / Chromium 152.0.7977.169.

| ID | Task | Result | Evidence |
| --- | --- | --- | --- |
| 1.1 | Clean scratch build | ✅ | `./build.sh --build appimage --clean yes` exit 0 → `figma-desktop-126.12.7-amd64.AppImage` (115 MB). SHA-256 `c4c9e4e37f514186fe26d4887b1790089344c79bd5d93cc8394e756bfbd22d91`. |
| 1.2 | Version resolution | ✅ | Log: `manifest_version: 126.11.11`, `installer_version: 126.12.7`, `selected_version: 126.12.7`, explicit stale-manifest warning. |
| 1.3 | Electron selection | ✅ | `Detected Electron version from Figma.exe: 44.11.3` (no fallback). |
| 1.4 | Asar extraction | ✅ | `Extracted: 99 files, Skipped: 6 (unpacked/special)` — matches pre-flight. |
| 1.5 | Patch sentinels | ✅ | Added fail-loud guards for all three §5.2 patterns plus `</head>`; `patch_app_asar` now propagates failure. Built `main.js` verified: `frame:true`×6, `titleBarStyle:"default"`×1, Linux app menu×1, zero stale patterns. Three previously silent no-ops fixed. |
| 1.6 | Unit tests | ✅ | 69 tests, 67 pass, 0 fail, 2 skipped (deb/rpm packaging tests need missing host tools). Includes 7 new `patch-sentinels` regression tests. |
| 1.7 | Lint | ✅ | `bash -n` on all shell scripts clean; `shellcheck -x` clean on `build.sh`, version tool, version common, launcher common. |
| 1.8 | AppImage smoke | ✅ | `scripts/tests/appimage-smoke.sh` passed. |
| 1.9 | X11 launch smoke | ✅ (partial) | Fresh isolated profile, real X11 window `Untitled - Figma` under WM control → native frames working. Screenshot: 943×506, 499 unique colours, stddev 0.25 → not blank. 4 renderer processes, zero stderr. Interactive sign-in, fonts, protocol handler and MCP not exercised (needs a human session). |
| 1.10 | Wayland launch smoke | ✅ (partial) | `FIGMA_USE_WAYLAND=1` → 5 processes with `--ozone-platform=wayland`, `_version=126.12.7`, Electron 44.11.3, 4 renderers, zero stderr. Visual checks for #29/#34 not captured: no working Wayland screenshot portal in this context. |
| 1.11 | Packaging | ⚠️ blocked | `./build.sh --build deb` → `dpkg-deb: command not found`; `--build rpm` → `rpmbuild: command not found`. Distro detection reports `unknown` for EndeavourOS and sudo is non-interactive, so auto-install cannot run. Must be verified on Debian/Ubuntu and Fedora hosts. |
| 1.12 | Document results | ✅ | This section. |

#### Defects found and fixed in Phase 1

1. **Bare quotes stripped by bash** — the tray-window and `document.querySelectorAll` regexes used bare `"` inside a double-quoted `node -e "..."` string. Bash removed them, so the patterns never matched. Escaped as `\"`; regex now matches and the patch applies.
2. **Tray right-click handler shape changed** — Figma 126.12.x uses `this.electronTray?.popUpContextMenu(...)` instead of the old `var V;(V=this.electronTray)==null||V...` null-check. Added a modern pattern alongside the legacy one; now injects `setContextMenu()` for AppIndicator.
3. **Native Linux argv handling added upstream** — Figma now slices argv and skips flags when `process.platform === "linux"`, making the old `handleCommandLineArgs` patch unnecessary and its regex stale. Detect and skip the upstream implementation; keep the legacy patch for older clients.
4. **Silent-failure class eliminated** — all three patching `node -e` blocks now `process.exit(1)` on no-match and are followed by `|| exit 1`; frame/title/menu/`</head>` sentinels are asserted before patching. A future Figma minifier change now fails the build loudly instead of shipping a broken client.

#### Carried into Phase 2

- Produce and install-test `.deb` on Debian/Ubuntu and `.rpm` on Fedora/RHEL.
- Interactive X11 session: sign-in, open file, tray context menu, fonts, `figma://`, MCP, logout.
- Wayland visual confirmation of tab bar (#29) and app-view blanking (#34).
- Open the `Release v126.12.7` issue and attach the SHA-256 above.

---

## 6. Phase 2 — Ship before the December cutoff

**Status: COMPLETE (2026-11-23).** Release [v126.12.7](https://github.com/mhdztr/figforge/releases/tag/v126.12.7) published with AppImage, deb, rpm and verified `SHA256SUMS`; tag points to `b33550d`. Only the 72-hour monitoring window remains open. See §6.1.

1. Freeze `release/126.12.7` from a Phase-1-passing commit.
2. Generate `CHANGELOG.md` entry with: Figma version, Electron version, test matrix, known issues.
3. Build all three artifacts from a clean checkout; verify SHA256SUMS.
4. Tag `v126.12.7`; publish GitHub Release with notes and checksums.
5. Update README "Download an Existing AppImage" links and the "current version" badge.
6. Announce in the repo Discussions/README banner: users on pre-June builds must upgrade before **15 Dec**.
7. Monitor issue tracker for 72 hours; be ready with `fix/*` + `v126.12.7-r1`.

**Rollback:** keep the previous release assets published; if a regression is confirmed, mark the new release as having known issues rather than deleting it, and publish `v<previous>-r1` with the fix.

### 6.1 Phase 2 progress (2026-11-23)

Release tracker: [mhdztr/figforge#1](https://github.com/mhdztr/figforge/issues/1). Issues were disabled on the archived fork and have been re-enabled for the maintained project.

| Step | Status | Evidence |
| --- | --- | --- |
| 1. Freeze `release/126.12.7` | ✅ | Branch created from Phase-1-passing commit `15e96c0` and pushed; docs commit `2f6a18c` on top. |
| 2. `CHANGELOG.md` | ✅ | Versions, defect fixes, test matrix, SHA-256 and known issues recorded. |
| 3. Build all artifacts from a clean checkout | ✅ | AppImage from Phase 1 clean build reused (only documentation changed since). deb built in `debian:bookworm-slim`, rpm in `fedora:41`, both from the release branch with the same local installer. Install/purge verified in fresh containers. |
| 4. Tag + GitHub Release with notes/checksums | ✅ | Tag `v126.12.7`; release notes from `CHANGELOG.md`; `SHA256SUMS` attached and verified. |
| 5. README links / version badge | ✅ | `Figma Desktop 126.12.7` badge, direct release link, changelog link. |
| 6. December-cutoff announcement | ✅ | README `IMPORTANT` banner: pre-June builds must upgrade before 15 Dec; notice is a real server-side version gate, not a UI string to hide. |
| 7. 72-hour monitor | 🔄 | Started after publish on 2026-11-23; tracker [#1](https://github.com/mhdztr/figforge/issues/1) and announcement [#2](https://github.com/mhdztr/figforge/discussions/2) are live. |

**Packaging strategy note:** the host is EndeavourOS with no passwordless sudo and no `dpkg-deb`/`rpmbuild`. Docker is available, so native packages are built inside Debian/Fedora containers using the same `build.sh` and the same local `FigmaSetup.exe` as the AppImage. This gives real dpkg/rpm toolchain verification without modifying the host.

---

## 7. Phase 3 — Automation and guardrails

**Status: IMPLEMENTED AND VERIFIED (2026-11-23).** All items below are in
`master`, and each workflow was dispatched once on GitHub:

| Workflow | Run | Result |
| --- | --- | --- |
| `version-watch` | [45182092810](https://github.com/mhdztr/figforge/actions/runs/45182092810) | Pass — `manifest 126.11.11`, `installer 126.12.7`, `tracked 126.12.7`, `drift false`; no duplicate issue opened |
| `release-matrix` | [45182235520](https://github.com/mhdztr/figforge/actions/runs/45182235520) | Pass — AppImage (52s), deb (1m16s), rpm (3m27s) built from one installer; all `SHA256SUMS` verified |
| `installer-update-tests` | [45182900634](https://github.com/mhdztr/figforge/actions/runs/45182900634) | Pass — 75 tests (73 pass / 0 fail / 2 skipped), shell syntax, shellcheck, version pin, AppImage smoke |

Only the first scheduled cron execution remains to be observed.

| ID | Work | Outcome | Implementation |
| --- | --- | --- | --- |
| 3.1 | Daily cron workflow polling `RELEASES` + installer nupkg; open/refresh a tracking issue on change | No version drift goes unnoticed | ✅ `.github/workflows/version-watch.yml`, `scripts/check-version-drift.sh`, `TRACKED_VERSION` |
| 3.2 | Patch-sentinel test file (`scripts/tests/patch-targets.test.js`) fed by a captured asar fixture | Pattern loss fails CI immediately | ✅ `scripts/tests/patch-targets.test.js`, `scripts/tests/fixtures/main-js-126.12.7.txt` — extracts the actual regex literals from `build.sh` so changing a pattern breaks the test |
| 3.3 | Manifest-vs-installer mismatch regression test using recorded fixtures | §1.3 behaviour is locked in | ✅ `scripts/tests/version-drift.test.js`, `scripts/tests/fixtures/RELEASES.stale`, `nupkg-name.txt` |
| 3.4 | Matrix build job (AppImage + deb + rpm) on release tags | Reproducible artifacts | ✅ `.github/workflows/release-matrix.yml` — one job per format from the same installer, version pin asserted |
| 3.5 | Test gate: unit + shellcheck + smoke must pass before Release publish | G4 enforced mechanically | ✅ extended `.github/workflows/installer-update-tests.yml` (new tests, `check-version-drift.sh` lint, `TRACKED_VERSION` pin check) + checksum gate in `release-matrix.yml` |
| 3.6 | Dependabot/toolchain tracking for Node, asar pin, appimagetool runtime | Toolchain drift visible | ✅ `.github/dependabot.yml` for Actions; `@electron/asar` is pinned in `build.sh` and covered by `patch-sentinels.test.js` |
| 3.7 | Issue templates for "new Figma version" and "regression on version X" | Faster triage | ✅ `.github/ISSUE_TEMPLATE/{new-version,regression,config}.yml` |

### 7.1 How to bump a version after the watcher fires

1. Run `./scripts/check-version-drift.sh` locally to confirm the installer version.
2. Follow `MAINTENANCE.md` §§2–9 for patch inspection, build and packaging.
3. Update `TRACKED_VERSION` in the same commit as the changelog.
4. Push a `v<version>` tag — `release-matrix.yml` rebuilds all three formats and
   fails if any artifact does not contain the tracked version or a checksum is wrong.
5. Publish the GitHub Release from the verified artifacts, then close the drift issue.

---

## 8. Phase 4 — Known-issue backlog

Priority: P0 blocks release, P1 blocks Wayland parity, P2 quality, P3 polish.

**Progress (2026-11-23):** B5 and B9 are fixed in [v126.12.7-r1](https://github.com/mhdztr/figforge/releases/tag/v126.12.7-r1);
r2 adds the missing upgrade migration for pre-marker desktop entries. B11
(NVIDIA PRIME offload) is confirmed at the GL level on this host — a bounded
Figma launch under `__NV_PRIME_RENDER_OFFLOAD=1` exposed a healthy GPU process,
but visual canvas output still needs a human check. B4's
modern tray shape was already patched in the base release and re-verified in
the r1 build. Release artifacts came from [matrix run 45186400778](https://github.com/mhdztr/figforge/actions/runs/45186400778);
the [test gate 45186385474](https://github.com/mhdztr/figforge/actions/runs/45186385474)
also passed. B1–B3, B6–B8, B10–B12 remain open; most need a human desktop
session or a specific GPU/display combination to confirm.

| ID | Issue | Source | Priority | Notes |
| --- | --- | --- | --- | --- |
| B1 | App view blanking on Electron 43 X11/XWayland/Wayland | #34 | P1 | Retest on Electron 44 before assuming fixed |
| B2 | Wayland tab bar black/transparent | #29 | P1 | Retest on 44.11.3 |
| B3 | Canvas corruption on Fedora 44 / Mesa 26 | #23 | P1 | Chromium 152 expected to fix; verify |
| B4 | Tray context menu broken on Figma 126.10+ | #35 | P1 | Patch target may have moved in main.js |
| B5 | Tray icon dark mode | #36 | P3 | ✅ Fixed in `v126.12.7-r1` — platform gate removed, stub already reads `nativeTheme` |
| B6 | Installed fonts supersede other fonts | #15 | P2 | Font-agent interaction |
| B7 | Drag-and-drop unsupported | #12 | P2 | Native binding gap |
| B8 | Pinch zoom unsupported | #11 | P2 | Native binding gap |
| B9 | `.desktop` overwritten every launch | #32 | P2 | ✅ Fixed in `v126.12.7-r1`, upgrade migration in r2 — marked generated file, custom `Exec` flags preserved |
| B10 | Eyedropper / font-preview endpoint 404 | README | P2 | Documented limitation |
| B11 | Direct NVIDIA hardware rendering unverified | release notes | P2 | PRIME offload verified at GL level (RTX 3050, driver 620.73.04); GPU process starts under Figma — visual canvas check still needed |
| B12 | Fresh browser sign-in / logout unverified | release notes | P1 | Auth is load-bearing |

---

## 9. The evergreen loop

Phase 1 is a procedure, not a one-off. For every new Figma version, execute [`MAINTENANCE.md`](MAINTENANCE.md) end-to-end. The loop is:

```
watch → detect → branch → build → assert sentinels → test → smoke → release → monitor → repeat
```

The only thing that changes between versions is the version number and whatever the sentinel checks reveal.

---

## 10. Risk register

| ID | Risk | Severity | Owner action |
| --- | --- | --- | --- |
| R1 | Figma tightens server-side checks beyond version string | High | Monitor auth behaviour each release; never spoof version |
| R2 | Figma ships MAC-randomized/entitled binary that won't run under stock Electron | High | Investigate signing/entitlement changes at pre-flight |
| R3 | Electron major bump breaks native modules with no Figma-matched alternative | High | Track Figma's Electron; escalate in issues if mismatched |
| R4 | CDN staleness causes wrong version to be built | Medium | Installer-authoritative policy + regression test |
| R5 | Maintainer bandwidth | Medium | Automation (Phase 3) reduces per-release manual work |
| R6 | Legal/trademark confusion with Figma, Inc. | Medium | Keep explicit "unofficial, proprietary software, ToS applies" notices |

---

## 11. Success metrics

| Metric | Target |
| --- | --- |
| Max lag from Figma release to figforge release | ≤ 72 hours |
| Automated test pass rate on release branches | 100% |
| Silent patch failures | 0 (sentinels enforce) |
| Users stranded by a version cutoff | 0 |
| Reproduced regressions with no tracking issue | 0 |

---

## 12. Decision log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-11-23 | Rename to figforge, keep `upstream` remote | Respect archival; credit maintainer; preserve provenance |
| 2026-11-23 | Do not patch out the Dec 15 banner | It is server-driven; patching would not restore service |
| 2026-11-23 | Trust installer version over `RELEASES` on mismatch | Installer was newer and embedded a newer full nupkg |
| 2026-11-23 | Pin `@electron/asar` 4.2.0 | Higher versions reject Figma's `-1000` header entries |
| 2026-11-23 | Fast-path execution (no agent pipeline) for Phase 0 | User-selected workflow |
| 2026-11-23 | Remove inherited Telegram/OpenClaw workflow | Upstream-only secrets and self-hosted runner are absent here; every issue/discussion event failed at startup |

---

## 13. Primary sources

- Figma Help Center, *Guide to the Figma desktop app* — https://help.figma.com/hc/en-us/articles/5601429983767 (article API: `/api/v2/help_center/articles/5601429983767.json`, updated 2026-11-22)
- Figma Windows release manifest — https://desktop.figma.com/win/RELEASES
- Figma Windows installer — https://desktop.figma.com/win/FigmaSetup.exe
- Upstream archived repo — https://github.com/IliyaBrook/figma-linux
- This repo — https://github.com/mhdztr/figforge
