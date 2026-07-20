import { execSync, spawnSync, exec } from 'child_process';
import { existsSync, readFileSync, mkdirSync, createReadStream, statSync } from 'fs';
import { createServer } from 'https';
import { extname, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import net from 'net';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../..');
const CERTS = resolve(ROOT, 'build/certs');
const CERT = resolve(CERTS, 'localhost.pem');
const KEY = resolve(CERTS, 'localhost-key.pem');
const MIN_NODE = 18;
const args = process.argv.slice(2);
const isDev = args.includes('--dev');
const certsOnly = args.includes('--certs-only');

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < MIN_NODE) {
  console.error(`Node ${MIN_NODE}+ required. Running ${process.versions.node}.`);
  process.exit(1);
}

function mkcertInstalled() {
  try {
    execSync(process.platform === 'win32' ? 'where mkcert' : 'which mkcert', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function certValid() {
  if (!existsSync(CERT)) return false;
  const result = spawnSync('openssl', ['x509', '-noout', '-enddate', '-in', CERT], {
    encoding: 'utf8',
  });
  if (result.status === 0) {
    const expiry = new Date(result.stdout.replace('notAfter=', '').trim());
    return (expiry - Date.now()) / 86400000 > 30;
  }
  const stats = statSync(CERT);
  return (Date.now() - stats.mtimeMs) / 86400000 < 365;
}

function generateCerts() {
  mkdirSync(CERTS, { recursive: true });
  execSync(`mkcert -cert-file "${CERT}" -key-file "${KEY}" localhost 127.0.0.1`, {
    stdio: 'inherit',
    cwd: ROOT,
  });
}

if (!mkcertInstalled()) {
  const install = {
    win32: 'winget install FiloSottile.mkcert',
    darwin: 'brew install mkcert',
    linux: 'https://github.com/FiloSottile/mkcert/releases',
  }[process.platform] || 'https://github.com/FiloSottile/mkcert/releases';
  console.error(`\nmkcert not found. Install it:\n  ${install}\nThen run: npm start\n`);
  process.exit(1);
}

if (!certValid()) {
  console.log('Setting up local HTTPS certs...');
  execSync('mkcert -install', { stdio: 'inherit' });
  generateCerts();
  console.log('Certs ready.\n');
}

if (certsOnly) {
  console.log('Certs ready.');
  process.exit(0);
}

function findFreePort(start = 3000) {
  return new Promise((resolvePort) => {
    const s = net.createServer();
    s.listen(start, () => {
      const p = s.address().port;
      s.close(() => resolvePort(p));
    });
    s.on('error', () => resolvePort(findFreePort(start + 1)));
  });
}

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const { csp } = await import(pathToFileURL(resolve(ROOT, 'config/csp.config.js')).href);
const headers = isDev ? csp.local : csp.production;
console.log(isDev ? 'Development Mode: Relaxed CSP' : 'Production Mode: Strict CSP');

const port = await findFreePort(3040);
const swVersion = Date.now();

createServer({ cert: readFileSync(CERT), key: readFileSync(KEY) }, (req, res) => {
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.url === '/service-worker.js') {
    const sw = readFileSync(resolve(ROOT, 'service-worker.js'), 'utf8').replace(
      '__CACHE_VERSION__',
      isDev ? `dev-${swVersion}` : String(swVersion),
    );
    res.setHeader('Content-Type', 'application/javascript');
    res.end(sw);
    return;
  }

  let filePath = resolve(ROOT, `.${req.url === '/' ? '/index.html' : req.url.split('?')[0]}`);
  if (!existsSync(filePath)) filePath = resolve(ROOT, '404.html');
  res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream');
  createReadStream(filePath).on('error', () => res.end()).pipe(res);
}).listen(port, () => {
  const url = `https://localhost:${port}`;
  console.log(`\n${url}\n`);
  const open = { win32: `start ${url}`, darwin: `open ${url}`, linux: `xdg-open ${url}` };
  const cmd = open[process.platform];
  if (cmd) exec(cmd);
});
