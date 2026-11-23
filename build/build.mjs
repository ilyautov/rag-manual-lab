// Сборка книги: Markdown → pandoc → HTML → PDF через headless Chrome (CDP).
// Числа в тексте подставляются из build/numbers.json, который печатает код лаборатории.
// Запуск из корня книги: node build/build.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'out');
const book = JSON.parse(readFileSync(join(ROOT, 'book.json'), 'utf8'));
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Проверка инструментов до работы: без неё падение выглядит сырым ENOENT без пояснений. */
function preflight() {
  const missing = [];
  for (const tool of ['pandoc', 'pdftotext', 'pdffonts']) {
    try { execFileSync('which', [tool], { stdio: 'ignore' }); } catch { missing.push(tool); }
  }
  try { execFileSync(CHROME, ['--version'], { stdio: 'ignore' }); }
  catch { missing.push('Google Chrome (путь задайте переменной CHROME_PATH)'); }
  if (missing.length) {
    throw new Error(`Не найдены инструменты сборки: ${missing.join(', ')}.` +
      ' Нужны pandoc, poppler-utils (команды pdftotext и pdffonts) и Google Chrome;' +
      ' путь к Chrome на Linux и Windows задаётся переменной окружения CHROME_PATH.');
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function loadNumbers() {
  execFileSync(process.execPath, [join(ROOT, 'scripts/numbers.ts')], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  return flatten(JSON.parse(readFileSync(join(ROOT, 'build/numbers.json'), 'utf8')));
}

function renderChapter(file, numbers) {
  let md = readFileSync(join(ROOT, 'chapters', file), 'utf8');
  const missing = new Set();
  md = md.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (!(key in numbers)) { missing.add(key); return `??${key}??`; }
    return String(numbers[key]);
  });
  if (missing.size) throw new Error(`${file}: нет чисел ${[...missing].join(', ')}`);
  const html = execFileSync('pandoc', ['-f', 'markdown+fenced_divs+header_attributes+pipe_tables+raw_html-implicit_figures-tex_math_dollars',
    '-t', 'html5', '--wrap=none', `--id-prefix=${file.replace(/\W/g, '')}-`], { input: md, encoding: 'utf8' });
  return `<section class="chapter">\n${html}\n</section>`;
}

function headingsOf(html) {
  const list = [];
  const re = /<h1([^>]*)>([\s\S]*?)<\/h1>/g;
  let m;
  while ((m = re.exec(html))) {
    if (/class="[^"]*\bnotoc\b/.test(m[1])) continue;
    const kicker = (m[1].match(/data-kicker="([^"]*)"/) || [])[1] || '';
    const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    list.push({ text, kicker });
  }
  return list;
}

function cover() {
  return `<div class="cover">
  <div class="eyebrow">${esc(book.eyebrow)}</div>
  <h1 class="cover-title notoc">${book.title.split('\n').map(esc).join('<br>')}</h1>
  <div class="subtitle">${esc(book.subtitle)}</div>
  <div class="motif">${book.coverSvg ?? ''}</div>
  <div class="meta"><div class="bar"></div>${esc(book.author)} · РЕДАКЦИЯ ${esc(book.edition)}</div>
</div>`;
}

function toc(heads, pages) {
  const items = heads.map((h, i) => `<li class="l1"><span class="t">${h.kicker ? esc(h.kicker.split('/')[0].trim()) + ' · ' : ''}${esc(h.text)}</span><span class="dots"></span><span class="p">${pages?.[i] ?? '00'}</span></li>`).join('\n');
  return `<div class="toc"><h1 class="notoc">Содержание</h1><ol>${items}</ol></div>`;
}

function colophon() {
  const rows = [['Автор', book.author], ['Редакция', book.edition], ['Контакт', book.contact], ['Условия', book.license]]
    .map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('');
  return `<section class="colophon"><h1 class="notoc" data-kicker="ВЫХОДНЫЕ СВЕДЕНИЯ">Об издании</h1>
<table><thead><tr><th>Сведение</th><th>Значение</th></tr></thead><tbody>${rows}</tbody></table>
<p class="small">${esc(book.copyright)}</p>
<p class="small">${esc(book.changes ?? '')}</p></section>`;
}

