import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Logger } from '../core/logger';

let loaded = false;

const findEnvFile = (): string | null => {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env.local')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

export const loadEnv = (): void => {
  if (loaded) {
    return;
  }

  const envPath = findEnvFile();
  if (envPath) {
    dotenv.config({ path: envPath });
    Logger.debug(`[Env] Loaded environment from ${envPath}`);
  } else {
    dotenv.config();
    Logger.debug('[Env] Loaded environment from process defaults');
  }

  loaded = true;
};

export const getEnv = (key: string, fallback?: string): string | undefined => {
  loadEnv();
  const value = process.env[key];
  if (value === undefined || value === '') {
    return fallback;
  }
  return value;
};

// Load immediately for modules that import without calling getEnv
loadEnv();
