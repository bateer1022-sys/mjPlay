#!/usr/bin/env bash
# 从 build/super-html 各渠道子目录挑选文件，复制到 zip-out 并按规则命名（源目录不改名、不删除）
# - 多个 .zip：只复制文件名最短的那个 -> <baseName>_<渠道名>.zip
# - 单个 .zip：-> <baseName>_<渠道名>.zip
# - 多个 .html：只复制文件名最短的那个 -> <baseName>_<渠道名>.html
# - 若同目录有与 .html 主文件名相同的 .zip，zip-out 里只输出 zip，不复制 html
# - superHtml.skipDirs 中的子目录不处理（如 common、gdt）
#
# 用法:
#   ./tools/package-super-html.sh
#   ./tools/package-super-html.sh --config config/playable.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_NAME="PA_MJ1220_btr"
SRC_DIR="${PROJECT_DIR}/build/super-html"
OUT_DIR="${SRC_DIR}/zip-out"
SKIP_DIRS="zip-out"
CONFIG_PATH="${PROJECT_DIR}/config/playable.json"

load_playable_config() {
  local config="$1"
  local lines=()
  [[ ! -f "$config" ]] && return 0
  if ! command -v node >/dev/null 2>&1; then
    echo "[package-super-html] 提示：未找到 node，跳过读取配置文件: ${config}" >&2
    return 0
  fi
  while IFS= read -r line; do
    lines+=("$line")
  done < <(node -e '
const fs = require("fs");
const file = process.argv[1];
try {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const superHtml = (parsed && parsed.superHtml) || {};
  const baseName = parsed && parsed.baseName;
  const skipDirs = Array.isArray(superHtml.skipDirs) ? superHtml.skipDirs : ["zip-out"];
  const skip = skipDirs.map((s) => String(s).trim()).filter(Boolean);
  if (typeof baseName === "string" && baseName.trim()) {
    console.log("baseName\t" + baseName.trim());
  }
  if (skip.length > 0) {
    console.log("skipDirs\t" + skip.join(","));
  }
  if (typeof superHtml.srcDir === "string" && superHtml.srcDir.trim()) {
    console.log("srcDir\t" + superHtml.srcDir.trim());
  }
  if (typeof superHtml.outDir === "string" && superHtml.outDir.trim()) {
    console.log("outDir\t" + superHtml.outDir.trim());
  }
} catch (_) {}
' "$config" 2>/dev/null || true)

  for line in "${lines[@]}"; do
    case "$line" in
      baseName$'\t'*)
        BASE_NAME="${line#baseName$'\t'}"
        ;;
      skipDirs$'\t'*)
        SKIP_DIRS="${line#skipDirs$'\t'}"
        ;;
      srcDir$'\t'*)
        SRC_DIR="${PROJECT_DIR}/${line#srcDir$'\t'}"
        ;;
      outDir$'\t'*)
        OUT_DIR="${PROJECT_DIR}/${line#outDir$'\t'}"
        ;;
    esac
  done
}