function page(heads, pages, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(book.title.replace('\n', ' '))}</title>
<link rel="stylesheet" href="${pathToFileURL(join(ROOT, 'build/style.css'))}"></head>
<body>${cover()}${toc(heads, pages)}${body}${colophon()}</body></html>`;
}

// ---------- minimal CDP client ----------
async function printPdf(htmlPath, pdfPath) {
  const profile = mkdtempSync(join(tmpdir(), 'book-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const wsUrl = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('Chrome не ответил')), 20000);
      chrome.stderr.on('data', (d) => {
        buf += d;
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(t); res(m[1]); }
      });
    });
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    const waiters = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method) {
        for (const w of [...waiters]) if (w.method === msg.method) { waiters.splice(waiters.indexOf(w), 1); w.res(msg.params); }
      }
    };
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
      const msgId = ++id;
      pending.set(msgId, { res, rej });
      ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const once = (method) => new Promise((res) => waiters.push({ method, res }));
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: pathToFileURL(htmlPath).href }, sessionId);
    await loaded;
    await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true }, sessionId);
    const footer = `<div style="width:100%;font-size:7pt;font-family:Helvetica,Arial,sans-serif;color:#6B706C;padding:0 20mm;display:flex;justify-content:space-between;"><span>${esc(book.footer)}</span><span class="pageNumber"></span></div>`;
    const { data } = await send('Page.printToPDF', {
      printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: '<div></div>', footerTemplate: footer,
    }, sessionId);
    writeFileSync(pdfPath, Buffer.from(data, 'base64'));
    ws.close();
  } finally {
    const exited = new Promise((res) => chrome.once('exit', res));
    chrome.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

function pageTexts(pdf) {
  const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return text.split('\f');
}

function markerPages(count, texts) {
  return Array.from({ length: count }, (_, i) => {
    const p = texts.findIndex((t) => t.includes(`@@CH${i}@@`));
    if (p < 0) throw new Error(`Не найдена страница главы №${i + 1}`);
    return p + 1;
  });
}

async function main() {
  preflight();
  mkdirSync(OUT, { recursive: true });
  const numbers = loadNumbers();
  const chapters = book.chapters.map((f) => renderChapter(f, numbers));
  const body = chapters.join('\n');
  const marked = chapters.map((c, i) => c.replace('<section class="chapter">',
    `<section class="chapter"><span class="mk">@@CH${i}@@</span>`)).join('\n');
  const heads = headingsOf(body);
  if (heads.length !== chapters.length) throw new Error(`В каждой главе должен быть ровно один h1: ${heads.length} на ${chapters.length}`);
  const htmlPath = join(ROOT, 'build', 'book.html');
  const pdfPath = join(OUT, book.pdfName);

  writeFileSync(htmlPath, page(heads, null, marked));
  await printPdf(htmlPath, pdfPath);
  const pages = markerPages(chapters.length, pageTexts(pdfPath));

  writeFileSync(htmlPath, page(heads, pages, body));
  await printPdf(htmlPath, pdfPath);
  const texts = pageTexts(pdfPath);
  const norm = (s) => s.replace(/\s+/g, ' ');
  heads.forEach((h, i) => {
    if (!norm(texts[pages[i] - 1]).includes(norm(h.text))) throw new Error(`Глава «${h.text}» уехала со страницы ${pages[i]}`);
  });

  const fonts = execFileSync('pdffonts', [pdfPath], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean);
  const unembedded = fonts.filter((l) => / no +(yes|no) +(yes|no) +\d+ +\d+$/.test(l) && !/Helvetica|Arial/.test(l));
  if (unembedded.length) throw new Error('Невстроенные шрифты:\n' + unembedded.join('\n'));
  if (/\?\?[\w.]+\?\?/.test(texts.join(''))) throw new Error('В PDF остались неподставленные значения');
  console.log(`${pdfPath}\n${texts.filter((t) => t.trim()).length} страниц; главы на страницах: ${pages.join(', ')}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
