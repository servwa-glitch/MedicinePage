// ── Config ──────────────────────────────────────────────────
const SHEET_ID  = '1ekYUBtuQNjLB0RpWGCPJN7409sL74tqT36NfzUIM6o4';
const SHEET_GID = '1658780928';

// After deploying Cloudflare Worker, paste the URL here:
const WORKER_URL = '';   // e.g. 'https://medicine-api.your-name.workers.dev'

// ── State ───────────────────────────────────────────────────
let allItems = [];       // { name, stock, price }
let filteredItems = [];
let selectedFile = null;

// ── DOM refs ────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const searchInput   = $('searchInput');
const btnClear      = $('btnClear');
const btnRefresh    = $('btnRefresh');
const suggestions   = $('suggestions');
const statsText     = $('statsText');
const loadingState  = $('loadingState');
const emptyState    = $('emptyState');
const itemList      = $('itemList');
const btnFab        = $('btnFab');
const modal         = $('modal');
const modalBackdrop = $('modalBackdrop');
const btnCloseModal = $('btnCloseModal');
const dropZone      = $('dropZone');
const dropHint      = $('dropHint');
const imgPreview    = $('imgPreview');
const fileInput     = $('fileInput');
const cameraInput   = $('cameraInput');
const btnAnalyze    = $('btnAnalyze');
const analysisResult = $('analysisResult');

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  bindEvents();
});

// ── Data loading ─────────────────────────────────────────────
async function loadData() {
  showLoading(true);
  btnRefresh.classList.add('spinning');
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    if (csv.trim().startsWith('<')) throw new Error('Google Sheets 回傳登入頁，請確認試算表已設為「任何人都能檢視」');
    const { columns, rows } = parseCsv(csv);
    allItems = flattenData(columns, rows);
    filteredItems = [...allItems];
    renderList(filteredItems);
    statsText.textContent = `共 ${allItems.length} 項藥品`;
  } catch (e) {
    showLoading(false);
    statsText.textContent = '載入失敗';
    itemList.classList.add('hidden');
    loadingState.classList.remove('hidden');
    loadingState.innerHTML = `<div class="empty-icon">⚠️</div><p style="color:#b91c1c;font-size:14px;text-align:center">${e.message}</p>`;
  } finally {
    btnRefresh.classList.remove('spinning');
  }
}

// ── CSV parsing ───────────────────────────────────────────────
function parseCsv(csv) {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (!lines.length) return { columns: [], rows: [] };

  const rawCols = parseCsvLine(lines[0]);
  const columns = deduplicateColumns(rawCols);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const vals = parseCsvLine(line);
    const row = {};
    columns.forEach((col, j) => row[col] = (vals[j] ?? '').trim());
    if (Object.values(row).every(v => !v)) continue;
    rows.push(row);
  }
  return { columns, rows };
}

