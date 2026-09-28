// 行動 App 設定一致性：離線快取清單、manifest 圖示、各頁 manifest 連結都必須指向存在的檔案
// 執行：node --test tests/pwa.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const exists = f => fs.existsSync(path.join(root, f));

test('Service Worker 快取清單的檔案都存在', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const list = eval(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1]);
  const missing = list.filter(f => f !== './' && !exists(f));
  assert.deepEqual(missing, []);
  // 所有 img/ 內的圖片都要進離線快取，避免離線時破圖
  const imgs = fs.readdirSync(path.join(root, 'img')).map(f => 'img/' + f).filter(f => !f.includes('brand-'));
  assert.deepEqual(imgs.filter(f => !list.includes(f)), []);
});

test('每個頁面都有 manifest、iOS 圖示與 pwa.js，且檔案存在', () => {
  for (const page of ['index.html', 'market.html', 'stall.html', 'board.html', 'kiosk.html', 'admin.html', 'qr.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const man = html.match(/<link rel="manifest" href="([^"]+)">/);
    assert.ok(man, page + ' 缺 manifest');
    assert.ok(exists(man[1]), man[1] + ' 不存在');
    assert.ok(/apple-touch-icon" href="icons\/apple-touch-icon.png"/.test(html), page + ' 缺 iOS 圖示');
    assert.ok(html.includes('<script src="pwa.js"></script>'), page + ' 缺 pwa.js');
    assert.ok(html.includes('viewport-fit=cover'), page + ' 缺瀏海安全區設定');
  }
});

test('manifest 內容與圖示', () => {
  for (const f of fs.readdirSync(root).filter(f => f.startsWith('manifest-'))) {
    const m = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
    assert.ok(m.name && m.short_name && m.start_url && m.display, f);
    assert.ok(exists(m.start_url.replace('./', '')), f + ' start_url 不存在');
    assert.ok(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), f + ' 缺 maskable 圖示（Android）');
    for (const i of m.icons) assert.ok(exists(i.src), i.src);
  }
});
