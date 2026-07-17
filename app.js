/**
 * 道玄文集 5.2 - 前端逻辑
 * =========================
 * 功能：按需加载文章数据，支持分卷、分类筛选、搜索、键盘导航
 *
 * 数据架构：
 *   articles-index.json  ← 首屏加载（仅元数据，< 5KB）
 *   articles_v1.json     ← 按需加载（第1卷正文）
 *   articles_v2.json     ← 按需加载（第2卷正文）
 *   ...
 */

// ============================================================
// 全局状态
// ============================================================
const STATE = {
    index: [],          // 文章索引 [{id, title, category, date, volume}]
    loadedVolumes: {},  // 已加载的分卷 { '1': [{id, title, content, ...}], ... }
    currentArticleId: null,
    currentVolume: 1,
    activeFilter: 'all',
    searchKeyword: '',
    isDataLoaded: false,
    sidebarHidden: false,
    searchTimer: null,
    lastScrollTop: 0
};

const ARTICLES_PER_VOLUME = 50;

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await loadIndex();
        STATE.isDataLoaded = true;
        
        renderVolumeNav();
        renderArticleList();
        
        // 检查 URL 参数（支持从搜索页跳转）
        const urlParams = new URLSearchParams(window.location.search);
        const articleId = urlParams.get('article');
        if (articleId !== null) {
            const id = parseInt(articleId);
            loadArticleById(id);
        } else if (STATE.index.length > 0) {
            loadArticleById(STATE.index[0].id);
        }
    } catch (error) {
        showError('数据加载失败：' + error.message);
    }
    
    // 事件绑定
    setupEventListeners();
});

// ============================================================
// 数据加载
// ============================================================
async function loadIndex() {
    const resp = await fetch('articles-index.json?' + Date.now());
    if (!resp.ok) throw new Error('索引文件加载失败 (HTTP ' + resp.status + ')');
    STATE.index = await resp.json();
    console.log('✅ 索引加载完成：' + STATE.index.length + ' 篇文章');
}

async function loadVolume(vol) {
    if (STATE.loadedVolumes[vol]) return STATE.loadedVolumes[vol];
    
    const resp = await fetch('articles_v' + vol + '.json?' + Date.now());
    if (!resp.ok) throw new Error('第' + vol + '卷加载失败 (HTTP ' + resp.status + ')');
    const data = await resp.json();
    STATE.loadedVolumes[vol] = data;
    console.log('✅ 第' + vol + '卷加载完成：' + data.length + ' 篇');
    return data;
}

// ============================================================
// 渲染函数
// ============================================================

/** 渲染卷导航按钮 */
function renderVolumeNav() {
    const total = getTotalVolumes();
    const nav = document.getElementById('mainNav');
    if (!nav) return;
    
    // 移除旧的卷按钮
    nav.querySelectorAll('.volume-btn').forEach(b => b.remove());
    
    if (total <= 1) return;
    
    const wechatLink = nav.querySelector('a[href*="wechat"]');
    for (let i = 1; i <= total; i++) {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'page-link volume-btn' + (i === STATE.currentVolume ? ' active' : '');
        a.dataset.vol = i;
        a.textContent = '卷' + i;
        a.addEventListener('click', function(e) {
            e.preventDefault();
            switchVolume(i);
        });
        nav.insertBefore(a, wechatLink);
    }
}

