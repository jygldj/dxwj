/**
 * 道玄文集 5.2 - 构建脚本
 * ===========================
 * 功能：扫描 articles/ 文件夹中的 .md 文件 →
 *       生成分片 JSON 数据 + 复制静态文件 → dist/
 *
 * 用法：node build.js
 *
 * 输出目录结构：
 *   dist/
 *   ├── articles-index.json      ← 轻量索引（仅标题/分类/日期，用于快速加载）
 *   ├── articles_v1.json         ← 第1卷正文（每卷50篇）
 *   ├── articles_v2.json         ← 第2卷正文
 *   ├── ...
 *   ├── index.html, index1.html  ← 页面文件
 *   ├── style.css, cover.css      ← 样式文件
 *   ├── app.js                    ← 前端逻辑
 *   └── sw.js                     ← Service Worker（自动更新版本号）
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 配置
// ============================================================
const ARTICLES_DIR = path.join(__dirname, 'articles');
const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const ARTICLES_PER_VOLUME = 50;   // 每卷文章数

// ============================================================
// 1. 扫描 articles/ 目录
// ============================================================
function scanArticles() {
  if (!fs.existsSync(ARTICLES_DIR)) {
    console.error('❌ 错误：articles/ 文件夹不存在！');
    console.error('   请在 build.js 同级目录下创建 articles/ 文件夹，放入 .md 文件。');
    process.exit(1);
  }

  const files = fs.readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();  // 按文件名排序（001-xxx.md → 002-xxx.md）

  if (files.length === 0) {
    console.error('❌ 错误：articles/ 文件夹中没有找到 .md 文件！');
    process.exit(1);
  }

  console.log(`📂 在 articles/ 中找到 ${files.length} 个 .md 文件`);

  const articles = [];
  let id = 1;

  for (const file of files) {
    const filePath = path.join(ARTICLES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const article = parseMarkdown(file, content, id);
    if (article) {
      articles.push(article);
      id++;
    }
  }

  console.log(`✅ 成功解析 ${articles.length} 篇文章`);
  return articles;
}

// ============================================================
// 2. 解析单篇 .md 文件
// ============================================================
function parseMarkdown(filename, content, id) {
  const lines = content.trim().split('\n');
  if (lines.length < 1) return null;

  let title = '';
  let category = '其它';
  let date = '';
  let bodyLines = [];
  let headerDone = false;

  for (const line of lines) {
    const s = line.trim();

    // # 标题
    if (s.startsWith('# ') && !title) {
      title = s.substring(2).trim();
      continue;
    }

    // > 分类 | 日期  （元数据行）
    if (s.startsWith('> ') && !headerDone) {
      const meta = s.substring(2).trim();
      const parts = meta.replace('｜', '|').split('|');
      if (parts.length >= 2) {
        category = parts[0].trim();
        date = parts[1].trim();
      } else if (parts.length === 1) {
        category = parts[0].trim();
      }
      headerDone = true;
      continue;
    }

    // 跳过标题和元数据之间的空行
    if (!headerDone && !s) continue;

    // 到达正文部分
    if (title) {
      bodyLines.push(line);  // 保留原始行内容
      headerDone = true;
    }
  }

  if (!title) {
    console.warn(`⚠️  跳过 ${filename}：未找到标题（缺少 # 标题）`);
    return null;
  }

  // ============================================================
  // 3. 将正文转换为 HTML
  // ============================================================
  const htmlContent = renderBodyToHtml(bodyLines, category);

  return {
    id,
    title,
    category,
    date: date || '未标注日期',
    content: htmlContent
  };
}

// ============================================================
// 3. 正文 → HTML 转换
// ============================================================
function renderBodyToHtml(bodyLines, category) {
  if (bodyLines.length === 0) return '<p></p>';

  // 检测注释块
  let contentPieces = [];
  let inNotes = false;
  let noteLines = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();

    // 检测注释开始
    const noteMatch = trimmed.match(/^(注|注释|附|附记|附注)[：:]/);
    if (noteMatch) {
      inNotes = true;
      noteLines.push(line);
      continue;
    }

    if (inNotes) {
      noteLines.push(line);
      continue;
    }

    contentPieces.push(line);
  }

  // 处理正文部分
  let html = '';

  // 如果正文中包含大量空行分隔，按段落处理
  const paragraphs = [];
  let currentPara = [];

  for (const line of contentPieces) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join('\n'));
        currentPara = [];
      }
      // 连续空行也保留一个段落分隔
      continue;
    }
    currentPara.push(line);
  }
  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join('\n'));
  }

  // 处理每个段落
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 判断是否为诗词标题行（被《》包裹且单独一行）
    if (/^《.*》$/.test(trimmed)) {
      html += `<p class="poem-title">${trimmed}</p>\n`;
      continue;
    }

    // 普通段落：将换行符转为 <br>
    const withBreaks = trimmed.replace(/\n/g, '<br>');

    // 诗词/词类不加段落缩进
    if (category === '诗' || category === '词') {
      html += `<p>${withBreaks}</p>\n`;
    } else {
      html += `<p class="paragraph-indent">${withBreaks}</p>\n`;
    }
  }

  // 处理注释
  if (noteLines.length > 0) {
    const firstLine = noteLines[0].trim();
    let noteType = '注';
    const typeMatch = firstLine.match(/^(注|注释|附|附记|附注)/);
    if (typeMatch) noteType = typeMatch[1];

    // 提取注释正文
    const noteTexts = noteLines.map(l => l.trim()).filter(Boolean);
    // 第一行可能包含"注："前缀，去掉它
    noteTexts[0] = noteTexts[0].replace(/^(注|注释|附|附记|附注)[：:]\s*/, '');

    html += `<div class="annotation">`;
    html += `<p><strong>${noteType}：</strong></p>`;
    for (const n of noteTexts) {
      if (n) html += `<p>${n}</p>\n`;
    }
    html += `</div>\n`;
  }

  return html || '<p></p>';
}

