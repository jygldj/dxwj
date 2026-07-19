// 道玄文集 - 全文搜索（极简版）
var allArticles = [];
var currentResults = [];
var currentIdx = -1;
var loaded = false;

// 带重试的 XHR 加载（每次重试使用不同 URL 彻底绕过缓存）
function get(url, callback) {
    var retries = 0;
    var sep = url.indexOf('?') > -1 ? '&' : '?';
    function attempt() {
        var xhr = new XMLHttpRequest();
        var ts = Date.now() + '_' + Math.floor(Math.random() * 100000);
        xhr.open('GET', url + sep + '_t=' + ts, true);
        xhr.timeout = 10000;
        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) callback(null, xhr.responseText);
            else if (retries < 2) { retries++; setTimeout(attempt, 1000); }
            else callback(new Error('HTTP ' + xhr.status));
        };
        xhr.onerror = function() {
            if (retries < 2) { retries++; setTimeout(attempt, 1000); }
            else callback(new Error('无法连接到服务器'));
        };
        xhr.ontimeout = function() {
            if (retries < 2) { retries++; setTimeout(attempt, 1000); }
            else callback(new Error('连接超时'));
        };
        xhr.send();
    }
    attempt();
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 告知 SW 不要拦截本页面的请求
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ bypass: true, page: 'search' });
    }
    // 随机化参数彻底绕过 SW/浏览器缓存
    function rnd() { return Date.now() + '_' + Math.random().toString(36).substring(2, 8); }
    // 先加载索引
    get('articles-index.json?' + rnd(), function(err, text) {
        if (err) {
            document.getElementById('msg').innerHTML = '😅 文章打了个盹儿<br><small>点"搜索"按钮或下拉刷新重试</small>';
            return;
        }
        try {
            var idx = JSON.parse(text);
            loadAllVolumes(idx, function() {
                var stats = {'诗':0,'词':0,'散文':0,'其它':0};
                for (var i = 0; i < allArticles.length; i++) {
                    var c = allArticles[i].category;
                    if (stats[c] !== undefined) stats[c]++; else stats['其它']++;
                }
                document.getElementById('msg').innerHTML =
                    '共 ' + allArticles.length + ' 篇文章<br>' +
                    '诗 ' + stats['诗'] + ' 篇 · 词 ' + stats['词'] + ' 篇 · 散文 ' + stats['散文'] + ' 篇 · 其他 ' + stats['其它'] + ' 篇';
                loaded = true;
                // 支持 ?q=xxx
                var p = new URLSearchParams(window.location.search);
                var q = p.get('q');
                if (q) { document.getElementById('q').value = q; doSearch(); }
            });
        } catch(e) {
            document.getElementById('msg').innerHTML = '😅 数据解析出错<br><small>请刷新重试</small>';
        }
    });
    // 回车搜索
    document.getElementById('q').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
    });
});

// 加载所有卷（逐个加载，全部完成后回调）
function loadAllVolumes(idx, done) {
    var total = Math.ceil(idx.length / 50);
    var loadedCount = 0;

    function loadOne(vol) {
        if (vol > total) { done(); return; }
        get('articles_v' + vol + '.json', function(err, text) {
            if (err) {
                // 一卷加载失败也继续加载其他卷
                loadedCount++;
                loadOne(vol + 1);
                return;
            }
            try {
                var vd = JSON.parse(text);
                for (var i = 0; i < vd.length; i++) {
                    var a = vd[i];
                    var div = document.createElement('div');
                    div.innerHTML = a.content;
                    a.raw = div.textContent || '';
                    allArticles.push(a);
                }
            } catch(e) {}
            loadedCount++;
            loadOne(vol + 1);
        });
    }
    loadOne(1);
}

