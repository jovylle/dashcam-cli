# easy-youtube-batch-uploader
<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/03479dc8-3313-4f49-9221-919ffd57e465" />

Simple CLI for batch-uploading many `.mp4`/`.mov` files to YouTube with OAuth.

- installs from npm
- guided terminal setup (`setup`)
- safe upload staging with `_READY` / `_DONE` file tags
- optional channel lock and playlist auto-add

## Install

### Option 1: No global install (recommended)

```bash
npx easy-youtube-batch-uploader@latest start
npx easy-youtube-batch-uploader@latest upload
```

`npx` downloads/caches the package on first use, then runs it.

### Option 2: Global install (best for frequent use)

```bash
npm install -g easy-youtube-batch-uploader
easy-youtube-batch-uploader start
easy-youtube-batch-uploader upload
```

Commands:
- full command: `easy-youtube-batch-uploader`
- short alias (global install): `eybu`

## 3-Minute Quick Start

```bash
npx easy-youtube-batch-uploader@latest start
npx easy-youtube-batch-uploader@latest setup
npx easy-youtube-batch-uploader@latest setup-advanced
npx easy-youtube-batch-uploader@latest doctor
npx easy-youtube-batch-uploader@latest upload
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
 
Windows notes (npx)
- Use `npx` to run the beta without installing globally: `npx easy-youtube-batch-uploader@beta start`.
- The CLI expects a POSIX `bash` shell and `node` on PATH. On Windows, prefer:
	- WSL2 (recommended) or
	- Git Bash (from Git for Windows) with Node.js installed, or
	- Run inside a Linux VM/container.

If logs or prompts seem missing when using `npx` on Windows, capture full output to a file and inspect it:

Git Bash / WSL:
```bash
npx easy-youtube-batch-uploader@beta upload 2>&1 | tee eybu-upload.log
```

PowerShell:
```powershell
npx easy-youtube-batch-uploader@beta upload 2>&1 | Tee-Object -FilePath eybu-upload.log
```

## Google API setup

Before running the setup wizard, create your OAuth credentials:

1. Go to the Google Developers Console:  
   https://console.developers.google.com  
2. Create or select a project.  
3. In **APIs & Services** → **Library**, enable **YouTube Data API v3**.  
4. In **APIs & Services** → **Credentials**, click **Create credentials** → **OAuth client ID**.  
   - Application type: **Desktop application**  
5. Download the JSON file and note its path.  
6. When you run `easy-youtube-batch-uploader setup`, enter that JSON file path for **GOOGLE_CLIENT_SECRETS**.

## OAuth Notes

- No API key is required for upload flow.
- First upload opens browser login and consent screen.
- Token is cached locally and reused on next uploads.
- If token is revoked/expired, CLI asks to re-authenticate.
 
OAuth fallback behavior
- The uploader will try to open a local browser for the OAuth consent screen. If the environment cannot open a browser (headless, remote shell, WSL without GUI), the uploader falls back to a console flow and prints a URL and code in the terminal. Copy that URL into any browser, sign in, paste the code back into the terminal when prompted, and authentication will complete.

If you see "Google OAuth client secrets JSON not found" during `upload`, confirm `GOOGLE_CLIENT_SECRETS` in your config points at the desktop OAuth JSON you downloaded and that the path is expanded (supports `~` and Windows-style backslashes). Use `easy-youtube-batch-uploader doctor` or `npx easy-youtube-batch-uploader@beta doctor` to validate paths.

### Interactive setup improvements

The `setup` wizard now guides users through installing `client_secrets.json`:

- It prints a direct link to the Google Cloud Console credentials page:
	https://console.cloud.google.com/apis/credentials
- You can choose to open that page from the wizard.
- If you already downloaded the Desktop OAuth JSON, the wizard can copy it into the config dir for you.
- If you prefer, the wizard accepts pasted JSON directly in the terminal; finish paste by typing a line containing only `EOF` and pressing Enter.

Example: paste flow

1. Run: `easy-youtube-batch-uploader setup`
2. When asked `Would you like to paste the contents of client_secrets.json now?` answer `y`.
3. Paste the exact JSON content, then on a new line type `EOF` and Enter.

The wizard will save the file to the canonical config directory and update `GOOGLE_CLIENT_SECRETS` in your config.

## Commands

```bash
npx easy-youtube-batch-uploader@latest help

# If globally installed, short alias is available:
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
- OAuth opens URL but auth fails: regenerate Desktop OAuth credentials and rerun `easy-youtube-batch-uploader setup-advanced`

## Sample Screenshots

<img width="842" height="741" alt="sample screenshot 1" src="https://github.com/user-attachments/assets/d9f439bf-9771-4058-a902-d65d30165e89" />
<img width="293" height="689" alt="sample screenshot 2" src="https://github.com/user-attachments/assets/bc00fbef-a999-451c-bd86-715a9bacdc19" />
