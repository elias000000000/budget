/* ----------------------------- Helferfunktionen ----------------------------- */
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const STORAGE_KEY = 'budget_planner_v_final';

// Formatierung CHF (einfache)
function fmtCHF(value){
  const n = Number(value || 0);
  return `CHF ${n.toFixed(2)}`;
}

// unique id
function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 9);
}

// HTML-escape (sicherer Ausgabestring)
function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[ch]));
}

// normalize ß -> ss as requested
function normalizeSS(s){
  return String(s || '').replace(/ß/g, 'ss');
}

/* ----------------------------- Default State ----------------------------- */
let state = {
  name: '',
  budget: 0,
  transactions: [], // { id, desc, amount, category, date }
  categories: [],   // populated on load with defaults
  theme: 'standard', // standard, warm, kalt, fancy, special, girly
  payday: 1,        // 1..28
  savedRecords: []
};

/* ----------------------------- Zitate (täglich) ----------------------------- */
const QUOTES = [
  "Kleine Schritte, grosse Wirkung.",
  "Spare heute, geniesse morgen.",
  "Kenne deine Ausgaben, meistere dein Leben.",
  "Jeder Franken zählt.",
  "Bewusst leben, bewusst sparen."
];

/* ----------------------------- Persistence ----------------------------- */
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      // Merge into default state so missing properties don't break
      state = Object.assign(state, parsed);
    }
  }catch(e){
    console.warn('Fehler beim Laden des Zustands:', e);
  }

  // Ensure categories exist (defaults)
  if(!state.categories || !state.categories.length){
    state.categories = ['Handyabo','Fonds','Eltern','Verpflegung','Frisör','Sparen','Geschenke','Sonstiges'];
  }

  // Ensure payday valid
  if(!state.payday || state.payday < 1 || state.payday > 28) state.payday = 1;

  // Ensure theme fallback
  if(!state.theme) state.theme = 'standard';
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    console.warn('Fehler beim Speichern des Zustands:', e);
  }
}

/* ----------------------------- Charts (Chart.js) ----------------------------- */
let categoryChart = null;
let percentageChart = null;

