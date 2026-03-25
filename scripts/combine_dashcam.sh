#!/usr/bin/env bash
set -euo pipefail

# Merges segment videos in DEST into one file under COMBINED_DIR.
# Deletes segment files only after ffmpeg exits 0, and only if
# DELETE_SEGMENTS_AFTER_COMBINE=1 in .env.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "Missing $REPO_ROOT/.env — copy from .env.example and set paths." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$REPO_ROOT/.env"
set +a

: "${DEST:?DEST is not set in .env}"

COMBINED_DIR="${COMBINED_DIR:-$HOME/Movies/SJCamMovies/Combined}"
DELETE_SEGMENTS_AFTER_COMBINE="${DELETE_SEGMENTS_AFTER_COMBINE:-0}"

if [[ ! -d "$DEST" ]]; then
  echo "DEST folder not found: $DEST" >&2
  exit 1
fi

files=()
while IFS= read -r f; do
  files+=("$f")
done < <(
  find "$DEST" -maxdepth 1 -type f \
    ! -name '._*' \
    ! -name '.*' \
    \( -iname '*.mp4' -o -iname '*.mov' \) \
  | sort -V
)

if [[ ${#files[@]} -lt 2 ]]; then
  echo "Need at least two segment videos in $DEST to combine (found ${#files[@]})."
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

list="$tmp/list.txt"
: >"$list"

i=0
for f in "${files[@]}"; do
  ext="${f##*.}"
  seg="$tmp/$(printf '%05d' "$i").$ext"
  ln -s "$f" "$seg"
  printf "file '%s'\n" "$seg" >>"$list"
  i=$((i + 1))
done

mkdir -p "$COMBINED_DIR"
out="$COMBINED_DIR/combined_$(date +%Y%m%d_%H%M%S).mp4"

echo "Combining ${#files[@]} segments → $out"
echo "(stream copy — no re-encode, disk I/O bound)"
echo ""

# Fastest path for identical dashcam clips: mux-only (stream copy). -c copy
# copies compressed packets; no decode → no encode → no “rendering”.
if ! ffmpeg -hide_banner -loglevel error -nostats -y \
  -xerror \
  -f concat -safe 0 -i "$list" \
  -map 0 \
  -c copy \
  -max_muxing_queue_size 9999 \
  "$out"; then
  echo "ffmpeg failed — segment files were not deleted." >&2
  rm -f "$out" 2>/dev/null || true
  exit 1
fi

echo ""
echo "Compilation succeeded."
echo "Final file: $out"

if [[ "$DELETE_SEGMENTS_AFTER_COMBINE" == "1" ]]; then
  for f in "${files[@]}"; do
    rm -f -- "$f"
  done
  echo "Removed ${#files[@]} segment file(s) from $DEST (DELETE_SEGMENTS_AFTER_COMBINE=1)."
else
  echo "Segment files left in place (set DELETE_SEGMENTS_AFTER_COMBINE=1 to remove only after success)."
fi
