#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="${APP_NAME:-Home Ops Finance Deploy}"
APP_DIR="${APP_DIR:-${HOME}/Applications}"
APP_PATH="${APP_DIR}/${APP_NAME}.app"
CONTENTS_DIR="${APP_PATH}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
UI_RUNNER_PATH="${SCRIPT_DIR}/deploy-synology-ui.swift"
ICON_SOURCE="${ICON_SOURCE:-${SCRIPT_DIR}/assets/home-ops-finance-deploy.icns}"
ICON_SVG_SOURCE="${ICON_SVG_SOURCE:-${SCRIPT_DIR}/assets/home-ops-finance-deploy-icon.svg}"
EXECUTABLE_NAME="${EXECUTABLE_NAME:-home-ops-finance-deploy}"
UI_BINARY_NAME="${UI_BINARY_NAME:-home-ops-finance-deploy-ui}"
SWIFTC_BIN="${SWIFTC_BIN:-$(xcrun --find swiftc)}"
MACOS_SDK_PATH="${MACOS_SDK_PATH:-$(xcrun --show-sdk-path --sdk macosx 2>/dev/null || true)}"
MACOS_TARGET="${MACOS_TARGET:-arm64-apple-macos12.0}"

build_icon_from_svg() {
  local svg_source="$1"
  local iconset_dir
  local preview_dir
  local preview_file

  [[ -f "${svg_source}" ]] || return 1
  command -v qlmanage >/dev/null 2>&1 || return 1
  command -v sips >/dev/null 2>&1 || return 1
  command -v iconutil >/dev/null 2>&1 || return 1

  iconset_dir="$(mktemp -d "${TMPDIR:-/tmp}/home-ops-iconset.XXXXXX")"
  preview_dir="$(mktemp -d "${TMPDIR:-/tmp}/home-ops-preview.XXXXXX")"

  qlmanage -t -s 1024 -o "${preview_dir}" "${svg_source}" >/dev/null 2>&1 || {
    rm -rf "${iconset_dir}" "${preview_dir}"
    return 1
  }

  preview_file="$(find "${preview_dir}" -maxdepth 1 -type f -name '*.png' | head -n 1)"
  [[ -f "${preview_file}" ]] || {
    rm -rf "${iconset_dir}" "${preview_dir}"
    return 1
  }

  cp "${preview_file}" "${iconset_dir}/icon_512x512@2x.png"
  sips -z 16 16 "${preview_file}" --out "${iconset_dir}/icon_16x16.png" >/dev/null
  sips -z 32 32 "${preview_file}" --out "${iconset_dir}/icon_16x16@2x.png" >/dev/null
  sips -z 32 32 "${preview_file}" --out "${iconset_dir}/icon_32x32.png" >/dev/null
  sips -z 64 64 "${preview_file}" --out "${iconset_dir}/icon_32x32@2x.png" >/dev/null
  sips -z 128 128 "${preview_file}" --out "${iconset_dir}/icon_128x128.png" >/dev/null
  sips -z 256 256 "${preview_file}" --out "${iconset_dir}/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "${preview_file}" --out "${iconset_dir}/icon_256x256.png" >/dev/null
  sips -z 512 512 "${preview_file}" --out "${iconset_dir}/icon_256x256@2x.png" >/dev/null
  sips -z 512 512 "${preview_file}" --out "${iconset_dir}/icon_512x512.png" >/dev/null

  iconutil -c icns "${iconset_dir}" -o "${ICON_SOURCE}" >/dev/null 2>&1 || {
    rm -rf "${iconset_dir}" "${preview_dir}"
    return 1
  }

  rm -rf "${iconset_dir}" "${preview_dir}"
  return 0
}

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

if [[ -n "${SWIFTC_BIN}" && -f "${UI_RUNNER_PATH}" ]]; then
  SWIFTC_ARGS=(-O -o "${RESOURCES_DIR}/${UI_BINARY_NAME}")
  if [[ -n "${MACOS_SDK_PATH}" ]]; then
    SWIFTC_ARGS+=(-sdk "${MACOS_SDK_PATH}")
  fi
  if [[ -n "${MACOS_TARGET}" ]]; then
    SWIFTC_ARGS+=(-target "${MACOS_TARGET}")
  fi
  SWIFTC_ARGS+=("${UI_RUNNER_PATH}")
  "${SWIFTC_BIN}" "${SWIFTC_ARGS[@]}"
  cat >"${MACOS_DIR}/${EXECUTABLE_NAME}" <<SH
#!/bin/zsh
export HOME_OPS_FINANCE_ROOT="${SCRIPT_DIR}/.."
exec "${RESOURCES_DIR}/${UI_BINARY_NAME}" "${SCRIPT_DIR}/.."
SH
  chmod +x "${MACOS_DIR}/${EXECUTABLE_NAME}"
else
  cat >"${MACOS_DIR}/${EXECUTABLE_NAME}" <<SH
#!/bin/zsh
/usr/bin/osascript <<OSA
display dialog "Der native Deploy-Launcher konnte nicht gebaut werden." buttons {"OK"} default button "OK" with title "Home Ops Finance Deploy"
OSA
SH
  chmod +x "${MACOS_DIR}/${EXECUTABLE_NAME}"
fi

if [[ ! -f "${ICON_SOURCE}" ]]; then
  build_icon_from_svg "${ICON_SVG_SOURCE}" || true
fi

if [[ -f "${ICON_SOURCE}" ]]; then
  cp "${ICON_SOURCE}" "${RESOURCES_DIR}/applet.icns"
fi

touch "${APP_PATH}"
echo "Created ${APP_PATH}"
