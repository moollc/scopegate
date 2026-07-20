import { csp } from '../../config/csp.config.js';
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  cpSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'fs';
import { resolve, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../..');
const DEPLOY = resolve(ROOT, 'pipeline/deploy');

if (existsSync(DEPLOY)) rmSync(DEPLOY, { recursive: true, force: true });
mkdirSync(DEPLOY, { recursive: true });

const lines = ['/*'];
Object.entries(csp.production).forEach(([k, v]) => lines.push(`  ${k}: ${v}`));
writeFileSync(resolve(DEPLOY, '_headers'), lines.join('\n'));

const allowedExtensions = ['.html', '.css', '.js', '.json', '.png', '.svg', '.ico', '.ttf', '.webp'];
const excludedFiles = new Set(['package.json', 'package-lock.json']);

for (const file of readdirSync(ROOT)) {
  const ext = extname(file).toLowerCase();
  if (allowedExtensions.includes(ext) && !excludedFiles.has(file) && file !== 'service-worker.js') {
    cpSync(resolve(ROOT, file), resolve(DEPLOY, file));
  }
}

const sourceDir = resolve(ROOT, 'source');
if (existsSync(sourceDir)) {
  cpSync(sourceDir, resolve(DEPLOY, 'source'), { recursive: true });
}

function hashTree(dir) {
  const h = createHash('sha256');
  function walk(d) {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) walk(p);
      else h.update(readFileSync(p));
    }
  }
  if (existsSync(dir)) walk(dir);
  return h.digest('hex').slice(0, 12);
}

const version = hashTree(resolve(DEPLOY, 'source')) || Date.now().toString(36);
const swSrc = readFileSync(resolve(ROOT, 'service-worker.js'), 'utf8');
writeFileSync(resolve(DEPLOY, 'service-worker.js'), swSrc.replaceAll('__CACHE_VERSION__', version));

console.log(`build-web: deployed to ${DEPLOY} (cache ${version})`);
