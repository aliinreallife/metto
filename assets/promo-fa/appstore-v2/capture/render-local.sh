#!/usr/bin/env bash
# Local render fallback for WSL where Docker mode, the chrome-headless-shell download
# and the system ffmpeg wrapper don't work.
# Needs a native ffmpeg/ffprobe in /tmp/ffbin (e.g. from @ffmpeg-installer/ffmpeg)
# and a system Chromium.
set -euo pipefail
export PATH="/tmp/ffbin:$PATH"
export HYPERFRAMES_BROWSER_PATH="${HYPERFRAMES_BROWSER_PATH:-/usr/bin/chromium-browser}"
cd "$(dirname "$0")/../composition"
npx -y hyperframes@latest render -f 30 -q standard -o ../brag.mp4 "$@"