function createCharts(){
  // safe guard: Chart might not be loaded - check
  if(typeof Chart === 'undefined'){
    console.warn('Chart.js nicht verfügbar — Diagramme werden deaktiviert.');
    return;
  }

  const catCanvas = $('#categoryChart');
  const pctCanvas = $('#percentageChart');
  if(!catCanvas || !pctCanvas){
    console.warn('Chart-Canvas fehlt im DOM.');
    return;
  }

  // Destroy existing charts to avoid duplicates
  if(categoryChart) try{ categoryChart.destroy(); }catch(e){ /* ignore */ }
  if(percentageChart) try{ percentageChart.destroy(); }catch(e){ /* ignore */ }

  // Create bar chart (categories)
  categoryChart = new Chart(catCanvas.getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Betrag', data: [], backgroundColor: [] }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtCHF(ctx.raw) } } },
      scales: { y: { beginAtZero: true } }
    }
  });

  // Create doughnut chart (percent)
  percentageChart = new Chart(pctCanvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function updateCharts(){
  if(!categoryChart || !percentageChart) return;

  // aggregate sums by category
  const sums = {};
  state.transactions.forEach(t => {
    sums[t.category] = (sums[t.category] || 0) + Number(t.amount || 0);
  });

  const labels = Object.keys(sums);
  const values = labels.map(l => sums[l]);
  // generate palette (simple HSL cycling)
  const colors = labels.map((_, i) => `hsl(${(i * 55) % 360} 78% 55%)`);

  // update bar chart
  categoryChart.data.labels = labels.length ? labels : ['Keine Daten'];
  categoryChart.data.datasets[0].data = labels.length ? values : [0];
  categoryChart.data.datasets[0].backgroundColor = labels.length ? colors : ['rgba(0,0,0,0.06)'];
  categoryChart.update();

  // update doughnut
  percentageChart.data.labels = labels.length ? labels : ['Keine Daten'];
  percentageChart.data.datasets[0].data = labels.length ? values : [100];
  percentageChart.data.datasets[0].backgroundColor = labels.length ? colors : ['rgba(0,0,0,0.06)'];
  percentageChart.update();
}

/* ----------------------------- Header, Quote, Summary ----------------------------- */
function updateHeaderAndQuote(){
  const now = new Date();
  const month = now.toLocaleString('de-DE', { month:'long' });
  const year = now.getFullYear();

  const greetingEl = $('#greeting');
  if(greetingEl) greetingEl.textContent = state.name ? `Hallo ${normalizeSS(state.name)}` : 'Hallo';

  const monthRangeEl = $('#monthRange');
  if(monthRangeEl) monthRangeEl.innerHTML = `<span id="budgetWord">Budget</span> <span id="monthLabel">für ${month} ${year}</span>`;

  const currentDateEl = $('#currentDate');
  if(currentDateEl) currentDateEl.textContent = now.toLocaleString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

  // DAILY QUOTE — choose by day of month for determinism
  const quoteIndex = now.getDate() % QUOTES.length;
  const quoteText = QUOTES[quoteIndex] || QUOTES[0];

  // Use CSS theme gradient for colored quotes (read --accent-gradient)
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-gradient') || 'linear-gradient(135deg,#ffeb3b,#4caf50)';
  const dailyQuoteEl = $('#dailyQuote');
  if(dailyQuoteEl){
    // Use inline style trick to color only the quotes via gradient
    dailyQuoteEl.innerHTML = `<span style="background:${accent};-webkit-background-clip:text;color:transparent;font-weight:800">“</span> ${escapeHtml(quoteText)} <span style="background:${accent};-webkit-background-clip:text;color:transparent;font-weight:800">”</span>`;
  }
}

function updateSummary(){
  const spent = state.transactions.reduce((s, t) => s + Number(t.amount || 0), 0);
  const remaining = Number(state.budget || 0) - spent;

  const spentEl = $('#spent');
  if(spentEl) spentEl.textContent = fmtCHF(spent);

  const remainingEl = $('#remaining');
  if(remainingEl){
    remainingEl.textContent = fmtCHF(remaining);
    if(remaining < 200) remainingEl.classList.add('red-alert'); else remainingEl.classList.remove('red-alert');
  }
}

/* ----------------------------- Render lists & selects ----------------------------- */
function renderHistory(){
  const container = $('#historyList');
  if(!container) return;
  container.innerHTML = '';

  if(!state.transactions.length){
    container.innerHTML = '<div class="muted">Keine Einträge.</div>';
    return;
  }

  // show newest first
  state.transactions.slice().reverse().forEach(tx => {
    const el = document.createElement('div');
    el.className = 'panel';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:800">${escapeHtml(tx.desc)}</div>
          <div style="font-size:12px;color:rgba(6,22,36,0.45)">${new Date(tx.date).toLocaleString()}</div>
          <div style="font-size:12px;color:rgba(6,22,36,0.45)">${escapeHtml(tx.category)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:900">${fmtCHF(tx.amount)}</div>
          <div style="margin-top:8px"><button class="btn btn-ghost" data-delete="${tx.id}">Löschen</button></div>
        </div>
      </div>
    `;
    container.appendChild(el);
  });
}

function renderAllList(filterText = '', filterCategory = ''){
  const container = $('#allList');
  if(!container) return;
  container.innerHTML = '';

  const q = (filterText || '').toLowerCase();
  const items = state.transactions.filter(t => {
    const byCat = !filterCategory || t.category === filterCategory;
    const byText = !q || (t.desc || '').toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q);
    return byCat && byText;
  }).slice().reverse();

  if(!items.length){
    container.innerHTML = '<div class="muted">Keine Einträge.</div>';
    return;
  }

  items.forEach(t => {
    const el = document.createElement('div');
    el.className = 'panel';
    el.innerHTML = `<div style="display:flex;justify-content:space-between"><div>${escapeHtml(t.category)} — ${escapeHtml(t.desc)}</div><div style="font-weight:900">${fmtCHF(t.amount)}</div></div>`;
    container.appendChild(el);
  });
}

function renderCategoriesList(){
  const el = $('#categoriesList');
  if(!el) return;
  el.innerHTML = '';

  state.categories.slice().forEach(cat => {
    const row = document.createElement('div');
    row.className = 'panel';
    // include data attributes for edit/delete
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:800">${escapeHtml(cat)}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" data-edit-cat="${escapeHtml(cat)}">Bearbeiten</button>
          <button class="btn btn-danger" data-del-cat="${escapeHtml(cat)}">Löschen</button>
        </div>
      </div>
    `;
    el.appendChild(row);
  });
}

function refreshCategorySelect(){
  const sel = $('#txCategory');
  const filter = $('#filterCategory');
  if(sel){
    sel.innerHTML = '';
    state.categories.slice().sort().forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o);
    });
  }
  if(filter){
    filter.innerHTML = '<option value="">Alle Kategorien</option>';
    state.categories.slice().sort().forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c; filter.appendChild(o);
    });
  }
}

