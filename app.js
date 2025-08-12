/**
 * app.js — ausführlich, ohne Abkürzungen, robust
 *
 * Hinweise:
 * - Leg die drei Dateien in denselben Ordner.
 * - Öffne index.html im Browser. Tests im mobilen Modus empfohlen.
 * - Chart.js wird über CDN eingebunden. Wenn Chart.js nicht geladen wird, bleiben Diagramme inaktiv, aber App funktioniert weiter.
 */

/* ------------------------ Hilfsfunktionen ------------------------ */

/**
 * Wählt ein einzelnes Element aus dem DOM.
 * @param {string} selector CSS-Selector
 * @returns {Element|null}
 */
function selectElement(selector) {
  return document.querySelector(selector);
}

/**
 * Wählt mehrere Elemente aus dem DOM.
 * @param {string} selector CSS-Selector
 * @returns {Element[]}
 */
function selectElements(selector) {
  return Array.from(document.querySelectorAll(selector));
}

/**
 * Einfaches CHF-Format für Zahlen.
 * @param {number} value
 * @returns {string}
 */
function formatAsCHF(value) {
  const numberVersion = Number(value || 0);
  return 'CHF ' + numberVersion.toFixed(2);
}

/**
 * Erzeugt eine eindeutige ID mit voran gestelltem Prefix.
 * @param {string} prefix
 * @returns {string}
 */
function generateUniqueId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 9);
}

/**
 * Escape für HTML-Ausgaben (Sicherheit).
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, function (char) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[char];
  });
}

/* ------------------------ Locals / Constants ------------------------ */

const STORAGE_KEY = 'budget_planner_app_v1_complete';
const DAILY_QUOTES = [
  'Kleine Schritte, grosse Wirkung.',
  'Spare heute, geniesse morgen.',
  'Kenne deine Ausgaben, meistere dein Leben.',
  'Jeder Franken zählt.',
  'Bewusst leben, bewusst sparen.'
];

/* ------------------------ Application State ------------------------ */
/**
 * State-Objekt enthält alle persistierten Daten. Struktur:
 * {
 *   userName: string,
 *   budgetAmount: number,
 *   transactions: [{ id, description, amount, category, date }],
 *   categories: [ 'Miete', 'Transport', ... ],
 *   themeName: 'standard'|'warm'|'kalt'|'fancy'|'special'|'girly',
 *   payday: integer 1..28,
 *   archivedPeriods: [{ id, label, dateArchived, budgetAtArchive, transactionsSnapshot, categoriesSnapshot }],
 *   lastArchivePeriodId: string|null
 * }
 */
let applicationState = {
  userName: '',
  budgetAmount: 0,
  transactions: [],
  categories: [], // NO defaults — user must add categories
  themeName: 'standard',
  payday: 1,
  archivedPeriods: [],
  lastArchivePeriodId: null
};

/* ------------------------ Persistence ------------------------ */

/**
 * Lädt den State aus localStorage, wenn vorhanden.
 */
function loadApplicationState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merget konservativ, überschreibt nur vorhandene Schlüssel
      applicationState = Object.assign(applicationState, parsed || {});
    }
  } catch (error) {
    console.error('Fehler beim Laden des Zustands:', error);
    // Falls die Daten korrupt sind, behalten wir den Default-State
  }
}

/**
 * Speichert den aktuellen State in localStorage.
 */
function saveApplicationState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(applicationState));
  } catch (error) {
    console.error('Fehler beim Speichern des Zustands:', error);
  }
}

/* ------------------------ Chart-Management ------------------------ */

let chartByCategory = null;
let chartPercentage = null;

/**
 * Initialisiert Chart.js Diagramme, falls Chart.js geladen ist.
 * Schützt gegen Fehler, gibt Konsolenmeldung bei fehlender Bibliothek.
 */
