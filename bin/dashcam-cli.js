#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const readline = require("readline");

const repoRoot = path.resolve(__dirname, "..");
const scriptsDir = path.join(repoRoot, "scripts");
const envExamplePath = path.join(repoRoot, ".env.example");
const appName = "easy-youtube-batch-uploader";
const defaultConfigDir =
  process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName)
    : path.join(os.homedir(), ".config", appName);
const envPath = process.env.EYBU_ENV_FILE
  ? path.resolve(process.env.EYBU_ENV_FILE)
  : path.join(defaultConfigDir, "config.env");

function printHelp() {
  console.log(`easy-youtube-batch-uploader

Usage:
  easy-youtube-batch-uploader start
  easy-youtube-batch-uploader setup
  easy-youtube-batch-uploader setup-advanced
  easy-youtube-batch-uploader doctor
  easy-youtube-batch-uploader upload
  easy-youtube-batch-uploader help
  eybu <command>

Commands:
  start   Quick start (bootstrap config, ask missing core values, doctor, optional upload)
  setup   Interactive quick setup wizard (core values)
  setup-advanced  Interactive wizard for advanced values
  doctor  Validate local setup and config paths
  upload  Run scripts/upload_sdcard_youtube.sh
  store-secrets  Copy a client_secrets.json into the canonical config folder and update config
`);
}

async function storeSecretsCmd(srcPath) {
  if (!srcPath) {
    console.error('Usage: easy-youtube-batch-uploader store-secrets <path-to-client_secrets.json>');
    process.exit(1);
  }
  const expanded = expandPath(srcPath);
  const abs = path.resolve(expanded);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    console.error(`Source not found: ${abs}`);
    process.exit(1);
  }

  fs.mkdirSync(defaultConfigDir, { recursive: true });
  const dest = path.join(defaultConfigDir, 'client_secrets.json');
  fs.copyFileSync(abs, dest);
  try {
    if (process.platform !== 'win32') {
      fs.chmodSync(dest, 0o600);
    }
  } catch (e) {
    // ignore permission errors
  }

  const currentValues = parseEnvFile(envPath);
  currentValues.GOOGLE_CLIENT_SECRETS = dest;
  fs.writeFileSync(envPath, toEnvContent(normalizeEnvValues(currentValues), envExamplePath), 'utf8');
  console.log(`Installed Google client secrets: ${dest}`);
}

function run(scriptName) {
  const scriptPath = path.join(scriptsDir, scriptName);
  const result = spawnSync("bash", [scriptPath], {
    stdio: "inherit",
    env: {
      ...process.env,
      ENV_FILE: envPath,
    },
  });
  process.exit(result.status ?? 1);
}