/* ----------------------------- CRUD: Transactions ----------------------------- */
function addTransaction(desc, amount, category){
  // validations
  const amt = Number(amount);
  if(!desc || isNaN(amt)) {
    console.warn('Ungültiger Eintrag: Beschreibung und Betrag erforderlich.');
    return;
  }
  const tx = { id: uid('t_'), desc: desc, amount: amt, category: category || 'Sonstiges', date: new Date().toISOString() };
  state.transactions.push(tx);
  saveState();
  // update UI
  updateAfterChange();
}

function deleteTransaction(id){
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
  updateAfterChange();
}

/* ----------------------------- Categories management ----------------------------- */
function addCategory(name){
  const n = String(name || '').trim();
  if(!n) { alert('Bitte Namen eingeben'); return; }
  if(state.categories.includes(n)) { alert('Kategorie existiert bereits'); return; }
  state.categories.push(n);
  saveState();
  refreshCategorySelect();
  renderCategoriesList();
}

function editCategory(oldName, newName){
  const n = String(newName || '').trim();
  if(!n) { alert('Bitte Namen eingeben'); return; }
  const idx = state.categories.indexOf(oldName);
  if(idx === -1) return;
  // rename in categories
  state.categories[idx] = n;
  // also update existing transactions to keep consistency
  state.transactions.forEach(tx => {
    if(tx.category === oldName) tx.category = n;
  });
  saveState();
  refreshCategorySelect();
  renderCategoriesList();
  updateAfterChange();
}

function deleteCategory(name){
  if(!confirm(`Kategorie "${name}" wirklich löschen? Bestehende Ausgaben werden auf "Sonstiges" gesetzt.`)) return;
  state.categories = state.categories.filter(c => c !== name);
  // set transactions with that category to Sonstiges
  state.transactions.forEach(tx => {
    if(tx.category === name) tx.category = 'Sonstiges';
  });
  saveState();
  refreshCategorySelect();
  renderCategoriesList();
  updateAfterChange();
}

