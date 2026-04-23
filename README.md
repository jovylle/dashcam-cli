# easy-youtube-batch-uploader
<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/03479dc8-3313-4f49-9221-919ffd57e465" />

Simple CLI for batch-uploading many `.mp4`/`.mov` files to YouTube with OAuth.

- installs from npm
- guided terminal setup (`setup`)
- safe upload staging with `_READY` / `_DONE` file tags
- optional channel lock and playlist auto-add

## Install

```bash
npm install -g easy-youtube-batch-uploader
```

Commands:
- full command: `easy-youtube-batch-uploader`
- short alias: `eybu`

## 3-Minute Quick Start

```bash
eybu setup
eybu doctor
eybu upload
```

What to do:
1. `setup`: answer prompts (video folder + YouTube config)
2. `doctor`: verify local setup
3. `upload`: first run opens browser OAuth login, then uploads in batch

## Platform Support

- macOS / Linux: supported
- Windows: use WSL2 (recommended) or Git Bash
- Native Windows `cmd` / PowerShell: not officially supported in this release

## OAuth Notes

- No API key is required for upload flow.
- First upload opens browser login and consent screen.
- Token is cached locally and reused on next uploads.
- If token is revoked/expired, CLI asks to re-authenticate.

## Commands

```bash
eybu init
eybu setup
eybu doctor
eybu upload
```

- `init`: non-interactive config initialize/update
- `setup`: interactive setup wizard
- `doctor`: environment and config checks
- `upload`: batch upload all supported videos from `SOURCE`

## Config File

- Default path: `~/.config/easy-youtube-batch-uploader/config.env`
- Override path: `EYBU_ENV_FILE=/your/path/config.env`

Main values:
- `SOURCE`: folder containing videos to upload
- `YT_TITLE_PREFIX`: title prefix
- `YT_DESCRIPTION`: default description
- `YT_CATEGORY_ID`: YouTube category id (default `2`)
- `YT_PRIVACY`: `private`, `unlisted`, or `public`
- `READY_TAG` / `DONE_TAG`: upload state tags in filename
- `GOOGLE_CLIENT_SECRETS`: OAuth client JSON path
- `GOOGLE_TOKEN_FILE`: OAuth token cache path
- `YT_TARGET_CHANNEL_ID` (optional): enforce specific channel id
- `YT_PLAYLIST_ID` (optional): auto-add uploaded videos to playlist

## Safety Behavior

- validates auth and (optionally) target channel before renaming files
- renames file to `*_READY` before upload
- renames to `*_DONE` only after successful upload
- leaves failed uploads as `*_READY` for easy retry

## Troubleshooting

- `EOTP` on publish: run npm publish with OTP (`--otp=<code>`)
- OAuth issues: delete token file and run upload again
- Wrong account/channel: set `YT_TARGET_CHANNEL_ID` as safety lock
- `SOURCE` not found: update path in config or mount drive first

## Sample Screenshots

<img width="842" height="741" alt="sample screenshot 1" src="https://github.com/user-attachments/assets/d9f439bf-9771-4058-a902-d65d30165e89" />
<img width="293" height="689" alt="sample screenshot 2" src="https://github.com/user-attachments/assets/bc00fbef-a999-451c-bd86-715a9bacdc19" />
