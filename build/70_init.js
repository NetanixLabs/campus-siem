
/* =========================================================
   Wiring
========================================================= */

/* ---------------- clock ---------------- */
function clock(){ $('clock').textContent = new Date().toLocaleTimeString('en-US',{hour12:false}); }
clock(); setInterval(clock, 1000);

/* ---------------- nav ---------------- */
$$('#topnav a').forEach(a => a.addEventListener('click', e => {
  e.preventDefault(); showView(a.dataset.view);
}));
$$('[data-goto]').forEach(el => el.addEventListener('click', () => showView(el.dataset.goto)));
window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'dashboards', true));

/* ---------------- generic dropdowns ---------------- */
function closeAllDD(except){
  $$('.dd.open').forEach(d => { if(d !== except) d.classList.remove('open'); });
  if(except !== $('bellWrap')) closeBell();
  const pm = $('panelMenuPop'); if(pm) pm.remove();
}
document.addEventListener('click', e => {
  if(!e.target.closest('.dd') && !e.target.closest('.bell-wrap') && !e.target.closest('#panelMenuPop')) closeAllDD();
});
['ddTime','ddRole','ddSearchTime'].forEach(id => {
  const dd = $(id);
  dd.addEventListener('click', e => {
    if(e.target.closest('.dd-menu')) return;
    const wasOpen = dd.classList.contains('open');
    closeAllDD(dd);
    dd.classList.toggle('open', !wasOpen);
  });
});

$('ddTimeMenu').addEventListener('click', e => {
  const it = e.target.closest('.dd-item'); if(!it) return;
  $$('#ddTimeMenu .dd-item').forEach(x => x.classList.remove('sel'));
  it.classList.add('sel');
  SCOPE.days = parseInt(it.dataset.days,10);
  SCOPE.rt = it.dataset.rt === '1';
  $('ddTimeLabel').textContent = SCOPE.rt ? 'Real-time · 30s' : it.textContent.replace(/\s*\(.*\)/,'');
  if(SCOPE.days === 11 && !SCOPE.rt) $('ddTimeLabel').textContent = 'Jul 3 – Jul 13, 2026';
  $('ddTime').classList.remove('open');
  renderDashboard();
  showToast(SCOPE.rt ? 'Real-time window enabled' : `Time range set to ${esc($('ddTimeLabel').textContent)}`);
});

$('ddRoleMenu').addEventListener('click', e => {
  const it = e.target.closest('.dd-item'); if(!it) return;
  $$('#ddRoleMenu .dd-item').forEach(x => x.classList.remove('sel'));
  it.classList.add('sel');
  SCOPE.role = it.dataset.role;
  $('ddRoleLabel').textContent = SCOPE.role === 'all' ? 'All' : SCOPE.role;
  $('ddRole').classList.remove('open');
  renderDashboard();
});

$('ddSearchTimeMenu').addEventListener('click', e => {
  const it = e.target.closest('.dd-item'); if(!it) return;
  $$('#ddSearchTimeMenu .dd-item').forEach(x => x.classList.remove('sel'));
  it.classList.add('sel');
  SEARCH_DAYS = parseInt(it.dataset.days,10);
  $('searchTimeLabel').textContent = it.textContent;
  $('ddSearchTime').classList.remove('open');
  runSearch();
});

/* ---------------- KPI drilldown ---------------- */
$$('.kpi.clickable').forEach(k => k.addEventListener('click', () => gotoSearch(k.dataset.q)));