// 搜索
function doSearch() {
    var kw = document.getElementById('q').value.trim();
    var left = document.getElementById('left');
    var right = document.getElementById('right');
    if (!kw) {
        left.innerHTML = '<div class="empty"><div class="icon">📖</div><p>输入关键词搜索全部文章</p></div>';
        right.innerHTML = '<div class="empty"><div class="icon">📄</div><p>输入关键词搜索文章</p></div>';
        document.getElementById('stats').style.display = 'none';
        return;
    }
    if (!loaded) {
        left.innerHTML = '<div class="loading">🔍 文章索引正在加载，请稍后再搜...</div>';
        return;
    }
    left.innerHTML = '<div class="loading">🔍 搜索中...</div>';
    document.getElementById('stats').style.display = 'none';

    setTimeout(function() {
        var lk = kw.toLowerCase();
        currentResults = [];
        for (var i = 0; i < allArticles.length; i++) {
            var a = allArticles[i];
            var txt = (a.title + ' ' + a.category + ' ' + a.date + ' ' + a.raw).toLowerCase();
            if (txt.indexOf(lk) > -1) currentResults.push(a);
        }
        document.getElementById('stats').style.display = 'block';
        document.getElementById('count').textContent = currentResults.length;

        var html = '';
        for (var i = 0; i < currentResults.length; i++) {
            var a = currentResults[i];
            var snippet = getSnippet(a.raw, lk);
            html += '<div class="result-item" onclick="showPreview(' + i + ')">' +
                '<span class="t">' + hl(a.title, lk) + '</span>' +
                '<div class="m"><span>#' + a.id + '</span><span>' + a.category + '</span><span>' + a.date + '</span></div>' +
                '<div class="s">' + snippet + '</div>' +
                '</div>';
        }
        left.innerHTML = html || '<div class="empty"><div class="icon">🔍</div><p>未找到包含 "<b>' + kw + '</b>" 的文章</p></div>';

        if (currentResults.length > 0) { currentIdx = 0; showPreview(0); }
        else { currentIdx = -1; right.innerHTML = '<div class="empty"><div class="icon">🔍</div><p>未找到文章</p></div>'; }
    }, 100);
}

function showPreview(i) {
    if (i < 0 || i >= currentResults.length) return;
    currentIdx = i;
    var a = currentResults[i];
    var content = a.content;
    // 高亮
    var kw = document.getElementById('q').value.trim().toLowerCase();
    if (kw) content = content.replace(new RegExp('(' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<span class="highlight">$1</span>');
    // 更新左侧高亮
    var items = document.querySelectorAll('.result-item');
    for (var j = 0; j < items.length; j++) items[j].className = items[j].className.replace(' active', '');
    if (items[i]) items[i].className += ' active';

    document.getElementById('right').innerHTML =
        '<div style="padding:8px">' +
        '<h1 style="font-size:1.6em;color:#3A6351;border-left:5px solid #7A8B7B;padding-left:12px;margin-bottom:8px;font-weight:normal">' + hl(a.title, kw) + '</h1>' +
        '<div style="font-size:0.9em;color:#7A8B7B;display:flex;gap:12px;margin-bottom:12px">' +
        '<span>#' + a.id + '</span><span>分类：' + a.category + '</span><span>日期：' + a.date + '</span></div>' +
        '<div style="font-size:17px;line-height:1.9">' + content + '</div>' +
        '<div style="margin-top:12px;padding-top:8px;border-top:1px solid #E8EDEA;display:flex;justify-content:space-between;font-size:0.9em;color:#7A8B7B">' +
        '<a href="#" style="color:' + (i > 0 ? '#3A6351' : '#C7D8D2') + ';text-decoration:none"' + (i > 0 ? ' onclick="event.preventDefault();showPreview(' + (i-1) + ')"' : '') + '>← 上一篇</a>' +
        '<span>' + (i+1) + ' / ' + currentResults.length + '</span>' +
        '<a href="#" style="color:' + (i < currentResults.length-1 ? '#3A6351' : '#C7D8D2') + ';text-decoration:none"' + (i < currentResults.length-1 ? ' onclick="event.preventDefault();showPreview(' + (i+1) + ')"' : '') + '>下一篇 →</a>' +
        '</div></div>';
    document.getElementById('right').scrollTop = 0;
}

function hl(text, kw) {
    if (!kw || !text) return text;
    return text.replace(new RegExp('(' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<span class="highlight">$1</span>');
}

function getSnippet(text, kw) {
    if (!kw) return (text || '').substring(0, 80);
    var idx = (text || '').toLowerCase().indexOf(kw);
    if (idx < 0) return (text || '').substring(0, 80);
    var start = Math.max(0, idx - 15);
    var end = Math.min(text.length, idx + kw.length + 30);
    var s = text.substring(start, end);
    if (start > 0) s = '...' + s;
    if (end < text.length) s += '...';
    return hl(s, kw);
}