const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#060818',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'logo.ico')
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.on('maximize',   () => mainWindow.webContents.send('window-maximized'));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-unmaximized'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// Parse SRT content
function parseSRT(content) {
  const blocks = content.trim().split(/\n\s*\n/);
  const entries = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    // Find timestamp line
    let timeIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeIndex = i;
        break;
      }
    }
    if (timeIndex === -1) continue;

    const timeLine = lines[timeIndex];
    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,.:]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.:]\d{3})/
    );
    if (!timeMatch) continue;

    const start = timeMatch[1].replace(',', '.');
    const end = timeMatch[2].replace(',', '.');
    const dialogLines = lines.slice(timeIndex + 1).filter(l => l.trim());
    const dialog = dialogLines.join(' ').trim();

    if (dialog) {
      entries.push({ inicio: start, fin: end, dialogo: dialog });
    }
  }

  return entries;
}

// Extract chapter number from filename
function extractChapter(filename) {
  const base = path.basename(filename, path.extname(filename));

  // 1. Explicit episode/chapter keywords (highest priority)
  const keywordPatterns = [
    /[Ee][Pp](\d{1,4})/,           // EP01, Ep3
    /[Ee](\d{1,4})\b/,             // E01, E12
    /[Cc]a[Pp](\d{1,4})/,         // Cap01, CAP3
    /[Cc]ap[íi]tulo[_\s]?(\d{1,4})/i, // Capitulo 3
    /[Cc](\d{1,4})\b/,             // C01, C3
    /[Ss]\d{1,2}[Ee](\d{1,4})/,   // S01E05 → episode number
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
  if (sepMatches.length) return sepMatches[0]; // take the first (leftmost)

  // 3. Number at start of string: "01_longnumber" → take leading short number
  const leadingMatch = base.match(/^(\d{1,4})[_\-.,\s]/);
  if (leadingMatch) return parseInt(leadingMatch[1], 10);

  // 4. Any short number (1-4 digits) — ignore long IDs (5+ digits)
  const shortNumbers = [...base.matchAll(/(?<![0-9])(\d{1,4})(?![0-9])/g)];
  if (shortNumbers.length) return parseInt(shortNumbers[0][1], 10);

  // 5. Absolute fallback: first number of any length
  const anyNum = base.match(/(\d+)/);
  return anyNum ? parseInt(anyNum[1], 10) : 0;
}

// IPC: Open file dialog
ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar archivos SRT',
    filters: [{ name: 'Subtítulos SRT', extensions: ['srt'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled) return [];

  const files = [];
  for (const fp of result.filePaths) {
    const content = fs.readFileSync(fp, 'utf-8');
    const chapter = extractChapter(fp);
    files.push({ path: fp, name: path.basename(fp), content, chapter });
  }
  return files;
});

// IPC: Parse SRT files
ipcMain.handle('parse-srts', async (_, files) => {
  const parsed = [];
  for (const f of files) {
    const entries = parseSRT(f.content);
    parsed.push({ ...f, entries, count: entries.length });
  }
  // Sort by chapter number
  parsed.sort((a, b) => a.chapter - b.chapter);
  return parsed;
});

// IPC: Save dialog for Excel
ipcMain.handle('save-excel', async (_, parsedFiles) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar Excel',
    defaultPath: 'guion.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (result.canceled) return { success: false };

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SRT Converter';
    wb.created = new Date();

    // ---- Sheet CV ----
    const cvSheet = wb.addWorksheet('CV');
    const cvHeaders = ['Capitulo', 'Nombre', 'Foto'];
    const cvHeaderRow = cvSheet.addRow(cvHeaders);
    styleHeaderRow(cvHeaderRow, 'CV');
    cvSheet.columns = [
      { key: 'Capitulo', width: 12 },
      { key: 'Nombre', width: 30 },
      { key: 'Foto', width: 20 }
    ];
    // Add one row per chapter — Capitulo column left empty
    for (const f of parsedFiles) {
      const row = cvSheet.addRow(['', '', '']);
      styleDataRow(row);
    }

    // ---- Sheet GUION ----
    const guionSheet = wb.addWorksheet('GUION');
    const guionHeaders = ['Capitulo', 'Inicio', 'Fin', 'Personaje', 'Dialogo'];
    const guionHeaderRow = guionSheet.addRow(guionHeaders);
    styleHeaderRow(guionHeaderRow, 'GUION');
    guionSheet.columns = [
      { key: 'Capitulo', width: 12 },
      { key: 'Inicio', width: 16 },
      { key: 'Fin', width: 16 },
      { key: 'Personaje', width: 20 },
      { key: 'Dialogo', width: 60 }
    ];

    for (const f of parsedFiles) {
      for (const entry of f.entries) {
        const row = guionSheet.addRow([
          f.chapter || '',
          entry.inicio,
          entry.fin,
          '',
          entry.dialogo
        ]);
        styleDataRow(row);
        // Wrap dialog text
        row.getCell(5).alignment = { wrapText: true, vertical: 'top' };
      }
    }

    // Freeze header rows
    cvSheet.views = [{ state: 'frozen', ySplit: 1 }];
    guionSheet.views = [{ state: 'frozen', ySplit: 1 }];

    await wb.xlsx.writeFile(result.filePath);
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function styleHeaderRow(row, sheetType) {
  const bgColor = sheetType === 'CV' ? '1a1a2e' : '16213e';
  const textColor = 'e0b472';
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FF' + textColor }, size: 11, name: 'Arial' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FFe0b472' } }
    };
  });
  row.height = 24;
}

function styleDataRow(row) {
  row.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10 };
    cell.alignment = { vertical: 'top' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFdddddd' } }
    };
  });
}