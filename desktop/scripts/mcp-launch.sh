#!/bin/sh
set -eu
ftc_desktop_app="${FTC_DESKTOP_APP:-$HOME/Applications/FTC Simulator Desktop.app}"
exec /usr/sbin/taskpolicy -a "$ftc_desktop_app/Contents/Resources/bin/bun" "$ftc_desktop_app/Contents/Resources/desktop/mcp.js"
