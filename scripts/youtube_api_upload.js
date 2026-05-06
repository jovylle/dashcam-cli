#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const path = require("path");
const readline = require("readline");
const { google } = require("googleapis");
const { spawnSync } = require("child_process");

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

function parseArgs(argv) {
  const out = {
    file: "",
    title: "",
    description: "",
    categoryId: "2",
    privacy: "unlisted",
    clientSecrets: "",
    tokenFile: "",
    targetChannelId: "",
    playlistId: "",
    checkChannelOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--file") out.file = next || "";
    else if (arg === "--title") out.title = next || "";
    else if (arg === "--description") out.description = next || "";
    else if (arg === "--category-id") out.categoryId = next || "2";
    else if (arg === "--privacy") out.privacy = next || "unlisted";
    else if (arg === "--client-secrets") out.clientSecrets = next || "";
    else if (arg === "--token-file") out.tokenFile = next || "";
    else if (arg === "--target-channel-id") out.targetChannelId = next || "";
    else if (arg === "--playlist-id") out.playlistId = next || "";
    else if (arg === "--check-channel-only") out.checkChannelOnly = true;
    if (arg.startsWith("--") && arg !== "--check-channel-only") i += 1;
  }
  return out;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function openUrl(url) {
  try {
    if (process.platform === "darwin") spawnSync("open", [url], { stdio: "ignore" });
    else if (process.platform === "win32") {
      // Avoid cmd URL parsing issues with '&' query params.
      // cmd/start can truncate OAuth URLs, causing missing response_type.
      const escaped = String(url).replace(/'/g, "''");
      const ps = spawnSync(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", `Start-Process '${escaped}'`],
        { stdio: "ignore" }
      );
      if ((ps.status ?? 1) !== 0) {
        const cmdSafe = String(url).replace(/&/g, "^&");
        spawnSync("cmd", ["/c", "start", "", cmdSafe], { stdio: "ignore" });
      }
    }
    else spawnSync("xdg-open", [url], { stdio: "ignore" });
  } catch (e) {
    // ignore open failures
  }
}

function loadClientSecrets(file) {
  const expanded = path.resolve(file.replace(/^~(?=$|\/|\\)/, require("os").homedir()));
  if (!fs.existsSync(expanded)) throw new Error(`Client secrets not found: ${expanded}`);
  const json = JSON.parse(fs.readFileSync(expanded, "utf8"));
  const cfg = json.installed || json.web;
  if (!cfg || !cfg.client_id || !cfg.client_secret) {
    throw new Error("Invalid client secrets JSON: expected installed/client_id/client_secret");
  }
  return { cfg, resolvedPath: expanded };
}

function selectRedirectUri(cfg) {
  const redirectUris = Array.isArray(cfg.redirect_uris) ? cfg.redirect_uris : [];
  const preferred = redirectUris.find(
    (uri) =>
      typeof uri === "string" &&
      (uri.startsWith("http://localhost") || uri.startsWith("http://127.0.0.1"))
  );
  if (preferred) return preferred;
  const fallback = redirectUris.find(
    (uri) => typeof uri === "string" && !uri.startsWith("urn:ietf:wg:oauth:2.0:oob")
  );
  if (fallback) return fallback;
  return "";
}

function startOAuthCallbackServer(redirectUri) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(redirectUri);
    const host = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
    const callbackPath = parsed.pathname || "/";
    let settled = false;
    let resolveCode;
    let rejectCode;
    const codePromise = new Promise((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      if (reqUrl.pathname !== callbackPath) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      const code = reqUrl.searchParams.get("code");
      const error = reqUrl.searchParams.get("error");
      if (error) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(`OAuth failed: ${error}. You can close this tab.`);
        settled = true;
        server.close();
        rejectCode(new Error(`OAuth failed: ${error}`));
        return;
      }
      if (!code) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Missing OAuth code. You can close this tab.");
        settled = true;
        server.close();
        rejectCode(new Error("OAuth callback did not include authorization code."));
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<html><body><h2>Authentication complete</h2><p>You can close this tab and return to the terminal.</p></body></html>"
      );
      settled = true;
      server.close();
      resolveCode(code);
    });

    server.listen(0, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not start local OAuth callback server."));
        return;
      }
      const resolvedUri = new URL(redirectUri);
      resolvedUri.hostname = host;
      resolvedUri.port = String(addr.port);
      resolve({
        redirectUri: resolvedUri.toString(),
        waitForCode: (timeoutMs = 120000) =>
          Promise.race([
            codePromise,
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error("Timed out waiting for OAuth callback.")), timeoutMs)
            ),
          ]),
        close: () => {
          if (!settled) {
            settled = true;
            rejectCode(new Error("OAuth callback server closed before receiving code."));
          }
          try {
            server.close();
          } catch (e) {
            // ignore close errors
          }
        },
      });
    });

    server.on("error", (err) => {
      reject(new Error(`Failed to start local OAuth callback server: ${err.message}`));
    });
  });
}