/* ----------------------------- Exports ----------------------------- */
function exportCSV(){
  if(!state.transactions.length){ alert('Keine Daten zum Exportieren.'); return; }
  const rows = [['Kategorie','Beschreibung','Betrag','Datum']];
  state.transactions.forEach(t => rows.push([t.category, t.desc, Number(t.amount).toFixed(2), t.date]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `verlauf_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function exportWord(){
  if(!state.transactions.length){ alert('Keine Daten zum Exportieren.'); return; }
  const grouped = {};
  state.transactions.forEach(t => {
    if(!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  });
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>Verlauf</title></head><body style="font-family:Nunito, sans-serif"><h2>Verlauf</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Kategorie</th><th>Beschreibung</th><th style="text-align:right">Betrag</th></tr></thead><tbody>`;
  let grandTotal = 0;
  Object.keys(grouped).sort().forEach(cat => {
    let subtotal = 0;
    grouped[cat].forEach(it => {
      subtotal += Number(it.amount || 0);
      html += `<tr><td>${escapeHtml(cat)}</td><td>${escapeHtml(it.desc)}</td><td style="text-align:right">${Number(it.amount).toFixed(2)}</td></tr>`;
    });
    html += `<tr style="font-weight:700;background:#f4f4f4"><td colspan="2">Total ${escapeHtml(cat)}</td><td style="text-align:right">${subtotal.toFixed(2)}</td></tr>`;
    grandTotal += subtotal;
  });
  html += `<tr style="font-weight:900;background:#e9f7ef"><td colspan="2">Gesamt</td><td style="text-align:right">${grandTotal.toFixed(2)}</td></tr>`;
  html += `</tbody></table></body></html>`;

  const blob = new Blob([`\ufeff${html}`], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `verlauf_${new Date().toISOString().slice(0,10)}.doc`; a.click();
  URL.revokeObjectURL(url);
}

function exportChartPNG(){
  if(!categoryChart){ alert('Kein Diagramm vorhanden.'); return; }
  try{
    const url = categoryChart.toBase64Image();
    const a = document.createElement('a'); a.href = url; a.download = `diagramm_${new Date().toISOString().slice(0,10)}.png`; a.click();
  }catch(e){
    console.warn('Fehler beim Export des Diagramms:', e);
    alert('Diagramm-Export fehlgeschlagen.');
  }
}

/* ----------------------------- Payday & Saved Calculation ----------------------------- */
/**
 * periodStartForDate(d, payday)
 * returns Date object representing the start-of-period (the payday day) that contains date d
 */
function periodStartForDate(d, payday){
  const day = Number(payday) || 1;
  const candidate = new Date(d.getFullYear(), d.getMonth(), day, 0,0,0,0);
  if(d >= candidate) return candidate;
  const prev = new Date(candidate);
  prev.setMonth(prev.getMonth() - 1);
  return prev;
}

/**
 * computeSavedRecords()
 * returns array of periods with saved amount { label, start, end, saved }
 * from first transaction month until current month (by payday)
 */
function computeSavedRecords(){
  const payday = Number(state.payday) || 1;

  // if no transactions: return only current period
  if(!state.transactions.length){
    const now = new Date();
    const start = periodStartForDate(now, payday);
    const nextStart = new Date(start); nextStart.setMonth(start.getMonth() + 1);
    const end = new Date(nextStart); end.setDate(end.getDate()-1);
    const label = `${start.toLocaleString('de-DE',{month:'short', year:'numeric'})}`;
    const spent = state.transactions.filter(t => new Date(t.date) >= start && new Date(t.date) <= end).reduce((s,t)=> s + Number(t.amount||0), 0);
    return [{ label, start, end, saved: Number(state.budget || 0) - spent }];
  }

  // determine earliest transaction
  const txs = state.transactions.slice().sort((a,b) => new Date(a.date) - new Date(b.date));
  let start = periodStartForDate(new Date(txs[0].date), payday);
  const now = new Date();
  const periods = [];
  // build periods up to current
  while(start <= now){
    const next = new Date(start); next.setMonth(start.getMonth() + 1);
    const end = new Date(next); end.setDate(end.getDate() - 1);
    const label = `${start.toLocaleString('de-DE',{month:'short', year:'numeric'})}`;
    periods.push({ start: new Date(start), end: end, label });
    start = next;
  }

  // compute saved for each period
  const records = periods.map(p => {
    const spent = state.transactions.filter(t => {
      const d = new Date(t.date);
      return d >= p.start && d <= p.end;
    }).reduce((s,t) => s + Number(t.amount || 0), 0);
    return { label: p.label, start: p.start, end: p.end, saved: Number(state.budget || 0) - spent };
  });

  state.savedRecords = records;
  saveState();
  return records;
}

/* ----------------------------- Utility UI: show/hide tabs ----------------------------- */
function showTab(tabId){
  // hide all tabs
  $$('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-hidden', 'true');
    t.style.display = 'none';
  });

  // show requested tab
  const el = $(`#tab-${tabId}`);
  if(el){
    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
    el.style.display = 'block';
  } else {
    console.warn('Tab nicht gefunden:', tabId);
  }

  // update bottom nav active
  $$('.bottom-btn').forEach(b => b.classList.remove('active'));
  $$('.bottom-btn').forEach(b => {
    if(b.dataset.tab === tabId) b.classList.add('active');
  });

  // update top nav if present (some earlier versions had top nav buttons)
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  $$('.nav-btn').forEach(b => {
    if((b.dataset.tab || b.getAttribute('data-tab')) === tabId) b.classList.add('active');
  });

  // special actions per tab
  if(tabId === 'saved') { computeSavedRecords(); renderSavedList(); }
  if(tabId === 'categories') { renderCategoriesList(); }
}

/* ----------------------------- Render saved list (UI) ----------------------------- */
function renderSavedList(){
  const out = $('#savedList');
  if(!out) return;
  out.innerHTML = '';
  const records = computeSavedRecords();
  if(!records || !records.length){ out.innerHTML = '<div class="muted">Keine Daten.</div>'; return; }
  // show last period
  const last = records[records.length - 1];
  const node = document.createElement('div'); node.className = 'panel';
  node.innerHTML = `<div style="display:flex;justify-content:space-between"><div style="font-weight:800">${escapeHtml(last.label)}</div><div style="font-weight:900">${fmtCHF(last.saved)}</div></div>`;
  out.appendChild(node);
}

/* ----------------------------- Update after state changes ----------------------------- */
function updateAfterChange(){
  refreshCategorySelect();
  updateSummary();
  renderHistory();
  renderAllList();
  updateCharts();
  computeSavedRecords();
  renderSavedList();
}

/* ----------------------------- Wire UI Events (lots of listeners) ----------------------------- */
function wireUI(){
  // BOTTOM NAV handling
  $$('.bottom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if(tab) showTab(tab);
    });
  });

  // Save budget
  $('#saveBudget') && $('#saveBudget').addEventListener('click', () => {
    const v = Number($('#totalBudget').value) || 0;
    state.budget = v;
    saveState();
    updateSummary();
    computeSavedRecords();
    renderSavedList();
  });

  // Add transaction
  $('#addTx') && $('#addTx').addEventListener('click', () => {
    const desc = ($('#txDesc').value || '').trim();
    const amount = parseFloat($('#txAmount').value);
    const category = $('#txCategory').value || 'Sonstiges';
    if(!desc || isNaN(amount)){ alert('Bitte Beschreibung und gültigen Betrag eingeben.'); return; }
    addTransaction(desc, amount, category);
    // clear fields
    $('#txDesc').value = '';
    $('#txAmount').value = '';
    if($('#txCategory')) $('#txCategory').selectedIndex = 0;
  });

  // Delete transaction (delegation)
  $('#historyList') && $('#historyList').addEventListener('click', e => {
    const del = e.target.closest('[data-delete]');
    if(del){
      const id = del.getAttribute('data-delete');
      if(confirm('Eintrag wirklich löschen?')) deleteTransaction(id);
    }
  });

  // Export buttons
  $('#exportCSV') && $('#exportCSV').addEventListener('click', exportCSV);
  $('#exportWord') && $('#exportWord').addEventListener('click', exportWord);
  $('#exportChart') && $('#exportChart').addEventListener('click', exportChartPNG);

  // Reset history
  $('#resetHistory') && $('#resetHistory').addEventListener('click', () => {
    if(confirm('Verlauf wirklich löschen?')) {
      state.transactions = [];
      saveState();
      updateAfterChange();
    }
  });

  // Save name (settings)
  $('#saveName') && $('#saveName').addEventListener('click', () => {
    const v = normalizeSS($('#userName').value || '').trim();
    if(!v){ alert('Bitte Namen eingeben'); return; }
    state.name = v;
    saveState();
    updateHeaderAndQuote();
    // optional: show info modal
    $('#infoModal') && $('#infoModal').setAttribute('aria-hidden', 'false');
  });

  // Info modal close
  $('#infoClose') && $('#infoClose').addEventListener('click', () => {
    $('#infoModal').setAttribute('aria-hidden', 'true');
  });

  // Welcome flow
  $('#welcomeSave') && $('#welcomeSave').addEventListener('click', () => {
    const name = normalizeSS($('#welcomeName').value || '').trim();
    const pd = Number($('#welcomePayday').value) || 1;
    if(!name){ alert('Bitte Namen eingeben'); return; }
    if(pd < 1 || pd > 28){ alert('Zahltag bitte zwischen 1 und 28'); return; }
    state.name = name;
    state.payday = pd;
    saveState();
    $('#welcomeModal') && $('#welcomeModal').setAttribute('aria-hidden', 'true');
    updateHeaderAndQuote();
    computeSavedRecords();
    renderSavedList();
  });

  // Theme buttons
  $$('[data-theme-select]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme-select');
      applyTheme(theme);
      // keep UI in sync
      $$('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Add category
  $('#addCategory') && $('#addCategory').addEventListener('click', () => {
    const name = ($('#newCategoryName').value || '').trim();
    if(!name) { alert('Bitte Kategorienamen eingeben'); return; }
    addCategory(name);
    $('#newCategoryName').value = '';
  });

  // Categories edit/delete delegation
  $('#categoriesList') && $('#categoriesList').addEventListener('click', e => {
    const editBtn = e.target.closest('[data-edit-cat]');
    const delBtn  = e.target.closest('[data-del-cat]');
    if(editBtn){
      const oldName = editBtn.getAttribute('data-edit-cat');
      const newName = prompt('Neuer Kategorienname', oldName);
      if(newName && newName.trim()) editCategory(oldName, newName.trim());
    }
    if(delBtn){
      const name = delBtn.getAttribute('data-del-cat');
      deleteCategory(name);
    }
  });

  // Search & filter controls
  $('#searchHistory') && $('#searchHistory').addEventListener('input', () => {
    renderAllList($('#searchHistory').value || '', $('#filterCategory').value || '');
  });
  $('#filterCategory') && $('#filterCategory').addEventListener('change', () => {
    renderAllList($('#searchHistory').value || '', $('#filterCategory').value || '');
  });

  // Save payday from settings
  $('#savePayday') && $('#savePayday').addEventListener('click', () => {
    const pd = Number($('#paydayInput').value);
    if(!pd || pd < 1 || pd > 28) { alert('Bitte Zahltag zwischen 1 und 28 eingeben'); return; }
    state.payday = pd;
    saveState();
    computeSavedRecords();
    renderSavedList();
    alert('Zahltag gespeichert');
  });

  // Settings export shortcuts
  $('#settingsExportWord') && $('#settingsExportWord').addEventListener('click', exportWord);
  $('#settingsExportChart') && $('#settingsExportChart').addEventListener('click', exportChartPNG);

  // Deletion in all list (if present)
  $('#allList') && $('#allList').addEventListener('click', e => {
    const d = e.target.closest('[data-delete]');
    if(d){
      const id = d.getAttribute('data-delete');
      if(confirm('Eintrag löschen?')) deleteTransaction(id);
    }
  });

  // Keyboard Enter actions (im mobilen Kontext oft nützlich)
  ['totalBudget','txAmount','txDesc','userName','welcomeName','welcomePayday'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('keydown', e => {
      if(e.key === 'Enter'){
        e.preventDefault();
        if(id === 'totalBudget') $('#saveBudget') && $('#saveBudget').click();
        else if(id === 'txAmount' || id === 'txDesc') $('#addTx') && $('#addTx').click();
        else if(id === 'userName') $('#saveName') && $('#saveName').click();
        else if(id === 'welcomeName') $('#welcomeSave') && $('#welcomeSave').click();
        else if(id === 'welcomePayday') $('#welcomeSave') && $('#welcomeSave').click();
      }
    });
  });

  // Orientation change -> resize charts
  window.addEventListener('orientationchange', () => {
    try { categoryChart?.resize(); percentageChart?.resize(); } catch(e){ /* ignore */ }
  }, { passive: true });
}

