#!/usr/bin/env python3
import argparse
import os
import sys

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]


def get_credentials(client_secrets: str, token_file: str) -> Credentials:
    creds = None
    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)
        if not creds.has_scopes(SCOPES):
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(client_secrets, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_file, "w", encoding="utf-8") as f:
            f.write(creds.to_json())

    return creds


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
        print(f"Uploaded video id: {response.get('id', '')}")
        return 0
    except HttpError as exc:
        print(f"YouTube API error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
