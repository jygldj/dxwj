/**
 * 道玄文集 - Service Worker
 * ==========================
 * 版本：daoxuan-v1784344402
 * 构建时间：2026-07-18T03:13:22.408Z
 *
 * 当前为极简版：不缓存任何资源，直接放行所有请求。
 * 目的：先确保基础功能在所有设备上正常工作。
 * 后续可按需添加更复杂的缓存策略。
 */

const CACHE_NAME = 'daoxuan-v1784344402';

// 安装时立即激活
self.addEventListener('install', function(event) {
    self.skipWaiting();
});

// 激活时清理所有旧缓存
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(name) {
                    console.log('[SW] 删除缓存:', name);
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// 拦截请求：所有请求直接走网络，不读取缓存
self.addEventListener('fetch', function(event) {
    // 不做处理，让浏览器走默认的网络请求
    return;
});