/** 渲染文章目录 */
function renderArticleList() {
    const filtered = applyFilters();
    const container = document.getElementById('articleList');
    if (!container) return;
    const fragment = document.createDocumentFragment();
    
    if (filtered.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = '<div style="text-align:center;padding:15px;color:#7A8B7B;">没有找到符合条件的文章</div>';
        fragment.appendChild(li);
        container.innerHTML = '';
        container.appendChild(fragment);
        return;
    }
    
    for (const article of filtered) {
        const li = document.createElement('li');
        const kw = STATE.searchKeyword;
        li.innerHTML = `
            <a href="#" class="${STATE.currentArticleId === article.id ? 'active' : ''}"
               data-id="${article.id}">
                <span class="article-number">${article.id}.</span>
                ${kw ? highlightKeyword(article.title, kw) : article.title}
                <small>(${article.category})</small>
            </a>
        `;
        fragment.appendChild(li);
    }
    
    container.innerHTML = '';
    container.appendChild(fragment);
    
    // 绑定点击事件
    container.querySelectorAll('a[data-id]').forEach(a => {
        a.addEventListener('click', function(e) {
            e.preventDefault();
            loadArticleById(parseInt(this.dataset.id));
        });
    });
}

/** 渲染文章正文 */
async function loadArticleById(id) {
    if (!id || id < 1 || id > STATE.index.length) return;
    
    const articleMeta = STATE.index[id - 1];
    if (!articleMeta) return;
    
    STATE.currentArticleId = id;
    
    const contentArea = document.getElementById('articleText');
    const titleEl = document.getElementById('articleTitle');
    const metaEl = document.getElementById('articleMeta');
    
    if (!contentArea || !titleEl || !metaEl) return;
    
    contentArea.innerHTML = '<div class="loading">🕯️ 文章加载中...</div>';
    
    try {
        // 按需加载对应卷的数据
        const vol = articleMeta.volume;
        await loadVolume(vol);
        
        const volData = STATE.loadedVolumes[vol];
        const article = volData.find(a => a.id === id);
        if (!article) throw new Error('文章数据未找到');
        
        titleEl.textContent = article.title;
        metaEl.innerHTML = `
            <span>分类：${article.category}</span>
            <span>日期：${article.date}</span>
            <span>编号：${article.id}</span>
        `;
        
        // 关键字高亮
        let content = article.content;
        if (STATE.searchKeyword) {
            content = highlightContent(content, STATE.searchKeyword);
        }
        
        contentArea.innerHTML = content;
        updateNavButtons();
        updateSidebarHighlight();
        
        // 滚动到顶部
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // 移动端切换到文章视图
        if (window.innerWidth <= 768) {
            switchTab('article');
        }
    } catch (error) {
        contentArea.innerHTML = '<div class="loading" style="color:#c0392b;">⚠️ ' + error.message + '</div>';
    }
}

/** 更新导航按钮状态 */
function updateNavButtons() {
    const filtered = applyFilters();
    const curIdx = filtered.findIndex(a => a.id === STATE.currentArticleId);
    
    setNavButton('prevArticle', curIdx > 0, () => loadArticleById(filtered[curIdx - 1].id));
    setNavButton('prevArticleBottom', curIdx > 0, () => loadArticleById(filtered[curIdx - 1].id));
    setNavButton('mobilePrevArticle', curIdx > 0, () => loadArticleById(filtered[curIdx - 1].id));
    setNavButton('nextArticle', curIdx < filtered.length - 1, () => loadArticleById(filtered[curIdx + 1].id));
    setNavButton('nextArticleBottom', curIdx < filtered.length - 1, () => loadArticleById(filtered[curIdx + 1].id));
    setNavButton('mobileNextArticle', curIdx < filtered.length - 1, () => loadArticleById(filtered[curIdx + 1].id));
}

function setNavButton(id, visible, onClick) {
    const el = document.getElementById(id);
    if (!el) return;
    const link = el.tagName === 'A' ? el : el.querySelector('a');
    if (!link) return;
    if (visible) {
        link.style.visibility = 'visible';
        link.onclick = function(e) { e.preventDefault(); onClick(); };
    } else {
        link.style.visibility = 'hidden';
        link.onclick = null;
    }
}

/** 更新侧边栏高亮 */
function updateSidebarHighlight() {
    document.querySelectorAll('.article-list a').forEach(a => {
        a.classList.toggle('active', parseInt(a.dataset.id) === STATE.currentArticleId);
    });
}

