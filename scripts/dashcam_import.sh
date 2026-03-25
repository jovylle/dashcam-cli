#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "Missing $REPO_ROOT/.env — copy from .env.example and set SOURCE and DEST." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$REPO_ROOT/.env"
set +a

: "${SOURCE:?SOURCE is not set in .env}"
: "${DEST:?DEST is not set in .env}"

if [[ ! -d "$SOURCE" ]]; then
  echo "Source folder not found: $SOURCE" >&2
  echo "Check that the card is mounted and SOURCE matches the path." >&2
  exit 1
fi

mkdir -p "$DEST"

echo "Importing from: $SOURCE"
echo "           to: $DEST"
echo ""

# Copy-only: never remove files from SOURCE here. Optional removal of imported
# segments after a successful merge is handled by combine_dashcam.sh only.
rsync -av --progress \
  --exclude='._*' \
  --size-only \
  --ignore-existing \
  "$SOURCE/" "$DEST/"

echo ""
echo "Import finished."
