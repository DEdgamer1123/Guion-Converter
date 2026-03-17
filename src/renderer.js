// State
let parsedFiles = [];
let activeTab = 'guion';

// ── DRAG & DROP ──────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('drop-area').classList.add('drag-over');
}
function handleDragLeave(e) {
  e.preventDefault();
  document.getElementById('drop-area').classList.remove('drag-over');
}
async function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-area').classList.remove('drag-over');
  // Electron drag-drop: use file paths via webUtils or fallback
  const files = Array.from(e.dataTransfer.files);
  const srtFiles = files.filter(f => f.name.toLowerCase().endsWith('.srt'));
  if (!srtFiles.length) { showToast('No se encontraron archivos .srt', 'error'); return; }

  const fileData = [];
  for (const f of srtFiles) {
    const content = await readFileAsText(f);
    const chapter = extractChapter(f.name);
    fileData.push({ path: f.path || f.name, name: f.name, content, chapter });
  }
  await processSRTs(fileData);
}

function readFileAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsText(file, 'utf-8');
  });
}

function extractChapter(filename) {
  const base = filename.replace(/\.[^.]+$/, '');

  // 1. Explicit keyword patterns
  const keywordPatterns = [
    /[Ee][Pp](\d{1,4})/,
    /[Ee](\d{1,4})\b/,
    /[Cc]a[Pp](\d{1,4})/,
    /[Cc]ap[íi]tulo[_\s]?(\d{1,4})/i,
    /[Cc](\d{1,4})\b/,
    /[Ss]\d{1,2}[Ee](\d{1,4})/,
  ];
  for (const p of keywordPatterns) {
    const m = base.match(p);
    if (m) return parseInt(m[1], 10);
  }

  // 2. Number after separator at END of string: es_1, nombre-3, abc.2
  const trailingMatch = base.match(/[_\-.,\s](\d{1,4})$/);
  if (trailingMatch) return parseInt(trailingMatch[1], 10);

  // 3. Number surrounded by separators: _01_, -01-, .01., (01), [01]
  const separatorPattern = /[_\-.,\[\]()\s](\d{1,4})[_\-.,\[\]()\s]/g;
  const sepMatches = [];
  let sm;
  while ((sm = separatorPattern.exec(base)) !== null) {
    sepMatches.push(parseInt(sm[1], 10));
  }
  if (sepMatches.length) return sepMatches[0];

  // 3. Leading short number before separator
  const leadingMatch = base.match(/^(\d{1,4})[_\-.,\s]/);
  if (leadingMatch) return parseInt(leadingMatch[1], 10);

  // 4. Any short number (1-4 digits), ignoring long IDs
  const shortNumbers = [...base.matchAll(/(?<![0-9])(\d{1,4})(?![0-9])/g)];
  if (shortNumbers.length) return parseInt(shortNumbers[0][1], 10);

  // 5. Fallback: first number of any length
  const anyNum = base.match(/(\d+)/);
  return anyNum ? parseInt(anyNum[1], 10) : 0;
}

// ── FILE DIALOG ──────────────────────────────────────────
async function addFiles() {
  setProgress(10);
  const files = await window.api.openFiles();
  if (!files || !files.length) { setProgress(0); return; }
  await processSRTs(files);
}

async function processSRTs(newFiles) {
  setStatus('Procesando...', true);
  setProgress(30);

  // Merge with existing, avoid duplicates by name
  const existing = new Set(parsedFiles.map(f => f.name));
  const toAdd = newFiles.filter(f => !existing.has(f.name));
  if (!toAdd.length) {
    showToast('Esos archivos ya están cargados', 'error');
    setProgress(0); setStatus('Listo'); return;
  }

  setProgress(60);
  const freshParsed = await window.api.parseSrts(toAdd);
  parsedFiles = [...parsedFiles, ...freshParsed];
  // Re-sort all by chapter
  parsedFiles.sort((a, b) => a.chapter - b.chapter);

  setProgress(90);
  renderAll();
  setProgress(0);
  setStatus('Listo', false, true);
  showToast(`${toAdd.length} archivo(s) cargado(s)`, 'success');
}

function clearAll() {
  parsedFiles = [];
  renderAll();
  showToast('Lista limpiada', 'success');
  setStatus('Listo');
}

function removeFile(name) {
  parsedFiles = parsedFiles.filter(f => f.name !== name);
  renderAll();
}

// ── RENDER ───────────────────────────────────────────────
function renderAll() {
  renderSidebar();
  renderTables();
  updateStats();
  updateButtons();
  toggleView();
}

