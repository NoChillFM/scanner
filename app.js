/* ═══════════════════════════════════════════════════════════
   Inventory Scanner — app.js
   ═══════════════════════════════════════════════════════════ */

// ── DOM refs ──
const themeBtn = document.getElementById('themeBtn');
const csvFileInput = document.getElementById('csvFile');
const fileBtnTrigger = document.getElementById('fileBtnTrigger');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const fileNameEl = document.getElementById('fileName');

const scanInput = document.getElementById('scanInput');
const scannerIndicator = document.getElementById('scannerIndicator');
const scannerLabel = document.getElementById('scannerLabel');

const statusBox = document.getElementById('status');
const loadInfo = document.getElementById('loadInfo');

const statTotal = document.getElementById('statTotal');
const statFound = document.getElementById('statFound');
const statMissing = document.getElementById('statMissing');

const orgSection = document.getElementById('orgSection');
const orgGrid = document.getElementById('orgGrid');
const orgMeta = document.getElementById('orgMeta');

const deviceListSection = document.getElementById('deviceListSection');
const deviceListBody = document.getElementById('deviceListBody');
const deviceListMeta = document.getElementById('deviceListMeta');

const filterSearch = document.getElementById('filterSearch');
const filterStatus = document.getElementById('filterStatus');
const filterOrg = document.getElementById('filterOrg');
const filterCategory = document.getElementById('filterCategory');

const confirmOverlay = document.getElementById('confirmOverlay');
const confirmCancel = document.getElementById('confirmCancel');
const confirmReplace = document.getElementById('confirmReplace');

// ── Storage keys ──
const THEME_KEY = 'scanner-theme';
const SESSION_KEY = 'scanner-session';

// ── State ──
const knownByInventoryId = new Map();   // id(lower) -> row
const knownBySerial = new Map();        // serial(lower) -> row
const orgStats = new Map();             // orgName -> { total, foundSet }

const DEVICE_LIST_DEFAULT_VISIBLE = false;

let allRows = [];                       // all CSV rows
const uniqueScannedInputs = new Set();  // distinct scan inputs (for "Total Scans")
const uniqueFoundIds = new Set();       // distinct inventory_ids found

let pendingFileText = null;             // CSV text waiting for confirm dialog

// ── Theme ──
function setTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') { setTheme(saved); return; }
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  setTheme(prefersDark ? 'dark' : 'light');
}

// ── CSV parsing ──
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = (cells[j] ?? '').trim();
    rows.push(row);
  }
  return rows;
}

// ── Persistence ──
let _saveTimer = null;

