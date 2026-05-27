#!/usr/bin/env bash
# 在 build/super-html 各渠道子目录内重命名（同目录 mv，不删除、不打包）
# - 多个 .zip：只把文件名最短的那个 -> PA_MJ1218_btr_<渠道名>.zip，其余不动
# - 单个 .zip：-> PA_MJ1218_btr_<渠道名>.zip
# - 多个 .html：只改文件名最短的那个 -> PA_MJ1218_btr_<渠道名>.html
# - 单个 .html：-> PA_MJ1218_btr_<渠道名>.html
#   （<渠道名> 为 build/super-html 下该文件所在子目录名）
# - 重命名成功的文件会复制一份到 build/super-html/zip-out/
#
# 用法:
#   ./tools/package-super-html.sh
#   ./tools/package-super-html.sh --base PA_MJ1218_btr
#   ./tools/package-super-html.sh --out build/super-html/zip-out

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_NAME="PA_MJ1220_btr"
SRC_DIR="${PROJECT_DIR}/build/super-html"
OUT_DIR="${SRC_DIR}/zip-out"
SKIP_DIRS="zip-out"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_NAME="${2:?missing value for --base}"
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
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
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

rename_file() {
  local src="$1"
  local dest="$2"
  if [[ "$src" == "$dest" ]]; then
    return 0
  fi
  if [[ -e "$dest" ]]; then
    echo "[package-super-html] 跳过（目标已存在）: $(basename "$dest")" >&2
    return 0
  fi
  mv "$src" "$dest"
}

copy_to_out() {
  local src="$1"
  local name
  name="$(basename "$src")"
  mkdir -p "$OUT_DIR"
  cp "$src" "${OUT_DIR}/${name}"
  echo "[package-super-html] 复制: ${name} -> ${OUT_DIR}/"
}

# 从路径列表里选出「完整路径字符串最短」的一项（同目录下即文件名最短）
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

# 多个文件时只改最短名；单个则直接改
rename_shortest_or_only() {
  local dir="${1%/}"
  local channel="$2"
  local pattern="$3"
  local dest_name="$4"

  local files=()
  while IFS= read -r line; do
    files+=("$line")
  done < <(find "$dir" -maxdepth 1 -type f -name "$pattern" | LC_ALL=C sort)

  local count="${#files[@]}"
  [[ "$count" -eq 0 ]] && return 1

  local src_path
  if [[ "$count" -eq 1 ]]; then
    src_path="${files[0]}"
  else
    src_path="$(pick_shortest_path "${files[@]}")"
  fi

  local dest="${dir}/${dest_name}"
  rename_file "$src_path" "$dest"
  if [[ -f "$dest" && ( "$src_path" == "$dest" || ! -e "$src_path" ) ]]; then
    copy_to_out "$dest"
  fi
  if [[ "$count" -gt 1 ]]; then
    echo "[package-super-html] ${channel}: $(basename "$src_path") -> ${dest_name}（${count} 个文件中只改最短名，其余未动）"
  else
    echo "[package-super-html] ${channel}: $(basename "$src_path") -> ${dest_name}"
  fi
  return 0
}

rename_dir() {
  local dir="${1%/}"
  local channel
  channel="$(basename "$dir")"
  local did=0

  local out_name="${BASE_NAME}_${channel}"

  if rename_shortest_or_only "$dir" "$channel" 'NewProject_*.zip' "${out_name}.zip"; then
    did=1
  fi
  if rename_shortest_or_only "$dir" "$channel" 'NewProject_*.html' "${out_name}.html"; then
    did=1
  fi

  [[ "$did" -eq 1 ]]
}

total=0
shopt -s nullglob
for subdir in "${SRC_DIR}"/*/; do
  name="$(basename "$subdir")"
  if should_skip_dir "$name"; then
    continue
  fi
  if rename_dir "$subdir"; then
    total=$((total + 1))
  fi
done
shopt -u nullglob

if [[ "$total" -eq 0 ]]; then
  echo "[package-super-html] 未处理任何渠道目录（无 NewProject_* 文件）: $SRC_DIR" >&2
  exit 1
fi

echo "[package-super-html] 完成，共处理 ${total} 个渠道目录，输出目录: ${OUT_DIR}"
