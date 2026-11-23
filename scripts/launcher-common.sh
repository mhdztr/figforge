#!/usr/bin/env bash
# Common launcher functions for Figma Desktop (AppImage, deb, and rpm).

# Setup logging directory and file
# Sets: log_dir, log_file
setup_logging() {
	log_dir="${XDG_CACHE_HOME:-$HOME/.cache}/figma-desktop-linux"
	mkdir -p "$log_dir" || return 1
	log_file="$log_dir/launcher.log"
}

# Log a message to the log file
# Usage: log_message "message"
log_message() {
	echo "$1" >> "$log_file"
}

# Detect display backend (Wayland vs X11)
# Sets: is_wayland, use_x11_on_wayland
detect_display_backend() {
	# Detect if Wayland is running
	is_wayland=false
	[[ -n ${WAYLAND_DISPLAY:-} ]] && is_wayland=true

	# Default: Use X11/XWayland on Wayland for compatibility
	# Use native Wayland if XWayland is unavailable, or when explicitly requested.
	use_x11_on_wayland=true
	if [[ ${FIGMA_USE_WAYLAND:-} == '1' || -z ${DISPLAY:-} ]]; then
		use_x11_on_wayland=false
	fi
	[[ ${FIGMA_USE_X11:-} == '1' ]] && use_x11_on_wayland=true
	return 0
}

# Check if we have a valid display (not running from TTY)
# Returns: 0 if display available, 1 if not
check_display() {
	[[ -n ${DISPLAY:-} || -n ${WAYLAND_DISPLAY:-} ]]
}

# Keep Electron's graphics defaults unless X11 is confirmed to lack GLX.
# The optional probe is bounded and never examines X11 when using native Wayland.
select_renderer() {
	local requested_renderer=${FIGMA_RENDERER:-auto}
	selected_renderer='hardware'
	case "$requested_renderer" in
		hardware) log_message 'Renderer: Electron defaults (hardware requested)' ;;
		software) selected_renderer='software'; log_message 'Renderer: SwiftShader (software requested)' ;;
		auto)
			local display_info
			if [[ ( $is_wayland != true || $use_x11_on_wayland == true ) && -n ${DISPLAY:-} ]] \
				&& command -v xdpyinfo > /dev/null 2>&1 && command -v timeout > /dev/null 2>&1 \
				&& display_info=$(LC_ALL=C timeout 3s xdpyinfo -display "$DISPLAY" -queryExtensions 2>/dev/null) \
				&& [[ $display_info == *'number of extensions:'* ]]; then
				if [[ ! $display_info =~ (^|[[:space:]])GLX([[:space:]]|$) ]]; then
					selected_renderer='software'
					log_message 'Renderer: SwiftShader (X11 display has no GLX)'
				else
					log_message 'Renderer: Electron defaults (X11 GLX available)'
				fi
			else
				log_message 'Renderer: Electron defaults (native Wayland or X11 probe unavailable)'
			fi
			;;
		*)
			echo "Invalid FIGMA_RENDERER: $requested_renderer (expected auto, hardware, or software)" >&2
			return 1
			;;
	esac
	if [[ $selected_renderer == 'software' ]]; then
		# SwiftShader as an OpenGL ES driver; keep WebGL enabled.
		electron_args+=('--use-gl=angle' '--use-angle=swiftshader')
	fi
}

# Build Electron arguments array based on display backend
# Requires: is_wayland, use_x11_on_wayland to be set
#           (call detect_display_backend first)
# Sets: electron_args array
# The optional package-type argument is accepted by all package launchers.
build_electron_args() {
	electron_args=()

	# Disable Chromium sandbox for all package types. Figma's
	# web_app_binding_renderer.js preload uses process.getSystemMemoryInfo()
	# and process.getHeapStatistics(), which Electron blocks inside a sandboxed
	# renderer. Without this flag, the preload fails to load and the desktop
	# bridge never initializes, so OAuth callbacks ("Unable to get profile
	# information from Google") and IPC silently break. AppImage already needed
	# this for FUSE; deb/rpm need it for the preload.
	electron_args+=('--no-sandbox')

	# Disable CustomTitlebar for better Linux integration
	electron_args+=('--disable-features=CustomTitlebar')

	select_renderer || return 1

	# X11 session - no backend override needed
	if [[ $is_wayland != true ]]; then
		log_message 'X11 session detected'
		return
	fi

	if [[ $use_x11_on_wayland == true ]]; then
		# Default: Use X11 via XWayland for compatibility
		log_message 'Using X11 backend via XWayland'
		electron_args+=('--ozone-platform=x11')
	else
		# Native Wayland mode (user opted in via FIGMA_USE_WAYLAND=1)
		log_message 'Using native Wayland backend'
		electron_args+=('--enable-features=UseOzonePlatform,WaylandWindowDecorations')
		electron_args+=('--ozone-platform=wayland')
		electron_args+=('--enable-wayland-ime')
		electron_args+=('--wayland-text-input-version=3')
	fi
}