function initializeCharts() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js ist nicht geladen. Diagramme sind deaktiviert.');
    return;
  }

  const canvasCategory = selectElement('#categoryChart');
  const canvasPercentage = selectElement('#percentageChart');

  if (!canvasCategory || !canvasPercentage) {
    console.warn('Canvas-Elemente für Diagramme fehlen im DOM.');
    return;
  }

  if (chartByCategory) try { chartByCategory.destroy(); } catch (e) {}
  if (chartPercentage) try { chartPercentage.destroy(); } catch (e) {}

  chartByCategory = new Chart(canvasCategory.getContext('2d'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{ label: 'Betrag', data: [], backgroundColor: [] }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatAsCHF(ctx.raw) } } },
      scales: { y: { beginAtZero: true } }
    }
  });

  chartPercentage = new Chart(canvasPercentage.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{ data: [], backgroundColor: [] }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

/**
 * Aktualisiert Daten und Farben in den Diagrammen.
 */
function refreshCharts() {
  if (!chartByCategory || !chartPercentage) {
    return;
  }

  const sums = {};
  applicationState.transactions.forEach(function (t) {
    sums[t.category] = (sums[t.category] || 0) + Number(t.amount || 0);
  });

  const labels = Object.keys(sums);
  const values = labels.map(function (label) { return sums[label]; });

  // einfache Farbgenerierung HSL
  const colors = labels.map(function (_, i) {
    return 'hsl(' + ((i * 55) % 360) + ' 78% 55%)';
  });

  // Falls keine Daten vorhanden sind, zeigen wir "Keine Daten" im Diagramm
  if (labels.length === 0) {
    chartByCategory.data.labels = ['Keine Daten'];
    chartByCategory.data.datasets[0].data = [0];
    chartByCategory.data.datasets[0].backgroundColor = ['rgba(0,0,0,0.06)'];
    chartPercentage.data.labels = ['Keine Daten'];
    chartPercentage.data.datasets[0].data = [100];
    chartPercentage.data.datasets[0].backgroundColor = ['rgba(0,0,0,0.06)'];
  } else {
    chartByCategory.data.labels = labels;
    chartByCategory.data.datasets[0].data = values;
    chartByCategory.data.datasets[0].backgroundColor = colors;

    chartPercentage.data.labels = labels;
    chartPercentage.data.datasets[0].data = values;
    chartPercentage.data.datasets[0].backgroundColor = colors;
  }

  chartByCategory.update();
  chartPercentage.update();
}

/**
 * Exportiert das Kategorie-Diagramm als PNG mit canvas.toBlob und lädt die Datei herunter.
 * Sauberer Weg, unterstützt Browser ohne zusätzliche Plugins.
 */
function downloadCategoryChartAsPng() {
  try {
    if (!chartByCategory) {
      alert('Diagramm ist nicht verfügbar.');
      return;
    }
    const canvas = chartByCategory.canvas;
    // toBlob ist asynchron und zuverlässiger als dataURL für grosse Bilder
    canvas.toBlob(function(blob) {
      if (!blob) {
        alert('Diagramm konnte nicht exportiert werden.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ausgaben-diagramm-' + (new Date().toISOString().slice(0,10)) + '.png';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast('Diagramm als PNG heruntergeladen');
    }, 'image/png');
  } catch (error) {
    console.error('Fehler beim Export des Diagramms:', error);
    alert('Diagramm-Export fehlgeschlagen.');
  }
}

/* ------------------------ UI Aktualisierungen & Render ------------------------ */

/**
 * Aktualisiert Kopfzeile (Name, Monat, Datum) und täglich wechselndes Zitat.
 */
function updateHeaderAndQuote() {
  const greetingElement = selectElement('#greetingLine');
  const monthHeaderElement = selectElement('#monthHeader');
  const monthLabelElement = selectElement('#monthLabel');
  const currentDateTimeElement = selectElement('#currentDateTime');
  const dailyQuoteElement = selectElement('#dailyQuote');
  const now = new Date();

  if (greetingElement) {
    greetingElement.textContent = applicationState.userName ? 'Hallo ' + applicationState.userName : 'Hallo';
  }

  if (monthLabelElement) {
    const month = now.toLocaleString('de-DE', { month: 'long' });
    monthLabelElement.textContent = 'für ' + month + ' ' + now.getFullYear();
  }

  if (currentDateTimeElement) {
    currentDateTimeElement.textContent = now.toLocaleString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  if (dailyQuoteElement) {
    const quoteIndex = now.getDate() % DAILY_QUOTES.length;
    const quoteText = DAILY_QUOTES[quoteIndex];
    // Colorize quote-quotation-marks using current theme gradient variable
    const accentGradient = getComputedStyle(document.documentElement).getPropertyValue('--accent-gradient') || 'linear-gradient(135deg,#ffeb3b,#4caf50)';
    dailyQuoteElement.innerHTML = '<span style="background:' + accentGradient + ';-webkit-background-clip:text;color:transparent;font-weight:800">“</span> ' + escapeHtml(quoteText) + ' <span style="background:' + accentGradient + ';-webkit-background-clip:text;color:transparent;font-weight:800">”</span>';
  }
}

/**
 * Aktualisiert Budget-Übersicht (spent / remaining) im UI.
 */
function updateSummaryInUi() {
  const spentElement = selectElement('#spentAmount');
  const remainingElement = selectElement('#remainingAmount');

  const totalSpent = applicationState.transactions.reduce(function(sum, tx) { return sum + Number(tx.amount || 0); }, 0);
  const remaining = Number(applicationState.budgetAmount || 0) - totalSpent;

  if (spentElement) { spentElement.textContent = formatAsCHF(totalSpent); }
  if (remainingElement) {
    remainingElement.textContent = formatAsCHF(remaining);
    if (remaining < 200) {
      remainingElement.classList.add('red-alert');
    } else {
      remainingElement.classList.remove('red-alert');
    }
  }
}

/**
 * Rendert die Transaktionsliste im Reiter Verlauf.
 */
function renderHistoryList() {
  const container = selectElement('#historyList');
  if (!container) return;
  container.innerHTML = '';

  if (!applicationState.transactions.length) {
    container.innerHTML = '<div class="muted">Keine Einträge.</div>';
    return;
  }

  // Neueste Einträge oben
  const transactionsSorted = applicationState.transactions.slice().reverse();
  transactionsSorted.forEach(function (tx) {
    const wrapper = document.createElement('div');
    wrapper.className = 'panel';
    wrapper.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div><div style="font-weight:800">' + escapeHtml(tx.description) + '</div>' +
      '<div style="font-size:12px;color:rgba(6,22,36,0.45)">' + new Date(tx.date).toLocaleString() + '</div>' +
      '<div style="font-size:12px;color:rgba(6,22,36,0.45)">' + escapeHtml(tx.category) + '</div></div>' +
      '<div style="text-align:right"><div style="font-weight:900">' + formatAsCHF(tx.amount) + '</div>' +
      '<div style="margin-top:8px"><button class="btn btn-ghost" data-delete="' + tx.id + '">Löschen</button></div></div></div>';
    container.appendChild(wrapper);
  });
}

/**
 * Rendert die vollständige Liste im Reiter Auflistung (mit Filter).
 */
function renderAllTransactionsList(filterText, filterCategory) {
  const container = selectElement('#listAllTransactions');
  if (!container) return;
  container.innerHTML = '';
  const text = (filterText || '').trim().toLowerCase();

  const filtered = applicationState.transactions.filter(function (tx) {
    const matchesCategory = !filterCategory || tx.category === filterCategory;
    const matchesText = !text || (tx.description || '').toLowerCase().includes(text) || (tx.category || '').toLowerCase().includes(text);
    return matchesCategory && matchesText;
  });

  if (!filtered.length) {
    container.innerHTML = '<div class="muted">Keine Einträge.</div>';
    return;
  }

  filtered.slice().reverse().forEach(function (tx) {
    const row = document.createElement('div');
    row.className = 'panel';
    row.innerHTML = '<div style="display:flex;justify-content:space-between"><div>' + escapeHtml(tx.category) + ' — ' + escapeHtml(tx.description) + '</div><div style="font-weight:900">' + formatAsCHF(tx.amount) + '</div></div>';
    container.appendChild(row);
  });
}

/**
 * Rendert die Kategorie-Liste in Einstellungen und befüllt die Select-Auswahl.
 */
function renderCategoryListAndSelects() {
  // Kategorie-Liste
  const categoryListElement = selectElement('#listCategories');
  if (categoryListElement) {
    categoryListElement.innerHTML = '';
    if (!applicationState.categories.length) {
      categoryListElement.innerHTML = '<div class="muted">Keine Kategorien. Bitte erstelle welche.</div>';
    } else {
      applicationState.categories.forEach(function (cat) {
        const item = document.createElement('div');
        item.className = 'panel';
        item.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
                         '<div style="font-weight:800">' + escapeHtml(cat) + '</div>' +
                         '<div style="display:flex;gap:8px">' +
                         '<button class="btn btn-primary" data-edit-cat="' + escapeHtml(cat) + '">Bearbeiten</button>' +
                         '<button class="btn btn-danger" data-delete-cat="' + escapeHtml(cat) + '">Löschen</button>' +
                         '</div></div>';
        categoryListElement.appendChild(item);
      });
    }
  }

  // Select-Steuerelemente
  const selectTransactionCategory = selectElement('#transactionCategory');
  const filterCategorySelect = selectElement('#filterCategory');

  if (selectTransactionCategory) {
    selectTransactionCategory.innerHTML = '';
    if (!applicationState.categories.length) {
      selectTransactionCategory.disabled = true;
      const placeholderOption = document.createElement('option');
      placeholderOption.text = 'Bitte Kategorien anlegen';
      placeholderOption.value = '';
      selectTransactionCategory.appendChild(placeholderOption);
    } else {
      selectTransactionCategory.disabled = false;
      applicationState.categories.slice().sort().forEach(function (cat) {
        const option = document.createElement('option');
        option.value = cat;
        option.text = cat;
        selectTransactionCategory.appendChild(option);
      });
    }
  }

  if (filterCategorySelect) {
    filterCategorySelect.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.text = 'Alle Kategorien';
    filterCategorySelect.appendChild(allOption);
    applicationState.categories.slice().sort().forEach(function (cat) {
      const option = document.createElement('option');
      option.value = cat;
      option.text = cat;
      filterCategorySelect.appendChild(option);
    });
  }

  // Aktivierungszustand für Hinzufügen-Button
  const addTransactionButton = selectElement('#buttonAddTransaction');
  if (addTransactionButton) {
    addTransactionButton.disabled = !applicationState.categories.length;
  }
}

/**
 * Rendert Archiv-Einträge
 */
function renderArchiveList() {
  const archiveElement = selectElement('#archiveList');
  if (!archiveElement) return;
  archiveElement.innerHTML = '';
  if (!applicationState.archivedPeriods.length) {
    archiveElement.innerHTML = '<div class="muted">Keine archivierten Monate.</div>';
    return;
  }

  applicationState.archivedPeriods.slice().reverse().forEach(function (archive) {
    const node = document.createElement('div');
    node.className = 'panel';
    // Jeweils Download-Buttons für Archiv-Inhalt (Word/CSV) und Übersicht
    node.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
                     '<div><div style="font-weight:800">' + escapeHtml(archive.label) + '</div><div style="font-size:12px;color:rgba(6,22,36,0.45)">' + new Date(archive.dateArchived).toLocaleString() + '</div></div>' +
                     '<div style="display:flex;gap:8px">' +
                     '<button class="btn btn-primary" data-archive-download-word="' + archive.id + '">Word</button>' +
                     '<button class="btn btn-ghost" data-archive-download-csv="' + archive.id + '">CSV</button>' +
                     '</div></div>';
    archiveElement.appendChild(node);
  });
}

/* ------------------------ Archivier-Logik (Zahltag) ------------------------ */

/**
 * Erzeugt eine Periodenkennung (z.B. "2025-08") für einen Startdatum
 * basierend auf dem Zahltag. So wird eindeutig später geprüft, ob archiviert wurde.
 * @param {Date} date
 * @param {number} payday
 * @returns {string} periodId
 */
function computePeriodIdForDate(date, payday) {
  // Der Periodenstart ist der Tag = payday des aktuellen Monats, wenn date >= diesem Tag,
  // sonst ist der Periodenstart der payday des vorherigen Monats.
  var year = date.getFullYear();
  var month = date.getMonth(); // 0-basiert
  var day = date.getDate();
  var candidate = new Date(year, month, payday, 0, 0, 0, 0);
  var periodStart;
  if (day >= payday) {
    periodStart = candidate;
  } else {
    // vorheriger monat
    periodStart = new Date(year, month - 1, payday, 0, 0, 0, 0);
  }
  // periodId in Format YYYY-MM
  var pidYear = periodStart.getFullYear();
  var pidMonth = String(periodStart.getMonth() + 1).padStart(2, '0'); // month+1
  return pidYear + '-' + pidMonth;
}

/**
 * Archiviert das aktuelle Budget und die Transaktionen in applicationState.archivedPeriods,
 * wenn heute Zahltag ist und die Periode noch nicht archiviert wurde.
 */
function archiveIfNeededAndPerformAutomatically() {
  try {
    var today = new Date();
    var configuredPayday = Number(applicationState.payday) || 1;
    // Wenn heute am konfigurierten Zahltag ist, prüfen wir, ob diese Periode schon archiviert wurde
    if (today.getDate() !== configuredPayday) {
      return; // nur archivieren am exakt eingestellten Tag
    }

    var currentPeriodId = computePeriodIdForDate(today, configuredPayday);

    if (applicationState.lastArchivePeriodId === currentPeriodId) {
      // bereits archiviert für diese Periode
      return;
    }

    // Erstellen eines Archiv-Eintrags
    var archiveEntry = {
      id: 'arch_' + generateUniqueId('arch_'),
      label: (new Date()).toLocaleString('de-DE', { month: 'long', year: 'numeric' }),
      dateArchived: new Date().toISOString(),
      budgetAtArchive: Number(applicationState.budgetAmount || 0),
      transactionsSnapshot: JSON.parse(JSON.stringify(applicationState.transactions || [])),
      categoriesSnapshot: JSON.parse(JSON.stringify(applicationState.categories || []))
    };

    applicationState.archivedPeriods = applicationState.archivedPeriods || [];
    applicationState.archivedPeriods.push(archiveEntry);

    // Reset: Budget-Seite leeren (Budget und Transaktionen löschen)
    applicationState.budgetAmount = 0;
    applicationState.transactions = [];

    // Markieren, dass diese Periode archiviert wurde
    applicationState.lastArchivePeriodId = currentPeriodId;

    // Persistieren
    saveApplicationState();

    // UI-Update
    updateSummaryInUi();
    renderHistoryList();
    refreshCharts();
    renderArchiveList();
    renderCategoryListAndSelects();
    showToast('Budget archiviert für diese Periode. Die Budgetseite wurde zurückgesetzt.');
  } catch (error) {
    console.error('Fehler beim automatischen Archivieren:', error);
  }
}

/* ------------------------ Exports für Archiv-Einträge ------------------------ */

/**
 * Exportiert einen Archiv-Eintrag als Word (.doc) — HTML-in-Word.
 * @param {string} archiveId
 */
function downloadArchiveAsWord(archiveId) {
  const archive = (applicationState.archivedPeriods || []).find(function (a) { return a.id === archiveId; });
  if (!archive) { alert('Archiv-Eintrag nicht gefunden.'); return; }

  // HTML-Tabelle mit gruppierten Transaktionen nach Kategorie
  const groups = {};
  (archive.transactionsSnapshot || []).forEach(function (tx) {
    groups[tx.category] = groups[tx.category] || [];
    groups[tx.category].push(tx);
  });

  var html = '<html><head><meta charset="utf-8"><title>Archiv ' + escapeHtml(archive.label) + '</title></head><body style="font-family:Nunito, sans-serif">';
  html += '<h2>Archiv: ' + escapeHtml(archive.label) + '</h2>';
  html += '<p>Budget bei Archivierung: ' + formatAsCHF(archive.budgetAtArchive) + '</p>';
  html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Kategorie</th><th>Beschreibung</th><th style="text-align:right">Betrag</th></tr></thead><tbody>';

  var grandTotal = 0;
  Object.keys(groups).sort().forEach(function (cat) {
    var subtotal = 0;
    groups[cat].forEach(function (tx) {
      subtotal += Number(tx.amount || 0);
      html += '<tr><td>' + escapeHtml(cat) + '</td><td>' + escapeHtml(tx.description) + '</td><td style="text-align:right">' + Number(tx.amount).toFixed(2) + '</td></tr>';
    });
    html += '<tr style="font-weight:700;background:#f4f4f4"><td colspan="2">Total ' + escapeHtml(cat) + '</td><td style="text-align:right">' + subtotal.toFixed(2) + '</td></tr>';
    grandTotal += subtotal;
  });

  html += '<tr style="font-weight:900;background:#e9f7ef"><td colspan="2">Gesamt</td><td style="text-align:right">' + grandTotal.toFixed(2) + '</td></tr>';
  html += '</tbody></table></body></html>';

  var blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  var url = URL.createObjectURL(blob);
  var anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'archiv_' + archive.label.replace(/\s+/g, '_') + '.doc';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exportiert ein Archiv-Eintrag als CSV
 * @param {string} archiveId
 */
function downloadArchiveAsCsv(archiveId) {
  const archive = (applicationState.archivedPeriods || []).find(function (a) { return a.id === archiveId; });
  if (!archive) { alert('Archiv-Eintrag nicht gefunden.'); return; }

  var rows = [['Kategorie', 'Beschreibung', 'Betrag', 'Datum']];
  (archive.transactionsSnapshot || []).forEach(function (tx) {
    rows.push([tx.category, tx.description, Number(tx.amount).toFixed(2), tx.date]);
  });

  var csv = rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'archiv_' + archive.label.replace(/\s+/g, '_') + '.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------ Toast (kurze Hinweise für Nutzer) ------------------------ */

var toastTimeoutHandle = null;

/**
 * Zeigt eine temporäre Mitteilung an.
 * @param {string} message
 * @param {number} duration
 */
function showToast(message, duration) {
  var toastElement = selectElement('#toast');
  if (!toastElement) return;
  toastElement.textContent = message;
  toastElement.hidden = false;
  if (toastTimeoutHandle) clearTimeout(toastTimeoutHandle);
  toastTimeoutHandle = setTimeout(function () {
    toastElement.hidden = true;
  }, duration || 2500);
}

/* ------------------------ Benutzeraktionen (Buttons etc.) ------------------------ */

/**
 * Fügt eine neue Kategorie hinzu.
 */
function handleAddCategory() {
  var input = selectElement('#inputNewCategory');
  if (!input) return;
  var name = (input.value || '').trim();
  if (!name) { alert('Bitte einen Kategorienamen eingeben.'); return; }
  if (applicationState.categories.indexOf(name) !== -1) { alert('Kategorie existiert bereits.'); input.value = ''; return; }
  applicationState.categories.push(name);
  saveApplicationState();
  input.value = '';
  renderCategoryListAndSelects();
  showToast('Kategorie hinzugefügt');
}

/**
 * Fügt eine Transaktion hinzu.
 */
function handleAddTransaction() {
  var descriptionInput = selectElement('#transactionDescription');
  var amountInput = selectElement('#transactionAmount');
  var categorySelect = selectElement('#transactionCategory');

  if (!descriptionInput || !amountInput || !categorySelect) {
    alert('Fehler: Formelemente fehlen.');
    return;
  }

  var desc = (descriptionInput.value || '').trim();
  var amount = parseFloat(amountInput.value);
  var category = categorySelect.value;

  if (!desc) { alert('Bitte eine Beschreibung eingeben.'); return; }
  if (isNaN(amount) || amount <= 0) { alert('Bitte einen gültigen Betrag eingeben.'); return; }
  if (!category) { alert('Bitte eine Kategorie auswählen.'); return; }

  var tx = {
    id: generateUniqueId('tx_'),
    description: desc,
    amount: amount,
    category: category,
    date: new Date().toISOString()
  };

  applicationState.transactions.push(tx);
  saveApplicationState();

  descriptionInput.value = '';
  amountInput.value = '';

  updateSummaryInUi();
  renderHistoryList();
  renderAllTransactionsList();
  refreshCharts();
  showToast('Ausgabe hinzugefügt');
}

/**
 * Speichert das Gesamtbudget.
 */
function handleSaveBudget() {
  var totalBudgetInput = selectElement('#totalBudget');
  if (!totalBudgetInput) return;
  var value = parseFloat(totalBudgetInput.value);
  if (isNaN(value) || value < 0) { alert('Bitte gültiges Budget eingeben.'); return; }
  applicationState.budgetAmount = value;
  saveApplicationState();
  updateSummaryInUi();
  showToast('Budget gespeichert');
}

/**
 * Löscht einen Verlaufseintrag per ID.
 * @param {string} id
 */
function handleDeleteTransactionById(id) {
  if (!confirm('Eintrag wirklich löschen?')) return;
  applicationState.transactions = applicationState.transactions.filter(function (t) { return t.id !== id; });
  saveApplicationState();
  updateSummaryInUi();
  renderHistoryList();
  renderAllTransactionsList();
  refreshCharts();
  showToast('Eintrag gelöscht');
}

/* ------------------------ Eventdelegation & Wiring ------------------------ */

/**
 * Registriert alle Event-Listener für Buttons, Delegationen etc.
 */
function wireEventHandlers() {
  // Bottom nav buttons: zeigt passenden Tab
  selectElements('.bottom-nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-target');
      // Deaktiviert alle ersten
      selectElements('.bottom-nav-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      // Versteckt alle Tabs
      selectElements('.tab').forEach(function (tab) { tab.classList.remove('active'); tab.style.display = 'none'; tab.setAttribute('aria-hidden', 'true'); });
      var targetSection = selectElement('#tab-' + target);
      if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
        targetSection.setAttribute('aria-hidden', 'false');
      }
    });
  });

  // Button: Kategorie hinzufügen
  var addCategoryButton = selectElement('#buttonAddCategory');
  if (addCategoryButton) addCategoryButton.addEventListener('click', handleAddCategory);

  // Button: Transaktion hinzufügen
  var addTransactionButton = selectElement('#buttonAddTransaction');
  if (addTransactionButton) addTransactionButton.addEventListener('click', handleAddTransaction);

  // Button: Budget speichern
  var saveBudgetButton = selectElement('#buttonSaveBudget');
  if (saveBudgetButton) saveBudgetButton.addEventListener('click', handleSaveBudget);

  // Delegation: Löschen einzelner Transaktionen in Verlauf
  var historyListElement = selectElement('#historyList');
  if (historyListElement) {
    historyListElement.addEventListener('click', function (event) {
      var deleteButton = event.target.closest('[data-delete]');
      if (deleteButton) {
        var id = deleteButton.getAttribute('data-delete');
        if (id) {
          handleDeleteTransactionById(id);
        }
      }
    });
  }

  // Delegation: Kategorie bearbeiten/löschen
  var categoriesListElement = selectElement('#listCategories');
  if (categoriesListElement) {
    categoriesListElement.addEventListener('click', function (event) {
      var editButton = event.target.closest('[data-edit-cat]');
      var deleteButton = event.target.closest('[data-delete-cat]');
      if (editButton) {
        var oldName = editButton.getAttribute('data-edit-cat');
        var newName = prompt('Neuer Kategorienname', oldName);
        if (newName && newName.trim()) {
          // replace category and update transactions
          applicationState.categories = applicationState.categories.map(function (c) { return c === oldName ? newName.trim() : c; });
          applicationState.transactions.forEach(function (tx) { if (tx.category === oldName) tx.category = newName.trim(); });
          saveApplicationState();
          renderCategoryListAndSelects();
          updateSummaryInUi();
          renderHistoryList();
          refreshCharts();
          showToast('Kategorie umbenannt');
        }
        return;
      }
      if (deleteButton) {
        var nameToDelete = deleteButton.getAttribute('data-delete-cat');
        if (!nameToDelete) return;
        if (!confirm('Kategorie löschen? Bestehende Einträge werden auf "Sonstiges" gesetzt.')) return;
        applicationState.categories = applicationState.categories.filter(function (c) { return c !== nameToDelete; });
        applicationState.transactions.forEach(function (tx) { if (tx.category === nameToDelete) tx.category = 'Sonstiges'; });
        saveApplicationState();
        renderCategoryListAndSelects();
        updateSummaryInUi();
        renderHistoryList();
        refreshCharts();
        showToast('Kategorie gelöscht');
      }
    });
  }

  // Export-Buttons in Einstellungen
  var exportWordButton = selectElement('#buttonExportWord');
  if (exportWordButton) {
    exportWordButton.addEventListener('click', function () {
      // Exportiert alle bisherigen Transaktionen als Word-Dokument
      if (!applicationState.transactions.length) { alert('Keine Daten zum Exportieren.'); return; }

      // Build grouped HTML (like in archive)
      var groups = {};
      applicationState.transactions.forEach(function (tx) {
        groups[tx.category] = groups[tx.category] || [];
        groups[tx.category].push(tx);
      });

      var html = '<html><head><meta charset="utf-8"><title>Verlauf</title></head><body style="font-family:Nunito, sans-serif"><h2>Verlauf</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Kategorie</th><th>Beschreibung</th><th style="text-align:right">Betrag</th></tr></thead><tbody>';
      var grand = 0;
      Object.keys(groups).sort().forEach(function (cat) {
        var subtotal = 0;
        groups[cat].forEach(function (it) {
          subtotal += Number(it.amount || 0);
          html += '<tr><td>' + escapeHtml(cat) + '</td><td>' + escapeHtml(it.description) + '</td><td style="text-align:right">' + Number(it.amount).toFixed(2) + '</td></tr>';
        });
        html += '<tr style="font-weight:700;background:#f4f4f4"><td colspan="2">Total ' + escapeHtml(cat) + '</td><td style="text-align:right">' + subtotal.toFixed(2) + '</td></tr>';
        grand += subtotal;
      });
      html += '<tr style="font-weight:900;background:#e9f7ef"><td colspan="2">Gesamt</td><td style="text-align:right">' + grand.toFixed(2) + '</td></tr>';
      html += '</tbody></table></body></html>';

      var blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a'); anchor.href = url; anchor.download = 'verlauf_' + (new Date().toISOString().slice(0,10)) + '.doc'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      showToast('Verlauf als Word exportiert');
    });
  }

  var exportCsvButton = selectElement('#buttonExportCsv');
  if (exportCsvButton) {
    exportCsvButton.addEventListener('click', function () {
      if (!applicationState.transactions.length) { alert('Keine Daten.'); return; }
      var rows = [['Kategorie','Beschreibung','Betrag','Datum']];
      applicationState.transactions.forEach(function (tx) {
        rows.push([tx.category, tx.description, Number(tx.amount).toFixed(2), tx.date]);
      });
      var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a'); anchor.href = url; anchor.download = 'verlauf_' + (new Date().toISOString().slice(0,10)) + '.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      showToast('Verlauf als CSV exportiert');
    });
  }

  var exportChartButton = selectElement('#buttonExportChart');
  if (exportChartButton) {
    exportChartButton.addEventListener('click', function () {
      downloadCategoryChartAsPng();
    });
  }

  // Reset History Button
  var resetHistoryButton = selectElement('#buttonResetHistory');
  if (resetHistoryButton) {
    resetHistoryButton.addEventListener('click', function () {
      if (!confirm('Verlauf wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
      applicationState.transactions = [];
      saveApplicationState();
      updateSummaryInUi();
      renderHistoryList();
      renderAllTransactionsList();
      refreshCharts();
      showToast('Verlauf gelöscht');
    });
  }

  // Delegation: Löschen einzelne Transaktionen in AllList (falls wir delete buttons setzen)
  selectElement('#listAllTransactions') && selectElement('#listAllTransactions').addEventListener('click', function (event) {
    var deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      var id = deleteButton.getAttribute('data-delete');
      if (id) handleDeleteTransactionById(id);
    }
  });

  // Delegation für Archiv-Download Buttons
  selectElement('#archiveList') && selectElement('#archiveList').addEventListener('click', function (event) {
    var downloadWordBtn = event.target.closest('[data-archive-download-word]');
    var downloadCsvBtn = event.target.closest('[data-archive-download-csv]');
    if (downloadWordBtn) {
      var archiveId = downloadWordBtn.getAttribute('data-archive-download-word');
      if (archiveId) downloadArchiveAsWord(archiveId);
    } else if (downloadCsvBtn) {
      var archiveIdCsv = downloadCsvBtn.getAttribute('data-archive-download-csv');
      if (archiveIdCsv) downloadArchiveAsCsv(archiveIdCsv);
    }
  });

  // Filter & Search inputs
  selectElement('#searchTransactions') && selectElement('#searchTransactions').addEventListener('input', function () {
    renderAllTransactionsList(selectElement('#searchTransactions').value || '', selectElement('#filterCategory').value || '');
  });

  selectElement('#filterCategory') && selectElement('#filterCategory').addEventListener('change', function () {
    renderAllTransactionsList(selectElement('#searchTransactions').value || '', selectElement('#filterCategory').value || '');
  });

  // Save name button in settings
  selectElement('#buttonSaveName') && selectElement('#buttonSaveName').addEventListener('click', function () {
    var name = (selectElement('#inputUserName').value || '').trim();
    if (!name) { alert('Bitte einen Namen eingeben.'); return; }
    applicationState.userName = name;
    saveApplicationState();
    updateHeaderAndQuote();
    showToast('Name gespeichert');
  });

  // Save payday in settings
  selectElement('#buttonSavePayday') && selectElement('#buttonSavePayday').addEventListener('click', function () {
    var v = Number(selectElement('#inputPayday').value);
    if (!v || v < 1 || v > 28) { alert('Zahltag bitte zwischen 1 und 28 eingeben.'); return; }
    applicationState.payday = v;
    saveApplicationState();
    showToast('Zahltag gespeichert');
  });

  // Modal flow buttons
  var modalButtonSaveName = selectElement('#modalButtonSaveName');
  if (modalButtonSaveName) modalButtonSaveName.addEventListener('click', function () {
    var nameValue = (selectElement('#modalInputName').value || '').trim();
    if (!nameValue) { alert('Bitte Namen eingeben.'); return; }
    applicationState.userName = nameValue;
    saveApplicationState();
    // schliessen Welcome modal
    selectElement('#modalWelcome').setAttribute('aria-hidden', 'true');
    updateHeaderAndQuote();
    // Nun Intro in Ich-Perspektive zeigen
    selectElement('#modalIntro').setAttribute('aria-hidden', 'false');
  });

  var modalIntroOk = selectElement('#modalIntroOk');
  if (modalIntroOk) modalIntroOk.addEventListener('click', function () {
    selectElement('#modalIntro').setAttribute('aria-hidden', 'true');
    // Zeige Hinweis: Kategorien anlegen (erzwungen)
    selectElement('#modalCategoriesRequired').setAttribute('aria-hidden', 'false');
  });

  var modalCategoriesGo = selectElement('#modalCategoriesGo');
  if (modalCategoriesGo) modalCategoriesGo.addEventListener('click', function () {
    selectElement('#modalCategoriesRequired').setAttribute('aria-hidden', 'true');
    // Öffne Kategorien-Reiter automatisch
    selectElements('.bottom-nav-btn').forEach(function (b) { b.classList.remove('active'); });
    var categoryNavBtn = selectElements('.bottom-nav-btn').find(function (b) { return b.getAttribute('data-target') === 'categories'; });
    if (categoryNavBtn) categoryNavBtn.classList.add('active');
    selectElements('.tab').forEach(function (t) { t.classList.remove('active'); t.style.display = 'none'; });
    var catTab = selectElement('#tab-categories');
    if (catTab) { catTab.classList.add('active'); catTab.style.display = 'block'; catTab.setAttribute('aria-hidden', 'false'); }
    // Anschliessend Payday-Modal öffnen (wie gewünscht)
    selectElement('#modalPayday').setAttribute('aria-hidden', 'false');
  });

  var modalPaydaySave = selectElement('#modalPaydaySave');
  if (modalPaydaySave) modalPaydaySave.addEventListener('click', function () {
    var v = Number(selectElement('#modalPaydayInput').value);
    if (!v || v < 1 || v > 28) { alert('Bitte einen Zahltag zwischen 1 und 28 eingeben.'); return; }
    applicationState.payday = v;
    saveApplicationState();
    selectElement('#modalPayday').setAttribute('aria-hidden', 'true');
    showToast('Zahltag gespeichert. Die Archivierung erfolgt jeweils am gewählten Tag.');
  });

  // Button Save Payday in Einstellungen synchron
  var inputPayday = selectElement('#inputPayday');
  if (inputPayday) inputPayday.value = applicationState.payday || 1;

  // Theme buttons
  selectElements('.theme-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var themeName = btn.getAttribute('data-theme') || 'standard';
      applicationState.themeName = themeName;
      document.documentElement.setAttribute('data-theme', themeName);
      saveApplicationState();
      updateHeaderAndQuote();
      showToast('Theme gewechselt');
    });
  });
}