// ============================================================
// 筛选与搜索
// ============================================================

function getTotalVolumes() {
    return Math.ceil(STATE.index.length / ARTICLES_PER_VOLUME);
}

function getCurrentVolumeArticles() {
    const start = (STATE.currentVolume - 1) * ARTICLES_PER_VOLUME;
    const end = Math.min(start + ARTICLES_PER_VOLUME, STATE.index.length);
    return STATE.index.slice(start, end);
}

function applyFilters() {
    // 先按卷筛选
    let filtered = getCurrentVolumeArticles();
    
    // 再按分类筛选
    if (STATE.activeFilter === '诗') {
        filtered = filtered.filter(a => a.category === '诗');
    } else if (STATE.activeFilter === '词') {
        filtered = filtered.filter(a => a.category === '词');
    } else if (STATE.activeFilter === '散文') {
        filtered = filtered.filter(a => a.category === '散文');
    } else if (STATE.activeFilter === '其它') {
        filtered = filtered.filter(a => !['诗', '词', '散文'].includes(a.category));
    }
    
    // 再按关键词筛选
    if (STATE.searchKeyword) {
        const kw = STATE.searchKeyword.toLowerCase();
        filtered = filtered.filter(a =>
            a.title.toLowerCase().includes(kw)
        );
    }
    
    return filtered;
}

function filterArticles() {
    const select = document.getElementById('categoryFilter');
    if (!select) return;
    STATE.activeFilter = select.value;
    
    renderArticleList();
    const filtered = applyFilters();
    if (filtered.length > 0) {
        loadArticleById(filtered[0].id);
    }
}

async function searchArticles() {
    const input = document.getElementById('searchInput');
    STATE.searchKeyword = input.value.trim().toLowerCase();
    
    if (!STATE.searchKeyword) {
        renderArticleList();
        const filtered = applyFilters();
        if (filtered.length > 0) loadArticleById(filtered[0].id);
        return;
    }
    
    // 搜索只在当前卷内（标题/分类匹配）
    const filtered = getCurrentVolumeArticles().filter(a =>
        a.title.toLowerCase().includes(STATE.searchKeyword) ||
        a.category.toLowerCase().includes(STATE.searchKeyword)
    );
    
    const container = document.getElementById('articleList');
    if (filtered.length === 0) {
        container.innerHTML = `<li style="text-align:center;padding:15px;color:#7A8B7B;">在当前卷中未找到包含"${STATE.searchKeyword}"的文章</li>`;
        return;
    }
    
    container.innerHTML = filtered.map(a => `
        <li>
            <a href="#" data-id="${a.id}">
                <span class="article-number">${a.id}.</span>
                ${highlightKeyword(a.title, STATE.searchKeyword)}
                <small>(${a.category})</small>
            </a>
        </li>
    `).join('');
    
    container.querySelectorAll('a[data-id]').forEach(a => {
        a.addEventListener('click', function(e) {
            e.preventDefault();
            loadArticleById(parseInt(this.dataset.id));
        });
    });
    
    loadArticleById(filtered[0].id);
}

// ============================================================
// 卷切换
// ============================================================
function switchVolume(vol) {
    if (vol === STATE.currentVolume) return;
    STATE.currentVolume = vol;
    
    // 更新导航按钮高亮
    document.querySelectorAll('.volume-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.vol) === vol);
    });
    
    // 重置筛选项
    const filterSelect = document.getElementById('categoryFilter');
    if (filterSelect) {
        filterSelect.value = 'all';
        STATE.activeFilter = 'all';
    }
    STATE.searchKeyword = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    renderArticleList();
    const filtered = applyFilters();
    if (filtered.length > 0) {
        loadArticleById(filtered[0].id);
    } else {
        document.getElementById('articleText').innerHTML = '<div class="loading">📭 该卷暂无文章</div>';
        document.getElementById('articleTitle').textContent = '欢迎来到道玄文集';
        document.getElementById('articleMeta').innerHTML = '<span>请从左侧选择文章</span>';
    }
}

