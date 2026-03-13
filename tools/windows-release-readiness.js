#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const checks = [];

function addCheck(name, pass, detail, fix) {
  checks.push({ name, pass, detail, fix });
}

function fileExists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

addCheck(
  'Windows build scripts',
  Boolean(pkg.scripts?.['build:win'] && pkg.scripts?.['build:win:release']),
  'Requires build and release scripts for Windows packaging.',
  'Add build:win and build:win:release scripts in package.json.'
);

addCheck(
  'Windows target config',
  Boolean(pkg.build?.win?.target && pkg.build?.nsis),
  'Electron builder must define win target + nsis settings.',
  'Configure build.win.target and build.nsis in package.json.'
);

addCheck(
  'Windows icon configured',
  Boolean(pkg.build?.win?.icon && fileExists(pkg.build.win.icon)),
  'Windows installer/app icon should be configured and present.',
  'Set build.win.icon and ensure the icon file exists.'
);

addCheck(
  'Native build helper exists',
  fileExists('build-native.js'),
  'Platform-aware native build helper is required for cross-platform CI.',
  'Create build-native.js and route build:native/install through it.'
);

const signingVars = ['CSC_LINK', 'CSC_KEY_PASSWORD'];
const missingSigningVars = signingVars.filter((name) => !process.env[name]);
const allowUnsignedRelease = process.env.ALLOW_UNSIGNED_WINDOWS_RELEASE === 'true';
addCheck(
  'Windows signing env vars',
  missingSigningVars.length === 0 || allowUnsignedRelease,
  'Signing requires CSC_LINK and CSC_KEY_PASSWORD environment variables.',
  allowUnsignedRelease
    ? 'Unsigned mode enabled via ALLOW_UNSIGNED_WINDOWS_RELEASE=true'
    : `Set missing variables: ${missingSigningVars.join(', ') || 'none'}`
);

addCheck(
  'Windows updater metadata script',
  fileExists('tools/windows-update-metadata.example.json'),
  'Windows release should have updater metadata template.',
  'Add tools/windows-update-metadata.example.json with installer metadata fields.'
);

const hasBundledWindowsFfmpeg = fileExists('assets/ffmpeg.exe');
const hasSystemFfmpeg = (() => {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe', shell: true, timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
})();

addCheck(
  'Windows ffmpeg availability strategy',
  hasBundledWindowsFfmpeg || hasSystemFfmpeg,
  'Windows runtime recording fallback requires ffmpeg.exe bundled or ffmpeg on PATH.',
  'Provide assets/ffmpeg.exe or ensure ffmpeg is available on PATH in Windows environments.'
);

const failures = checks.filter((check) => !check.pass);

console.log('🪟 Windows Release Readiness Check');
console.log('==================================');
for (const check of checks) {
  const marker = check.pass ? '✅' : '❌';
  console.log(`${marker} ${check.name}`);
  if (!check.pass) {
    console.log(`   - ${check.detail}`);
    console.log(`   - Fix: ${check.fix}`);
  }
}

if (failures.length > 0) {
  console.error(`\n❌ Windows release is NOT ready (${failures.length} checks failed).`);
  process.exit(1);
}

console.log('\n✅ Windows release baseline checks passed.');
process.exit(0);