async function getAuthorizedClient(clientSecretsPath, tokenFilePath) {
  const { cfg } = loadClientSecrets(clientSecretsPath);
  const tokenPath = path.resolve(tokenFilePath.replace(/^~(?=$|\/|\\)/, require("os").homedir()));
  const redirectUri = selectRedirectUri(cfg);
  if (!redirectUri) {
    throw new Error(
      "OAuth client config has no supported redirect URI. Recreate credentials as Desktop app in Google Cloud Console and download a fresh JSON."
    );
  }
  const oauth2Client = new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    redirectUri
  );

  let existing = null;
  if (fs.existsSync(tokenPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
      oauth2Client.setCredentials(existing);
    } catch (e) {
      existing = null;
    }
  }

  try {
    await oauth2Client.getAccessToken();
    return oauth2Client;
  } catch (e) {
    // Need interactive auth
  }

  let callback = null;
  let runtimeRedirectUri = redirectUri;
  try {
    callback = await startOAuthCallbackServer(redirectUri);
    if (callback && callback.redirectUri) {
      runtimeRedirectUri = callback.redirectUri;
      oauth2Client.redirectUri = runtimeRedirectUri;
    }
  } catch (e) {
    // fallback to manual copy-paste flow below
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    redirect_uri: runtimeRedirectUri,
  });
  console.error("Authorize this app by visiting this URL:");
  console.error(authUrl);
  console.error("If browser opens Error 400 invalid_request, copy the full URL above and paste it manually.");
  const openNow = await prompt("Open URL in browser now? [Y/n]: ");
  if (openNow === "" || openNow.toLowerCase() === "y" || openNow.toLowerCase() === "yes") {
    openUrl(authUrl);
  }
  let code = "";
  if (callback) {
    try {
      code = await callback.waitForCode(120000);
    } catch (e) {
      // fallback to manual paste
      callback.close();
    }
  }
  if (!code) {
    code = await prompt("Paste authorization code here: ");
  }

  const tokenResult = await oauth2Client.getToken({
    code,
    redirect_uri: runtimeRedirectUri,
  });
  const tokens = tokenResult.tokens || {};
  if (!tokens.refresh_token && existing && existing.refresh_token) {
    tokens.refresh_token = existing.refresh_token;
  }
  oauth2Client.setCredentials(tokens);
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, `${JSON.stringify(tokens, null, 2)}\n`, "utf8");
  return oauth2Client;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.clientSecrets) throw new Error("--client-secrets is required");
  if (!args.tokenFile) throw new Error("--token-file is required");
  if (!["public", "unlisted", "private"].includes(args.privacy)) {
    throw new Error(`Invalid --privacy: ${args.privacy}`);
  }

  const auth = await getAuthorizedClient(args.clientSecrets, args.tokenFile);
  const youtube = google.youtube({ version: "v3", auth });

  const channels = await youtube.channels.list({ part: ["id", "snippet"], mine: true });
  const items = channels.data.items || [];
  const channelIds = items.map((item) => item.id || "").filter(Boolean);
  if (channelIds.length === 0) {
    throw new Error("No accessible YouTube channel found for authenticated account.");
  }
  if (args.targetChannelId && !channelIds.includes(args.targetChannelId)) {
    throw new Error(
      `Authenticated channel does not match YT_TARGET_CHANNEL_ID=${args.targetChannelId}. Available: ${channelIds.join(", ")}`
    );
  }
  const active = items[0];
  console.log(`Authenticated channel: ${active.snippet?.title || ""} (${active.id || ""})`);

  if (args.checkChannelOnly) return;
  if (!args.file) throw new Error("--file is required unless --check-channel-only is used.");
  if (!args.title) throw new Error("--title is required unless --check-channel-only is used.");
  if (!fs.existsSync(args.file)) throw new Error(`File not found: ${args.file}`);

  const upload = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: args.title,
        description: args.description || "",
        categoryId: args.categoryId || "2",
      },
      status: { privacyStatus: args.privacy },
    },
    media: {
      body: fs.createReadStream(args.file),
    },
  });
  const videoId = upload.data.id || "";
  console.log(`Uploaded video id: ${videoId}`);

  if (args.playlistId && videoId) {
    try {
      await youtube.playlistItems.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            playlistId: args.playlistId,
            resourceId: { kind: "youtube#video", videoId },
          },
        },
      });
      console.log(`Added to playlist: ${args.playlistId}`);
    } catch (e) {
      console.error(`Upload succeeded but playlist add failed (video is live): ${e.message || e}`);
      console.error("Fix YT_PLAYLIST_ID / permissions or add the video manually in YouTube Studio.");
    }
  }
}

main().catch((err) => {
  const msg = err && (err.message || String(err));
  console.error(`YouTube API error: ${msg}`);
  if (msg && msg.includes("invalid_request")) {
    console.error(
      "OAuth setup hint: use a Desktop OAuth client in Google Cloud Console, enable YouTube Data API v3, then rerun setup and use that client_secrets.json."
    );
  }
  process.exit(1);
});
