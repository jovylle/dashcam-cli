#!/usr/bin/env python3
import argparse
import os
import sys

from google.auth.transport.requests import Request
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    # Required for playlistItems.insert (add uploaded video to a playlist).
    "https://www.googleapis.com/auth/youtube.force-ssl",
]


def get_credentials(client_secrets: str, token_file: str) -> Credentials:
    creds = None
    if os.path.exists(token_file):
        try:
            creds = Credentials.from_authorized_user_file(token_file, SCOPES)
            if not creds.has_scopes(SCOPES):
                creds = None
        except Exception:
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except RefreshError as exc:
                # invalid_grant means refresh token was revoked/expired; re-auth interactively.
                if "invalid_grant" not in str(exc):
                    raise
                creds = None
        if not creds:
            flow = InstalledAppFlow.from_client_secrets_file(client_secrets, SCOPES)
            creds = flow.run_local_server(port=0)
        os.makedirs(os.path.dirname(token_file), exist_ok=True)
        with open(token_file, "w", encoding="utf-8") as f:
            f.write(creds.to_json())

    return creds


def add_video_to_playlist(youtube, playlist_id: str, video_id: str) -> None:
    youtube.playlistItems().insert(
        part="snippet",
        body={
            "snippet": {
                "playlistId": playlist_id,
                "resourceId": {"kind": "youtube#video", "videoId": video_id},
            }
        },
    ).execute()


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload one video to YouTube.")
    parser.add_argument("--file", default="")
    parser.add_argument("--title", default="")
    parser.add_argument("--description", default="")
    parser.add_argument("--category-id", default="2")
    parser.add_argument("--privacy", default="unlisted", choices=["public", "unlisted", "private"])
    parser.add_argument("--client-secrets", required=True)
    parser.add_argument("--token-file", required=True)
    parser.add_argument("--target-channel-id", default="")
    parser.add_argument(
        "--playlist-id",
        default="",
        help="If set, add the new video to this playlist (ID from studio URL, e.g. PL…).",
    )
    parser.add_argument("--check-channel-only", action="store_true")
    args = parser.parse_args()

    if not os.path.exists(args.client_secrets):
        print(f"Client secrets not found: {args.client_secrets}", file=sys.stderr)
        return 1

    try:
        creds = get_credentials(args.client_secrets, args.token_file)
        youtube = build("youtube", "v3", credentials=creds)
        channels = youtube.channels().list(part="id,snippet", mine=True).execute()
        items = channels.get("items", [])
        channel_ids = [item.get("id", "") for item in items]

        if not channel_ids:
            print("No accessible YouTube channel found for authenticated account.", file=sys.stderr)
            return 1

        if args.target_channel_id and args.target_channel_id not in channel_ids:
            print(
                f"Authenticated channel does not match YT_TARGET_CHANNEL_ID={args.target_channel_id}. "
                f"Available: {', '.join(channel_ids)}",
                file=sys.stderr,
            )
            return 1

        active = items[0]
        print(f"Authenticated channel: {active.get('snippet', {}).get('title', '')} ({active.get('id', '')})")

        if args.check_channel_only:
            return 0

        if not args.file:
            print("--file is required unless --check-channel-only is used.", file=sys.stderr)
            return 1
        if not args.title:
            print("--title is required unless --check-channel-only is used.", file=sys.stderr)
            return 1
        if not os.path.exists(args.file):
            print(f"File not found: {args.file}", file=sys.stderr)
            return 1

        body = {
            "snippet": {
                "title": args.title,
                "description": args.description,
                "categoryId": args.category_id,
            },
            "status": {"privacyStatus": args.privacy},
        }
        media = MediaFileUpload(args.file, resumable=True)
        request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
        response = request.execute()
        video_id = response.get("id", "")
        print(f"Uploaded video id: {video_id}")

        playlist_id = (args.playlist_id or "").strip()
        if playlist_id and video_id:
            try:
                add_video_to_playlist(youtube, playlist_id, video_id)
                print(f"Added to playlist: {playlist_id}")
            except HttpError as exc:
                print(
                    f"Upload succeeded but playlist add failed (video is live): {exc}",
                    file=sys.stderr,
                )
                print(
                    "Fix YT_PLAYLIST_ID / permissions or add the video manually in YouTube Studio.",
                    file=sys.stderr,
                )
        return 0
    except HttpError as exc:
        print(f"YouTube API error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