/* ---------------- panel ⋯ menu ---------------- */
const PANEL_QUERIES = {
  workflow:'index=campus_siem behaviour!=normal',
  timeline:'index=campus_siem | timechart count by behaviour',
  behaviour:'index=campus_siem | stats count by behaviour',
  hourly:'index=campus_siem behaviour!=normal | stats count by hour',
  topips:'index=campus_siem behaviour!=normal | top src_ip limit=10',
  topstudents:'index=campus_siem behaviour!=normal | top student_id limit=10',
  midnight:'index=campus_siem behaviour=midnight_download | timechart count',
  authfail:'index=campus_siem auth_fail=1 | timechart count',
  status:'index=campus_siem | stats count by status',
  role:'index=campus_siem | stats count by role',
  massdl:'index=campus_siem behaviour=mass_download | top student_id limit=15',
  dbadmin:'index=campus_siem behaviour=db_admin_access | top student_id limit=15',
  burst:'index=campus_siem req_per_min>150 | stats max(req_per_min) by student_id',
  tickets:'index=campus_siem behaviour!=normal'
};
const PANEL_CSV = {
  massdl: () => ({ name:'mass_download.csv', fields:['student_id','src_ip','count','severity'],
    rows: DATA.mass_dl_top.map(r => [r.student_id, r.src_ip, r.count, sevLabel(r.count)]) }),
  dbadmin: () => ({ name:'db_admin_access.csv', fields:['role','student_id','count'],
    rows: DATA.db_admin_top.map(r => [r.role, r.student_id, r.count]) }),
  burst: () => ({ name:'request_bursts.csv', fields:['student_id','src_ip','bursts','peak_rpm'],
    rows: DATA.burst_top.map(r => [r.student_id, r.src_ip, r.count, r.peak_rpm]) }),
  tickets: () => ({ name:'tickets.csv', fields:['id','panel','student','priority','status','created','sentTo'],
    rows: TICKETS.map(t => [t.id, t.panel, t.student, t.priority, t.status, t.created, t.sentTo]) })
};

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-pmenu]');
  if(!btn) return;
  e.stopPropagation();
  closeAllDD();
  const panel = btn.closest('.panel');
  const key = panel.dataset.panel;
  const title = panel.querySelector('.panel-head .title').textContent;

  const pop = document.createElement('div');
  pop.id = 'panelMenuPop';
  pop.className = 'dd-menu';
  pop.style.display = 'block';
  pop.style.position = 'absolute';
  pop.style.zIndex = '80';
  const items = [
    { label:'Refresh panel', act:() => { renderDashboard(); renderDashTables(); showToast('Panel refreshed'); } },
    { label:'Open in Search', act:() => gotoSearch(PANEL_QUERIES[key] || 'index=campus_siem') }
  ];
  if(PANEL_CSV[key]) items.push({ label:'Export CSV', act:() => { const d = PANEL_CSV[key](); downloadCSV(d.name, toCSV(d.fields, d.rows)); } });
  items.push({ label:'Hide panel', act:() => {
    panel.classList.add('hidden-panel');
    const hid = Store.get('hiddenPanels', []);
    if(hid.indexOf(key) === -1){ hid.push(key); Store.set('hiddenPanels', hid); }
    showToast(`Panel <b>${esc(title)}</b> hidden — restore it from Edit mode`);
  }});

  pop.innerHTML = `<div class="dd-head">${esc(title)}</div>` +
    items.map((it,i) => `<div class="dd-item" data-i="${i}">${it.label}</div>`).join('');
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom + window.scrollY + 4) + 'px';
  pop.style.left = Math.max(8, r.right + window.scrollX - pop.offsetWidth) + 'px';
  pop.addEventListener('click', ev => {
    const it = ev.target.closest('.dd-item'); if(!it) return;
    items[+it.dataset.i].act();
    pop.remove();
  });
});

function applyHiddenPanels(){
  const hid = Store.get('hiddenPanels', []);
  $$('#dashGrid .panel').forEach(p => p.classList.toggle('hidden-panel', hid.indexOf(p.dataset.panel) !== -1));
}

/* ---------------- edit mode ---------------- */
$('btnEdit').addEventListener('click', () => {
  document.body.classList.toggle('editing');
  $('btnEdit').textContent = document.body.classList.contains('editing') ? 'Editing…' : 'Edit';
});
$('btnEditDone').addEventListener('click', () => {
  document.body.classList.remove('editing');
  $('btnEdit').textContent = 'Edit';
  showToast('Dashboard layout saved');
});
$('btnEditRestore').addEventListener('click', () => {
  Store.set('hiddenPanels', []);
  applyHiddenPanels();
  showToast('All panels restored');
});

