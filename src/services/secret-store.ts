import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export const MASKED_SECRET = '••••••••';

export type SecretName =
  | 'openaiApiKey'
  | 'deepgramApiKey'
  | 'anthropicApiKey'
  | 'geminiApiKey'
  | 'awsAccessKeyId'
  | 'awsSecretAccessKey';

const ENVIRONMENT_KEYS: Partial<Record<SecretName, string>> = {
  openaiApiKey: 'OPENAI_API_KEY',
  deepgramApiKey: 'DEEPGRAM_API_KEY',
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  geminiApiKey: 'GEMINI_API_KEY',
  awsAccessKeyId: 'AWS_ACCESS_KEY_ID',
  awsSecretAccessKey: 'AWS_SECRET_ACCESS_KEY'
};

type EncryptedSecrets = Partial<Record<SecretName, string>>;

/**
 * Stores credentials with Electron safeStorage (Keychain on macOS). Plaintext
 * credentials are never written to disk and environment variables take
 * precedence over persisted values.
 */
export class SecretStore {
  private static instance: SecretStore;
  private readonly secretsPath: string;

  private constructor() {
    this.secretsPath = path.join(app.getPath('userData'), 'api-keys.enc.json');
  }

  static getInstance(): SecretStore {
    if (!SecretStore.instance) {
      SecretStore.instance = new SecretStore();
    }
    return SecretStore.instance;
  }

  get(name: SecretName): string | undefined {
    const environmentName = ENVIRONMENT_KEYS[name];
    const environmentValue = environmentName ? process.env[environmentName]?.trim() : undefined;
    if (environmentValue) {
      return environmentValue;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      return undefined;
    }

    const encrypted = this.readEncrypted()[name];
    if (!encrypted) {
      return undefined;
    }

    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64')).trim() || undefined;
    } catch {
      return undefined;
    }
  }

  has(name: SecretName): boolean {
    return Boolean(this.get(name));
  }

  setMany(updates: Partial<Record<SecretName, string | undefined>>): void {
    const actionable = Object.entries(updates).filter(([, value]) => value !== MASKED_SECRET);
    if (actionable.length === 0) {
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is unavailable. Use environment variables instead.');
    }

    const encrypted = this.readEncrypted();
    for (const [rawName, rawValue] of actionable) {
      const name = rawName as SecretName;
      const value = rawValue?.trim();
      if (!value) {
        delete encrypted[name];
        continue;
      }
      encrypted[name] = safeStorage.encryptString(value).toString('base64');
    }
    this.writeEncrypted(encrypted);
  }

  private readEncrypted(): EncryptedSecrets {
    try {
      if (!fs.existsSync(this.secretsPath)) {
        return {};
      }
      return JSON.parse(fs.readFileSync(this.secretsPath, 'utf8')) as EncryptedSecrets;
    } catch {
      return {};
    }
  }

  private writeEncrypted(secrets: EncryptedSecrets): void {
    const directory = path.dirname(this.secretsPath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    fs.chmodSync(this.secretsPath, 0o600);
  }
}