// ============================================================
// 工具函数
// ============================================================
function highlightKeyword(text, keyword) {
    if (!keyword) return text;
    return text.replace(new RegExp('(' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
        '<span class="highlight">$1</span>');
}

function highlightContent(html, keyword) {
    if (!keyword) return html;
    // 注意：这里直接在HTML上替换，避免破坏标签结构
    // 只替换文本内容中的关键字
    const regex = new RegExp('(' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return html.replace(regex, '<span class="highlight">$1</span>');
}

function showError(msg) {
    const el = document.getElementById('articleText');
    if (el) el.innerHTML = '<div class="loading" style="color:#c0392b;">⚠️ ' + msg + '</div>';
}

// ============================================================
// UI 交互函数
// ============================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`.tab-btn[onclick*="'${tabId}'"]`);
    if (btn) btn.classList.add('active');
    const tab = document.getElementById(tabId + 'Tab');
    if (tab) tab.classList.add('active');
    if (tabId === 'article') {
        document.getElementById('articleContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    STATE.sidebarHidden = !STATE.sidebarHidden;
    sidebar.classList.toggle('hidden', STATE.sidebarHidden);
    const icon = document.getElementById('sidebar-icon');
    if (icon) icon.textContent = STATE.sidebarHidden ? '☰' : '✕';
}

function initSidebar() {
    const isMobile = window.innerWidth <= 768;
    const toggle = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (!toggle || !sidebar) return;
    if (isMobile) {
        toggle.style.display = 'flex';
        sidebar.classList.remove('hidden');
        STATE.sidebarHidden = false;
        const icon = document.getElementById('sidebar-icon');
        if (icon) icon.textContent = '☰';
    } else {
        toggle.style.display = 'none';
    }
}

function initMobileTabs() {
    if (window.innerWidth <= 768) {
        const tabNav = document.querySelector('.tab-nav');
        if (tabNav) tabNav.style.display = 'flex';
        const catalogTab = document.getElementById('catalogTab');
        if (catalogTab) catalogTab.style.display = 'block';
    }
}

// ============================================================
// 事件绑定
// ============================================================
function setupEventListeners() {
    // 搜索输入框防抖
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            clearTimeout(STATE.searchTimer);
            STATE.searchTimer = setTimeout(searchArticles, 300);
        });
    }
    
    // 滚动监听（移动端自动隐藏侧边栏）
    window.addEventListener('scroll', function() {
        if (window.innerWidth > 768) return;
        const scrollTop = window.scrollY;
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        if (scrollTop > 100 && scrollTop > STATE.lastScrollTop && !STATE.sidebarHidden) {
            sidebar.classList.add('hidden');
            STATE.sidebarHidden = true;
            const icon = document.getElementById('sidebar-icon');
            if (icon) icon.textContent = '☰';
        } else if (scrollTop < 50 && STATE.sidebarHidden) {
            sidebar.classList.remove('hidden');
            STATE.sidebarHidden = false;
            const icon = document.getElementById('sidebar-icon');
            if (icon) icon.textContent = '✕';
        }
        STATE.lastScrollTop = scrollTop;
    });
    
    // 窗口大小变化
    window.addEventListener('resize', function() {
        initSidebar();
    });
    
    // 键盘导航
    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowLeft') {
            const filtered = applyFilters();
            const curIdx = filtered.findIndex(a => a.id === STATE.currentArticleId);
            if (curIdx > 0) loadArticleById(filtered[curIdx - 1].id);
        } else if (e.key === 'ArrowRight') {
            const filtered = applyFilters();
            const curIdx = filtered.findIndex(a => a.id === STATE.currentArticleId);
            if (curIdx < filtered.length - 1) loadArticleById(filtered[curIdx + 1].id);
        }
    });
    
    // 初始化移动端UI
    initSidebar();
    initMobileTabs();
}
