/* app.js — robust mobile-first implementation
   - Tabs (top header + bottom nav)
   - Themes (6), quote with theme-colored quotes
   - Categories management
   - Transactions CRUD
   - Payday-based saved calculation
   - Exports: Word (.doc), CSV, Chart PNG
   - Chart.js usage
   - localStorage persistence
*/

(() => {
  'use strict';

  /* ------------------ Helpers ------------------ */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const KEY = 'budget_planner_state_v1';
  const fmtCHF = (v) => `CHF ${Number(v || 0).toFixed(2)}`;
  const normalizeSS = (s='') => String(s).replace(/ß/g, 'ss');

  /* ------------------ Default state ------------------ */
  let state = {
    name: '',
    budget: 0,
    transactions: [], // {id,desc,amount,category,date}
    categories: [],   // populated with defaults
    theme: 'standard',
    payday: 1,
    savedRecords: []
  };

  const QUOTES = [
    "Kleine Schritte, grosse Wirkung.",
    "Spare heute, geniesse morgen.",
    "Kenne deine Ausgaben, meistere dein Leben.",
    "Jeder Franken zählt.",
    "Bewusst leben, bewusst sparen."
  ];

  /* ------------------ Persistence ------------------ */
  function loadState(){
    try{
      const raw = localStorage.getItem(KEY);
      if(raw){ Object.assign(state, JSON.parse(raw)); }
    }catch(e){ console.warn('loadState', e); }
    if(!state.categories || !state.categories.length){
      state.categories = ['Handyabo','Fonds','Eltern','Verpflegung','Frisör','Sparen','Geschenke','Sonstiges'];
    }
    // sanitize payday
    if(!state.payday || state.payday < 1 || state.payday > 28) state.payday = 1;
  }
  function saveState(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){ console.warn('saveState', e); } }

  /* ------------------ Charts ------------------ */
  let categoryChart = null, percentageChart = null;
  function createCharts(){
    const catCanvas = $('#categoryChart');
    const pctCanvas = $('#percentageChart');
    if(!catCanvas || !pctCanvas) return;
    try{
      if(categoryChart) categoryChart.destroy();
      if(percentageChart) percentageChart.destroy();
      categoryChart = new Chart(catCanvas.getContext('2d'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
      });
      percentageChart = new Chart(pctCanvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }
      });
    }catch(e){ console.error('Chart init error', e); }
  }

  function updateCharts(){
    if(!categoryChart || !percentageChart) return;
    const sums = {};
    state.transactions.forEach(t => { sums[t.category] = (sums[t.category] || 0) + Number(t.amount || 0); });
    const labels = Object.keys(sums);
    const data = labels.map(l => sums[l]);
    const colors = labels.map((_,i)=> `hsl(${(i*55)%360} 78% 55%)`);
    categoryChart.data.labels = labels;
    categoryChart.data.datasets[0].data = data;
    categoryChart.data.datasets[0].backgroundColor = colors;
    categoryChart.update();

    percentageChart.data.labels = labels;
    percentageChart.data.datasets[0].data = data;
    percentageChart.data.datasets[0].backgroundColor = colors;
    percentageChart.update();
  }

  /* ------------------ UI rendering ------------------ */
  function updateHeaderAndQuote(){
    const now = new Date();
    const month = now.toLocaleString('de-DE', { month:'long' });
    $('#greeting') && ($('#greeting').textContent = state.name ? `Hallo ${normalizeSS(state.name)}` : 'Hallo');
    $('#monthRange') && ($('#monthRange').innerHTML = `<span id="budgetWord">Budget</span> <span id="monthLabel">für ${month} ${now.getFullYear()}</span>`);
    $('#currentDate') && ($('#currentDate').textContent = now.toLocaleString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}));
    const q = QUOTES[now.getDate() % QUOTES.length];
    // theme gradient for quotes: use CSS var
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-gradient') || 'linear-gradient(135deg,#ffeb3b,#4caf50)';
    $('#dailyQuote') && ($('#dailyQuote').innerHTML = `<span style="background:${accent};-webkit-background-clip:text;color:transparent;font-weight:800">“</span> ${q} <span style="background:${accent};-webkit-background-clip:text;color:transparent;font-weight:800">”</span>`);
  }

  function updateSummary(){
    const spent = state.transactions.reduce((s,t)=> s + Number(t.amount||0), 0);
    const remaining = Number(state.budget || 0) - spent;
    $('#spent') && ($('#spent').textContent = fmtCHF(spent));
    const rem = $('#remaining');
    if(rem){
      rem.textContent = fmtCHF(remaining);
      if(remaining < 200) rem.classList.add('red-alert'); else rem.classList.remove('red-alert');
    }
  }

  function renderHistory(){
    const container = $('#historyList');
    if(!container) return;
    container.innerHTML = '';
    if(!state.transactions.length){
      container.innerHTML = '<div class="muted">Keine Einträge.</div>'; return;
    }
    state.transactions.slice().reverse().forEach(tx=>{
      const node = document.createElement('div'); node.className = 'panel';
      node.innerHTML = `
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
        </div>`;
      container.appendChild(node);
    });
  }

  function renderAllList(filterText='', filterCategory=''){
    const all = $('#allList'); if(!all) return; all.innerHTML = '';
    const q = (filterText||'').toLowerCase();
    const items = state.transactions.filter(t => (!filterCategory || t.category === filterCategory) &&
      (!q || (t.desc||'').toLowerCase().includes(q) || (t.category||'').toLowerCase().includes(q))
    ).slice().reverse();
    if(!items.length){ all.innerHTML = '<div class="muted">Keine Einträge.</div>'; return; }
    items.forEach(t=>{
      const e = document.createElement('div'); e.className = 'panel';
      e.innerHTML = `<div style="display:flex;justify-content:space-between"><div>${escapeHtml(t.category)} — ${escapeHtml(t.desc)}</div><div style="font-weight:900">${fmtCHF(t.amount)}</div></div>`;
      all.appendChild(e);
    });
  }

  function renderCategories(){
    const el = $('#categoriesList'); if(!el) return; el.innerHTML = '';
    state.categories.slice().forEach(cat=>{
      const row = document.createElement('div'); row.className = 'panel';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:800">${escapeHtml(cat)}</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" data-edit-cat="${escapeHtml(cat)}">Bearbeiten</button>
            <button class="btn btn-danger" data-del-cat="${escapeHtml(cat)}">Löschen</button>
          </div>
        </div>`;
      el.appendChild(row);
    });
  }

  function refreshCategorySelect(){
    const sel = $('#txCategory'); if(!sel) return;
    sel.innerHTML = '';
    state.categories.slice().sort().forEach(c=>{
      const o = document.createElement('option'); o.value = o.textContent = c; sel.appendChild(o);
    });
    const filt = $('#filterCategory'); if(filt){
      filt.innerHTML = '<option value="">Alle Kategorien</option>';
      state.categories.slice().sort().forEach(c => { const o = document.createElement('option'); o.value = o.textContent = c; filt.appendChild(o); });
    }
  }

  function renderSavedList(){
    const out = $('#savedList'); if(!out) return; out.innerHTML = '';
    const rec = computeSavedRecords();
    if(!rec || !rec.length){ out.innerHTML = '<div class="muted">Keine Daten.</div>'; return; }
    // show most recent
    const last = rec[rec.length-1];
    const node = document.createElement('div'); node.className = 'panel';
    node.innerHTML = `<div style="display:flex;justify-content:space-between"><div style="font-weight:800">${escapeHtml(last.label)}</div><div style="font-weight:900">${fmtCHF(last.saved)}</div></div>`;
    out.appendChild(node);
  }

  /* ------------------ CRUD ------------------ */
  function addTransaction(desc, amount, category){
    const tx = { id: uid('t_'), desc: desc || '—', amount: Number(amount), category: category || 'Sonstiges', date: new Date().toISOString() };
    state.transactions.push(tx); saveState(); updateAfterChange();
  }

  function deleteTransaction(id){
    state.transactions = state.transactions.filter(t => t.id !== id); saveState(); updateAfterChange();
  }

  /* ------------------ Exports ------------------ */
  function exportCSV(){
    if(!state.transactions.length){ alert('Keine Daten'); return; }
    const rows = [['Kategorie','Beschreibung','Betrag','Datum']];
    state.transactions.forEach(t => rows.push([t.category, t.desc, Number(t.amount).toFixed(2), t.date]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `verlauf_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function exportWord(){
    if(!state.transactions.length){ alert('Keine Daten'); return; }
    const groups = {};
    state.transactions.forEach(t => { if(!groups[t.category]) groups[t.category]=[]; groups[t.category].push(t); });
    let html = `<!doctype html><html><head><meta charset="utf-8"><title>Verlauf</title></head><body style="font-family:Nunito, sans-serif"><h2>Verlauf</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Kategorie</th><th>Beschreibung</th><th style="text-align:right">Betrag</th></tr></thead><tbody>`;
    let grand = 0;
    Object.keys(groups).sort().forEach(cat=>{
      let subtotal = 0;
      groups[cat].forEach(it => { subtotal += Number(it.amount || 0); html += `<tr><td>${escapeHtml(cat)}</td><td>${escapeHtml(it.desc)}</td><td style="text-align:right">${Number(it.amount).toFixed(2)}</td></tr>`; });
      html += `<tr style="font-weight:700;background:#f4f4f4"><td colspan="2">Total ${escapeHtml(cat)}</td><td style="text-align:right">${subtotal.toFixed(2)}</td></tr>`;
      grand += subtotal;
    });
    html += `<tr style="font-weight:900;background:#e9f7ef"><td colspan="2">Gesamt</td><td style="text-align:right">${grand.toFixed(2)}</td></tr>`;
    html += `</tbody></table></body></html>`;
    const blob = new Blob([`\ufeff${html}`], { type: 'application/msword' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `verlauf_${new Date().toISOString().slice(0,10)}.doc`; a.click(); URL.revokeObjectURL(url);
  }

  function exportChartPNG(){
    try{
      if(!categoryChart){ alert('Kein Diagramm vorhanden'); return; }
      const dataUrl = categoryChart.toBase64Image();
      const a = document.createElement('a'); a.href = dataUrl; a.download = `diagramm_${new Date().toISOString().slice(0,10)}.png`; a.click();
    }catch(e){ console.warn('chart export', e); alert('Export fehlgeschlagen'); }
  }

  /* ------------------ Payday & saved calculation ------------------ */
  function computeSavedRecords(){
    const payday = Number(state.payday) || 1;
    if(!state.transactions.length) return [];
    const txs = state.transactions.slice().sort((a,b)=> new Date(a.date) - new Date(b.date));
    let start = periodStartForDate(new Date(txs[0].date), payday);
    const now = new Date();
    const periods = [];
    while(start <= now){
      const next = new Date(start); next.setMonth(next.getMonth()+1);
      const end = new Date(next); end.setDate(end.getDate()-1);
      const label = `${start.toLocaleString('de-DE',{month:'short', year:'numeric'})}`;
      periods.push({ start: new Date(start), end: new Date(end), label });
      start = next;
    }
    const records = periods.map(p => {
      const spent = state.transactions.filter(t => new Date(t.date) >= p.start && new Date(t.date) <= p.end).reduce((s,t)=> s + Number(t.amount||0), 0);
      return