// ============================================================
// 4. 生成分片 JSON 文件
// ============================================================
function generateVolumeFiles(articles) {
  // 确保 dist 目录存在
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // 4a. 生成索引文件（仅元数据）
  const indexData = articles.map(a => ({
    id: a.id,
    title: a.title,
    category: a.category,
    date: a.date,
    volume: Math.ceil(a.id / ARTICLES_PER_VOLUME)
  }));

  const indexPath = path.join(DIST_DIR, 'articles-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 0), 'utf-8');
  const indexSize = fs.statSync(indexPath).size;
  console.log(`📄 生成索引文件: articles-index.json (${formatSize(indexSize)})`);

  // 4b. 按卷分片生成正文文件
  const totalVolumes = Math.ceil(articles.length / ARTICLES_PER_VOLUME);
  console.log(`📚 共 ${totalVolumes} 卷，每卷 ${ARTICLES_PER_VOLUME} 篇`);

  for (let vol = 1; vol <= totalVolumes; vol++) {
    const start = (vol - 1) * ARTICLES_PER_VOLUME;
    const end = Math.min(start + ARTICLES_PER_VOLUME, articles.length);
    const volArticles = articles.slice(start, end);

    // 每卷只包含正文内容
    const volData = volArticles.map(a => ({
      id: a.id,
      title: a.title,
      category: a.category,
      date: a.date,
      content: a.content
    }));

    const volFileName = `articles_v${vol}.json`;
    const volPath = path.join(DIST_DIR, volFileName);
    fs.writeFileSync(volPath, JSON.stringify(volData, null, 0), 'utf-8');
    const volSize = fs.statSync(volPath).size;
    console.log(`   📄 ${volFileName}: ${volArticles.length} 篇 (${formatSize(volSize)})`);
  }
}

// ============================================================
// 5. 复制静态文件到 dist/
// ============================================================
function copyStaticFiles() {
    const filesToCopy = [
        'index.html',
        'index1.html',
        'style.css',
        'cover.css',
        'app.js',
        'sw.js',
        'wsf.webp',
        'wsf.jpg',
        'search.html',
        'jianjie.html'
    ];

  let copied = 0;
  for (const file of filesToCopy) {
    const srcPath = path.join(SRC_DIR, file);
    const destPath = path.join(DIST_DIR, file);

    if (fs.existsSync(srcPath)) {
      const content = fs.readFileSync(srcPath, 'utf-8');

      // 对 sw.js 特殊处理：注入构建时间和缓存版本号
      let processed = content;
      if (file === 'sw.js') {
        const buildTime = new Date().toISOString();
        const cacheVersion = `daoxuan-v${Math.floor(Date.now() / 1000)}`;
        processed = content
          .replace(/__BUILD_TIME__/g, buildTime)
          .replace(/__CACHE_VERSION__/g, cacheVersion);
      }

      fs.writeFileSync(destPath, processed, 'utf-8');
      copied++;
    } else {
      console.warn(`⚠️  警告：src/${file} 不存在，跳过`);
    }
  }

  // 复制图片文件夹（如果存在）
  const imgSrcDir = path.join(SRC_DIR, '../images');
  const imgDstDir = path.join(DIST_DIR, 'images');
  if (fs.existsSync(imgSrcDir)) {
    if (!fs.existsSync(imgDstDir)) fs.mkdirSync(imgDstDir, { recursive: true });
    const imgFiles = fs.readdirSync(imgSrcDir).filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f));
    for (const img of imgFiles) {
      fs.copyFileSync(path.join(imgSrcDir, img), path.join(imgDstDir, img));
    }
    if (imgFiles.length > 0) console.log(`   🖼️  已复制 ${imgFiles.length} 张图片`);
  }

  console.log(`📋 已复制 ${copied} 个静态文件`);
}

// ============================================================
// 6. 生成报告
// ============================================================
function generateReport(articles) {
  const categories = {};
  for (const a of articles) {
    categories[a.category] = (categories[a.category] || 0) + 1;
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  📊 构建报告');
  console.log('═══════════════════════════════════════');
  console.log(`  文章总数: ${articles.length} 篇`);
  for (const [cat, count] of Object.entries(categories)) {
    console.log(`  ${cat}: ${count} 篇`);
  }
  console.log('');

  // 统计 dist 目录总大小
  let totalSize = 0;
  const distFiles = fs.readdirSync(DIST_DIR);
  for (const f of distFiles) {
    const stat = fs.statSync(path.join(DIST_DIR, f));
    totalSize += stat.size;
  }
  console.log(`  dist/ 总大小: ${formatSize(totalSize)}`);
  console.log(`  索引文件: ${formatSize(fs.statSync(path.join(DIST_DIR, 'articles-index.json')).size)}`);
  console.log(`  首屏只需加载索引 + 静态文件，大幅减少初始加载量`);
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('✅ 构建完成！dist/ 目录已准备好部署。');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================
// 主流程
// ============================================================
console.log('');
console.log('📖 道玄文集 5.2 - 构建工具');
console.log('════════════════════════════');
console.log('');

try {
  // 1. 扫描并解析 .md 文件
  const articles = scanArticles();

  // 2. 生成分片 JSON
  generateVolumeFiles(articles);

  // 3. 复制静态文件
  copyStaticFiles();

  // 4. 生成报告
  generateReport(articles);

} catch (error) {
  console.error('❌ 构建失败：', error.message);
  process.exit(1);
}