/* ----------------------------- Theme apply (CSS variable switch) ----------------------------- */
function applyTheme(theme){
  state.theme = theme || 'standard';
  saveState();
  document.documentElement.setAttribute('data-theme', state.theme);
  // update header quote styling
  updateHeaderAndQuote();
}

/* ----------------------------- Initialization ----------------------------- */
function init(){
  loadState();

  // default fallback values (explicit)
  state = Object.assign({
    name: '',
    budget: 0,
    transactions: [],
    categories: ['Handyabo','Fonds','Eltern','Verpflegung','Frisör','Sparen','Geschenke','Sonstiges'],
    theme: 'standard',
    payday: 1,
    savedRecords: []
  }, state);

  // fill inputs from state
  if($('#totalBudget')) $('#totalBudget').value = state.budget || '';
  if($('#userName')) $('#userName').value = state.name || '';
  if($('#paydayInput')) $('#paydayInput').value = state.payday || 1;

  // create charts (if Chart.js present)
  createCharts();

  // wire UI events
  wireUI();

  // apply theme and update header/quote
  document.documentElement.setAttribute('data-theme', state.theme || 'standard');
  updateHeaderAndQuote();

  // refresh selects / lists
  refreshCategorySelect();
  renderCategoriesList();
  renderHistory();
  renderAllList();
  updateSummary();
  updateCharts();
  computeSavedRecords();
  renderSavedList();

  // show welcome modal if no name set
  if(!state.name){
    const wm = $('#welcomeModal');
    if(wm) wm.setAttribute('aria-hidden', 'false');
  }

  // periodic update for clock & quote
  setInterval(() => {
    updateHeaderAndQuote();
  }, 60 * 1000);
}

// call init on DOMContentLoaded (script is deferred but be safe)
document.addEventListener('DOMContentLoaded', init);

/* ----------------------------- Expose small debug (optional) ----------------------------- */
window.__budgetApp = {
  state,
  addTransaction,
  deleteTransaction,
  exportCSV,
  exportWord,
  exportChartPNG,
  updateCharts
};