function saveSession() {
  try {
    const data = {
      csvRows: allRows,
      scannedInputs: [...uniqueScannedInputs],
      foundIds: [...uniqueFoundIds],
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch { /* storage full — silently skip */ }
}

function saveSessionDeferred() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveSession, 500);
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.csvRows?.length) return false;

    allRows = data.csvRows;
    buildIndexes(allRows);

    for (const id of (data.foundIds || [])) uniqueFoundIds.add(id);
    for (const inp of (data.scannedInputs || [])) uniqueScannedInputs.add(inp);

    // Rebuild org found sets from persisted found IDs
    for (const id of uniqueFoundIds) {
      const row = knownByInventoryId.get(id);
      if (row) markFoundInOrg(row);
    }

    fileNameEl.textContent = 'Restored from cache';
    loadInfo.textContent = `Restored ${allRows.length} rows | ${uniqueFoundIds.size} found previously`;
    setStatus('Session restored. Continue scanning.', null);
    return true;
  } catch {
    return false;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ── Indexing ──
function getOrgName(row) {
  return (row.organization_name || 'Unassigned').trim() || 'Unassigned';
}

function getCategory(row) {
  return (row.category || 'Uncategorized').trim() || 'Uncategorized';
}

function buildIndexes(rows) {
  knownByInventoryId.clear();
  knownBySerial.clear();
  orgStats.clear();

  for (const row of rows) {
    const id = (row.inventory_id || '').trim();
    const serial = (row.serial_number || '').trim();
    const org = getOrgName(row);

    if (id) knownByInventoryId.set(id.toLowerCase(), row);
    if (serial) knownBySerial.set(serial.toLowerCase(), row);

    if (!orgStats.has(org)) orgStats.set(org, { total: 0, foundSet: new Set() });
    orgStats.get(org).total++;
  }
}

function loadNewCsv(text) {
  allRows = parseCsv(text);
  uniqueScannedInputs.clear();
  uniqueFoundIds.clear();
  buildIndexes(allRows);

  loadInfo.textContent = `Loaded ${allRows.length} rows | ${knownByInventoryId.size} inventory IDs`;
  saveSession();
  refreshAllUI();
}

// ── Stats ──
function getMissingCount() {
  return knownByInventoryId.size - uniqueFoundIds.size;
}

function updateStatsUI() {
  statTotal.textContent = String(uniqueScannedInputs.size);
  statFound.textContent = String(uniqueFoundIds.size);
  statMissing.textContent = String(Math.max(0, getMissingCount()));
}

// ── Organization grid (compact pills) ──
function renderOrgGrid() {
  const entries = [...orgStats.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (!entries.length) {
    orgSection.style.display = 'none';
    orgGrid.innerHTML = '';
    orgMeta.textContent = '';
    return;
  }

  orgSection.style.display = 'block';
  orgGrid.innerHTML = '';
  let completed = 0;

  for (const [name, org] of entries) {
    const found = org.foundSet.size;
    const total = org.total;
    let state = 'idle';
    if (found >= total && total > 0) { state = 'complete'; completed++; }
    else if (found > 0) state = 'partial';

    const pill = document.createElement('div');
    pill.className = 'org-pill';
    pill.dataset.state = state;
    pill.title = `${name}: ${found}/${total}`;
    pill.innerHTML = `<span class="org-pill-name">${name}</span><span class="org-pill-count">${found}/${total}</span>`;
    orgGrid.appendChild(pill);
  }

  orgMeta.textContent = `${entries.length} orgs · ${completed} done`;
}

function markFoundInOrg(row) {
  const org = getOrgName(row);
  const id = (row.inventory_id || '').trim().toLowerCase();
  if (!id) return;
  if (!orgStats.has(org)) orgStats.set(org, { total: 0, foundSet: new Set() });
  orgStats.get(org).foundSet.add(id);
}

// ── Device list + filters ──
function populateFilterDropdowns() {
  const orgs = new Set();
  const cats = new Set();
  for (const row of allRows) {
    orgs.add(getOrgName(row));
    cats.add(getCategory(row));
  }

  filterOrg.innerHTML = '<option value="all">All Orgs</option>';
  [...orgs].sort().forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    filterOrg.appendChild(opt);
  });

  filterCategory.innerHTML = '<option value="all">All Categories</option>';
  [...cats].sort().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    filterCategory.appendChild(opt);
  });
}

function getFilteredRows() {
  const search = filterSearch.value.trim().toLowerCase();
  const status = filterStatus.value;
  const org = filterOrg.value;
  const cat = filterCategory.value;

  return allRows.filter(row => {
    const id = (row.inventory_id || '').trim().toLowerCase();
    const isFound = uniqueFoundIds.has(id);

    if (status === 'found' && !isFound) return false;
    if (status === 'missing' && isFound) return false;
    if (org !== 'all' && getOrgName(row) !== org) return false;
    if (cat !== 'all' && getCategory(row) !== cat) return false;

    if (search) {
      const serial = (row.serial_number || '').toLowerCase();
      const product = (row.product_title || '').toLowerCase();
      const orgName = getOrgName(row).toLowerCase();
      const catName = getCategory(row).toLowerCase();
      if (
        !serial.includes(search) &&
        !product.includes(search) &&
        !orgName.includes(search) &&
        !catName.includes(search) &&
        !id.includes(search)
      ) return false;
    }

    return true;
  });
}

