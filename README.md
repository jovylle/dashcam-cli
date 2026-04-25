# easy-youtube-batch-uploader
<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/03479dc8-3313-4f49-9221-919ffd57e465" />

Simple CLI for batch-uploading many `.mp4`/`.mov` files to YouTube with OAuth.

- installs from npm
- guided terminal setup (`setup`)
- safe upload staging with `_READY` / `_DONE` file tags
- optional channel lock and playlist auto-add

## Install

### Option 1: Global install (best for frequent use)

```bash
npm install -g easy-youtube-batch-uploader
easy-youtube-batch-uploader start
easy-youtube-batch-uploader upload
```

### Option 2: No global install (via npx)

```bash
npx easy-youtube-batch-uploader
```

Commands:
- full command: `easy-youtube-batch-uploader`
- short alias (global install): `eybu`

## 3-Minute Quick Start

```bash
eybu start
eybu setup
eybu setup-advanced
eybu doctor
eybu upload
```

What to do:
1. `start`: quick start flow (auto-bootstrap, asks missing core setup values, runs doctor, optional upload)
2. `setup`: core setup wizard (manual edit/update)
3. `setup-advanced`: advanced values (video defaults/tags + OAuth/channel/playlist)
4. `upload`: first run opens browser OAuth login, then uploads in batch

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
eybu start
eybu setup
eybu setup-advanced
eybu doctor
eybu upload
```

- `start`: one-command quick start (default when no command is passed)
- `setup`: interactive quick setup wizard (core values)
- `setup-advanced`: interactive wizard for advanced values (video defaults/tags, OAuth paths, channel lock, playlist)
- `doctor`: environment and config checks
- `upload`: batch upload all supported videos from `SOURCE`

## Config File

- Default path: `~/.config/easy-youtube-batch-uploader/config.env`
- Override path: `EYBU_ENV_FILE=/your/path/config.env`

Use `setup` for core values and `setup-advanced` for advanced values. You can re-run either command anytime to update values.

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
