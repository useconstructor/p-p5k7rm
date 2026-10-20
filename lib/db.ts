import 'server-only';
import { createClient, type Client } from '@libsql/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
let client: Client;
let migration: Promise<void> | undefined;
export async function getDb() {
  if (!process.env.TURSO_DATABASE_URL) throw new Error('Database configuration missing');
  client ??= createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'number' });
  migration ??= readFile(path.join(process.cwd(), 'migrations/001_products.sql'), 'utf8').then(sql => client.executeMultiple(sql)).catch(e => { migration = undefined; throw e; });
  await migration;
  return client;
}
