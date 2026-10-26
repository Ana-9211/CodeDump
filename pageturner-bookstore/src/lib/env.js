// Loads .env for plain Node scripts (Next.js loads it by itself for the web app).
import fs from 'node:fs';
import path from 'node:path';

export function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.resolve(process.cwd(), name);
    if (fs.existsSync(file)) {
      try { process.loadEnvFile(file); } catch { /* ignore malformed file */ }
    }
  }
}
