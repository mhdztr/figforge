# Attribution and license continuity

figforge is a continuation of **Figma Desktop for Linux** by **IliyaBrook**, originally published at <https://github.com/IliyaBrook/figma-linux>. That repository was archived on 2026-11-07 and is no longer maintained by its original author.

## Maintainer

- **Maintained since 2026-11-23 by `mhdztr`** (<https://github.com/mhdztr>).
- Repository: <https://github.com/mhdztr/figforge>.

## License continuity

The original project's license notice is reproduced verbatim below and remains in force. Renaming the project does not change or replace these terms.

> This project provides build tooling only. Figma Desktop is proprietary software owned by Figma, Inc. By using this project you agree to [Figma's Terms of Service](https://www.figma.com/tos/).

No third-party license is relicensed, removed, or weakened by this fork. Figma Desktop itself is not redistributed as open source; the build scripts download and patch the official Windows installer at build time.

## Upstream contributions

Credit for the original build system, Linux compatibility patches, font enumeration work, launcher logic, and packaging scripts belongs to IliyaBrook and the original contributors. Their commit history is preserved intact in this repository; use `git log upstream/master` (remote `upstream` points at the archived repository) to inspect it.

Changes made under the figforge name are recorded as conventional commits and can be distinguished with:

```bash
git log --oneline --author=mhdztr
```
