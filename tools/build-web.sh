#!/usr/bin/env bash
# Cocos Creator 2.4 命令行构建 web-mobile
# https://docs.cocos.com/creator/2.4/manual/zh/publish/publish-in-command-line.html
#
# 用法:
#   ./tools/build-web.sh
#   COCOS_CREATOR=/path/to/CocosCreator ./tools/build-web.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$(uname -s)" == "Darwin" ]]; then
  CREATOR="${COCOS_CREATOR:-/Applications/Cocos/Creator/2.4.12/CocosCreator.app/Contents/MacOS/CocosCreator}"
else
  CREATOR="${COCOS_CREATOR:-}"
fi

if [[ -z "${CREATOR}" || ! -x "${CREATOR}" ]]; then
  echo "error: 请设置环境变量 COCOS_CREATOR 为 Cocos Creator 可执行文件路径" >&2
  exit 1
fi

echo "[build-web] project: ${PROJECT_DIR}"
echo "[build-web] creator: ${CREATOR}"

"${CREATOR}" --path "${PROJECT_DIR}" --build "platform=web-mobile;debug=false"

echo "[build-web] done -> ${PROJECT_DIR}/build/web-mobile"
