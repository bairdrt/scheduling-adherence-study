/**
 * WHERE A KEY COMES FROM, ONE LOADER FOR EVERY ADAPTER. Order: the environment, then var/.env (git-ignored KEY=VALUE
 * lines), then, only where the adapter names one, a macOS keychain item read the way Winnie reads it
 * (harness/src/shared/keychain.ts). var/.env exists because the keychain refuses a non-interactive read from an agent
 * session (security exit 36, "User interaction is not allowed", 2026-11-05); Bob writes the file once from his own shell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keychainSecret } from '../harness/src/shared/keychain.js';

export const DOTENV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'var', '.env');

/** One name from var/.env (or another file, for tests), undefined when absent or empty. */
export function dotenvValue(name: string, file = DOTENV): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[1] === name && m[2]) return m[2].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

export type KeyResult = { ok: true; key: string; from: string } | { ok: false; why: string };

/** The key named `name`, or the exact reason there is none. */
export function apiKeyFor(name: string, opts: { keychainItem?: string; file?: string } = {}): KeyResult {
  const env = process.env[name];
  if (env) return { ok: true, key: env, from: name };
  const dot = dotenvValue(name, opts.file);
  if (dot) return { ok: true, key: dot, from: 'var/.env' };
  if (!opts.keychainItem) return { ok: false, why: `${name} is not set and var/.env has none` };
  try {
    return { ok: true, key: keychainSecret(opts.keychainItem), from: `keychain:${opts.keychainItem}` };
  } catch (e) {
    return { ok: false, why: `${name} is not set, var/.env has none, and ${(e as Error).message}` };
  }
}