/* ---------------- bell ---------------- */
$('bellWrap').addEventListener('click', e => {
  if(e.target.closest('.bell-menu')) return;
  const open = $('bellWrap').classList.contains('open');
  closeAllDD($('bellWrap'));
  $('bellWrap').classList.toggle('open', !open);
});
$('bellClear').addEventListener('click', e => {
  e.stopPropagation();
  NOTES = []; saveNotes(); renderBell();
  showToast('Notifications cleared');
});
$('bellGoTickets').addEventListener('click', e => {
  e.stopPropagation(); closeBell();
  showView('dashboards');
  setTimeout(() => $('ticketsPanel').scrollIntoView({ behavior:'smooth' }), 60);
});

/* ---------------- avatar ---------------- */
$('avatar').addEventListener('click', () => {
  $('infoTitle').textContent = 'Signed in';
  $('infoBody').innerHTML = `
    <div class="kv-grid">
      <div><span>User</span><br><b>campus.soc</b></div>
      <div><span>Role</span><br><b>admin</b></div>
      <div><span>App</span><br><b>Campus SIEM</b></div>
      <div><span>Index access</span><br><b>campus_siem</b></div>
      <div><span>Tickets open</span><br><b>${TICKETS.length}</b></div>
      <div><span>Mail relay</span><br><b>${esc(MAIL.provider)}</b></div>
    </div>
    <div class="hint" style="margin-top:10px;">All dashboard state (tickets, alerts, reports, settings) is stored in this browser only.</div>`;
  openModal('infoModal');
});

/* ---------------- search view ---------------- */
$('btnSearch').addEventListener('click', runSearch);
$('spl').addEventListener('keydown', e => {
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); runSearch(); }
});
$$('#searchTabs .st').forEach(t => t.addEventListener('click', () => switchStab(t.dataset.stab)));
$('vizType').addEventListener('change', () => {
  if(SEARCH_RESULT && SEARCH_RESULT.ok && SEARCH_RESULT.kind === 'table') renderVizFromTable(SEARCH_RESULT.fields, SEARCH_RESULT.rows);
  else drawViz();
});
$('vizField').addEventListener('change', drawViz);
$('btnExportCsv').addEventListener('click', exportCurrentSearch);

$('btnSaveAsReport').addEventListener('click', () => {
  editingReportId = null;
  $('reportModalTitle').textContent = 'Save Search As Report';
  $('rpTitle').value = ''; $('rpDesc').value = '';
  $('rpSearch').value = $('spl').value;
  $('rpViz').value = 'bar';
  setStatus('rpStatus','');
  openModal('reportModal');
});
$('btnSaveAsAlert').addEventListener('click', () => {
  editingAlertId = null;
  $('alertModalTitle').textContent = 'Save Search As Alert';
  $('alTitle').value = ''; $('alSearch').value = $('spl').value;
  $('alOp').value = 'gt'; $('alThreshold').value = 10;
  $('alSeverity').value = 'medium'; $('alCron').value = '0 * * * *';
  $('alActEmail').checked = true; $('alActTicket').checked = true; $('alActEnabled').checked = true;
  $('alActEmailTo').textContent = MAIL.to || '(set a recipient in Settings)';
  setStatus('alStatus','');
  openModal('alertModal');
});

