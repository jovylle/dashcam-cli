const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, args = [], options = {}) {
  const p = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  return p.status;
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

console.log('Running syntax check...');
let status = run('node', ['--check', path.join('bin', 'dashcam-cli.js')]);
if (status !== 0) process.exit(status);
status = run('node', ['--check', path.join('scripts', 'youtube_api_upload.js')]);
if (status !== 0) process.exit(status);

// A CRLF checkout of upload_sdcard_youtube.sh was published once, which made
// `set -euo pipefail` fail with "invalid option name" on macOS and Linux.
console.log('Checking line endings...');
const checked = [
  path.join('bin', 'dashcam-cli.js'),
  path.join('scripts', 'upload_sdcard_youtube.sh'),
  path.join('scripts', 'youtube_api_upload.js'),
  path.join('scripts', 'demo_setup.sh'),
];
for (const file of checked) {
  if (!fs.existsSync(file)) continue;
  if (fs.readFileSync(file, 'utf8').includes('\r\n')) fail(`${file} has CRLF line endings`);
}

console.log('Checking OAuth safety guards...');
const apiUpload = fs.readFileSync(path.join('scripts', 'youtube_api_upload.js'), 'utf8');
if (!apiUpload.includes('rl.on("close"')) {
  fail('prompt() must settle on stdin close, or an unattended run exits 0 after a failed login');
}
if (!apiUpload.includes('withRetry(')) {
  fail('uploads must retry transient stream failures such as EPIPE');
}
if (!apiUpload.includes('clearTimeout(timer)')) {
  fail('the OAuth callback timeout timer must be cleared once login completes');
}

console.log('Running demo script...');
status = run('bash', [path.join('scripts', 'demo_setup.sh')]);
if (status !== 0) process.exit(status);

console.log('All tests passed.');
process.exit(0);
