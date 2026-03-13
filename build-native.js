#!/usr/bin/env node

const { spawnSync } = require('child_process');

const platform = process.platform;
const forceBuild = process.env.FORCE_NATIVE_BUILD === 'true';

if (platform !== 'darwin' && !forceBuild) {
  console.log(`[native-build] Skipping native addon build on ${platform} (macOS-only modules currently).`);
  console.log('[native-build] Set FORCE_NATIVE_BUILD=true to override.');
  process.exit(0);
}

console.log(`[native-build] Running node-gyp rebuild on ${platform}...`);

const result = spawnSync('node-gyp', ['rebuild'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

process.exit(0);