/* ---------------- reports view ---------------- */
$('reportFilter').addEventListener('input', renderReports);
$('btnNewReport').addEventListener('click', () => {
  editingReportId = null;
  $('reportModalTitle').textContent = 'New Report';
  $('rpTitle').value = ''; $('rpDesc').value = '';
  $('rpSearch').value = 'index=campus_siem behaviour!=normal | stats count by src_ip';
  $('rpViz').value = 'bar';
  setStatus('rpStatus','');
  openModal('reportModal');
});
$('btnReportClose').addEventListener('click', () => { $('reportResultPanel').style.display = 'none'; });
$('btnRpSave').addEventListener('click', () => {
  const title = $('rpTitle').value.trim();
  const spl = $('rpSearch').value.trim();
  if(!title){ setStatus('rpStatus','Give the report a title.','err'); return; }
  const test = runSPL(spl);
  if(!test.ok){ setStatus('rpStatus','Search error: ' + test.error,'err'); return; }
  if(editingReportId){
    const r = REPORTS.find(x => x.id === editingReportId);
    Object.assign(r, { title, desc:$('rpDesc').value.trim(), spl, viz:$('rpViz').value });
    showToast('Report updated');
  }else{
    REPORTS.unshift({ id:'r' + Date.now(), title, desc:$('rpDesc').value.trim(), spl,
      viz:$('rpViz').value, owner:'campus.soc', sharing:'Private', lastRun:null });
    showToast('Report saved');
  }
  saveReports(); closeModal('reportModal');
  showView('reports'); renderReports();
});

/* ---------------- alerts view ---------------- */
$('alertFilter').addEventListener('input', renderAlerts);
$('btnRunAllAlerts').addEventListener('click', runAllAlerts);
$('btnClearFired').addEventListener('click', () => {
  FIRED = []; saveFired(); renderFired();
  showToast('Triggered-alert history cleared');
});
$('btnNewAlert').addEventListener('click', () => {
  editingAlertId = null;
  $('alertModalTitle').textContent = 'New Alert';
  $('alTitle').value = ''; $('alSearch').value = 'index=campus_siem behaviour=db_admin_access role=student';
  $('alOp').value = 'gt'; $('alThreshold').value = 10;
  $('alSeverity').value = 'medium'; $('alCron').value = '0 * * * *';
  $('alActEmail').checked = true; $('alActTicket').checked = true; $('alActEnabled').checked = true;
  $('alActEmailTo').textContent = MAIL.to || '(set a recipient in Settings)';
  setStatus('alStatus','');
  openModal('alertModal');
});
$('btnAlPreview').addEventListener('click', () => {
  const spl = $('alSearch').value.trim();
  const res = runSPL(spl);
  if(!res.ok){ setStatus('alStatus','Search error: ' + res.error,'err'); return; }
  const n = res.kind === 'events' ? res.events.length : res.rows.length;
  const th = parseInt($('alThreshold').value,10) || 0;
  const op = $('alOp').value;
  const would = op === 'gt' ? n > th : op === 'lt' ? n < th : n === th;
  setStatus('alStatus',
    `<b>${fmt(n)}</b> matching events right now. With <b>count ${opLabel(op)} ${th}</b> this alert <b>${would ? 'WOULD' : 'would NOT'}</b> trigger.`,
    would ? 'err' : 'ok');
});
$('btnAlSave').addEventListener('click', () => {
  const title = $('alTitle').value.trim();
  const spl = $('alSearch').value.trim();
  if(!title){ setStatus('alStatus','Give the alert a title.','err'); return; }
  const test = runSPL(spl);
  if(!test.ok){ setStatus('alStatus','Search error: ' + test.error,'err'); return; }
  const payload = {
    title, spl,
    op: $('alOp').value,
    threshold: parseInt($('alThreshold').value,10) || 0,
    severity: $('alSeverity').value,
    cron: $('alCron').value,
    email: $('alActEmail').checked,
    ticket: $('alActTicket').checked,
    enabled: $('alActEnabled').checked
  };
  if(editingAlertId) Object.assign(ALERTS.find(x => x.id === editingAlertId), payload);
  else ALERTS.unshift(Object.assign({ id:'a' + Date.now(), lastTriggered:null }, payload));
  saveAlerts(); closeModal('alertModal');
  showView('alerts'); renderAlerts();
  showToast(editingAlertId ? 'Alert updated' : 'Alert saved');
});

