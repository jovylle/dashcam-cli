# dashcam-cli
<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/03479dc8-3313-4f49-9221-919ffd57e465" />

Simple scripts to automate a dashcam workflow:
- import clips from SD card
- combine segment clips into one output file
- upload clips to YouTube with safe channel checks and file tagging

## Requirements

- macOS or Linux
- `bash`, `rsync`, `ffmpeg`, `python3`
- Google Cloud OAuth desktop client JSON (for YouTube upload)

## Setup

1. Create your local config:

```bash
cp .env.example .env
```

2. Update `.env` paths and YouTube values.
3. Make scripts executable (if needed):

```bash
chmod +x scripts/*.sh
```

## Environment Variables

Copy from `.env.example` and adjust:

- `SOURCE`: folder to read videos from (usually SD card mount path)
- `DEST`: local import directory for raw clips
- `COMBINED_DIR`: output directory for merged videos
- `DELETE_SEGMENTS_AFTER_COMBINE`: set `1` only if you want source segments removed after successful combine
- `YT_TITLE_PREFIX`: prefix for generated video titles
- `YT_DESCRIPTION`: default YouTube description
- `YT_CATEGORY_ID`: YouTube category (default `2`)
- `YT_PRIVACY`: `private`, `unlisted`, or `public`
- `READY_TAG` / `DONE_TAG`: filename tags used by upload flow
- `GOOGLE_CLIENT_SECRETS`: path to OAuth client JSON
- `GOOGLE_TOKEN_FILE`: token cache path
- `YT_TARGET_CHANNEL_ID` (optional but recommended): safety lock to enforce target channel
- `YT_PLAYLIST_ID` (optional): auto-add uploads to a playlist

## Usage

### 1) Import from SD card

```bash
./scripts/dashcam_import.sh
```

Copies from `SOURCE` to `DEST` without deleting from source.

### 2) Combine imported segments

```bash
./scripts/combine_dashcam.sh
```

Merges clips in `DEST` using stream copy into `COMBINED_DIR`.
Segments are only deleted when combine succeeds and `DELETE_SEGMENTS_AFTER_COMBINE=1`.

### 3) Upload clips to YouTube

```bash
./scripts/upload_sdcard_youtube.sh
```

What this upload script does:
- validates auth and (optionally) channel before renaming files
- renames file to `*_READY` before upload
- uploads with generated title and configured metadata
- renames to `*_DONE` only after successful upload
- leaves failed uploads as `*_READY` for retry

## Sample Screenshots

<img width="842" height="741" alt="sample screenshot 1" src="https://github.com/user-attachments/assets/d9f439bf-9771-4058-a902-d65d30165e89" />
<img width="293" height="689" alt="sample screenshot 2" src="https://github.com/user-attachments/assets/bc00fbef-a999-451c-bd86-715a9bacdc19" />