function renderDeviceList() {
  if (!allRows.length || !DEVICE_LIST_DEFAULT_VISIBLE) {
    deviceListSection.style.display = 'none';
    return;
  }

  deviceListSection.style.display = 'block';
  const filtered = getFilteredRows();

  let html = '';
  for (const row of filtered) {
    const id = (row.inventory_id || '').trim().toLowerCase();
    const isFound = uniqueFoundIds.has(id);
    html += `
      <tr>
        <td>${getOrgName(row)}</td>
        <td>${row.serial_number || '—'}</td>
        <td>${getCategory(row)}</td>
        <td><span class="badge ${isFound ? 'found' : 'missing'}">${isFound ? 'Found' : 'Missing'}</span></td>
      </tr>
    `;
  }

  deviceListBody.innerHTML = html;
  deviceListMeta.textContent = `${filtered.length} of ${allRows.length} devices`;
}

// ── Refresh everything ──
function refreshAllUI() {
  updateStatsUI();
  renderOrgGrid();
  populateFilterDropdowns();
  renderDeviceList();
  updateExportBtn();
}

function updateExportBtn() {
  exportCsvBtn.disabled = allRows.length === 0;
}

function escapeCsvValue(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function exportCsv() {
  if (!allRows.length) return;
  
  // Get original headers from the first row
  const originalHeaders = Object.keys(allRows[0]);
  const headers = [...originalHeaders, 'Status'];
  
  // Separate found and not_found
  const foundRows = [];
  const notFoundRows = [];
  
  for (const row of allRows) {
    const id = (row.inventory_id || '').trim().toLowerCase();
    const isFound = uniqueFoundIds.has(id);
    if (isFound) {
      foundRows.push(row);
    } else {
      notFoundRows.push(row);
    }
  }
  
  // Build CSV: Found first, then Not_Found
  const lines = [headers.map(escapeCsvValue).join(',')];
  
  for (const row of foundRows) {
    const values = originalHeaders.map(h => escapeCsvValue(row[h]));
    values.push('Found');
    lines.push(values.join(','));
  }
  
  for (const row of notFoundRows) {
    const values = originalHeaders.map(h => escapeCsvValue(row[h]));
    values.push('Not_Found');
    lines.push(values.join(','));
  }
  
  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventory_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Vibrate ──
function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ── Status ──
function setStatus(msg, type) {
  statusBox.textContent = msg;
  statusBox.classList.remove('success', 'error');
  if (type) statusBox.classList.add(type);
}

// ── Scan match ──
function findMatch(raw) {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return knownByInventoryId.get(key) || knownBySerial.get(key) || null;
}

// ── Process a single scan ──
function processScan(inputValue) {
  const key = inputValue.trim().toLowerCase();
  if (!key) return { found: false, message: null };

  // Track as unique scan input
  uniqueScannedInputs.add(key);

  if (!knownByInventoryId.size) {
    return { found: false, message: 'Upload a CSV before scanning.', type: 'error' };
  }

  const row = findMatch(inputValue);
  if (row) {
    const id = (row.inventory_id || '').trim().toLowerCase();
    if (id) {
      uniqueFoundIds.add(id);
      markFoundInOrg(row);
    }
    return {
      found: true,
      message: `Found: ${row.inventory_id} · ${row.product_title}`,
      type: 'success',
    };
  }

  return { found: false, message: `Not found: ${inputValue}`, type: 'error' };
}

function parseScanBuffer(value) {
  return value.split(/[\s,;]+/).map(v => v.trim()).filter(Boolean);
}

// ── Scanner focus helpers ──
function focusScannerInput() {
  scanInput.focus();
  scannerIndicator.classList.add('active');
  scannerLabel.textContent = 'Scanner active — ready for scans';
}

function blurScannerIndicator() {
  scannerIndicator.classList.remove('active');
  scannerLabel.textContent = 'Scanner inactive — tap to activate';
}

// ── Confirm dialog helpers ──
function showConfirm() { confirmOverlay.classList.add('show'); }
function hideConfirm() { confirmOverlay.classList.remove('show'); pendingFileText = null; }

// ═══════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════

// Theme
themeBtn.addEventListener('click', () => {
  setTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
});

// File button opens hidden input
fileBtnTrigger.addEventListener('click', () => csvFileInput.click());

// Export CSV
exportCsvBtn.addEventListener('click', () => exportCsv());

// CSV file selected
csvFileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  fileNameEl.textContent = file.name;

  try {
    const text = await file.text();

    // If we already have data, ask for confirmation
    if (allRows.length > 0) {
      pendingFileText = text;
      showConfirm();
      return;
    }

    loadNewCsv(text);
    setStatus('CSV ready. Begin scanning.', null);
    focusScannerInput();
  } catch (err) {
    setStatus(`CSV parse error: ${err.message}`, 'error');
  }
});