function hasCommand(command) {
  const check = spawnSync("bash", ["-lc", `command -v ${command}`], {
    stdio: "pipe",
  });
  return check.status === 0;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const out = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function toEnvContent(values, templatePath) {
  const lines = fs.readFileSync(templatePath, "utf8").split(/\r?\n/);
  const rendered = lines.map((rawLine) => {
    const line = rawLine;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const idx = line.indexOf("=");
    if (idx <= 0) return line;
    const key = line.slice(0, idx).trim();
    if (!(key in values)) return line;
    return `${key}=${values[key]}`;
  });
  return `${rendered.join("\n").trimEnd()}\n`;
}

function normalizeEnvValues(values) {
  const normalized = {};
  for (const [key, value] of Object.entries(values)) {
    normalized[key] = quoteIfNeeded(value);
  }
  return normalized;
}

function expandPath(value) {
  if (!value) return value;
  return value
    .replace(/^~(?=$|\/|\\)/, os.homedir())
    .replace(/\$HOME/g, os.homedir());
}

function checkPathExists(label, value, expectedType, required, collector) {
  if (!value) {
    if (required) collector.push(`${label} is missing`);
    return;
  }
  const expanded = expandPath(value);
  const normalized = path.normalize(expanded);
  const resolved = path.resolve(normalized);
  const exists = fs.existsSync(resolved);
  if (!exists) {
    collector.push(`${label} path does not exist: ${resolved}`);
    return;
  }
  if (expectedType === "dir" && !fs.statSync(resolved).isDirectory()) {
    collector.push(`${label} is not a directory: ${resolved}`);
  }
  if (expectedType === "file" && !fs.statSync(resolved).isFile()) {
    collector.push(`${label} is not a file: ${resolved}`);
  }
}

function ensureInitialized({ printSummary = true } = {}) {
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const templateValues = parseEnvFile(envExamplePath);
  let currentValues = {};
  let created = false;

  if (!fs.existsSync(envPath)) {
    created = true;
    currentValues = { ...templateValues };
    // On Windows, prefer storing OAuth files under %APPDATA% to keep them
    // in a per-user, OS-standard location rather than scattering under $HOME.
    if (process.platform === "win32") {
      const appDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "easy-youtube-batch-uploader");
      currentValues.GOOGLE_CLIENT_SECRETS = path.join(appDataDir, "client_secrets.json");
      currentValues.GOOGLE_TOKEN_FILE = path.join(appDataDir, "token.json");
    }
    fs.writeFileSync(
      envPath,
      toEnvContent(normalizeEnvValues(currentValues), envExamplePath),
      "utf8"
    );
    console.log(`Created config file: ${envPath}`);
  } else {
    currentValues = parseEnvFile(envPath);
    let added = 0;
    for (const [key, value] of Object.entries(templateValues)) {
      if (!(key in currentValues)) {
        currentValues[key] = value;
        added += 1;
      }
    }
    fs.writeFileSync(
      envPath,
      toEnvContent(normalizeEnvValues(currentValues), envExamplePath),
      "utf8"
    );
    if (added > 0) {
      console.log(`Config updated with ${added} missing default value(s): ${envPath}`);
    } else {
      console.log(`Config already up-to-date: ${envPath}`);
    }
  }

  const files = fs.readdirSync(scriptsDir);
  for (const file of files) {
    if (!file.endsWith(".sh")) continue;
    fs.chmodSync(path.join(scriptsDir, file), 0o755);
  }
  if (printSummary) {
    console.log("Ensured scripts/*.sh are executable");
    console.log("");
    console.log("Next steps:");
    if (created) {
      console.log(`1) Run: easy-youtube-batch-uploader setup`);
      console.log("2) Run: easy-youtube-batch-uploader doctor");
      console.log("3) Run: easy-youtube-batch-uploader upload");
    } else {
      console.log(`1) Optional: review config at ${envPath}`);
      console.log("2) Run: easy-youtube-batch-uploader doctor");
      console.log("3) Run: easy-youtube-batch-uploader upload");
    }
  }
  return { created };
}

function init() {
  ensureInitialized({ printSummary: true });
}

function quoteIfNeeded(value) {
  if (value == null) return "";
  const str = String(value);
  if (str === "") return "";
  // If the value contains whitespace or characters that could be interpreted
  // by a shell when the .env file is sourced, wrap it in single quotes and
  // safely escape any single quotes inside the value. This preserves
  // backslashes on Windows paths and avoids accidental shell escapes.
  if (/\s|\\|\$|`|'/.test(str)) {
    const escaped = str.replace(/'/g, "'\"'\"'");
    return `'${escaped}'`;
  }
  return str;
}

async function setupWizard(mode = "core", options = {}) {
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const templateValues = parseEnvFile(envExamplePath);
  const currentValues = fs.existsSync(envPath) ? parseEnvFile(envPath) : {};
  const merged = { ...templateValues, ...currentValues };
  const { onlyMissing = false } = options;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (prompt) =>
    new Promise((resolve) => {
      rl.question(prompt, (answer) => resolve(answer.trim()));
    });

  try {
    const isAdvanced = mode === "advanced";
    console.log(`\n${isAdvanced ? "Advanced setup wizard" : "Setup wizard"} for ${appName}`);
    console.log(`Config file: ${envPath}`);
    console.log("Press Enter to keep the current/default value.\n");
    console.log(`
To upload to YouTube you need OAuth credentials. If you don’t have them yet:
 1) Open https://console.developers.google.com
 2) Create or select a project
 3) Enable “YouTube Data API v3”
 4) In “APIs & Services” → “Credentials” → “Create credentials” → “OAuth client ID”
    • Application type: Desktop
 5) Download the JSON file
 6) Save it somewhere and enter its path when prompted below
