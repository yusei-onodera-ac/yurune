// 記事と提出用の図を、SVG で書き、Chrome（ヘッドレス）で PNG にする。
// 使い方: node docs/diagrams/build.js   （Chrome と Node.js 24 が要る。フォントは Google Fonts の Noto Sans JP）
// 色は、アプリの画面と同じ（lp/template.html、src/main/webapp/css/yurune.css）。
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9418;
const SCALE = 2;

const INK = '#1D2326';
const SUB = '#69757B';
const LINE = '#D5DDDE';
const BG = '#F2F4F4';
const ACCENT = '#2E8C87';
const ACCENT_SOFT = '#DDEFED';
const GRAY_DOT = '#8DA09E';
const FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function text(x, y, size, fill, content, options = {}) {
  const weight = options.weight || 400;
  const anchor = options.anchor || 'start';
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${esc(content)}</text>`;
}

function lines(x, y, size, fill, rows, lineHeight, options = {}) {
  return rows.map((row, index) => text(x, y + index * lineHeight, size, fill, row, options)).join('');
}

function rect(x, y, w, h, fill, stroke, strokeWidth = 1.5, radius = 6) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke || 'none'}" stroke-width="${strokeWidth}"/>`;
}

function arrow(x1, y1, x2, y2, color = SUB) {
  const dx = Math.sign(x2 - x1);
  const head = `<path d="M ${x2} ${y2} l ${-dx * 9} -5 l 0 10 z" fill="${color}"/>`;
  const tail = `<path d="M ${x1} ${y1} l ${dx * 9} -5 l 0 10 z" fill="${color}"/>`;
  return `<line x1="${x1 + dx * 8}" y1="${y1}" x2="${x2 - dx * 8}" y2="${y2}" stroke="${color}" stroke-width="1.5"/>${head}${tail}`;
}