// Confirm dialog
confirmCancel.addEventListener('click', () => {
  hideConfirm();
  csvFileInput.value = '';
  focusScannerInput();
});

confirmReplace.addEventListener('click', () => {
  const text = pendingFileText;
  hideConfirm();
  if (text) {
    clearSession();
    loadNewCsv(text);
    setStatus('New CSV loaded. Begin scanning.', null);
  }
  focusScannerInput();
});

// Scanner keydown
scanInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();

  const tokens = parseScanBuffer(scanInput.value);
  scanInput.value = '';
  if (!tokens.length) return;

  let foundCountInBurst = 0;
  let lastMessage = null;
  let lastType = null;

  for (const t of tokens) {
    const result = processScan(t);
    if (!result || !result.message) continue;

    if (result.found) foundCountInBurst += 1;
    lastMessage = result.message;
    lastType = result.type;
  }

  if (lastMessage) setStatus(lastMessage, lastType);

  // Immediate feedback path (must feel instant)
  updateStatsUI();
  if (foundCountInBurst > 0) {
    const pattern = [];
    for (let i = 0; i < foundCountInBurst; i += 1) {
      pattern.push(80);
      if (i < foundCountInBurst - 1) pattern.push(70);
    }
    vibrate(pattern);
  }
  focusScannerInput();

  // Defer heavier work so it doesn't block scan-to-status latency
  setTimeout(() => {
    renderOrgGrid();
    renderDeviceList();
    saveSessionDeferred();
  }, 0);
});

// Scanner focus/blur indicator
scanInput.addEventListener('focus', () => {
  scannerIndicator.classList.add('active');
  scannerLabel.textContent = 'Scanner active — ready for scans';
});
scanInput.addEventListener('blur', () => blurScannerIndicator());

// Click scanner indicator to refocus
scannerIndicator.addEventListener('click', () => focusScannerInput());
scannerIndicator.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusScannerInput(); }
});

// Global click → refocus scanner (except on interactive elements)
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t === scanInput) return;
  if (t.closest('#csvFile, #fileBtnTrigger, #exportCsvBtn, #confirmOverlay, .filters-row, .theme-toggle')) return;
  if (!scanInput.matches(':focus')) focusScannerInput();
});

// Filters
filterSearch.addEventListener('input', () => renderDeviceList());
filterStatus.addEventListener('change', () => renderDeviceList());
filterOrg.addEventListener('change', () => renderDeviceList());
filterCategory.addEventListener('change', () => renderDeviceList());

// Prevent filter search from stealing scanner focus permanently
filterSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { filterSearch.blur(); focusScannerInput(); }
});

// ═══════════════════════════════════════
//  INIT
// ═══════════════════════════════════════
initTheme();

const restored = loadSession();
if (restored) {
  refreshAllUI();
} else {
  updateStatsUI();
  renderOrgGrid();
}

focusScannerInput();
