/* app.js
   Vollständige, saubere Implementation für die Budget-App.
   - Keine voreingestellten Kategorien: Benutzer legt sie an.
   - Popups: Welcome -> Intro (Ich-Perspektive) -> Kategorien-Hinweis -> Zahltag
   - Exporte (Einstellungen): Word (.doc via HTML), CSV, Diagramm PNG (canvas.toBlob)
   - Archivierung: Am konfigurierten Zahltag archiviert die App Budget+Transaktionen und leert das Budget
   - Persistenz: localStorage unter KEY
   - Chart.js verwendet (über CDN in index.html)
*/

/* -------------------- Helferfunktionen -------------------- */
function $ (sel) { return document.querySelector(sel); }
function $$ (sel) { return Array.from(document.querySelectorAll(sel)); }
function uid(prefix = '') { return prefix + Math.random().toString(36).slice(2,9); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }
function fmtCHF(v){ return 'CHF ' + (Number(v||0)).toFixed(2); }
const STORAGE_KEY = 'bp_app_state_v1';

/* -------------------- Initial State -------------------- */
/* No default categories by design */
let state = {
  userName: '',
  budget: 0,
  transactions: [],       // {id, desc, amount, category, date}
  categories: [],         // user-defined only
  theme: 'standard',
  payday: 1,
  archived: [],           // [{id,label,dateArchived,budget,transactions,categories}]
  lastArchivePeriodId: null
};

/* -------------------- Persistence -------------------- */
function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') state = Object.assign(state, parsed);
    }
  } catch(e){
    console.warn('loadState error', e);
  }
}
function saveState(){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.warn('saveState error', e); }
}