function svgWrap(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`
    + `<rect width="${width}" height="${height}" fill="#FFFFFF"/>${body}</svg>`;
}

// ---- 1 システム構成図 ----
function arrowTo(x1, y1, x2, y2, color = SUB) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const hx = x2 - Math.cos(angle) * 9;
  const hy = y2 - Math.sin(angle) * 9;
  const px = Math.cos(angle + Math.PI / 2) * 5;
  const py = Math.sin(angle + Math.PI / 2) * 5;
  return `<line x1="${x1}" y1="${y1}" x2="${hx}" y2="${hy}" stroke="${color}" stroke-width="1.6"/>`
    + `<path d="M ${x2} ${y2} L ${hx + px} ${hy + py} L ${hx - px} ${hy - py} z" fill="${color}"/>`;
}

// 見出しと、数行の説明を持つ箱。高さは行数から決める
function boxHeight(rowCount) {
  return 51 + (rowCount - 1) * 21 + 16;
}

function card(x, y, w, title, rows, options = {}) {
  const h = options.height || boxHeight(rows.length);
  let s = rect(x, y, w, h, options.fill || BG, options.stroke || null, 1.5);
  if (options.marker) s += rect(x, y, 5, h, ACCENT, null, 0, 2);
  s += text(x + 18, y + 27, 16, INK, title, { weight: 700 });
  if (options.note) s += text(x + w - 14, y + 27, 13.5, SUB, options.note, { anchor: 'end' });
  s += lines(x + 18, y + 51, 14, SUB, rows, 21);
  return s;
}

function architecture() {
  const W = 1500;
  const H = 1152;
  let s = '';
  s += text(32, 50, 27, INK, 'ゆるね  システム構成図', { weight: 700 });
  s += text(32, 82, 16, SUB, '夜の制御、会話、週の見直しは、Cloud Run の 1 つのアプリで動きます。公開と運用の仕組みも、同じ Google Cloud にあります');

  const top = 116;
  const panelH = 752;
  const bottom = top + panelH;

  // 左: 利用者の端末
  s += rect(32, top, 252, panelH, '#FFFFFF', LINE);
  s += text(50, top + 34, 18, INK, '利用者の端末', { weight: 700 });
  s += text(50, top + 58, 14, SUB, 'スマホ・PC のブラウザ（PWA）');
  const device = [
    ['画面', ['JSP と JavaScript。', 'ぽてねの最新の返事を、', '1 行だけ出す']],
    ['環境音', ['雨・波・森を、端末の中で', '合成する（Web Audio）。', '音源のファイルは使わない']],
    ['声を文字にする', ['ブラウザの音声認識。', '音声は、このアプリの', 'サーバーに送らない']],
    ['ぽてねの声', ['サーバーでつくった声を、', '環境音と同じ出力で', '流す']],
  ];
  device.forEach((item, index) => {
    s += card(48, top + 80 + index * 156, 220, item[0], item[1], { height: 142 });
  });

  // 中: Cloud Run のアプリ
  s += rect(352, top, 576, panelH, '#FFFFFF', LINE);
  s += text(372, top + 34, 18, INK, 'アプリ（Cloud Run・東京）', { weight: 700 });
  s += text(372, top + 58, 14, SUB, 'Java 21 + Tomcat 10.1。1〜3 台、1 台あたり同時 40 リクエスト');
  const app = [
    ['入口と層', ['Filter: 認証、CSRF、セキュリティヘッダー、トレース ID', 'Controller → Service → Repository（層に分けた作り）'], false],
    ['夜の制御', ['観測 → 判断 → 検証 → 実行 → 記録 のループ。', 'Gemini がツール呼び出しで操作を選び、', '選んだ理由を 1 行つけて記録する'], true],
    ['会話', ['発言を検査してから Gemini に聞き、返事も検査して、', '1 行の文と、ぽてねの声で返す'], true],
    ['週の見直し', ['標準の夜と変えた夜を、符号反転検定で比べる。', '試す選択肢はトンプソン抽出。AI は使わない'], false],
    ['固定の枠（コード）', [
      '入力: 伏せ字 → 指示の無視 → 病気や薬（決まった文） → Model Armor',
      '出力: 効き目の断定、睡眠状態の推測、個人情報などを止める',
      'ToolGuard: 許可リスト、引数の範囲、音量の上限と上げ幅',
      '呼び出し: 20 秒間隔、1 日 2000 回、ブレーカー、停止スイッチ',
      '認証と画面: ログイン試行の制限、CSRF、CSP、利用者ごとの分離',
    ], false],
    ['判断の記録とログ', ['経路（規則か Gemini か）と理由を残す。会話の本文は含めない。', '出してよい項目だけの構造化ログ。トレース ID で、夜 1 回をつなぐ'], false],
  ];
  let y = top + 80;
  app.forEach((item) => {
    const h = boxHeight(item[1].length);
    s += card(368, y, 544, item[0], item[1], { marker: item[2] });
    y += h + 8;
  });

  // 右: つないでいるサービス
  s += rect(984, top, 484, panelH, '#FFFFFF', LINE);
  s += text(1004, top + 34, 18, INK, 'つないでいるサービス', { weight: 700 });
  s += text(1004, top + 58, 14, SUB, 'Google Cloud。矢印は、呼び出しの向き');
  const groups = [
    ['AI と検査', top + 94, [
      ['Gemini API', '', ['夜の判断（ツール呼び出し）と会話'], true, 'out'],
      ['Model Armor', '米国', ['入力と返事の検査（伏せ字にした文だけ）'], false, 'out'],
      ['Cloud Text-to-Speech', '', ['ぽてねの声をつくる（返事の文だけ送る）'], false, 'out'],
    ]],
    ['データと認証', top + 338, [
      ['Firestore', '東京', ['利用者ごとに保存。書き込みはサーバーだけ'], false, 'out'],
      ['Firebase Authentication', '', ['メールとパスワード、メール確認'], false, 'out'],
      ['Secret Manager', '', ['Gemini のキー。サービスアカウントだけが読める'], false, 'in'],
    ]],
    ['運用', top + 582, [
      ['Cloud Logging・Monitoring', '', ['構造化ログ（30 日）から、メトリクス 7 つ、', 'ダッシュボード、アラート 3 つ'], false, 'out'],
      ['アップタイム確認・予算', '', ['/ready を 6 か所から 1 分ごと。予算アラート付き'], false, 'in'],
    ]],
  ];
  groups.forEach((group) => {
    s += text(1004, group[1], 14.5, ACCENT, group[0], { weight: 700 });
    let gy = group[1] + 14;
    group[2].forEach((item) => {
      const h = item[2].length === 2 ? 76 : 62;
      s += rect(1000, gy, 452, h, item[3] ? ACCENT_SOFT : BG, item[3] ? ACCENT : null, 1.5);
      s += text(1018, gy + 26, 15.5, INK, item[0], { weight: 700 });
      if (item[1]) s += text(1438, gy + 26, 13.5, SUB, item[1], { anchor: 'end' });
      s += lines(1018, gy + 49, 14, SUB, item[2], 21);
      const mid = gy + h / 2;
      s += item[4] === 'out' ? arrowTo(928, mid, 1000, mid) : arrowTo(1000, mid, 928, mid);
      gy += h + 8;
    });
  });

  // 端末とアプリのあいだ
  s += arrowTo(286, 300, 350, 300);
  s += text(318, 288, 13, SUB, '観測の数値', { anchor: 'middle' });
  s += text(318, 322, 13, SUB, '発言の文字', { anchor: 'middle' });
  s += arrowTo(350, 392, 286, 392);
  s += text(318, 380, 13, SUB, '音の状態', { anchor: 'middle' });
  s += text(318, 414, 13, SUB, '返事と声', { anchor: 'middle' });

  // 下: 紹介ページ
  const lower = bottom + 32;
  s += arrowTo(158, bottom, 158, lower);
  s += text(170, bottom + 21, 13, SUB, '紹介ページを開く');
  s += rect(32, lower, 252, 184, '#FFFFFF', LINE);
  s += text(50, lower + 34, 18, INK, 'Firebase Hosting', { weight: 700 });
  s += lines(50, lower + 62, 14, SUB, ['紹介ページと、制作者の', 'ページ（HTML と画像）。', 'CSP などのヘッダー付き'], 21);
  s += text(50, lower + 150, 13.5, SUB, 'yurune-1756f.web.app');

  // 下: 公開の流れ
  s += rect(352, lower, 1116, 184, '#FFFFFF', LINE);
  s += text(372, lower + 34, 18, INK, '公開（デプロイ）の流れ', { weight: 700 });
  s += text(372, lower + 56, 14, SUB, '手元から gcloud run deploy --source で実行（deploy/deploy.ps1）');
  const pipeline = [
    [368, 'ソース', ['アプリ、Dockerfile、', '設定のファイル']],
    [626, 'Cloud Build', ['Dockerfile から', 'イメージをつくる', '（版を固定、非 root）']],
    [884, 'Artifact Registry', ['イメージを保存。', '脆弱性スキャン付き']],
  ];
  const cardY = lower + 72;
  pipeline.forEach((item) => {
    s += card(item[0], cardY, 210, item[1], item[2], { height: 104 });
  });
  s += arrowTo(580, cardY + 52, 624, cardY + 52);
  s += arrowTo(838, cardY + 52, 882, cardY + 52);
  s += card(1112, cardY, 340, '実行用サービスアカウント', ['Firestore、ログとトレース、', 'Model Armor、Gemini のキーの読み取りだけ。', 'Owner や Editor は付けない'], { height: 104 });
  s += arrowTo(906, cardY, 906, bottom);
  s += text(918, lower + 36, 13, SUB, '新しいリビジョンに切り替え');

  // 凡例
  s += rect(32, 1108, 5, 24, ACCENT, null, 0, 2);
  s += text(48, 1126, 14, SUB, '青緑の印は、Gemini に聞く所です。ほかは、コードだけで決まります。');
  return svgWrap(W, H, s);
}

// ---- 2 夜のくり返しと、週の見直し ----
function cycle() {
  const W = 1200;
  const H = 440;
  let s = '';
  s += text(32, 50, 25, INK, '夜のくり返しと、週の見直し', { weight: 700 });
  s += text(32, 80, 16, SUB, '丸は 1 夜です。最初の 7 夜で基準をとり、そのあとは、3 夜に 1 夜を標準の夜にします。');

  const x0 = 70;
  const step = 38.5;
  const cy = 196;
  const r = 12;
  const nights = [];
  for (let night = 1; night <= 28; night++) {
    let kind = 'standard';
    if (night > 7) kind = ((night - 8) % 3 === 2) ? 'standard' : 'changed';
    nights.push({ night, kind, x: x0 + (night - 1) * step });
  }

  // 週の区切りと、見直しの日
  for (let week = 0; week < 4; week++) {
    const left = x0 + week * 7 * step - step / 2;
    const right = left + 7 * step;
    s += `<rect x="${left + 3}" y="${cy - 52}" width="${right - left - 6}" height="104" rx="6" fill="${BG}"/>`;
    s += text((left + right) / 2, cy + 80, 14, SUB, `第${week + 1}週`, { anchor: 'middle' });
  }
  [14, 21, 28].forEach((night) => {
    const x = x0 + (night - 1) * step;
    s += `<line x1="${x}" y1="${cy - 52}" x2="${x}" y2="${cy - 70}" stroke="${ACCENT}" stroke-width="2"/>`;
    s += text(x, cy - 80, 14.5, ACCENT, '見直し', { anchor: 'middle', weight: 700 });
  });

  nights.forEach((n) => {
    if (n.kind === 'standard') {
      s += `<circle cx="${n.x}" cy="${cy}" r="${r}" fill="${GRAY_DOT}"/>`;
    } else {
      s += `<circle cx="${n.x}" cy="${cy}" r="${r - 1.5}" fill="#FFFFFF" stroke="${ACCENT}" stroke-width="3"/>`;
    }
  });

  // 基準の括弧
  const bx1 = x0 - r;
  const bx2 = x0 + 6 * step + r;
  s += `<path d="M ${bx1} ${cy + 108} v 8 h ${bx2 - bx1} v -8" fill="none" stroke="${SUB}" stroke-width="1.5"/>`;
  s += text((bx1 + bx2) / 2, cy + 142, 15, INK, '基準', { anchor: 'middle', weight: 700 });
  s += text((bx1 + bx2) / 2, cy + 166, 13.5, SUB, '標準のすごし方で、夜のようすを見る', { anchor: 'middle' });
  const cx1 = x0 + 7 * step - r;
  const cx2 = x0 + 27 * step + r;
  s += `<path d="M ${cx1} ${cy + 108} v 8 h ${cx2 - cx1} v -8" fill="none" stroke="${SUB}" stroke-width="1.5"/>`;
  s += text((cx1 + cx2) / 2, cy + 142, 15, INK, '3 夜に 1 夜が標準。ほかの夜は、音か、音量の下げ方を、1 つだけ変える', { anchor: 'middle', weight: 700 });
  s += text((cx1 + cx2) / 2, cy + 166, 13.5, SUB, '見直しの日に、変えた夜を、日の近い標準の夜と組にして比べ、よく使う・外す・戻す・もう少し見る、を決める', { anchor: 'middle' });

  // 凡例
  s += `<circle cx="40" cy="${H - 22}" r="8" fill="${GRAY_DOT}"/>`;
  s += text(56, H - 17, 14, SUB, '標準の夜');
  s += `<circle cx="150" cy="${H - 22}" r="7" fill="#FFFFFF" stroke="${ACCENT}" stroke-width="3"/>`;
  s += text(166, H - 17, 14, SUB, '少し変えた夜');
  return svgWrap(W, H, s);
}

const FIGURES = [
  { name: 'architecture', svg: architecture(), width: 1500, height: 1152 },
  { name: 'cycle', svg: cycle(), width: 1200, height: 440 },
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

async function main() {
  const pages = [];
  for (const figure of FIGURES) {
    fs.writeFileSync(path.join(OUT_DIR, `${figure.name}.svg`), figure.svg);
    const html = `<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet"><style>html,body{margin:0;background:#fff}</style>${figure.svg}`;
    const htmlPath = path.join(OUT_DIR, `${figure.name}.render.html`);
    fs.writeFileSync(htmlPath, html);
    pages.push({ ...figure, htmlPath });
  }
  const chrome = spawn(CHROME_PATH, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${process.env.TEMP}\\yurune-diagrams-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
  let targets = [];
  for (let attempt = 0; attempt < 40 && targets.length === 0; attempt++) {
    try { targets = await fetchJson(`http://localhost:${DEBUG_PORT}/json`); } catch (error) { await sleep(250); }
  }
  const socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => { socket.onopen = resolve; });
  let nextId = 0;
  const waiting = new Map();
  socket.onmessage = (message) => {
    const payload = JSON.parse(message.data);
    if (payload.id && waiting.has(payload.id)) { waiting.get(payload.id)(payload); waiting.delete(payload.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++nextId;
    waiting.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  for (const page of pages) {
    await send('Emulation.setDeviceMetricsOverride', { width: page.width, height: page.height, deviceScaleFactor: SCALE, mobile: false });
    await send('Page.navigate', { url: 'file:///' + page.htmlPath.replace(/\\/g, '/') });
    await sleep(2500);
    await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => document.fonts.size)', awaitPromise: true, returnByValue: true });
    await sleep(500);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT_DIR, `${page.name}.png`), Buffer.from(shot.result.data, 'base64'));
    fs.rmSync(page.htmlPath);
    console.log(`saved ${page.name}.png`);
  }
  chrome.kill();
  process.exit(0);
}

main().catch((error) => { console.log('FAILED', error); process.exit(1); });