`);

    const coreFields = [
    
      ["SOURCE", "Folder containing videos to upload"],
      ["YT_TITLE_PREFIX", "YouTube title prefix"],
      ["YT_DESCRIPTION", "YouTube default description"],
      ["YT_PRIVACY", "YouTube privacy (private|unlisted|public)"],
    ];
    const optionalFields = [
      ["YT_TITLE_PREFIX", "YouTube title prefix"],
      ["YT_DESCRIPTION", "YouTube default description"],
      ["YT_CATEGORY_ID", "YouTube category ID (default: 2)"],
      ["YT_PRIVACY", "YouTube privacy (private|unlisted|public)"],
      ["READY_TAG", "Staging tag appended before upload (default: READY)"],
      ["DONE_TAG", "Success tag appended after upload (default: DONE)"],
      ["GOOGLE_CLIENT_SECRETS", "Path to Google OAuth client_secrets JSON"],
      ["GOOGLE_TOKEN_FILE", "Path to token cache JSON"],
      ["YT_TARGET_CHANNEL_ID", "Target channel ID (optional safety lock)"],
      ["YT_PLAYLIST_ID", "Playlist ID for auto-add uploads (optional)"],
    ];
    const fields = isAdvanced ? optionalFields : coreFields;
    const activeFields = onlyMissing
      ? fields.filter(([key]) => {
          const value = (merged[key] ?? "").trim();
          return value === "";
        })
      : fields;

    if (activeFields.length === 0) {
      console.log("All required values for this setup mode are already configured.");
    }

    // Helpful interactive flow specifically for Google OAuth client secrets
    if (activeFields.find(([k]) => k === "GOOGLE_CLIENT_SECRETS")) {
      const current = merged.GOOGLE_CLIENT_SECRETS ?? "";
      if (!current) {
        console.log('\nGoogle OAuth client credentials are required to authorize uploads.');
        console.log('If you are unfamiliar with the Google Cloud Console, visit:');
        console.log('  https://console.cloud.google.com/apis/credentials (APIs & Services → Credentials)');
        console.log('Steps: 1) Create a project 2) Enable YouTube Data API 3) Create OAuth client ID → Desktop app 4) Download JSON');

        const openNow = (await ask('Open Google Cloud Credentials page in your browser now? [y/N]: ')).toLowerCase();
        if (openNow === 'y' || openNow === 'yes') {
          try {
            if (process.platform === 'darwin') {
              spawnSync('open', ['https://console.cloud.google.com/apis/credentials']);
            } else if (process.platform === 'win32') {
              spawnSync('cmd', ['/c', 'start', 'https://console.cloud.google.com/apis/credentials'], { shell: true });
            } else {
              spawnSync('xdg-open', ['https://console.cloud.google.com/apis/credentials']);
            }
          } catch (e) {
            // ignore open failures
          }
        }

        const haveFile = (await ask('Do you already have client_secrets.json downloaded? [y/N]: ')).toLowerCase();
        if (haveFile === 'y' || haveFile === 'yes') {
          const pathInput = await ask('Enter path to client_secrets.json (or leave empty to skip): ');
          if (pathInput) {
            const expanded = expandPath(pathInput);
            const abs = path.resolve(expanded);
            if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
              fs.mkdirSync(defaultConfigDir, { recursive: true });
              const dest = path.join(defaultConfigDir, 'client_secrets.json');
              fs.copyFileSync(abs, dest);
              try { if (process.platform !== 'win32') fs.chmodSync(dest, 0o600); } catch (e) {}
              merged.GOOGLE_CLIENT_SECRETS = dest;
              console.log(`Installed client_secrets.json -> ${dest}`);
            } else {
              console.log(`Path not found or not a file: ${abs}`);
            }
          }
        } else {
          const paste = (await ask('Would you like to paste the contents of client_secrets.json now? (end with a single line containing EOF) [y/N]: ')).toLowerCase();
          if (paste === 'y' || paste === 'yes') {
            console.log('Paste the JSON now. Finish by typing a line with only EOF and pressing Enter.');
            const lines = [];
            // read until EOF marker
            while (true) {
              const line = await ask('');
              if (line === 'EOF') break;
              lines.push(line);
            }
            const content = lines.join('\n').trim();
            try {
              JSON.parse(content);
              fs.mkdirSync(defaultConfigDir, { recursive: true });
              const dest = path.join(defaultConfigDir, 'client_secrets.json');
              fs.writeFileSync(dest, content, 'utf8');
              try { if (process.platform !== 'win32') fs.chmodSync(dest, 0o600); } catch (e) {}
              merged.GOOGLE_CLIENT_SECRETS = dest;
              console.log(`Saved pasted client_secrets.json -> ${dest}`);
            } catch (e) {
              console.log('Invalid JSON pasted; skipping client_secrets installation.');
            }
          }
        }
      }
    }

    for (const [key, label] of activeFields) {
      // GOOGLE_CLIENT_SECRETS already handled above; show current and allow override
      if (key === 'GOOGLE_CLIENT_SECRETS') {
        const current = merged[key] ?? '';
        const answer = await ask(`${label} [${current}]: `);
        if (answer !== '') {
          merged[key] = answer;
        }
        continue;
      }
      const current = merged[key] ?? "";
      const answer = await ask(`${label} [${current}]: `);
      if (answer !== "") {
        merged[key] = answer;
      }
    }

    const normalized = {};
    for (const [key, value] of Object.entries(merged)) {
      normalized[key] = quoteIfNeeded(value);
    }
    fs.writeFileSync(envPath, toEnvContent(normalized, envExamplePath), "utf8");
    console.log(`\nSaved config: ${envPath}`);
    console.log("Run: easy-youtube-batch-uploader doctor");
  } finally {
    rl.close();
  }
}

function runDoctor({ exitOnFinish = true } = {}) {
  const missingCommands = ["bash", "python3"].filter(
    (command) => !hasCommand(command)
  );

  const envValues = parseEnvFile(envPath);
  const issues = [];
  const warnings = [];

  function tryInstallClientSecretsIfMissing(values) {
    const current = values.GOOGLE_CLIENT_SECRETS || "";
    const expandedCurrent = expandPath(current || "");
    if (expandedCurrent && fs.existsSync(expandedCurrent)) return false;

    const candidates = [];
    // user-specified but maybe unexpanded
    if (current) candidates.push(expandPath(current));
    // cwd
    candidates.push(path.join(process.cwd(), "client_secrets.json"));
    // repo root
    candidates.push(path.join(repoRoot, "client_secrets.json"));
    // Downloads
    candidates.push(path.join(os.homedir(), "Downloads", "client_secrets.json"));
    // common appdata location (Windows)
    candidates.push(path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName, "client_secrets.json"));
    // location next to env file
    candidates.push(path.join(path.dirname(envPath), "client_secrets.json"));

    let found = null;
    for (const c of candidates) {
      if (!c) continue;
      try {
        const p = path.resolve(c);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          found = p;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    if (!found) return false;

    // destination
    const dest = expandPath(values.GOOGLE_CLIENT_SECRETS) || path.join(defaultConfigDir, "client_secrets.json");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(found, dest);

    // update env file to point to the dest
    const currentValues = parseEnvFile(envPath);
    currentValues.GOOGLE_CLIENT_SECRETS = dest;
    fs.writeFileSync(envPath, toEnvContent(normalizeEnvValues(currentValues), envExamplePath), "utf8");
    console.log(`Auto-installed Google client secrets from ${found} -> ${dest}`);
    return true;
  }

  if (!fs.existsSync(envPath)) {
    issues.push(`Missing config file: ${envPath} (run: easy-youtube-batch-uploader setup)`);
  } else {
    checkPathExists("SOURCE", envValues.SOURCE, "dir", true, warnings);

    let hasSecrets = Boolean(envValues.GOOGLE_CLIENT_SECRETS);
    let hasToken = Boolean(envValues.GOOGLE_TOKEN_FILE);
    // If the configured secrets path is missing, try to auto-install from common locations.
    if (envValues.GOOGLE_CLIENT_SECRETS) {
      const expanded = expandPath(envValues.GOOGLE_CLIENT_SECRETS);
      if (!fs.existsSync(expanded)) {
        tryInstallClientSecretsIfMissing(envValues);
        // re-read envValues after potential change
        Object.assign(envValues, parseEnvFile(envPath));
        hasSecrets = Boolean(envValues.GOOGLE_CLIENT_SECRETS);
      }
    } else {
      // No configured value — try install
      tryInstallClientSecretsIfMissing(envValues);
      Object.assign(envValues, parseEnvFile(envPath));
      hasSecrets = Boolean(envValues.GOOGLE_CLIENT_SECRETS);
    }
    if (!hasSecrets || !hasToken) {
      warnings.push(
        "GOOGLE_CLIENT_SECRETS and GOOGLE_TOKEN_FILE are required for upload command"
      );
    } else {
      checkPathExists("GOOGLE_CLIENT_SECRETS", envValues.GOOGLE_CLIENT_SECRETS, "file", true, warnings);
      const tokenDir = path.dirname(expandPath(envValues.GOOGLE_TOKEN_FILE));
      if (!fs.existsSync(tokenDir)) {
        warnings.push(`Token directory does not exist yet: ${tokenDir}`);
      }
    }
  }

  if (missingCommands.length > 0) {
    issues.push(`Missing required commands: ${missingCommands.join(", ")}`);
  }

  console.log("easy-youtube-batch-uploader doctor");
  console.log(`Config: ${envPath}`);
  console.log("");
  if (issues.length === 0) {
    console.log("PASS: required checks look good.");
  } else {
    console.log("FAIL: required checks found issues.");
    for (const issue of issues) console.log(`- ${issue}`);
  }

  if (warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  const status = issues.length === 0 ? 0 : 1;
  if (exitOnFinish) {
    process.exit(status);
  }
  return status;
}

function doctor() {
  runDoctor({ exitOnFinish: true });
}

async function start() {
  const { created } = ensureInitialized({ printSummary: false });

  if (created) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.log("First run detected. Run 'easy-youtube-batch-uploader setup' to finish setup, then run upload.");
      process.exit(0);
    }
    console.log("\nFirst run detected. We'll do quick setup, then continue to doctor and upload.");
    await setupWizard("core");
  }

  const envValues = parseEnvFile(envPath);
  const missingCoreKeys = ["SOURCE", "YT_TITLE_PREFIX", "YT_DESCRIPTION", "YT_PRIVACY"].filter(
    (key) => !(envValues[key] || "").trim()
  );

  if (missingCoreKeys.length > 0) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error("Missing core setup values. Run 'easy-youtube-batch-uploader setup' in an interactive terminal.");
      process.exit(1);
    }
    console.log("Core setup is incomplete. Let's finish missing values.\n");
    await setupWizard("core", { onlyMissing: true });
  }

  const doctorStatus = runDoctor({ exitOnFinish: false });
  if (doctorStatus !== 0) {
    process.exit(doctorStatus);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("Doctor passed. Run: easy-youtube-batch-uploader upload");
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (prompt) =>
    new Promise((resolve) => {
      rl.question(prompt, (answer) => resolve(answer.trim().toLowerCase()));
    });
  try {
    const shouldUpload = await ask("\nDoctor passed. Start upload now? [y/N]: ");
    if (shouldUpload === "y" || shouldUpload === "yes") {
      run("upload_sdcard_youtube.sh");
      return;
    }
    console.log("Upload skipped. Run: easy-youtube-batch-uploader upload");
  } finally {
    rl.close();
  }
}

const command = process.argv[2] || "start";

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else if (command === "start") {
  start()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`Start failed: ${err.message}`);
      process.exit(1);
    });
} else if (command === "init") {
  console.log("`init` is deprecated. Using quick bootstrap flow.");
  init();
} else if (command === "setup") {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("setup requires an interactive terminal. Use 'start' for non-interactive quick checks.");
    process.exit(1);
  }
  setupWizard("core")
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`Setup failed: ${err.message}`);
      process.exit(1);
    });
} else if (command === "setup-advanced" || command === "setup-optional") {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("setup-advanced requires an interactive terminal. Use 'start' for non-interactive quick checks.");
    process.exit(1);
  }
  setupWizard("advanced")
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`Setup failed: ${err.message}`);
      process.exit(1);
    });
} else if (command === "doctor") {
  doctor();
} else if (command === "upload") {
  run("upload_sdcard_youtube.sh");
} else if (command === "store-secrets") {
  storeSecretsCmd(process.argv[3])
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`store-secrets failed: ${err.message}`);
      process.exit(1);
    });
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Run 'easy-youtube-batch-uploader help' to see available commands.");
  process.exit(1);
}
