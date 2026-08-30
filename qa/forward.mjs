/**
 * A local stand-in for the Supabase host.
 *
 * The sandbox this runs in reaches the internet only through an HTTP proxy, and
 * the browser Playwright drives cannot use it — so a page pointed straight at
 * `*.supabase.co` gets a connection reset and every check becomes a check of
 * the offline state. This listens on localhost, forwards each request through
 * `curl` (which does honour the proxy) and hands the answer back, so the app
 * under test talks to a real database.
 *
 *   node qa/forward.mjs &
 *   EXPO_PUBLIC_SUPABASE_URL=http://localhost:3200 npm run web
 *
 * It is test scaffolding. Nothing in the app knows it exists, and it never runs
 * anywhere but here.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, readFileSync as read } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const UPSTREAM = env.EXPO_PUBLIC_SUPABASE_URL;
if (!UPSTREAM) throw new Error('EXPO_PUBLIC_SUPABASE_URL is not in .env');

const PORT = Number(process.env.QA_FORWARD_PORT ?? 3200);

createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    // Headers on stdout, body to a file. Splitting one stream on a blank line
    // sounds simpler and is not: the proxy answers CONNECT with its own
    // "HTTP/1.1 200 Connection Established" block first, so the first split
    // lands in the wrong place and the whole response arrives as the body.
    const bodyFile = join(tmpdir(), `xl-forward-${randomUUID()}`);
    const args = [
      '-s', '-D', '-', '-o', bodyFile, '--compressed',
      '-X', req.method,
      UPSTREAM + req.url,
    ];
    for (const [k, v] of Object.entries(req.headers)) {
      // `host` would name localhost, and the hop-by-hop headers are curl's to set.
      if (['host', 'connection', 'content-length', 'accept-encoding'].includes(k)) continue;
      args.push('-H', `${k}: ${Array.isArray(v) ? v.join(',') : v}`);
    }
    if (body.length) args.push('--data-binary', '@-');

    const curl = spawn('curl', args);
    const head = [];
    curl.stdout.on('data', (c) => head.push(c));
    curl.on('close', () => {
      let body = Buffer.alloc(0);
      try {
        body = read(bodyFile);
      } catch {
        // Nothing came back; the status below says so.
      }
      rmSync(bodyFile, { force: true });
      const lines = Buffer.concat(head).toString('utf8').split(/\r?\n/);
      // The last status line wins, so a proxy's own 200 does not become the
      // answer the page sees.
      const statusLines = lines.filter((l) => /^HTTP\//.test(l));
      const status = Number(statusLines[statusLines.length - 1]?.split(' ')[1] || 502);
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
        'access-control-expose-headers': '*',
      };
      for (const line of lines) {
        const i = line.indexOf(':');
        if (i < 1 || /^HTTP\//.test(line)) continue;
        const name = line.slice(0, i).toLowerCase();
        if (['transfer-encoding', 'content-encoding', 'content-length', 'connection'].includes(name)) continue;
        headers[name] = line.slice(i + 1).trim();
      }
      res.writeHead(status, headers);
      res.end(body);
    });
    if (body.length) {
      curl.stdin.write(body);
      curl.stdin.end();
    }
  });
}).listen(PORT, () => console.log(`forwarding localhost:${PORT} → ${UPSTREAM}`));