function parseCsvLine(line) {
  const result = [];
  let inQuotes = false;
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { result.push(cur.trim()); cur = ''; }
      else cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function deduplicateColumns(cols) {
  const seen = {};
  let emptyIdx = 0;
  return cols.map(col => {
    const name = col.trim() || `欄位${++emptyIdx}`;
    const count = seen[name] || 0;
    seen[name] = count + 1;
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

// ── Flatten multi-column layout ───────────────────────────────
function flattenData(columns, rows) {
  // Identify column groups by keywords (mirrors C# FlattenData logic)
  const nameCols  = columns.filter(c => c.includes('品') && c.includes('名'));
  const stockCols = columns.filter(c => c.includes('庫') && !nameCols.includes(c));
  const priceCols = columns.filter(c => c.includes('價') && !nameCols.includes(c));
  const groups = Math.max(nameCols.length, stockCols.length, priceCols.length);

  const result = [];
  for (let g = 0; g < groups; g++) {
    const nc = nameCols[g] ?? '';
    const sc = stockCols[g] ?? '';
    const pc = priceCols[g] ?? '';
    for (const row of rows) {
      const name  = (row[nc] ?? '').trim();
      const stock = (row[sc] ?? '').trim();
      const price = (row[pc] ?? '').trim();
      if (!name || isSectionHeader(name)) continue;
      if (!stock && !price) continue;
      result.push({ name, stock, price });
    }
  }
  // Deduplicate by name
  const seen = new Set();
  return result.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

function isSectionHeader(name) {
  return name.includes('劃') || name.includes('★') ||
         name.includes('製表') || name.includes('科中') ||
         (name.includes('~') && name.includes('劃'));
}

// ── Render ────────────────────────────────────────────────────
function renderList(items) {
  showLoading(false);
  if (!items.length) {
    emptyState.classList.remove('hidden');
    itemList.classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  itemList.classList.remove('hidden');

  itemList.innerHTML = '';
  const frag = document.createDocumentFragment();
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'item-card';
    const stockClass = getStockClass(item.stock);
    const stockLabel = item.stock || '—';
    li.innerHTML = `
      <div class="item-left">
        <div class="item-name">${escHtml(item.name)}</div>
        ${item.price ? `<div class="item-price">💰 ${escHtml(item.price)}</div>` : ''}
      </div>
      <div class="item-right">
        <span class="stock-badge ${stockClass}">${escHtml(stockLabel)}</span>
      </div>`;
    frag.appendChild(li);
  });
  itemList.appendChild(frag);
}

function getStockClass(stock) {
  if (!stock) return 'stock-unknown';
  if (stock.includes('有') || stock === '✓') return 'stock-yes';
  if (stock.includes('無') || stock === '✗' || stock.includes('缺')) return 'stock-no';
  return 'stock-unknown';
}

function showLoading(on) {
  loadingState.classList.toggle('hidden', !on);
  if (on) {
    loadingState.innerHTML = '<div class="spinner"></div><p>載入資料中...</p>';
  }
}

// ── Search ────────────────────────────────────────────────────
function filterItems(kw) {
  kw = kw.trim();
  if (!kw) {
    filteredItems = [...allItems];
  } else {
    filteredItems = allItems.filter(item =>
      item.name.toLowerCase().includes(kw.toLowerCase())
    );
  }
  renderList(filteredItems);
  statsText.textContent = kw
    ? `搜尋「${kw}」→ ${filteredItems.length} 筆 / 共 ${allItems.length} 項`
    : `共 ${allItems.length} 項藥品`;
}

function showSuggestions(kw) {
  if (!kw.trim() || !allItems.length) {
    suggestions.classList.add('hidden');
    return;
  }
  const matches = allItems
    .filter(i => i.name.toLowerCase().includes(kw.toLowerCase()))
    .slice(0, 12);
  if (!matches.length) {
    suggestions.classList.add('hidden');
    return;
  }
  suggestions.innerHTML = matches.map(i => {
    const hi = i.name.replace(
      new RegExp(`(${escRegex(kw)})`, 'gi'),
      '<mark>$1</mark>'
    );
    return `<div class="suggestion-item" data-name="${escHtml(i.name)}">${hi}</div>`;
  }).join('');
  suggestions.classList.remove('hidden');
}

function hideSuggestions() {
  setTimeout(() => suggestions.classList.add('hidden'), 150);
}

// ── Events ────────────────────────────────────────────────────
function bindEvents() {
  // Search input
  searchInput.addEventListener('input', e => {
    const kw = e.target.value;
    btnClear.classList.toggle('hidden', !kw);
    filterItems(kw);
    showSuggestions(kw);
  });
  searchInput.addEventListener('focus', e => {
    if (e.target.value) showSuggestions(e.target.value);
  });
  searchInput.addEventListener('blur', hideSuggestions);

  // Suggestion click
  suggestions.addEventListener('click', e => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    const name = item.dataset.name;
    searchInput.value = name;
    btnClear.classList.remove('hidden');
    filterItems(name);
    suggestions.classList.add('hidden');
  });

  // Clear
  btnClear.addEventListener('click', () => {
    searchInput.value = '';
    btnClear.classList.add('hidden');
    filterItems('');
    suggestions.classList.add('hidden');
    searchInput.focus();
  });

  // Refresh
  btnRefresh.addEventListener('click', loadData);

  // FAB → open modal
  btnFab.addEventListener('click', openModal);

  // Close modal
  btnCloseModal.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);

  // File inputs
  fileInput.addEventListener('change', e => handleFileSelect(e.target.files[0]));
  cameraInput.addEventListener('change', e => handleFileSelect(e.target.files[0]));

  // Analyze
  btnAnalyze.addEventListener('click', analyzeImage);
}

// ── Modal ─────────────────────────────────────────────────────
function openModal() {
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Image handling ────────────────────────────────────────────
function handleFileSelect(file) {
  if (!file) return;
  selectedFile = file;
  const url = URL.createObjectURL(file);
  imgPreview.src = url;
  imgPreview.classList.remove('hidden');
  dropHint.classList.add('hidden');
  btnAnalyze.disabled = false;
  analysisResult.classList.add('hidden');
}

// ── Image Analysis ────────────────────────────────────────────
async function analyzeImage() {
  if (!selectedFile) return;

  if (!WORKER_URL) {
    analysisResult.classList.remove('hidden');
    analysisResult.innerHTML = `
      <div class="no-worker-msg">
        ⚠️ 尚未設定 Cloudflare Worker URL。<br><br>
        請先完成 Cloudflare Worker 部署，<br>
        再將 Worker URL 填入 js/app.js 的 <code>WORKER_URL</code> 欄位。
      </div>`;
    return;
  }

  btnAnalyze.disabled = true;
  analysisResult.classList.remove('hidden');
  analysisResult.innerHTML = `
    <div class="analyzing-msg">
      <div class="spinner"></div>
      <p>AI 分析圖片中...</p>
    </div>`;

  try {
    const base64 = await fileToBase64(selectedFile);
    const mediaType = selectedFile.type || 'image/jpeg';

    const requestBody = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          },
          {
            type: 'text',
            text: '這張圖片中包含藥品訂單或品項清單。請從圖片中識別所有藥品品項名稱，以JSON陣列格式回傳，只包含品名，不要包含數量、劑型或其他資訊。例如：["八正散", "八味地黃丸", "木香檳榔丸"]'
          }
        ]
      }]
    };

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const msg = data.error?.message || JSON.stringify(data.error) || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const text = data.content?.[0]?.text ?? '';
    const names = parseNamesFromResponse(text);
    renderAnalysisResults(names);

  } catch (e) {
    analysisResult.innerHTML = `<div class="error-msg">❌ 辨識失敗：${escHtml(e.message)}</div>`;
  } finally {
    btnAnalyze.disabled = false;
  }
}