load_playable_config "$CONFIG_PATH"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_NAME="${2:?missing value for --base}"
      shift 2
      ;;
    --config)
      CONFIG_PATH="${2:?missing value for --config}"
      if [[ "$CONFIG_PATH" != /* ]]; then
        CONFIG_PATH="${PROJECT_DIR}/${CONFIG_PATH}"
      fi
      load_playable_config "$CONFIG_PATH"
      shift 2
      ;;
    --src)
      SRC_DIR="${PROJECT_DIR}/${2:?missing value for --src}"
      shift 2
      ;;
    --out)
      OUT_DIR="${2:?missing value for --out}"
      if [[ "$OUT_DIR" != /* ]]; then
        OUT_DIR="${PROJECT_DIR}/${OUT_DIR}"
      fi
      shift 2
      ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "[package-super-html] 未知参数: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$SRC_DIR" ]]; then
  echo "[package-super-html] 源目录不存在: $SRC_DIR" >&2
  exit 1
fi

should_skip_dir() {
  local name="$1"
  [[ ",${SKIP_DIRS}," == *,"${name}",* ]]
}

pick_shortest_path() {
  local shortest="$1"
  local shortest_len="${#shortest}"
  local f
  shift
  for f in "$@"; do
    if [[ ${#f} -lt $shortest_len ]]; then
      shortest="$f"
      shortest_len=${#f}
    fi
  done
  echo "$shortest"
}

copy_as_to_out() {
  local src="$1"
  local channel="$2"
  local dest_name="$3"
  local dest="${OUT_DIR}/${dest_name}"

  mkdir -p "$OUT_DIR"
  if [[ -e "$dest" ]]; then
    echo "[package-super-html] 跳过（zip-out 已存在）: ${dest_name}" >&2
    return 0
  fi
  cp "$src" "$dest"
  echo "[package-super-html] ${channel}: $(basename "$src") -> zip-out/${dest_name}"
}

copy_shortest_to_out() {
  local channel="$1"
  local dest_name="$2"
  shift 2
  local files=("$@")
  local count="${#files[@]}"
  local src_path

  [[ "$count" -eq 0 ]] && return 1
  if [[ "$count" -eq 1 ]]; then
    src_path="${files[0]}"
  else
    src_path="$(pick_shortest_path "${files[@]}")"
    echo "[package-super-html] ${channel}: ${count} 个文件，只复制最短名 $(basename "$src_path")" >&2
  fi
  copy_as_to_out "$src_path" "$channel" "$dest_name"
}

filter_html_without_matching_zip() {
  local dir="${1%/}"
  local channel="$2"
  local zips=()
  local htmls=()
  local kept=()
  local z h zstem hstem match

  while IFS= read -r line; do
    zips+=("$line")
  done < <(find "$dir" -maxdepth 1 -type f -name 'NewProject_*.zip' | LC_ALL=C sort)

  while IFS= read -r line; do
    htmls+=("$line")
  done < <(find "$dir" -maxdepth 1 -type f -name 'NewProject_*.html' | LC_ALL=C sort)

  [[ "${#htmls[@]}" -eq 0 ]] && return 0

  for h in "${htmls[@]}"; do
    hstem="$(basename "$h" .html)"
    match=0
    if [[ "${#zips[@]}" -gt 0 ]]; then
      for z in "${zips[@]}"; do
        zstem="$(basename "$z" .zip)"
        if [[ "$hstem" == "$zstem" ]]; then
          match=1
          break
        fi
      done
    fi
    if [[ "$match" -eq 1 ]]; then
      echo "[package-super-html] ${channel}: 同名仅保留 zip，跳过 html $(basename "$h")" >&2
    else
      kept+=("$h")
    fi
  done

  if [[ "${#kept[@]}" -gt 0 ]]; then
    printf '%s\n' "${kept[@]}"
  fi
}

dedupe_out_pair() {
  local out_name="$1"
  local zip_path="${OUT_DIR}/${out_name}.zip"
  local html_path="${OUT_DIR}/${out_name}.html"

  if [[ -f "$zip_path" && -f "$html_path" ]]; then
    echo "[package-super-html] zip-out 同名仅保留 zip，删除 ${out_name}.html" >&2
    rm -f "$html_path"
  fi
}

prepare_out_dir() {
  mkdir -p "$OUT_DIR"
  rm -f "${OUT_DIR}/${BASE_NAME}"_*.zip "${OUT_DIR}/${BASE_NAME}"_*.html 2>/dev/null || true
}

process_dir() {
  local dir="${1%/}"
  local channel
  channel="$(basename "$dir")"
  local did=0
  local out_name="${BASE_NAME}_${channel}"

  local zips=()
  while IFS= read -r line; do
    zips+=("$line")
  done < <(find "$dir" -maxdepth 1 -type f -name 'NewProject_*.zip' | LC_ALL=C sort)

  local html_files=()
  while IFS= read -r line; do
    html_files+=("$line")
  done < <(filter_html_without_matching_zip "$dir" "$channel")

  if [[ "${#zips[@]}" -gt 0 ]]; then
    copy_shortest_to_out "$channel" "${out_name}.zip" "${zips[@]}"
    did=1
  fi

  if [[ "${#html_files[@]}" -gt 0 ]]; then
    copy_shortest_to_out "$channel" "${out_name}.html" "${html_files[@]}"
    did=1
  fi

  dedupe_out_pair "$out_name"

  [[ "$did" -eq 1 ]]
}

prepare_out_dir

total=0
shopt -s nullglob
for subdir in "${SRC_DIR}"/*/; do
  name="$(basename "$subdir")"
  if should_skip_dir "$name"; then
    echo "[package-super-html] 跳过目录: ${name}" >&2
    continue
  fi
  if process_dir "$subdir"; then
    total=$((total + 1))
  fi
done
shopt -u nullglob

if [[ "$total" -eq 0 ]]; then
  echo "[package-super-html] 未处理任何渠道目录（无 NewProject_* 文件）: $SRC_DIR" >&2
  exit 1
fi

echo "[package-super-html] 完成，共处理 ${total} 个渠道目录，源目录未改动，输出: ${OUT_DIR}"