function renderSidebar() {
  const list = document.getElementById('file-list');
  const counter = document.getElementById('file-counter');
  counter.textContent = `${parsedFiles.length} archivo${parsedFiles.length !== 1 ? 's' : ''} cargado${parsedFiles.length !== 1 ? 's' : ''}`;

  if (!parsedFiles.length) { list.innerHTML = ''; return; }

  list.innerHTML = parsedFiles.map(f => `
    <div class="file-item">
      <div class="file-icon">${f.chapter ? f.chapter.toString().padStart(2,'0') : '??'}</div>
      <div class="file-info">
        <div class="file-name" title="${f.name}">${f.name}</div>
        <div class="file-meta">${f.count} líneas</div>
      </div>
      <span class="file-badge">Cap ${f.chapter || '?'}</span>
      <button class="file-remove" onclick="removeFile('${f.name.replace(/'/g,"\\'")}')">✕</button>
    </div>
  `).join('');
}

function renderTables() {
  const tbodyGuion = document.getElementById('tbody-guion');
  const tbodyCv = document.getElementById('tbody-cv');

  if (!parsedFiles.length) {
    tbodyGuion.innerHTML = `<tr><td colspan="5"><div class="empty-panel"><span>📋</span><p>No hay datos todavía</p></div></td></tr>`;
    tbodyCv.innerHTML = `<tr><td colspan="3"><div class="empty-panel"><span>📋</span><p>No hay datos todavía</p></div></td></tr>`;
    return;
  }

  // GUION
  let guionRows = '';
  for (const f of parsedFiles) {
    guionRows += `<tr class="chapter-sep"><td colspan="5">Capítulo ${f.chapter || '?'} — ${f.name} (${f.count} líneas)</td></tr>`;
    for (const e of f.entries) {
      guionRows += `
        <tr>
          <td class="col-cap">${f.chapter || ''}</td>
          <td class="col-time">${e.inicio}</td>
          <td class="col-time">${e.fin}</td>
          <td class="col-empty">—</td>
          <td class="col-dialog">${escHtml(e.dialogo)}</td>
        </tr>`;
    }
  }
  tbodyGuion.innerHTML = guionRows;

  // CV — no chapter numbers shown
  let cvRows = parsedFiles.map(f => `
    <tr>
      <td class="col-empty">—</td>
      <td class="col-empty">—</td>
    </tr>`).join('');
  tbodyCv.innerHTML = cvRows;

  // Update tab counts
  const totalLines = parsedFiles.reduce((s, f) => s + f.count, 0);
  document.getElementById('count-guion').textContent = totalLines;
  document.getElementById('count-cv').textContent = parsedFiles.length;
}

function updateStats() {
  const totalLines = parsedFiles.reduce((s, f) => s + f.count, 0);
  document.getElementById('val-chapters').textContent = parsedFiles.length;
  document.getElementById('val-lines').textContent = totalLines.toLocaleString();
}

function updateButtons() {
  const hasFiles = parsedFiles.length > 0;
  document.getElementById('btn-clear').disabled = !hasFiles;
  document.getElementById('btn-export').disabled = !hasFiles;
}

function toggleView() {
  const drop = document.getElementById('drop-area');
  const preview = document.getElementById('preview-area');
  if (parsedFiles.length) {
    drop.classList.add('has-files');
    preview.classList.add('visible');
  } else {
    drop.classList.remove('has-files');
    preview.classList.remove('visible');
  }
}

// ── TABS ─────────────────────────────────────────────────
function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}

// ── EXPORT ───────────────────────────────────────────────
async function exportExcel() {
  if (!parsedFiles.length) return;
  const btn = document.getElementById('btn-export');
  const icon = document.getElementById('export-icon');
  btn.disabled = true;
  icon.innerHTML = '<div class="spinner" style="display:inline-block"></div>';

  setStatus('Exportando...', true);
  setProgress(50);

  const result = await window.api.saveExcel(parsedFiles);
  setProgress(0);

  if (result && result.success) {
    setStatus('Exportado', false, true);
    showToast('✅ Excel guardado correctamente', 'success');
  } else {
    setStatus('Error al exportar', false, false);
    showToast('Error: ' + (result?.error || 'desconocido'), 'error');
  }

  btn.disabled = false;
  icon.textContent = '⬇';
}

// ── HELPERS ──────────────────────────────────────────────
function setProgress(pct) {
  const bar = document.getElementById('progress-bar');
  bar.style.width = pct + '%';
  if (pct === 0) setTimeout(() => { bar.style.width = '0%'; }, 400);
}

function setStatus(msg, loading = false, ok = false) {
  document.getElementById('val-status').textContent = msg;
  const dot = document.getElementById('dot-status');
  dot.className = 'stat-dot' + (ok ? ' green' : '');
}

function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span><span class="toast-msg">${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}