/* -------------------- Chart setup & update -------------------- */
let catChart = null, pctChart = null;
function initCharts(){
  if (typeof Chart === 'undefined') { console.warn('Chart.js fehlt'); return; }
  const catCtx = $('#categoryChart')?.getContext('2d');
  const pctCtx = $('#percentageChart')?.getContext('2d');
  if (!catCtx || !pctCtx) return;

  if (catChart) try{ catChart.destroy(); }catch(e){}
  if (pctChart) try{ pctChart.destroy(); }catch(e){}

  catChart = new Chart(catCtx, {
    type:'bar',
    data:{ labels:[], datasets:[{ label:'Betrag', data:[], backgroundColor:[] }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
  });
  pctChart = new Chart(pctCtx, {
    type:'doughnut',
    data:{ labels:[], datasets:[{ data:[], backgroundColor:[] }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }
  });
}

function updateCharts(){
  if(!catChart || !pctChart) return;
  const sums = {};
  state.transactions.forEach(t => sums[t.category] = (sums[t.category]||0) + Number(t.amount || 0));
  const labels = Object.keys(sums);
  const values = labels.map(l => sums[l]);
  const palette = labels.map((_,i) => `hsl(${(i*55)%360} 78% 55%)`);
  if (labels.length === 0) {
    catChart.data.labels = ['Keine Daten'];
    catChart.data.datasets[0].data = [0];
    catChart.data.datasets[0].backgroundColor = ['rgba(0,0,0,0.06)'];
    pctChart.data.labels = ['Keine Daten'];
    pctChart.data.datasets[0].data = [100];
    pctChart.data.datasets[0].backgroundColor = ['rgba(0,0,0,0.06)'];
  } else {
    catChart.data.labels = labels;
    catChart.data.datasets[0].data = values;
    catChart.data.datasets[0].backgroundColor = palette;
    pctChart.data.labels = labels;
    pctChart.data.datasets[0].data = values;
    pctChart.data.datasets[0].backgroundColor = palette;
  }
  catChart.update();
  pctChart.update();
}

/* -------------------- UI: render helpers -------------------- */
function updateHeader(){
  const now = new Date();
  $('#greeting').textContent = state.userName ? `Hallo ${state.userName}` : 'Hallo';
  const month = now.toLocaleString('de-DE',{month:'long', year:'numeric'});
  $('#monthRange').innerHTML = `<span id="budgetWord">Budget</span> für ${month}`;
  $('#currentDate').textContent = now.toLocaleString('de-DE',{weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
  // daily quote simple deterministic pick
  const quotes = ['Kleine Schritte, grosse Wirkung.','Spare heute, geniesse morgen.','Kenne deine Ausgaben, meistere dein Leben.','Jeder Franken zählt.','Bewusst leben, bewusst sparen.'];
  const q = quotes[now.getDate() % quotes.length];
  $('#quote').innerHTML = `<span style="font-weight:800;color:var(--accent-color,inherit)">“</span> ${escapeHtml(q)} <span style="font-weight:800;color:var(--accent-color,inherit)">”</span>`;
}

function updateSummaryUI(){
  const spent = state.transactions.reduce((s,t)=> s + Number(t.amount||0), 0);
  const remaining = Math.max(0, Number(state.budget||0) - spent);
  $('#spent').textContent = fmtCHF(spent);
  const remEl = $('#remaining');
  remEl.textContent = fmtCHF(remaining);
  if (remaining < 200) remEl.classList.add('red-alert'); else remEl.classList.remove('red-alert');
}

/* render categories list + selects */
function renderCategories(){
  const container = $('#categoriesList'); if(container) container.innerHTML = '';
  state.categories.forEach(cat=>{
    const el = document.createElement('div'); el.className = 'category-item panel';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div>${escapeHtml(cat)}</div><div><button class="btn btn-ghost edit-cat" data-cat="${escapeHtml(cat)}">Bearb.</button><button class="btn btn-danger del-cat" data-cat="${escapeHtml(cat)}">Löschen</button></div></div>`;
    container.appendChild(el);
  });
  // fill selects
  const txSel = $('#txCategory'); const filterSel = $('#filterCategory');
  if (txSel) {
    txSel.innerHTML = '';
    if (state.categories.length===0){ txSel.disabled=true; txSel.innerHTML = `<option>Bitte Kategorien anlegen</option>`; $('#buttonAddTransaction').disabled = true; }
    else { txSel.disabled=false; state.categories.slice().sort().forEach(c=> { const o=document.createElement('option'); o.value=o.textContent=c; txSel.appendChild(o); }); $('#buttonAddTransaction').disabled = false; }
  }
  if (filterSel){
    filterSel.innerHTML=''; const opt=document.createElement('option'); opt.value=''; opt.text='Alle Kategorien'; filterSel.appendChild(opt);
    state.categories.slice().sort().forEach(c=>{ const o=document.createElement('option'); o.value=o.textContent=c; filterSel.appendChild(o); });
  }
}

/* render transaction lists */
function renderTransactions(){
  // history list
  const hist = $('#historyList'); if(hist) hist.innerHTML = '';
  (state.transactions.slice().reverse() || []).forEach(tx=>{
    const div = document.createElement('div'); div.className = 'panel';
    div.innerHTML = `<div style="display:flex;justify-content:space-between"><div><div style="font-weight:800">${escapeHtml(tx.desc)}</div><div style="font-size:12px;color:rgba(0,0,0,0.5)">${new Date(tx.date).toLocaleString()}</div><div style="font-size:12px;color:rgba(0,0,0,0.5)">${escapeHtml(tx.category)}</div></div><div style="text-align:right"><div style="font-weight:900">${fmtCHF(tx.amount)}</div><div style="margin-top:8px"><button class="btn btn-ghost delete-tx" data-id="${tx.id}">Löschen</button></div></div></div>`;
    hist.appendChild(div);
  });
  // all list
  const all = $('#transactionList'); if(all) all.innerHTML = '';
  (state.transactions.slice().reverse() || []).forEach(tx=>{
    const el = document.createElement('div'); el.className='panel';
    el.innerHTML = `<div style="display:flex;justify-content:space-between"><div>${escapeHtml(tx.category)} — ${escapeHtml(tx.desc)}</div><div style="font-weight:900">${fmtCHF(tx.amount)}</div></div>`;
    all.appendChild(el);
  });
}

/* render archive */
function renderArchive(){
  const container = $('#archiveList'); if(!container) return; container.innerHTML = '';
  if (!state.archived || state.archived.length===0) { container.innerHTML='<div class="muted">Keine archivierten Monate.</div>'; return; }
  state.archived.slice().reverse().forEach(a=>{
    const node = document.createElement('div'); node.className='panel';
    node.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:800">${escapeHtml(a.label)}</div><div style="font-size:12px;color:rgba(0,0,0,0.5)">${new Date(a.dateArchived).toLocaleString()}</div></div><div style="display:flex;gap:8px"><button class="btn btn-primary download-archive-word" data-id="${a.id}">Word</button><button class="btn btn-ghost download-archive-csv" data-id="${a.id}">CSV</button></div></div>`;
    container.appendChild(node);
  });
}

/* -------------------- CRUD operations -------------------- */
function addCategory(name){
  const n = String(name||'').trim();
  if(!n) return alert('Gib einen Kategorienamen ein');
  if (state.categories.includes(n)) return alert('Kategorie existiert bereits');
  state.categories.push(n);
  saveState(); renderCategories(); showToast('Kategorie erstellt');
}

function deleteCategory(name){
  if(!confirm('Kategorie löschen? Bestehende Einträge werden auf "Sonstiges" gesetzt.')) return;
  state.categories = state.categories.filter(c=>c!==name);
  state.transactions.forEach(t=> { if(t.category===name) t.category='Sonstiges'; });
  saveState(); renderCategories(); renderTransactions(); updateCharts(); updateSummaryUI(); showToast('Kategorie gelöscht');
}

function addTransaction(desc, amount, category){
  const d = String(desc||'').trim();
  const a = Number(amount);
  if(!d) return alert('Bitte Beschreibung eingeben');
  if(isNaN(a) || a<=0) return alert('Bitte gültigen Betrag eingeben');
  if(!category) return alert('Bitte Kategorie wählen');
  const tx = { id: uid('tx_'), desc:d, amount:a, category:category, date: new Date().toISOString() };
  state.transactions.push(tx);
  saveState(); renderTransactions(); updateCharts(); updateSummaryUI(); showToast('Ausgabe hinzugefügt');
}

function deleteTransactionById(id){
  if(!confirm('Eintrag wirklich löschen?')) return;
  state.transactions = state.transactions.filter(t=>t.id!==id);
  saveState(); renderTransactions(); updateCharts(); updateSummaryUI(); showToast('Eintrag gelöscht');
}

/* -------------------- Export-Funktionen -------------------- */
function exportTransactionsAsCSV(transactions, namePrefix='verlauf'){
  if(!transactions || transactions.length===0) return alert('Keine Daten');
  const rows = [['Kategorie','Beschreibung','Betrag','Datum']];
  transactions.forEach(t => rows.push([t.category, t.desc, Number(t.amount).toFixed(2), t.date]));
  const csv = rows.map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${namePrefix}_${(new Date()).toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

function exportTransactionsAsWordGrouped(transactions, namePrefix='verlauf'){
  if(!transactions || transactions.length===0) return alert('Keine Daten');
  const groups = {};
  transactions.forEach(t => { (groups[t.category] = groups[t.category]||[]).push(t); });
  let html = '<html><head><meta charset="utf-8"><title>Verlauf</title></head><body style="font-family:Nunito, sans-serif">';
  html += `<h2>Verlauf — ${new Date().toLocaleDateString()}</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Kategorie</th><th>Beschreibung</th><th style="text-align:right">Betrag</th></tr></thead><tbody>`;
  let grand=0;
  Object.keys(groups).sort().forEach(cat=>{
    let subtotal=0;
    groups[cat].forEach(it=>{ subtotal+=Number(it.amount||0); html+=`<tr><td>${escapeHtml(cat)}</td><td>${escapeHtml(it.desc)}</td><td style="text-align:right">${Number(it.amount).toFixed(2)}</td></tr>`; });
    html+=`<tr style="font-weight:700;background:#f4f4f4"><td colspan="2">Total ${escapeHtml(cat)}</td><td style="text-align:right">${subtotal.toFixed(2)}</td></tr>`;
    grand+=subtotal;
  });
  html+=`<tr style="font-weight:900;background:#e9f7ef"><td colspan="2">Gesamt</td><td style="text-align:right">${grand.toFixed(2)}</td></tr>`;
  html+='</tbody></table></body></html>';
  const blob = new Blob(['\ufeff'+html], { type:'application/msword' });
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${namePrefix}_${(new Date()).toISOString().slice(0,10)}.doc`; a.click(); URL.revokeObjectURL(url);
}

/* Export chart PNG using canvas.toBlob for reliability */
function exportChartAsPNG(){
  if(!catChart) return alert('Diagramm nicht verfügbar');
  const canvas = catChart.canvas;
  canvas.toBlob(function(blob){
    if(!blob) return alert('Export fehlgeschlagen');
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`diagramm_${(new Date()).toISOString().slice(0,10)}.png`; a.click(); URL.revokeObjectURL(url);
  }, 'image/png');
}

/* -------------------- Archive logic -------------------- */
/* Determine period id by payday relative to date */
function computePeriodIdForDate(date, payday){
  const d = new Date(date);
  let year = d.getFullYear(), month = d.getMonth(); // 0-based
  const day = d.getDate();
  // if day >= payday -> period is current month's payday; else previous month
  if(day < payday){ month = month - 1; if(month < 0){ month = 11; year -= 1; } }
  return `${year}-${String(month+1).padStart(2,'0')}`; // e.g. 2025-08
}

/* Archive current budget+transactions if today is payday and not already archived for this period */
function archiveIfPayday(){
  try {
    const today = new Date();
    const pd = Number(state.payday) || 1;
    if (today.getDate() !== pd) return; // only act on exact payday
    const pid = computePeriodIdForDate(today, pd);
    if (state.lastArchivePeriodId === pid) return; // already archived this period
    // create archive
    const entry = {
      id: uid('arch_'),
      label: `${today.toLocaleString('de-DE',{month:'long', year:'numeric'})}`,
      dateArchived: new Date().toISOString(),
      budgetAtArchive: Number(state.budget||0),
      transactionsSnapshot: JSON.parse(JSON.stringify(state.transactions || [])),
      categoriesSnapshot: JSON.parse(JSON.stringify(state.categories || []))
    };
    state.archived = state.archived || [];
    state.archived.push(entry);
    // reset budget page
    state.budget = 0;
    state.transactions = [];
    state.lastArchivePeriodId = pid;
    saveState();
    // update UI
    updateSummaryUI(); renderTransactions(); updateCharts(); renderArchive();
    showToast('Budget archiviert — Budgetseite wurde zurückgesetzt.');
  } catch(e){ console.error('archive error', e); }
}

/* -------------------- Modal helpers -------------------- */
function showModal(sel){ const m = $(sel); if(m) m.setAttribute('aria-hidden','false'); }
function hideModal(sel){ const m = $(sel); if(m) m.setAttribute('aria-hidden','true'); }

/* -------------------- Toast -------------------- */
let toastTimer = null;
function showToast(msg, duration = 2200){
  const t = $('#toast'); if(!t) return;
  t.textContent = msg; t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ t.hidden = true; }, duration);
}

/* -------------------- Wiring UI events -------------------- */
function wireUI(){
  // Bottom nav (if present in different HTML versions)
  $$('.bottom-nav-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> {
      const tgt = btn.dataset.target;
      // update active
      $$('.bottom-nav-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      // show tab
      $$('.tab').forEach(t=>{ t.style.display='none'; t.classList.remove('active'); });
      const section = document.querySelector('#tab-'+tgt);
      if(section){ section.style.display='block'; section.classList.add('active'); section.setAttribute('aria-hidden','false'); }
    });
  });

  // Top nav fallback
  $$('.nav-btn').forEach(b=>{
    b.addEventListener('click', ()=> {
      const tab = b.getAttribute('data-tab');
      $$('.nav-btn').forEach(nb=>nb.classList.remove('active'));
      b.classList.add('active');
      $$('.tab').forEach(t=>{ t.style.display='none'; t.classList.remove('active'); });
      const s = document.querySelector('#tab-'+tab);
      if(s) { s.style.display='block'; s.classList.add('active'); s.setAttribute('aria-hidden','false'); }
    });
  });

  // Add category
  $('#addCategory')?.addEventListener('click', ()=> {
    const val = $('#inputNewCategory') ? $('#inputNewCategory').value : $('#newCategoryName')?.value;
    const name = String(val||'').trim();
    if(!name) return alert('Bitte Kategorienamen eingeben');
    addCategory(name);
    // close category-required modal if open
    hideModal('#categoryInfoModal');
  });

  // Delegation for edit/delete categories
  $('#listCategories')?.addEventListener('click', e =>{
    const edit = e.target.closest('.edit-cat'); const del = e.target.closest('.del-cat');
    if(edit){ const old = edit.dataset.cat; const newName = prompt('Neuer Kategorienname', old); if(newName && newName.trim()) { applicationStateRenameCategory(old,newName.trim()); } }
    if(del){ const name = del.dataset.cat; deleteCategory(name); }
  });

  // Add transaction
  $('#buttonAddTransaction')?.addEventListener('click', ()=> {
    const desc = ($('#transactionDescription')?.value || $('#txDesc')?.value || '').trim();
    const amount = Number($('#transactionAmount')?.value || $('#txAmount')?.value || 0);
    const category = ($('#transactionCategory')?.value || $('#txCategory')?.value || '');
    addTransaction(desc, amount, category);
  });

  // Save budget
  $('#buttonSaveBudget')?.addEventListener('click', ()=> {
    const v = Number($('#totalBudget')?.value || $('#totalBudget')?.value || 0);
    if(isNaN(v) || v < 0) return alert('Bitte gültiges Budget eingeben');
    state.budget = v; saveState(); updateSummaryUI(); showToast('Budget gespeichert');
  });

  // Delete transaction delegation in history
  $('#historyList')?.addEventListener('click', e=>{
    const del = e.target.closest('.delete-tx');
    if(del){ const id=del.dataset.id; deleteTransactionById(id); }
  });

  // Export buttons in settings
  $('#buttonExportCsv')?.addEventListener('click', ()=> exportTransactionsAsCSV(state.transactions));
  $('#buttonExportWord')?.addEventListener('click', ()=> exportTransactionsAsWordGrouped(state.transactions));
  $('#buttonExportChart')?.addEventListener('click', ()=> exportChartAsPNG());

  // Archive download actions
  $('#archiveList')?.addEventListener('click', e=>{
    const w = e.target.closest('.download-archive-word'); const c = e.target.closest('.download-archive-csv');
    if(w){ const id = w.dataset.id; const arch = state.archived.find(a=>a.id===id); if(arch) exportTransactionsAsWordGrouped(arch.transactionsSnapshot, `archiv_${arch.label.replace(/\s+/g,'_')}`); }
    if(c){ const id = c.dataset.id; const arch = state.archived.find(a=>a.id===id); if(arch) exportTransactionsAsCSV(arch.transactionsSnapshot, `archiv_${arch.label.replace(/\s+/g,'_')}`); }
  });

  // Welcome modal "Weiter" button
  $('#modalButtonSaveName')?.addEventListener('click', ()=>{
    const n = ($('#modalInputName')?.value || '').trim();
    if(!n) return alert('Bitte Namen eingeben');
    state.userName = n; saveState(); hideModal('#welcomeModal'); updateHeader(); // show intro next
    showModal('#modalIntro');
  });

  // Intro -> categories required
  $('#modalIntroOk')?.addEventListener('click', ()=>{ hideModal('#modalIntro'); showModal('#modalCategoriesRequired'); });

  // Categories required -> go to categories and then show payday modal
  $('#modalCategoriesGo')?.addEventListener('click', ()=>{
    hideModal('#modalCategoriesRequired');
    // open categories tab (if bottom nav exists)
    const catBtn = $$('.bottom-nav-btn').find(b=>b.dataset.target==='categories');
    if(catBtn){ catBtn.click(); } else { document.querySelectorAll('.tab').forEach(t=>t.style.display='none'); const t=document.querySelector('#tab-categories'); if(t) { t.style.display='block'; } }
    // open payday modal after small delay
    setTimeout(()=> showModal('#modalPayday'), 200);
  });

  // Payday modal save
  $('#modalPaydaySave')?.addEventListener('click', ()=>{
    const v = Number($('#modalPaydayInput')?.value || $('#inputPayday')?.value || state.payday || 1);
    if(!v || v<1 || v>28) return alert('Zahltag 1–28 wählen');
    state.payday = v; saveState(); hideModal('#modalPayday'); showToast('Zahltag gespeichert');
  });

  // small delegations for any dynamically created buttons
  document.body.addEventListener('click', (e)=>{
    // edit/delete categories handled above
  });

  // filters & search
  $('#searchTransactions')?.addEventListener('input', ()=> renderAllWithFilters());
  $('#filterCategory')?.addEventListener('change', ()=> renderAllWithFilters());
}

/* helper to ensure category rename updates transactions */
function applicationStateRenameCategory(oldName, newName){
  state.categories = state.categories.map(c => c===oldName ? newName : c);
  state.transactions.forEach(tx => { if(tx.category === oldName) tx.category = newName; });
  saveState(); renderCategories(); renderTransactions(); updateCharts(); showToast('Kategorie umbenannt');
}

/* render all list with filters */
function renderAllWithFilters(){
  const q = ($('#searchTransactions')?.value || '').toLowerCase();
  const filter = $('#filterCategory')?.value || '';
  // re-render main lists using filter
  renderTransactions();
  // Also update All-list differently if you have it
  const all = $('#transactionList'); if(all) {
    all.innerHTML = '';
    state.transactions.filter(tx => (!filter || tx.category===filter) && (!q || tx.desc.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q))).slice().reverse().forEach(tx=>{
      const row = document.createElement('div'); row.className='panel';
      row.innerHTML = `<div style="display:flex;justify-content:space-between"><div>${escapeHtml(tx.category)} — ${escapeHtml(tx.desc)}</div><div style="font-weight:900">${fmtCHF(tx.amount)}</div></div>`;
      all.appendChild(row);
    });
  }
}

/* -------------------- Initialization -------------------- */
function initApp(){
  loadState();
  // wire UI
  wireUI();
  // initialize charts
  initCharts();
  // populate UI elements from state
  if ($('#totalBudget')) $('#totalBudget').value = state.budget || '';
  if ($('#inputUserName')) $('#inputUserName').value = state.userName || '';
  if ($('#inputPayday')) $('#inputPayday').value = state.payday || 1;
  // render existing data
  renderCategories();
  renderTransactions();
  updateCharts();
  updateSummaryUI();
  renderArchive();
  updateHeader();
  // if no username -> show welcome modal (first-run)
  if (!state.userName) {
    showModal('#welcomeModal');
  } else {
    // if username exists but no categories -> show intro->categories flow
    if (!state.categories || state.categories.length===0) {
      showModal('#modalIntro');
    }
  }
  // check archival on load (if payday==today)
  archiveIfPayday();
  // periodic check once per hour to catch midnight/day changes (lightweight)
  setInterval(archiveIfPayday, 60*60*1000);
}

/* -------------------- Start -------------------- */
document.addEventListener('DOMContentLoaded', initApp);

/* -------------------- Expose debug in console (optional) -------------------- */
window.__budgetState = state;
window.__bp = { addCategory, addTransaction, exportChartAsPNG, exportTransactionsAsCSV, exportTransactionsAsWordGrouped };

