(() => {
  // DOM
  const tabs = document.querySelectorAll('.nav-btn');
  const tabSections = document.querySelectorAll('.tab');

  const totalBudgetInput = document.getElementById('totalBudget');
  const saveBudgetBtn = document.getElementById('saveBudget');
  const remainingAmountEl = document.getElementById('remainingAmount');
  const spentAmountEl = document.getElementById('spentAmount');

  const txDesc = document.getElementById('txDesc');
  const txAmount = document.getElementById('txAmount');
  const txCategory = document.getElementById('txCategory');
  const addTxBtn = document.getElementById('addTx');
  const historyList = document.getElementById('historyList');

  const toggleThemeBtn = document.getElementById('toggleTheme');
  const resetHistoryBtn = document.getElementById('resetHistory');
  const exportDataBtn = document.getElementById('exportData');
  const importFile = document.getElementById('importFile');

  const navItemsContainer = document.querySelector('.nav-items');
  const navUnderline = document.querySelector('.nav-underline');

  // categories
  const CATEGORIES = ["Handyabo","Fonds","Eltern","Verpflegung","Frisör","Sparen","Geschenke","Sonstiges"];
  const STORAGE_KEY = 'budget_planer_v1';

  // state
  let state = {
    totalBudget: 0,
    entries: [],
    theme: 'light'
  };

  // charts
  let chart = null;
  let percentageChart = null;
  const ctx = document.getElementById('categoryChart').getContext('2d');
  const ctxPerc = document.getElementById('percentageChart').getContext('2d');

  // helpers
  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function loadState(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw) state = JSON.parse(raw);
    } catch(e){ console.warn('load error', e); }
  }

  function formatMoney(v){
    const n = Number(v) || 0;
    return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', minimumFractionDigits: 2 }).format(n);
  }

  function calcTotals(){
    const spent = state.entries.reduce((s,e)=>s+Number(e.amount),0);
    const remaining = Math.max(0, Number(state.totalBudget) - spent);
    return {spent,remaining};
  }

  // render functions
  function renderSummary(){
    const {spent,remaining} = calcTotals();
    spentAmountEl.textContent = formatMoney(spent);
    remainingAmountEl.textContent = formatMoney(remaining);
    if(spent > Number(state.totalBudget)) remainingAmountEl.classList.add('over');
    else remainingAmountEl.classList.remove('over');
  }

  function renderHistory(){
    historyList.innerHTML = '';
    if(state.entries.length === 0){
      historyList.innerHTML = `<div class="muted">Kein Verlauf vorhanden.</div>`;
      return;
    }
    state.entries.slice().reverse().forEach(entry=>{
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div class="history-meta">
          <div class="badge">${entry.category}</div>
          <div>
            <div style="font-weight:700">${entry.desc || '(keine Beschreibung)'}</div>
            <div class="muted" style="font-size:12px">${new Date(entry.date).toLocaleString('de-CH')}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700">${formatMoney(entry.amount)}</div>
          <button data-id="${entry.id}" class="remove small muted" style="margin-top:6px;background:transparent;border:0;cursor:pointer;color:var(--muted)">Entfernen</button>
        </div>
      `;
      historyList.appendChild(item);
    });

    historyList.querySelectorAll('.remove').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        const id = ev.currentTarget.dataset.id;
        state.entries = state.entries.filter(e=>e.id !== id);
        saveState(); renderAll();
      });
    });
  }

  // update (not destroy) charts for smooth animations & correct tooltips
  function renderChart(){
    const sums = {};
    CATEGORIES.forEach(c => sums[c] = 0);
    state.entries.forEach(e => { sums[e.category] += Number(e.amount); });

    const labels = CATEGORIES;
    const data = labels.map(l => sums[l] || 0);
    const colors = ['#6c5ce7','#00b894','#0984e3','#fd79a8','#e17055','#00cec9','#fab1a0','#a29bfe'];

    // dynamic tooltip callback that always computes the current total
    const tooltipLabel = function(context){
      const amount = context.raw || 0;
      const total = context.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);
      const pct = total ? (amount / total * 100).toFixed(1) : '0.0';
      return `${context.label}: ${formatMoney(amount)} (${pct}%)`;
    };

    if(chart){
      chart.data.datasets[0].data = data;
      chart.options.plugins.tooltip.callbacks.label = tooltipLabel;
      chart.update({duration: 800, easing: 'easeOutQuart'});
      return;
    }

    chart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeOutQuart' },
        plugins: {
          legend: { position:'bottom' },
          tooltip: { callbacks: { label: tooltipLabel } }
        }
      }
    });
  }

  function renderPercentageChart(){
    const sums = {};
    CATEGORIES.forEach(c => sums[c] = 0);
    state.entries.forEach(e => { sums[e.category] += Number(e.amount); });

    const labels = CATEGORIES;
    const totals = labels.map(l => sums[l] || 0);          // absolute CHF per category
    const totalSpent = totals.reduce((a,b)=>a+b,0);
    const percents = totals.map(v => totalSpent > 0 ? (v / totalSpent * 100) : 0);
    const colors = ['#6c5ce7','#00b894','#0984e3','#fd79a8','#e17055','#00cec9','#fab1a0','#a29bfe'];

    // tooltip should show percent + absolute CHF (use chart._absTotals to keep values)
    const tooltipLabel = function(context){
      const pct = (context.raw || 0).toFixed(1);
      const idx = context.dataIndex;
      const abs = (context.chart._absTotals && context.chart._absTotals[idx]) ? context.chart._absTotals[idx] : 0;
      return `${context.label}: ${pct}% (${formatMoney(abs)})`;
    };

    if(percentageChart){
      percentageChart.data.datasets[0].data = percents;
      percentageChart._absTotals = totals;
      percentageChart.options.plugins.tooltip.callbacks.label = tooltipLabel;
      percentageChart.update({duration: 900, easing: 'easeOutQuart'});
      return;
    }

    percentageChart = new Chart(ctxPerc, {
      type: 'pie',
      data: { labels, datasets: [{ data: percents, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeOutQuart' },
        plugins: {
          legend: { position:'bottom' },
          tooltip: { callbacks: { label: tooltipLabel } }
        }
      }
    });
    percentageChart._absTotals = totals;
  }

  function renderTheme(){
    document.body.className = state.theme === 'dark' ? 'dark' : 'light';
  }

  function renderAll(){
    renderSummary();
    renderHistory();
    renderChart();
    renderPercentageChart();
    renderTheme();
    totalBudgetInput.value = state.totalBudget || '';
    // update nav underline after layout
    requestAnimationFrame(updateNavUnderline);
  }

  // nav underline
  function updateNavUnderline(){
    const activeBtn = document.querySelector('.nav-btn.active');
    if(!activeBtn || !navItemsContainer || !navUnderline) return;
    const containerRect = navItemsContainer.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const left = btnRect.left - containerRect.left;
    navUnderline.style.transform = `translateX(${left}px)`;
    navUnderline.style.width = `${btnRect.width}px`;
  }

  // tab switch
  function setTab(name){
    tabs.forEach(t=>{
      const active = t.dataset.tab === name;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    tabSections.forEach(s => s.classList.toggle('active', s.id === `tab-${name}`));
    updateNavUnderline();
  }

  function addTransaction(){
    const desc = txDesc.value.trim();
    const amount = parseFloat(txAmount.value);
    const category = txCategory.value;
    if(isNaN(amount) || amount <= 0){ alert('Bitte gültigen Betrag eingeben.'); return; }
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      desc,
      amount: Math.abs(amount),
      category,
      date: new Date().toISOString()
    };
    state.entries.push(entry);
    saveState();
    txDesc.value = ''; txAmount.value = '';
    renderAll();
    setTab('history');
  }

  // events
  tabs.forEach(btn => {
    btn.addEventListener('click', ()=> setTab(btn.dataset.tab));
  });
  window.addEventListener('resize', () => updateNavUnderline());

  saveBudgetBtn.addEventListener('click', ()=>{
    const v = parseFloat(totalBudgetInput.value);
    if(isNaN(v) || v < 0){ alert('Bitte gültiges Budget eingeben.'); return; }
    state.totalBudget = Number(v);
    saveState();
    renderAll();
  });

  addTxBtn.addEventListener('click', addTransaction);
  txAmount.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') addTransaction(); });

  toggleThemeBtn.addEventListener('click', ()=>{
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    saveState(); renderTheme();
  });

  resetHistoryBtn.addEventListener('click', ()=>{
    if(!confirm('Sicher: Verlauf komplett löschen?')) return;
    state.entries = [];
    saveState();
    renderAll();
  });

  exportDataBtn.addEventListener('click', ()=>{
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'budget_plan_export.json';
    a.click(); URL.revokeObjectURL(url);
  });

  importFile.addEventListener('change', (ev)=>{
    const f = ev.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try {
        const imported = JSON.parse(reader.result);
        if(imported && Array.isArray(imported.entries)){
          if(!confirm('Importieren und aktuellen Zustand überschreiben?')) return;
          state = imported;
          saveState(); renderAll();
        } else alert('Ungültige Datei.');
      } catch(err){ alert('Fehler beim Einlesen.'); }
    };
    reader.readAsText(f);
  });

  // init
  loadState();
  if(!state.entries) state.entries = [];
  if(!state.theme) state.theme = 'light';
  renderAll();
})();
