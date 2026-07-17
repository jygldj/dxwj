/**
 * 道玄文集 - Service Worker
 * ==========================
 * 功能：首次访问后缓存所有静态资源，后续访问秒开
 * 版本：__CACHE_VERSION__  （构建时自动替换）
 * 构建时间：__BUILD_TIME__
 */

const CACHE_NAME = '__CACHE_VERSION__';
const STATIC_ASSETS = [
    './',
    './index.html',
    './index1.html',
    './style.css',
    './cover.css',
    './app.js',
    './articles-index.json'
];

// ============================================================
// 安装：缓存静态资源
// ============================================================
self.addEventListener('install', function(event) {
    console.log('[SW] 安装版本:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] 缓存静态资源...');
            return cache.addAll(STATIC_ASSETS).then(function() {
                console.log('[SW] 静态资源缓存完成');
            });
        }).catch(function(error) {
            // 如果某些文件缓存失败（如 articles-index.json 尚未生成），不影响安装
            console.warn('[SW] 部分资源缓存失败:', error.message);
        })
    );
    // 立即激活，不等待页面关闭
    self.skipWaiting();
});

// ============================================================
// 激活：清理旧缓存
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
            // 立即控制所有页面
            return self.clients.claim();
        })
    );
});

// ============================================================
// 拦截请求：缓存优先 + 网络更新
// ============================================================
self.addEventListener('fetch', function(event) {
    // 只缓存同源请求
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // 跳过非 GET 请求
    if (event.request.method !== 'GET') return;

    // 对文章数据文件使用网络优先（保证内容最新）
    if (url.pathname.includes('articles_v') || url.pathname.includes('articles-index')) {
        event.respondWith(
            fetch(event.request)
                .then(function(response) {
                    // 网络成功时更新缓存
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(function(cache) {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                })
                .catch(function() {
                    // 网络失败时使用缓存
                    return caches.match(event.request);
                })
        );
        return;
    }

    // 其他静态资源：缓存优先
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) return cached;
            
            // 缓存未命中时从网络获取
            return fetch(event.request).then(function(response) {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, clone);
                });
                return response;
            }).catch(function() {
                // 离线时返回基本页面
                if (event.request.mode === 'navigate') {
                    return caches.match('./index1.html');
                }
            });
        })
    );
});
