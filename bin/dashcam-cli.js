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
const defaultConfigDir = path.join(os.homedir(), ".config", appName);
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
`);
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

function expandPath(value) {
  if (!value) return value;
  return value
    .replace(/^~(?=$|\/)/, os.homedir())
    .replace(/\$HOME/g, os.homedir());
}

function checkPathExists(label, value, expectedType, required, collector) {
  if (!value) {
    if (required) collector.push(`${label} is missing`);
    return;
  }
  const expanded = expandPath(value);
  const exists = fs.existsSync(expanded);
  if (!exists) {
    collector.push(`${label} path does not exist: ${expanded}`);
    return;
  }
  if (expectedType === "dir" && !fs.statSync(expanded).isDirectory()) {
    collector.push(`${label} is not a directory: ${expanded}`);
  }
  if (expectedType === "file" && !fs.statSync(expanded).isFile()) {
    collector.push(`${label} is not a file: ${expanded}`);
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
    fs.writeFileSync(envPath, toEnvContent(currentValues, envExamplePath), "utf8");
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
    fs.writeFileSync(envPath, toEnvContent(currentValues, envExamplePath), "utf8");
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
  if (/\s/.test(str) && !(str.startsWith('"') && str.endsWith('"'))) {
    return `"${str.replace(/"/g, '\\"')}"`;
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

    for (const [key, label] of activeFields) {
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

  if (!fs.existsSync(envPath)) {
    issues.push(`Missing config file: ${envPath} (run: easy-youtube-batch-uploader setup)`);
  } else {
    checkPathExists("SOURCE", envValues.SOURCE, "dir", true, warnings);

    const hasSecrets = Boolean(envValues.GOOGLE_CLIENT_SECRETS);
    const hasToken = Boolean(envValues.GOOGLE_TOKEN_FILE);
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
  ensureInitialized({ printSummary: false });

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
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Run 'easy-youtube-batch-uploader help' to see available commands.");
  process.exit(1);
}
