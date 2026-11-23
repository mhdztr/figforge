#!/usr/bin/env bash
# Compare the newest Figma client against the version tracked by this repo.
# Prints one JSON object on stdout; diagnostics go to stderr.
#
# Fixture overrides for tests:
#   FIGMA_MANIFEST_FIXTURE   path to a recorded RELEASES manifest
#   FIGMA_INSTALLER_FIXTURE  path to a recorded installer archive
#   TRACKED_VERSION_FILE     path to the tracked version file
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/figma-version-common.sh
source "$script_dir/figma-version-common.sh"

releases_url=${FIGMA_RELEASES_URL:-https://desktop.figma.com/win/RELEASES}
exe_url=${FIGMA_EXE_URL:-https://desktop.figma.com/win/FigmaSetup.exe}
tracked_file=${TRACKED_VERSION_FILE:-$script_dir/../TRACKED_VERSION}
manifest_fixture=${FIGMA_MANIFEST_FIXTURE:-}
installer_fixture=${FIGMA_INSTALLER_FIXTURE:-}

temp_dir=''
trap '[[ -z $temp_dir ]] || rm -rf -- "$temp_dir"' EXIT

tracked=''
if [[ -f $tracked_file ]]; then
	tracked=$(<"$tracked_file")
	tracked=${tracked//[$'\r\n']/}
fi

manifest_version=''
if [[ -n $manifest_fixture ]]; then
	manifest_version=$(figma_fetch_manifest_version "file://$(realpath -- "$manifest_fixture")")
elif manifest_version=$(figma_fetch_manifest_version "$releases_url"); then
	:
else
	echo 'Warning: RELEASES unavailable or invalid; installer remains authoritative.' >&2
fi

installer_path=$installer_fixture
if [[ -z $installer_path ]]; then
	temp_dir=$(mktemp -d)
	installer_path="$temp_dir/FigmaSetup.exe"
	figma_download_installer "$exe_url" "$installer_path"
fi

nupkg_name=$(figma_installer_nupkg "$installer_path")
installer_version=$(figma_version_from_nupkg "$nupkg_name")
selected_version=$installer_version

drift=false
if [[ -z $tracked ]]; then
	echo 'Warning: no tracked version found; treating installer version as a drift.' >&2
	drift=true
elif [[ $selected_version != "$tracked" ]]; then
	drift=true
fi

if [[ -n $manifest_version && $manifest_version != "$installer_version" ]]; then
	echo "Note: RELEASES ($manifest_version) lags installer ($installer_version)." >&2
fi

printf '{"manifest_version":"%s","installer_version":"%s","selected_version":"%s","tracked_version":"%s","drift":%s}\n' \
	"$manifest_version" "$installer_version" "$selected_version" "$tracked" "$drift"
