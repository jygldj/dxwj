/**
 * 道玄文集 - Service Worker（增强版）
 * ====================================
 * 版本：daoxuan-v1784623575
 * 强制刷新：1
 * 构建时间：2026-07-21T08:46:15.570Z
 *
 * 缓存策略：
 * - 静态资源（HTML/CSS/JS/图片）：安装时缓存，离线可用
 * - 数据文件（articles-*.json）：网络优先，保证内容最新
 * - 所有资源：一旦访问过就加入缓存，离线时自动使用缓存
 *
 * 设计原则：
 * - 安装时不因单个文件失败而中断（逐个缓存，失败跳过）
 * - 数据文件始终以网络为主（保证内容最新）
 * - 缓存自动清理（只保留当前版本）
 */

var CACHE_NAME = 'daoxuan-v1784623575';

// 静态资源清单（不含数据文件）
var STATIC_ASSETS = [
    './',
    './index.html',
    './index1.html',
    './search.html',
    './jianjie.html',
    './style.css',
    './cover.css',
    './app.js',
    './wsf.jpg'
];

// ============================================================
// 安装：逐个缓存静态资源，失败跳过
// ============================================================
self.addEventListener('install', function(e) {
    console.log('[SW] 安装版本:', CACHE_NAME);
    e.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            var promises = STATIC_ASSETS.map(function(url) {
                return fetch(url).then(function(r) {
                    if (r.ok) cache.put(url, r);
                }).catch(function(err) {
                    console.warn('[SW] 跳过:', url);
                });
            });
            return Promise.allSettled(promises);
        })
    );
    self.skipWaiting();
});

// ============================================================
// 激活：清理旧缓存，接管所有页面
// ============================================================
self.addEventListener('activate', function(e) {
    console.log('[SW] 激活版本:', CACHE_NAME);
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// ============================================================
// 拦截请求：区分数据文件和静态资源
// ============================================================
self.addEventListener('fetch', function(e) {
    var url = new URL(e.request.url);
    if (url.origin !== self.location.origin) return;
    if (e.request.method !== 'GET') return;

    var path = url.pathname;

    // ---- 数据文件：网络优先 ----
    if (path.indexOf('articles-') > -1 || path.indexOf('articles_v') > -1) {
        e.respondWith(
            fetch(e.request).then(function(r) {
                if (r.ok) {
                    var clone = r.clone();
                    caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
                }
                return r;
            }).catch(function() {
                return caches.match(e.request);
            })
        );
        return;
    }

    // ---- 图片文件：缓存优先，网络更新 ----
    if (path.indexOf('.jpg') > -1 || path.indexOf('.webp') > -1 || path.indexOf('.png') > -1) {
        e.respondWith(
            caches.match(e.request).then(function(cached) {
                var fetchPromise = fetch(e.request).then(function(r) {
                    if (r.ok) {
                        var clone = r.clone();
                        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
                    }
                    return r;
                });
                return cached || fetchPromise;
            })
        );
        return;
    }

    // ---- 其他静态资源（HTML/CSS/JS）：缓存优先 ----
    e.respondWith(
        caches.match(e.request).then(function(cached) {
            if (cached) return cached;
            return fetch(e.request).then(function(r) {
                if (r && r.status === 200) {
                    var clone = r.clone();
                    caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
                }
                return r;
            }).catch(function() {
                if (e.request.mode === 'navigate') return caches.match('./index1.html');
            });
        })
    );
});
