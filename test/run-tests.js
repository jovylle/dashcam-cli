const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args = [], options = {}) {
  const p = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  return p.status;
}

console.log('Running syntax check...');
let status = run('node', ['--check', path.join('bin', 'dashcam-cli.js')]);
if (status !== 0) process.exit(status);

console.log('Running demo script...');
status = run('bash', [path.join('scripts', 'demo_setup.sh')]);
if (status !== 0) process.exit(status);

console.log('All tests passed.');
process.exit(0);
