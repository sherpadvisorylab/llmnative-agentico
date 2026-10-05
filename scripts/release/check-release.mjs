import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const npmExecPath = process.env.npm_execpath;
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const cr = valueAfter('--cr');
const issue = valueAfter('--issue');
const noCr = args.includes('--no-cr');

const fail = (message) => {
  console.error(`release:check failed: ${message}`);
  process.exit(1);
};
const run = (command, commandArgs, options = {}) => {
  try {
    return execFileSync(command, commandArgs, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    if (options.allowFailure) return '';
    const detail = error.stderr?.toString().trim() || error.message;
    fail(`${command} ${commandArgs.join(' ')}: ${detail}`);
  }
};
const runNpm = (npmArgs) => {
  if (!npmExecPath) {
    fail('npm_execpath is unavailable; run the preflight through npm run release:check');
  }
  return run(process.execPath, [npmExecPath, ...npmArgs]);
};

if (noCr === Boolean(cr || issue)) {
  fail('use either --no-cr or both --cr CR-NNN --issue <number>');
}
if (!noCr && (!/^CR-\d{3}[a-z]?$/.test(cr ?? '') || !/^\d+$/.test(issue ?? ''))) {
  fail('a CR release requires --cr CR-NNN and --issue <number>');
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
const status = readFileSync(resolve(root, '.notes', 'STATUS.md'), 'utf8');
const changeRequests = readFileSync(resolve(root, '.notes', 'CHANGE_REQUESTS.md'), 'utf8');
const version = packageJson.version;
// owner/repo from package.json#repository.url (git+https://github.com/<owner>/<repo>.git)
const repository = packageJson.repository?.url?.match(/github\.com\/([^/]+\/[^/.]+)/)?.[1];
if (!repository) fail('package.json#repository.url must point to a GitHub repository');

if (packageLock.version !== version || packageLock.packages?.['']?.version !== version) {
  fail(`package-lock.json is not aligned with package.json ${version}`);
}
if (!changelog.includes(`[${version}]`)) fail(`CHANGELOG.md has no [${version}] entry`);
if (!status.includes(version)) fail(`STATUS.md does not mention version ${version}`);

if (cr) {
  if (!changeRequests.includes(`## ${cr}`)) fail(`${cr} is absent from CHANGE_REQUESTS.md`);
  if (!status.includes(`| ${cr} | Done |`)) fail(`${cr} is not Done in STATUS.md`);
  const issueData = JSON.parse(run('gh', [
    'issue', 'view', issue,
    '--repo', repository,
    '--json', 'state,labels,title',
  ]));
  const labels = issueData.labels.map((label) => label.name);
  if (issueData.state !== 'CLOSED' || !labels.includes('done')) {
    fail(`GitHub issue #${issue} must be CLOSED with label done`);
  }
  if (!issueData.title.includes(cr)) fail(`GitHub issue #${issue} title does not reference ${cr}`);
}

if (run('git', ['branch', '--show-current']) !== 'main') fail('release must run from main');
if (run('git', ['status', '--porcelain'])) fail('worktree is not clean');
const head = run('git', ['rev-parse', 'HEAD']);
run('git', ['fetch', 'origin', 'main', '--quiet']);
if (run('git', ['rev-parse', 'origin/main']) !== head) fail('origin/main does not match HEAD');
if (run('git', ['rev-list', '-n', '1', `v${version}`], { allowFailure: true }) !== head) {
  fail(`tag v${version} is missing or does not point to HEAD`);
}

runNpm(['whoami']);
// First release: the package does not exist on the registry yet (npm view answers E404).
const published = (() => {
  try {
    return execFileSync(process.execPath, [npmExecPath, 'view', packageJson.name, 'versions', '--json'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (/E404|404 Not Found/.test(error.stderr?.toString() ?? '')) return null;
    fail(`npm view ${packageJson.name}: ${error.stderr?.toString().trim() || error.message}`);
  }
})();
const publishedVersions = published ? [JSON.parse(published)].flat() : [];
if (publishedVersions.includes(version)) fail(`${packageJson.name}@${version} is already published`);
const latest = publishedVersions.at(-1);

const versionParts = (candidate) => candidate.split('.').map((part) => Number(part));
const compareVersions = (left, right) => {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  if (leftParts.length !== 3 || rightParts.length !== 3 ||
      [...leftParts, ...rightParts].some((part) => !Number.isInteger(part))) {
    fail(`release:check supports stable SemVer versions only (${left}, ${right})`);
  }
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
};
if (latest && compareVersions(version, latest) <= 0) {
  fail(`candidate ${version} must be newer than npm latest ${latest}`);
}

console.log(`release:check passed for ${packageJson.name}@${version}`);
