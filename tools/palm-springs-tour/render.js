// Renders frames of the tour with headless Chromium.
// usage: node render.js --v 1 --s 1 --from 0 --to 1800 --out frames/v1 [--frames 0,300,900] [--ui 0]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const v = arg('v', '1'), s = +arg('s', '1'), out = arg('out', 'frames/v' + v), ui = arg('ui', '1'), aa = arg('aa', '4'), step = +arg('step', '1');
const list = arg('frames') ? arg('frames').split(',').map(Number) : null;
const from = +arg('from', '0'), to = +arg('to', '1800');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); });
srv.listen(0, async () => {
  const port = srv.address().port; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
  const p = await b.newPage({ viewport: { width: Math.round(1080 * s), height: Math.round(1920 * s) } });
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 400)); });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  const t0 = Date.now();
  await p.goto(`http://localhost:${port}/index.html?v=${v}&s=${s}&ui=${ui}&aa=${aa}${arg('cam') ? '&cam=' + arg('cam') : ''}${arg('hour') ? '&hour=' + arg('hour') : ''}`);
  await p.waitForFunction('window.ready', null, { timeout: 600000 });
  console.log('scene ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const frames = list || Array.from({ length: Math.ceil((to - from) / step) }, (_, i) => from + i * step);
  let n = 0; const t1 = Date.now();
  for (const f of frames) {
    const file = path.join(out, String(f).padStart(5, '0') + '.jpg');
    if (!list && fs.existsSync(file)) continue;
    await p.evaluate(f => window.renderFrame(f), f);
    await p.screenshot({ path: file, type: 'jpeg', quality: 93 });
    if (++n % 25 === 0 || list) console.log('frame', f, ((Date.now() - t1) / n / 1000).toFixed(2), 's/frame');
  }
  await b.close(); srv.close();
});
