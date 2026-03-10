const themeBtn = document.getElementById('themeBtn');
const csvFileInput = document.getElementById('csvFile');
const fileBtnTrigger = document.getElementById('fileBtnTrigger');
const fileName = document.getElementById('fileName');

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

const historyBody = document.getElementById('historyBody');
const scanCount = document.getElementById('scanCount');

const STORAGE_KEY = 'scanner-theme';

const knownByInventoryId = new Map();
const knownBySerial = new Map();

// orgName -> { total: number, foundSet: Set<string> }
const orgStats = new Map();

let totalScans = 0;
const uniqueFoundInventoryIds = new Set();
const uniqueMissingInputs = new Set();

function setTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark', dark);
  localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') {
    setTheme(saved);
  } else {
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = (cells[j] ?? '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function resetState() {
  knownByInventoryId.clear();
  knownBySerial.clear();
  orgStats.clear();

  totalScans = 0;
  uniqueFoundInventoryIds.clear();
  uniqueMissingInputs.clear();

  historyBody.innerHTML = '';
  scanCount.textContent = '0 scans';

  updateStatsUI();
  renderOrgGrid();
}

function updateStatsUI() {
  statTotal.textContent = String(totalScans);
  statFound.textContent = String(uniqueFoundInventoryIds.size);
  statMissing.textContent = String(uniqueMissingInputs.size);
  scanCount.textContent = `${totalScans} scan${totalScans === 1 ? '' : 's'}`;
}

function getOrgName(row) {
  return (row.organization_name || 'Unassigned').trim() || 'Unassigned';
}

function indexRows(rows) {
  resetState();

  for (const row of rows) {
    const inventoryId = (row.inventory_id || '').trim();
    const serial = (row.serial_number || '').trim();
    const orgName = getOrgName(row);

    if (inventoryId) knownByInventoryId.set(inventoryId.toLowerCase(), row);
    if (serial) knownBySerial.set(serial.toLowerCase(), row);

    if (!orgStats.has(orgName)) {
      orgStats.set(orgName, { total: 0, foundSet: new Set() });
    }
    const org = orgStats.get(orgName);
    org.total += 1;
  }

  loadInfo.textContent = `Loaded ${rows.length} rows | Indexed ${knownByInventoryId.size} inventory IDs`;
  renderOrgGrid();
}

function renderOrgGrid() {
  const orgEntries = [...orgStats.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (!orgEntries.length) {
    orgSection.style.display = 'none';
    orgGrid.innerHTML = '';
    orgMeta.textContent = '';
    return;
  }

  orgSection.style.display = 'block';
  orgGrid.innerHTML = '';

  let completedCount = 0;

  for (const [orgName, org] of orgEntries) {
    const foundCount = org.foundSet.size;
    const total = org.total;
    const percent = total ? Math.round((foundCount / total) * 100) : 0;

    let state = 'idle';
    if (foundCount >= total && total > 0) {
      state = 'complete';
      completedCount += 1;
    } else if (foundCount > 0) {
      state = 'partial';
    }

    const pill = document.createElement('div');
    pill.className = 'org-pill';
    pill.dataset.state = state;
    pill.title = `${orgName}: ${foundCount}/${total} devices found`;

    pill.innerHTML = `
      <div class="org-pill-name">${orgName}</div>
      <div class="org-pill-footer">
        <span class="org-pill-count">${foundCount}/${total}</span>
        <span class="org-pill-bar-track">
          <span class="org-pill-bar-fill" style="width: ${percent}%;"></span>
        </span>
      </div>
    `;

    orgGrid.appendChild(pill);
  }

  orgMeta.textContent = `${orgEntries.length} organizations • ${completedCount} complete`;
}

function markFoundInOrganization(row) {
  const orgName = getOrgName(row);
  const inventoryId = (row.inventory_id || '').trim();
  if (!inventoryId) return;

  if (!orgStats.has(orgName)) {
    orgStats.set(orgName, { total: 0, foundSet: new Set() });
  }

  orgStats.get(orgName).foundSet.add(inventoryId.toLowerCase());
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function setStatus(message, type) {
  statusBox.textContent = message;
  statusBox.classList.remove('success', 'error');
  if (type) statusBox.classList.add(type);
}

function nowTime() {
  return new Date().toLocaleTimeString();
}

function addHistory(inputValue, found, row) {
  totalScans += 1;
  updateStatsUI();

  const tr = document.createElement('tr');
  const productTitle = row?.product_title || '—';
  const inventoryId = row?.inventory_id || '—';
  tr.innerHTML = `
    <td>${nowTime()}</td>
    <td>${inputValue}</td>
    <td><span class="badge ${found ? 'found' : 'missing'}">${found ? 'FOUND' : 'NOT FOUND'}</span></td>
    <td>${inventoryId}</td>
    <td>${productTitle}</td>
  `;
  historyBody.prepend(tr);

  while (historyBody.children.length > 250) {
    historyBody.removeChild(historyBody.lastChild);
  }
}

function findMatch(rawInput) {
  const key = rawInput.trim().toLowerCase();
  if (!key) return null;
  return knownByInventoryId.get(key) || knownBySerial.get(key) || null;
}

function processScan(inputValue) {
  if (!knownByInventoryId.size) {
    setStatus('Please upload a CSV before scanning.', 'error');
    vibrate([120, 60, 120]);
    addHistory(inputValue, false, null);
    uniqueMissingInputs.add(inputValue.trim().toLowerCase());
    updateStatsUI();
    return;
  }

  const row = findMatch(inputValue);
  if (row) {
    const inventoryId = (row.inventory_id || '').trim().toLowerCase();
    if (inventoryId) {
      uniqueFoundInventoryIds.add(inventoryId);
      markFoundInOrganization(row);
      uniqueMissingInputs.delete(inventoryId);
      const serial = (row.serial_number || '').trim().toLowerCase();
      if (serial) uniqueMissingInputs.delete(serial);
    }

    setStatus(`Found: ${row.inventory_id} • ${row.product_title}`, 'success');
    vibrate(80);
    addHistory(inputValue, true, row);
    renderOrgGrid();
  } else {
    setStatus(`Not found: ${inputValue}`, 'error');
    vibrate([90, 40, 90]);
    addHistory(inputValue, false, null);
    uniqueMissingInputs.add(inputValue.trim().toLowerCase());
    updateStatsUI();
  }
}

function parseScanBuffer(value) {
  return value
    .split(/[\s,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function focusScannerInput() {
  scanInput.focus();
  scannerIndicator.classList.add('active');
  scannerLabel.textContent = 'Scanner active — ready for scans';
}

function blurScannerIndicator() {
  scannerIndicator.classList.remove('active');
  scannerLabel.textContent = 'Scanner inactive — click to activate';
}

themeBtn.addEventListener('click', () => {
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  setTheme(next);
});

fileBtnTrigger.addEventListener('click', () => {
  csvFileInput.click();
});

csvFileInput.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  fileName.textContent = file.name;

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    indexRows(rows);
    setStatus('CSV ready. You can now scan items.', null);
    focusScannerInput();
  } catch (error) {
    setStatus(`Failed to parse CSV: ${error.message}`, 'error');
  }
});

scanInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();

  const raw = scanInput.value;
  const tokens = parseScanBuffer(raw);
  if (!tokens.length) {
    scanInput.value = '';
    return;
  }

  for (const token of tokens) {
    processScan(token);
  }

  scanInput.value = '';
  focusScannerInput();
});

scanInput.addEventListener('focus', () => {
  scannerIndicator.classList.add('active');
  scannerLabel.textContent = 'Scanner active — ready for scans';
});

scanInput.addEventListener('blur', () => {
  blurScannerIndicator();
});

scannerIndicator.addEventListener('click', () => {
  focusScannerInput();
});

scannerIndicator.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    focusScannerInput();
  }
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (target === scanInput) return;
  if (csvFileInput.contains(target)) return;

  if (!scanInput.matches(':focus')) {
    focusScannerInput();
  }
});

initTheme();
updateStatsUI();
renderOrgGrid();
focusScannerInput();