function parseNamesFromResponse(text) {
  try {
    const s = text.indexOf('['), e = text.lastIndexOf(']');
    if (s >= 0 && e > s) return JSON.parse(text.slice(s, e + 1));
  } catch {}
  return text.split('\n')
    .map(l => l.trim().replace(/^[-*•·、\d.]+\s*/, '').trim())
    .filter(l => l.length > 1 && !l.startsWith('[') && !l.startsWith('{'));
}

function renderAnalysisResults(names) {
  if (!names.length) {
    analysisResult.innerHTML = '<div class="no-worker-msg">⚠️ 未能從圖片中辨識出藥品名稱，請換一張更清晰的圖片。</div>';
    return;
  }

  const found = [], notFound = [];
  for (const name of names) {
    // Fuzzy match: check if any known item name contains this name or vice versa
    const match = allItems.find(item =>
      item.name.includes(name) || name.includes(item.name)
    );
    if (match) found.push({ queried: name, item: match });
    else notFound.push(name);
  }

  let html = '';
  if (found.length) {
    html += `<div class="analysis-section-title">✅ 找到 ${found.length} 項</div>`;
    html += found.map(({ queried, item }) => {
      const sc = getStockClass(item.stock);
      const stockLabel = item.stock || '—';
      const stockClass = sc === 'stock-yes' ? 'yes' : sc === 'stock-no' ? 'no' : '';
      return `
        <div class="result-item found">
          <span class="result-check">✓</span>
          <div class="result-name">${escHtml(item.name)}</div>
          <span class="result-stock ${stockClass}">${escHtml(stockLabel)}</span>
        </div>`;
    }).join('');
  }
  if (notFound.length) {
    html += `<div class="analysis-section-title">❌ 未找到 ${notFound.length} 項</div>`;
    html += notFound.map(name => `
      <div class="result-item notfound">
        <span class="result-check">✗</span>
        <div class="result-name">${escHtml(name)}</div>
      </div>`).join('');
  }

  analysisResult.innerHTML = html;
}

// ── Helpers ───────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const data = e.target.result;
      resolve(data.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
