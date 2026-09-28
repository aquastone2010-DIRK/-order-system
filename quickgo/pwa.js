// 快取GO 行動 App 支援：Service Worker 註冊、安裝提示（Android／iOS）、離線提示、螢幕常亮
(function () {
  'use strict';
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const KEY = 'quickgo_install_dismissed';
  const dismissed = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 7 * 864e5; } catch (e) { return false; } };
  const dismiss = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} };

  function bar(html, onAction) {
    if (document.getElementById('pwaBar')) return;
    const el = document.createElement('div');
    el.id = 'pwaBar'; el.className = 'pwa-bar'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '安裝 App');
    el.innerHTML = `<img src="icons/icon-192.png" alt=""><div class="grow">${html}</div>${onAction ? '<button class="btn pri sm" id="pwaGo">安裝</button>' : ''}<button class="btn sm" id="pwaX" aria-label="關閉">✕</button>`;
    document.body.appendChild(el);
    if (onAction) el.querySelector('#pwaGo').onclick = onAction;
    el.querySelector('#pwaX').onclick = () => { dismiss(); el.remove(); };
  }

  // Android／Chrome／Edge：瀏覽器提供安裝事件
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    if (!dismissed()) bar('<b>安裝快取GO App</b><div class="small muted">加到主畫面，開啟更快、全螢幕使用</div>', async () => {
      deferred.prompt(); await deferred.userChoice; deferred = null; document.getElementById('pwaBar')?.remove();
    });
  });
  window.addEventListener('appinstalled', () => document.getElementById('pwaBar')?.remove());

  // iPhone／iPad：Safari 沒有安裝事件，改顯示操作說明
  if (isIOS && !standalone && !dismissed()) {
    window.addEventListener('load', () => setTimeout(() => bar('<b>加到主畫面當 App 使用</b><div class="small">點瀏覽器的「分享」<span aria-hidden="true">⬆️</span> →「加入主畫面」</div>'), 1500));
  }

  // 離線提示
  function net() {
    let b = document.getElementById('pwaOffline');
    if (navigator.onLine) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'pwaOffline'; b.className = 'pwa-offline'; b.textContent = '⚠️ 目前離線：畫面可瀏覽，但下單與訂單更新需恢復網路'; document.body.prepend(b); }
  }
  window.addEventListener('online', net); window.addEventListener('offline', net);
  window.addEventListener('load', net);

  // 螢幕常亮（攤位平板、叫號電視、取餐站）：iOS 16.4+／Android Chrome 支援；切回畫面時重新取得
  let lock = null, want = false;
  async function acquire() {
    if (!want || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { lock = await navigator.wakeLock.request('screen'); } catch (e) { lock = null; }
  }
  document.addEventListener('visibilitychange', acquire);

  window.QGPWA = {
    standalone, isIOS,
    keepAwake() { want = true; acquire(); ['click', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { if (!lock) acquire(); }, { once: true })); },
  };
})();
