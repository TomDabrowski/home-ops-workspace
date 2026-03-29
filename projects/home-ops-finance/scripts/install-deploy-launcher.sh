#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="${APP_NAME:-Home Ops Finance Deploy}"
APP_DIR="${APP_DIR:-${HOME}/Applications}"
APP_PATH="${APP_DIR}/${APP_NAME}.app"
CONTENTS_DIR="${APP_PATH}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
RUNNER_PATH="${SCRIPT_DIR}/deploy-synology-macos.sh"
ICON_SOURCE="${ICON_SOURCE:-${HOME}/Applications/Home Ops Finance.app/Contents/Resources/applet.icns}"
EXECUTABLE_NAME="${EXECUTABLE_NAME:-home-ops-finance-deploy}"

mkdir -p "${APP_DIR}"
rm -rf "${APP_PATH}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"

cat >"${CONTENTS_DIR}/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>${EXECUTABLE_NAME}</string>
  <key>CFBundleIconFile</key>
  <string>applet</string>
  <key>CFBundleIdentifier</key>
  <string>com.tomdabrowski.homeopsfinancedeploy</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
PLIST

cat >"${MACOS_DIR}/${EXECUTABLE_NAME}" <<SH
#!/bin/zsh
/usr/bin/osascript <<OSA
tell application "Terminal"
  activate
  do script quoted form of POSIX path of "${RUNNER_PATH}"
end tell
OSA
SH
chmod +x "${MACOS_DIR}/${EXECUTABLE_NAME}"

if [[ -f "${ICON_SOURCE}" ]]; then
  cp "${ICON_SOURCE}" "${RESOURCES_DIR}/applet.icns"
fi

touch "${APP_PATH}"
echo "Created ${APP_PATH}"