# Set common environment variables
setup_electron_env() {
	export ELECTRON_FORCE_IS_PACKAGED=true
	export ELECTRON_USE_SYSTEM_TITLE_BAR=1
}

# Register figma-desktop as the per-user default handler for figma:// URLs.
# Idempotent (safe to call on every launch); non-fatal on failure.
# update-desktop-database alone is enough on some distros (Fedora), but
# Ubuntu/snap-sandboxed browsers need an explicit xdg-mime default.
register_url_scheme() {
	local desktop_id="${1:-figma-desktop.desktop}"
	command -v xdg-mime > /dev/null 2>&1 || return 0
	xdg-mime default "$desktop_id" x-scheme-handler/figma > /dev/null 2>&1 || true
}

# Create the AppImage desktop entry once, and only regenerate it when the
# AppImage itself moves. Users routinely add their own Exec flags (GPU features,
# touch gestures); overwriting those on every launch is a regression (upstream
# #32). A generated X-Figforge-AppImage marker distinguishes our file from a
# user-managed one, and custom Exec arguments are preserved when the path moves.
# Usage: integrate_appimage_desktop <appdir> <appimage_path>
integrate_appimage_desktop() {
	local appdir=$1 appimage_path=$2
	local desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
	local icon_dir="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
	local desktop_file="$desktop_dir/figma-desktop-appimage.desktop"
	local marker_prefix='X-Figforge-AppImage='
	local marker='' current_exec='' custom_args=' %u'
	local icon_changed=false desktop_changed=false legacy_generated=false
	local exec_re='^Exec="[^"]*"(.*)$'

	mkdir -p "$desktop_dir" "$icon_dir" 2>/dev/null || return 0

	local icon_src="$appdir/io.github.nickvdp.figma-desktop-linux.png"
	local icon_dest="$icon_dir/figma-desktop.png"
	if [[ -f $icon_src ]]; then
		if [[ ! -f $icon_dest ]] || ! cmp -s "$icon_src" "$icon_dest"; then
			cp "$icon_src" "$icon_dest" 2>/dev/null && icon_changed=true
		fi
	fi

	if [[ -f $desktop_file ]]; then
		marker=$(grep "^$marker_prefix" "$desktop_file" 2>/dev/null | head -1 || true)
		current_exec=$(grep '^Exec=' "$desktop_file" 2>/dev/null | head -1 || true)
		if [[ $current_exec =~ $exec_re ]]; then
			custom_args=${BASH_REMATCH[1]}
			[[ -n $custom_args ]] || custom_args=' %u'
		fi
		# Entries written by figforge before the marker existed carry this exact
		# signature. Migrate them once so an upgrade does not keep launching the
		# previous AppImage, while still preserving any custom Exec flags.
		if [[ -z $marker ]] \
			&& grep -qxF 'Comment=Figma Desktop for Linux (AppImage)' "$desktop_file" 2>/dev/null \
			&& grep -qxF 'StartupWMClass=Figma' "$desktop_file" 2>/dev/null; then
			legacy_generated=true
		fi
	fi

	if [[ ! -f $desktop_file ]]; then
		desktop_changed=true
	elif [[ $legacy_generated == true ]]; then
		desktop_changed=true
	elif [[ -n $marker && $marker != "$marker_prefix$appimage_path" ]]; then
		# Our file, but the AppImage was moved/renamed. Keep the user's flags.
		desktop_changed=true
	fi

	if [[ $desktop_changed == true ]]; then
		cat > "$desktop_file" << DESKTOP
[Desktop Entry]
Name=Figma
Exec="${appimage_path}"${custom_args}
Icon=figma-desktop
Type=Application
Terminal=false
Categories=Graphics;
Comment=Figma Desktop for Linux (AppImage)
MimeType=x-scheme-handler/figma;
StartupWMClass=Figma
$marker_prefix$appimage_path
DESKTOP
	fi

	if [[ $icon_changed == true || $desktop_changed == true ]]; then
		update-desktop-database "$desktop_dir" 2>/dev/null || true
		xdg-mime default figma-desktop-appimage.desktop x-scheme-handler/figma > /dev/null 2>&1 || true
		if declare -F log_message > /dev/null 2>&1; then
			log_message "Desktop integration updated: $desktop_file"
		fi
	fi
}
