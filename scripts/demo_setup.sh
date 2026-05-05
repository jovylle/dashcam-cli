#!/usr/bin/env bash
set -euo pipefail

# Demo: non-interactive setup + doctor run
# Creates a temporary config dir, writes a sample config and a fake client_secrets.json,
# then runs the doctor to show a passing config (where possible).

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
DEMO_TMP=$(mktemp -d)
CONFIG_DIR="$DEMO_TMP/eybu-config"
ENV_FILE="$CONFIG_DIR/config.env"
SECRETS_FILE="$CONFIG_DIR/client_secrets.json"

mkdir -p "$CONFIG_DIR"
# Copy example env if present
if [ -f "$ROOT_DIR/.env.example" ]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
else
  # minimal fallback
  cat > "$ENV_FILE" <<EOF
SOURCE=
YT_TITLE_PREFIX=
YT_DESCRIPTION=
YT_PRIVACY=private
GOOGLE_CLIENT_SECRETS=$SECRETS_FILE
GOOGLE_TOKEN_FILE=$CONFIG_DIR/token.json
EOF
fi

# Write a minimal fake client_secrets.json (desktop-type structure)
cat > "$SECRETS_FILE" <<JSON
{
  "installed": {
    "client_id": "000000000000-abcde.apps.googleusercontent.com",
    "project_id": "demo-project",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "DEMO-SECRET",
    "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob","http://localhost"]
  }
}
JSON

chmod 600 "$SECRETS_FILE" || true

export EYBU_ENV_FILE="$ENV_FILE"

echo "Running demo doctor with EYBU_ENV_FILE=$EYBU_ENV_FILE"
node "$ROOT_DIR/bin/dashcam-cli.js" doctor

echo "Demo completed. Temporary config directory: $CONFIG_DIR"