/* ------------------------ Initialisierung und Start ------------------------ */

/**
 * Hauptinitialisation: lädt State, initialisiert Chart, UI, Modals und Event-Handler,
 * prüft automatisches Archivieren am Zahltag.
 */
function initializeApplication() {
  // Load previous state
  loadApplicationState();

  // If no categories present, we enforce the modal flow:
  // At first run (no userName) show welcome modal
  if (!applicationState.userName) {
    selectElement('#modalWelcome').setAttribute('aria-hidden', 'false');
  } else {
    // if user exists but no categories, prompt categories modal
    if (!applicationState.categories || !applicationState.categories.length) {
      // show intro modal in Ich-Perspektive first, then categories required
      selectElement('#modalIntro').setAttribute('aria-hidden', 'false');
    }
  }

  // Set theme in DOM
  document.documentElement.setAttribute('data-theme', applicationState.themeName || 'standard');

  // Populate UI fields
  var budgetInput = selectElement('#totalBudget');
  if (budgetInput) budgetInput.value = applicationState.budgetAmount || '';

  var nameInput = selectElement('#inputUserName');
  if (nameInput) nameInput.value = applicationState.userName || '';

  var paydayInput = selectElement('#inputPayday');
  if (paydayInput) paydayInput.value = applicationState.payday || 1;

  // Initialize charts when DOM ready and Chart.js loaded
  initializeCharts();

  // Wire event handlers
  wireEventHandlers();

  // Render initial UI
  renderCategoryListAndSelects();
  updateHeaderAndQuote();
  updateSummaryInUi();
  renderHistoryList();
  renderAllTransactionsList();
  refreshCharts();
  renderArchiveList();

  // Archivierungsprüfung: wenn heute Zahltag ist, dann archivieren wir (einmal pro Tag)
  archiveIfNeededAndPerformAutomatically();

  // Periodische Aktualisierung der Uhr und Zitat
  setInterval(function () {
    updateHeaderAndQuote();
  }, 60 * 1000);
}

/* ------------------------ Start beim Laden des Dokuments ------------------------ */
document.addEventListener('DOMContentLoaded', function () {
  try {
    initializeApplication();
  } catch (error) {
    console.error('Fehler bei der Initialisierung der Anwendung:', error);
    alert('Ein Fehler ist aufgetreten. Öffne die Browserkonsole und sende mir die Fehlermeldung.');
  }
});
