#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing config file: $ENV_FILE" >&2
  echo "Run: easy-youtube-batch-uploader init" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

: "${SOURCE:?SOURCE is not set in .env}"

DONE_TAG="${DONE_TAG:-DONE}"
READY_TAG="${READY_TAG:-READY}"
YT_TITLE_PREFIX="${YT_TITLE_PREFIX:-Dashcam}"
YT_DESCRIPTION="${YT_DESCRIPTION:-Uploaded by dashcam-cli}"
YT_CATEGORY_ID="${YT_CATEGORY_ID:-2}"
YT_PRIVACY="${YT_PRIVACY:-unlisted}"
GOOGLE_CLIENT_SECRETS="${GOOGLE_CLIENT_SECRETS:-$HOME/.config/youtube/client_secrets.json}"
GOOGLE_TOKEN_FILE="${GOOGLE_TOKEN_FILE:-$HOME/.config/youtube/token.json}"
YT_TARGET_CHANNEL_ID="${YT_TARGET_CHANNEL_ID:-}"
YT_PLAYLIST_ID="${YT_PLAYLIST_ID:-}"

format_title_from_stem() {
  local stem="$1"
  local clean="$stem"
  clean="${clean%_$READY_TAG}"
  clean="${clean%_$DONE_TAG}"

  # Dashcam names often start with YYYYMMDDHHMMSS_...
  if [[ "$clean" =~ ^([0-9]{14})(_.+)?$ ]]; then
    local ts="${BASH_REMATCH[1]}"
    local suffix="${BASH_REMATCH[2]}"
    # Short date: YY-MM-DD HH:MM
    local yy="${ts:2:2}"
    local mm="${ts:4:2}"
    local dd="${ts:6:2}"
    local HH="${ts:8:2}"
    local MIN="${ts:10:2}"
    local pretty="${yy}-${mm}-${dd} ${HH}:${MIN}"
    suffix="${suffix#_}"
    if [[ -n "$suffix" ]]; then
      echo "${YT_TITLE_PREFIX} ${pretty} - ${suffix}"
    else
      echo "${YT_TITLE_PREFIX} ${pretty}"
    fi
    return
  fi

  echo "${YT_TITLE_PREFIX} ${clean}"
}

if [[ ! -d "$SOURCE" ]]; then
  echo "Source folder not found: $SOURCE" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found." >&2
  exit 1
fi

if [[ ! -f "$GOOGLE_CLIENT_SECRETS" ]]; then
  echo "Google OAuth client secrets JSON not found: $GOOGLE_CLIENT_SECRETS" >&2
  echo "Set GOOGLE_CLIENT_SECRETS in .env after downloading Desktop OAuth JSON." >&2
  exit 1
fi

echo "Validating Google auth and target channel..."
check_args=(
  --check-channel-only
  --category-id "$YT_CATEGORY_ID"
  --privacy "$YT_PRIVACY"
  --client-secrets "$GOOGLE_CLIENT_SECRETS"
  --token-file "$GOOGLE_TOKEN_FILE"
  --target-channel-id "$YT_TARGET_CHANNEL_ID"
)
if [[ -n "$YT_PLAYLIST_ID" ]]; then
  check_args+=(--playlist-id "$YT_PLAYLIST_ID")
fi
if ! python3 "$SCRIPT_DIR/youtube_api_upload.py" "${check_args[@]}"; then
  echo "Auth/channel pre-check failed. No files were renamed." >&2
  echo "If scopes changed, delete token and retry: rm -f \"$GOOGLE_TOKEN_FILE\"" >&2
  exit 1
fi

uploaded=0
skipped=0
failed=0

while IFS= read -r file; do
  base="$(basename "$file")"
  dir="$(dirname "$file")"
  ext="${base##*.}"
  stem="${base%.*}"

  case "$stem" in
    *"_$DONE_TAG")
      echo "Skip done: $base"
      skipped=$((skipped + 1))
      continue
      ;;
  esac

  working_path="$file"
  working_base="$base"
  working_stem="$stem"

  case "$stem" in
    *"_$READY_TAG")
      echo "Already staged: $base"
      ;;
    *)
      staged_stem="${stem}_$READY_TAG"
      staged_base="${staged_stem}.${ext}"
      staged_path="${dir}/${staged_base}"

      if [[ -e "$staged_path" ]]; then
        staged_stem="${staged_stem}_$(date +%Y%m%d_%H%M%S)"
        staged_base="${staged_stem}.${ext}"
        staged_path="${dir}/${staged_base}"
      fi

      echo "Rename for upload: $base -> $staged_base"
      mv "$file" "$staged_path"
      working_path="$staged_path"
      working_base="$staged_base"
      working_stem="$staged_stem"
      ;;
  esac

  title="$(format_title_from_stem "$working_stem")"
  echo "Uploading: $working_base"

  upload_args=(
    --file "$working_path"
    --title "$title"
    --description "$YT_DESCRIPTION"
    --category-id "$YT_CATEGORY_ID"
    --privacy "$YT_PRIVACY"
    --client-secrets "$GOOGLE_CLIENT_SECRETS"
    --token-file "$GOOGLE_TOKEN_FILE"
    --target-channel-id "$YT_TARGET_CHANNEL_ID"
  )
  if [[ -n "$YT_PLAYLIST_ID" ]]; then
    upload_args+=(--playlist-id "$YT_PLAYLIST_ID")
  fi
  if python3 "$SCRIPT_DIR/youtube_api_upload.py" "${upload_args[@]}"; then
    done_stem="${working_stem%_$READY_TAG}_$DONE_TAG"
    done_base="${done_stem}.${ext}"
    done_path="${dir}/${done_base}"

    if [[ -e "$done_path" ]]; then
      done_stem="${done_stem}_$(date +%Y%m%d_%H%M%S)"
      done_base="${done_stem}.${ext}"
      done_path="${dir}/${done_base}"
    fi

    mv "$working_path" "$done_path"
    echo "Uploaded and marked done: $done_base"
    uploaded=$((uploaded + 1))
  else
    echo "Upload failed: $working_base"
    echo "File left as READY for retry."
    failed=$((failed + 1))
  fi
done < <(
  find "$SOURCE" -maxdepth 1 -type f \
    ! -name '._*' \
    ! -name '.*' \
    \( -iname '*.mp4' -o -iname '*.mov' \) \
  | sort
)

echo ""
echo "Upload summary: uploaded=$uploaded skipped_done=$skipped failed=$failed"
if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
