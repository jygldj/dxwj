/**
 * 道玄文集 - Service Worker
 * ==========================
 * 功能：首次访问后缓存静态资源，后续访问秒开
 * 版本：daoxuan-v1784341399  （构建时自动替换）
 * 构建时间：2026-07-18T02:23:19.803Z
 *
 * 缓存策略：
 * - 静态资源（HTML/CSS/JS）：缓存优先，秒开
 * - 数据文件（articles-*.json）：网络优先，保证内容最新
 */

const CACHE_NAME = 'daoxuan-v1784341399';

// 安装时缓存的静态资源（不含数据文件，数据文件使用网络优先策略）
const STATIC_ASSETS = [
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
// 安装：缓存静态资源
// ============================================================
self.addEventListener('install', function(event) {
    console.log('[SW] 安装版本:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            // 逐个缓存，某个失败不影响其他资源
            const cachePromises = STATIC_ASSETS.map(function(url) {
                return cache.add(url).catch(function(err) {
                    console.warn('[SW] 跳过缓存:', url, err.message);
                });
            });
            return Promise.allSettled(cachePromises);
        })
    );
    // 立即激活，不等待页面关闭
    self.skipWaiting();
});

// ============================================================
// 激活：清理旧缓存，接管页面
// ============================================================
self.addEventListener('activate', function(event) {
    console.log('[SW] 激活版本:', CACHE_NAME);
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(name) {
                    if (name !== CACHE_NAME) {
                        console.log('[SW] 删除旧缓存:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// ============================================================
// 拦截请求
// ============================================================
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // 只处理同源请求
    if (url.origin !== self.location.origin) return;
    if (event.request.method !== 'GET') return;

    var pathname = url.pathname;

    // ---- 数据文件：网络优先 ----
    if (pathname.indexOf('articles-') !== -1 || pathname.indexOf('articles_v') !== -1) {
        event.respondWith(
            fetch(event.request).then(function(response) {
                if (response.ok) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(function() {
                return caches.match(event.request);
            })
        );
        return;
    }

    // ---- 静态资源：缓存优先 ---- 
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) return cached;
            return fetch(event.request).then(function(response) {
                if (!response || response.status !== 200) return response;
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, clone);
                });
                return response;
            }).catch(function() {
                // 离线时返回首页
                if (event.request.mode === 'navigate') {
                    return caches.match('./index1.html');
                }
            });
        })
    );
});