/* ---------------- settings view ---------------- */
$('setProvider').addEventListener('change', () => { updateProviderHint(); setStatus('setStatus',''); });
$('btnSaveMail').addEventListener('click', saveMailSettings);
$('btnTestMail').addEventListener('click', sendTestEmail);
$('btnSavePrefs').addEventListener('click', savePrefs);

const IDX_INFO = {
  index:['index=campus_siem', [['Events',fmt(DATA.kpi.total_events)],['Earliest','2026-07-03 00:00:00'],['Latest','2026-07-13 23:59:59'],['Buckets','11 (1 per day)'],['Max size','5 GB'],['Home path','$SPLUNK_DB/campus_siem/db']]],
  sourcetype:['sourcetype=campus:siem', [['Line breaker','([\\r\\n]+)'],['Timestamp field','_time'],['Time format','%Y-%m-%d %H:%M:%S'],['KV mode','auto'],['Truncate','10000']]],
  source:['source=campus_siem.log', [['Input type','monitor'],['Path','/var/log/campus/campus_siem.log'],['Index','campus_siem'],['Whitelist','\\.log$'],['Crc salt','<SOURCE>']]],
  retention:['Retention policy', [['frozenTimePeriodInSecs','7776000 (90 days)'],['maxTotalDataSizeMB','5120'],['coldToFrozenDir','(none — delete)'],['Current usage','1.2 GB']]],
  fields:['Field extractions', [['Fields', RAW_FIELDS.join(', ')],['Extraction','KV_MODE=auto'],['Calculated','severity = case(req_per_min>500,"high", ...)'],['Aliases','user_id AS student_id']]]
};
$$('.set-link[data-idx]').forEach(el => el.addEventListener('click', () => {
  const [title, rows] = IDX_INFO[el.dataset.idx];
  $('infoTitle').textContent = title;
  $('infoBody').innerHTML =
    '<table class="sp-table"><tbody>' +
    rows.map(([k,v]) => `<tr><td style="color:var(--text-dim);width:200px;">${esc(k)}</td><td class="mono" style="color:var(--teal);">${esc(v)}</td></tr>`).join('') +
    '</tbody></table>';
  openModal('infoModal');
}));

$('lnkExportTickets').addEventListener('click', () => {
  if(!TICKETS.length){ showToast('No tickets to export','err'); return; }
  const d = PANEL_CSV.tickets();
  downloadCSV(d.name, toCSV(d.fields, d.rows));
});
$('lnkExportEvents').addEventListener('click', () => {
  if(!SEARCH_RAN) runSPL('index=campus_siem');
  const f = ['time','host','student_id','role','src_ip','action','uri','status','bytes','req_per_min','auth_fail','behaviour'];
  const rows = (SEARCH_EVENTS.length ? SEARCH_EVENTS : EVENTS).map(e => f.map(k => e[k]));
  downloadCSV('campus_siem_events.csv', toCSV(f, rows));
});
$('lnkClearTickets').addEventListener('click', () => {
  if(!confirm('Delete every ticket in the queue? This cannot be undone.')) return;
  TICKETS = []; saveTickets(); renderTickets();
  showToast('Ticket queue cleared');
});
$('lnkResetAll').addEventListener('click', () => {
  if(!confirm('Reset all saved settings, reports, alerts and tickets back to defaults?')) return;
  Store.clearAll();
  location.reload();
});

/* ---------------- modal plumbing ---------------- */
$$('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
$$('.modal-backdrop').forEach(m => m.addEventListener('click', e => {
  if(e.target === m){ m.classList.remove('show'); if(m.id === 'notifyModal') resetFlowNodes(); }
}));
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    $$('.modal-backdrop.show').forEach(m => m.classList.remove('show'));
    resetFlowNodes(); closeAllDD();
  }
});

/* ---------------- boot ---------------- */
renderDashTables();
renderDashboard();
renderTickets();
renderBell();
applyHiddenPanels();
applyRefresh();
$('cfgToEmail').value = MAIL.to;
$('cfgCcEmail').value = MAIL.cc;
$('cfgPriority').value = MAIL.priority;
showView(location.hash.slice(1) || 'dashboards', true);
