
/* =========================================================
   Charts
========================================================= */
const CHARTS = {};
const commonGrid = { grid:{ color: C.grid, drawTicks:false }, ticks:{ color: C.dim } };

function mkChart(id, cfg){
  const el = $(id);
  if(!el) return null;
  if(CHARTS[id]){ CHARTS[id].destroy(); delete CHARTS[id]; }
  CHARTS[id] = new Chart(el, cfg);
  return CHARTS[id];
}
function drillOn(getQuery){
  return (evt, els) => {
    if(!els || !els.length) return;
    const q = getQuery(els[0].index, els[0].datasetIndex);
    if(q) gotoSearch(q);
  };
}

/* =========================================================
   Dashboard
========================================================= */
let SCOPE = { days: 11, role: 'all', rt: false };

function scopedData(){
  if(SCOPE.days === 11 && SCOPE.role === 'all'){
    return { d: DATA, sampled:false, dayFrom:0 };
  }
  const dayFrom = DATA.days.length - SCOPE.days;
  const evs = EVENTS.filter(e => e.dayIdx >= dayFrom && (SCOPE.role === 'all' || e.role === SCOPE.role));
  const up = n => Math.round(n * SCALE);
  const days = DATA.days.slice(dayFrom);

  const byDay = i => evs.filter(e => e.dayIdx === i + dayFrom);
  const countBy = (list, f) => {
    const m = {};
    list.forEach(e => { m[e[f]] = (m[e[f]] || 0) + 1; });
    return m;
  };
  const susp = evs.filter(e => e.behaviour !== 'normal');
  const scaleMap = m => { const o = {}; Object.keys(m).forEach(k => o[k] = up(m[k])); return o; };
  const topOf = (list, f, n) => Object.entries(countBy(list, f))
    .sort((a,b) => b[1]-a[1]).slice(0,n).map(([k,v]) => [k, up(v)]);

  const behav = scaleMap(countBy(evs, 'behaviour'));
  Object.keys(DATA.behaviour_counts).forEach(k => { if(!(k in behav)) behav[k] = 0; });

  return {
    sampled:true, dayFrom,
    d:{
      kpi:{
        total_events: up(evs.length),
        suspicious_events: up(susp.length),
        unique_students: new Set(evs.map(e => e.student_id)).size,
        unique_ips: new Set(evs.map(e => e.src_ip)).size
      },
      days,
      daily_susp: days.map((_,i) => up(byDay(i).filter(e => e.behaviour !== 'normal').length)),
      daily_norm: days.map((_,i) => up(byDay(i).filter(e => e.behaviour === 'normal').length)),
      behaviour_counts: behav,
      hourly_susp: Array.from({length:24}, (_,h) => up(susp.filter(e => e.hour === h).length)),
      top_ips: topOf(susp, 'src_ip', 10),
      top_students: topOf(susp, 'student_id', 10),
      midnight_daily: days.map((_,i) => up(byDay(i).filter(e => e.behaviour === 'midnight_download').length)),
      authfail_daily: days.map((_,i) => up(byDay(i).filter(e => e.auth_fail === 1).length)),
      status_counts: scaleMap(countBy(evs, 'status')),
      role_counts: scaleMap(countBy(evs, 'role'))
    }
  };
}

function roleQ(){ return SCOPE.role === 'all' ? '' : ' role=' + SCOPE.role; }

function renderDashboard(){
  const { d, sampled } = scopedData();

  $('kpiTotal').textContent = fmt(d.kpi.total_events);
  $('kpiSuspicious').textContent = fmt(d.kpi.suspicious_events);
  $('kpiSuspiciousPct').textContent = d.kpi.total_events
    ? (100*d.kpi.suspicious_events/d.kpi.total_events).toFixed(1) + '% of total events' : '— of total';
  $('kpiStudents').textContent = fmt(d.kpi.unique_students);
  $('kpiIps').textContent = fmt(d.kpi.unique_ips);
  $('kpiTotalDelta').textContent = `across ${d.days.length} day${d.days.length===1?'':'s'}` + (sampled ? ' · sampled estimate' : '');
  $('chipEvents').textContent = fmt(d.kpi.total_events);
  $('chipStudents').textContent = fmt(d.kpi.unique_students);
  $('chipIps').textContent = fmt(d.kpi.unique_ips);

  mkChart('chartTimeline', {
    type:'line',
    data:{ labels: d.days, datasets:[
      { label:'Normal', data: d.daily_norm, borderColor: C.blue, backgroundColor:'rgba(91,155,213,.12)', fill:true, tension:.3, pointRadius:2 },
      { label:'Suspicious', data: d.daily_susp, borderColor: C.red, backgroundColor:'rgba(220,78,65,.15)', fill:true, tension:.3, pointRadius:2 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      onClick: drillOn((i, ds) => `index=campus_siem${roleQ()} day="${d.days[i]}" ${ds === 1 ? 'behaviour!=normal' : 'behaviour=normal'}`),
      plugins:{ legend:{ position:'top', align:'end', labels:{ boxWidth:10, usePointStyle:true } } },
      scales:{ x: commonGrid, y: commonGrid } }
  });

  const behavKeys = Object.keys(d.behaviour_counts);
  mkChart('chartBehaviour', {
    type:'doughnut',
    data:{ labels: behavKeys, datasets:[{ data: behavKeys.map(k => d.behaviour_counts[k]),
      backgroundColor:[C.blue,C.red,C.gold,C.purple,C.teal], borderColor:'#1b1e23', borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
      onClick: drillOn(i => `index=campus_siem${roleQ()} behaviour=${behavKeys[i]}`),
      plugins:{ legend:{ position:'right', labels:{ boxWidth:10, usePointStyle:true, font:{size:10.5} } } } }
  });

  mkChart('chartHourly', {
    type:'bar',
    data:{ labels:[...Array(24).keys()], datasets:[{ label:'Suspicious events', data: d.hourly_susp, backgroundColor: C.gold, borderRadius:2 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      onClick: drillOn(i => `index=campus_siem${roleQ()} behaviour!=normal hour=${i}`),
      plugins:{legend:{display:false}}, scales:{ x: commonGrid, y: commonGrid } }
  });

  mkChart('chartTopIps', {
    type:'bar',
    data:{ labels: d.top_ips.map(x => x[0]), datasets:[{ data: d.top_ips.map(x => x[1]), backgroundColor: C.teal, borderRadius:2 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      onClick: drillOn(i => `index=campus_siem${roleQ()} behaviour!=normal src_ip="${d.top_ips[i][0]}"`),
      plugins:{legend:{display:false}},
      scales:{ x: commonGrid, y:{ grid:{ display:false }, ticks:{ color:C.dim, font:{size:9.5} } } } }
  });

  mkChart('chartTopStudents', {
    type:'bar',
    data:{ labels: d.top_students.map(x => x[0]), datasets:[{ data: d.top_students.map(x => x[1]), backgroundColor: C.red, borderRadius:2 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      onClick: drillOn(i => `index=campus_siem${roleQ()} behaviour!=normal student_id="${d.top_students[i][0]}"`),
      plugins:{legend:{display:false}},
      scales:{ x: commonGrid, y:{ grid:{ display:false }, ticks:{ color:C.dim } } } }
  });

  mkChart('chartMidnight', {
    type:'line',
    data:{ labels: d.days, datasets:[{ label:'midnight_download', data: d.midnight_daily, borderColor: C.purple, backgroundColor:'rgba(157,111,212,.18)', fill:true, tension:.35, pointRadius:2 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      onClick: drillOn(i => `index=campus_siem${roleQ()} behaviour=midnight_download day="${d.days[i]}"`),
      plugins:{legend:{display:false}}, scales:{ x: commonGrid, y: commonGrid } }
  });

  mkChart('chartAuthFail', {
    type:'bar',
    data:{ labels: d.days, datasets:[{ label:'auth_fail', data: d.authfail_daily, backgroundColor: C.red, borderRadius:2 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      onClick: drillOn(i => `index=campus_siem${roleQ()} auth_fail=1 day="${d.days[i]}"`),
      plugins:{legend:{display:false}}, scales:{ x: commonGrid, y: commonGrid } }
  });

  const statusKeys = Object.keys(d.status_counts);
  mkChart('chartStatus', {
    type:'pie',
    data:{ labels: statusKeys, datasets:[{ data: statusKeys.map(k => d.status_counts[k]),
      backgroundColor: PALETTE, borderColor:'#1b1e23', borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      onClick: drillOn(i => `index=campus_siem${roleQ()} status=${statusKeys[i]}`),
      plugins:{ legend:{ position:'right', labels:{ boxWidth:10, usePointStyle:true, font:{size:10} } } } }
  });

  const roleKeys = Object.keys(d.role_counts);
  mkChart('chartRole', {
    type:'bar',
    data:{ labels: roleKeys, datasets:[{ data: roleKeys.map(k => d.role_counts[k]), backgroundColor:[C.blue,C.teal,C.gold,C.purple], borderRadius:3 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      onClick: drillOn(i => `index=campus_siem role=${roleKeys[i]}`),
      plugins:{legend:{display:false}},
      scales:{ x: commonGrid, y:{ ...commonGrid, type:'logarithmic' } } }
  });
}

/* ---------------- dashboard tables ---------------- */
function sevBadge(n){
  if(n>=80) return '<span class="badge high">high</span>';
  if(n>=40) return '<span class="badge med">medium</span>';
  return '<span class="badge low">low</span>';
}
function sevLabel(n){ return n>=80 ? 'high' : n>=40 ? 'medium' : 'low'; }

function notifyBtn(panel, rowJson, rowId){
  return `<button class="notify-btn" id="notifyBtn-${rowId}" onclick='event.stopPropagation();openNotifyModal(${JSON.stringify(panel)}, ${rowJson}, "${rowId}")'>🔔 Notify</button>`;
}

function renderDashTables(){
  $('tblMassDl').innerHTML = DATA.mass_dl_top.map((r,i) => {
    const rowId = 'massdl-' + i;
    return `<tr class="drill" onclick='gotoSearch("index=campus_siem behaviour=mass_download student_id=\\"${r.student_id}\\"")'>` +
      `<td>${esc(r.student_id)}</td><td class="mono">${esc(r.src_ip)}</td><td>${r.count}</td><td>${sevBadge(r.count)}</td>` +
      `<td>${notifyBtn('Mass Download Events', JSON.stringify({student_id:r.student_id, src_ip:r.src_ip, count:r.count, severity:sevLabel(r.count)}), rowId)}</td></tr>`;
  }).join('');

  $('tblDbAdmin').innerHTML = DATA.db_admin_top.map((r,i) => {
    const rowId = 'dbadmin-' + i;
    return `<tr class="drill" onclick='gotoSearch("index=campus_siem behaviour=db_admin_access student_id=\\"${r.student_id}\\"")'>` +
      `<td>${esc(r.role)}</td><td>${esc(r.student_id)}</td><td>${r.count}</td>` +
      `<td>${notifyBtn('DB Admin Access Attempts', JSON.stringify({role:r.role, student_id:r.student_id, count:r.count}), rowId)}</td></tr>`;
  }).join('');

  $('tblBurst').innerHTML = DATA.burst_top.map((r,i) => {
    const rowId = 'burst-' + i;
    return `<tr class="drill" onclick='gotoSearch("index=campus_siem req_per_min>150 student_id=\\"${r.student_id}\\"")'>` +
      `<td>${esc(r.student_id)}</td><td class="mono">${esc(r.src_ip)}</td><td>${r.count}</td><td>${r.peak_rpm}</td>` +
      `<td>${notifyBtn('High Request-Rate Bursts', JSON.stringify({student_id:r.student_id, src_ip:r.src_ip, count:r.count, peak_rpm:r.peak_rpm}), rowId)}</td></tr>`;
  }).join('');
}

/* =========================================================
   Router
========================================================= */
const VIEWS = ['dashboards','search','reports','alerts','settings'];
let CURRENT_VIEW = 'dashboards';

function showView(name, skipHash){
  if(VIEWS.indexOf(name) === -1) name = 'dashboards';
  CURRENT_VIEW = name;
  VIEWS.forEach(v => $('view-' + v).classList.toggle('active', v === name));
  $$('#topnav a').forEach(a => a.classList.toggle('active', a.dataset.view === name));
  if(!skipHash && location.hash.slice(1).split('?')[0] !== name) history.replaceState(null,'','#'+name);
  window.scrollTo({ top:0 });
  if(name === 'search' && !SEARCH_RAN) runSearch();
  if(name === 'reports') renderReports();
  if(name === 'alerts')  renderAlerts();
  if(name === 'settings') fillSettings();
}

function gotoSearch(q){
  $('spl').value = q;
  showView('search');
  runSearch();
}

/* =========================================================
   Search view
========================================================= */
let SEARCH_RAN = false;
let SEARCH_RESULT = null;
let SEARCH_EVENTS = [];
let EV_PAGE = 0;
let SEARCH_DAYS = 11;

function jobProgress(done){
  const bar = $('sbJobBar'), txt = $('sbJobText');
  if(!done){
    bar.style.width = '0%'; txt.innerHTML = '<span class="spin"></span>scanning…';
    setTimeout(() => bar.style.width = '62%', 40);
  }else{
    bar.style.width = '100%'; txt.textContent = 'job complete';
  }
}

function runSearch(){
  SEARCH_RAN = true;
  const q = $('spl').value.trim();
  jobProgress(false);

  const dayFrom = DATA.days.length - SEARCH_DAYS;
  const scoped = SEARCH_DAYS === 11 ? EVENTS : EVENTS.filter(e => e.dayIdx >= dayFrom);
  const res = runSPL(q, { events: scoped });

  setTimeout(() => {
    jobProgress(true);
    SEARCH_RESULT = res;

    if(!res.ok){
      SEARCH_EVENTS = [];
      $('sbCount').textContent = '0';
      $('evList').innerHTML =
        `<div class="empty-state"><div class="big">⚠</div><div style="color:var(--red);max-width:520px;margin:0 auto;">${res.error}</div></div>`;
      $('evPager').innerHTML = '';
      $('statsHead').innerHTML = ''; $('statsBody').innerHTML = '';
      $('fpSelected').innerHTML = ''; $('fpInteresting').innerHTML = '';
      if(CHARTS['chartSearchTimeline']){ CHARTS['chartSearchTimeline'].destroy(); delete CHARTS['chartSearchTimeline']; }
      if(CHARTS['chartSearchViz']){ CHARTS['chartSearchViz'].destroy(); delete CHARTS['chartSearchViz']; }
      return;
    }

    $('sbRange').textContent = SEARCH_DAYS === 11
      ? 'Jul 3, 2026 – Jul 13, 2026'
      : `${DATA.days[dayFrom]}, 2026 – Jul 13, 2026`;

    if(res.kind === 'events'){
      SEARCH_EVENTS = res.events;
      $('sbCount').textContent = fmt(res.events.length);
      EV_PAGE = 0;
      renderEvents();
      renderFieldsPanel(res.events);
      renderSearchTimeline(res.events);
      renderStatsFromEvents(res.events);
      renderVizControls(res.events);
      switchStab('events');
    }else{
      SEARCH_EVENTS = [];
      $('sbCount').textContent = fmt(res.rows.length);
      $('evList').innerHTML =
        '<div class="empty-state"><div class="big">Σ</div>This search returns a transformed result set.<br>See the <b>Statistics</b> and <b>Visualization</b> tabs.</div>';
      $('evPager').innerHTML = '';
      $('fpSelected').innerHTML = ''; $('fpInteresting').innerHTML = '';
      if(CHARTS['chartSearchTimeline']){ CHARTS['chartSearchTimeline'].destroy(); delete CHARTS['chartSearchTimeline']; }
      renderStatsTable(res.fields, res.rows);
      renderVizFromTable(res.fields, res.rows);
      switchStab('stats');
    }
  }, 260);
}

function highlightRaw(e){
  let html = esc(rawLine(e));
  html = html.replace(/([a-z_]+)=(&quot;[^&]*?&quot;|[^\s]+)/g, (m, k, v) => {
    const numeric = /^\d+$/.test(v);
    return `<span class="k">${k}</span>=<span class="v${numeric?' num':''}">${v}</span>`;
  });
  const terms = parseFilters($('spl').value.split('|')[0])
    .filter(c => c.type === 'text' && c.value.length > 2 && !c.negate)
    .map(c => c.value);
  terms.forEach(t => {
    const rx = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')','ig');
    html = html.replace(rx, '<mark>$1</mark>');
  });
  return html;
}

function renderEvents(){
  const size = PREFS.pageSize;
  const total = SEARCH_EVENTS.length;
  if(!total){
    $('evList').innerHTML = '<div class="empty-state"><div class="big">∅</div>No events match this search.<br>Try widening the time range or removing a filter.</div>';
    $('evPager').innerHTML = '';
    return;
  }
  const pages = Math.ceil(total / size);
  EV_PAGE = Math.min(EV_PAGE, pages - 1);
  const slice = SEARCH_EVENTS.slice(EV_PAGE*size, EV_PAGE*size + size);

  $('evList').innerHTML = slice.map(e => `
    <div class="ev" id="ev-${e._id}">
      <div class="ev-time" onclick="document.getElementById('ev-${e._id}').classList.toggle('open')">
        <span class="caret-ev">▶</span><span>${e.time}</span>
      </div>
      <div>
        <div class="ev-raw">${highlightRaw(e)}</div>
        <div class="ev-fields">
          <table>${RAW_FIELDS.map(f => `<tr><td>${f}</td><td>${esc(e[f])}</td></tr>`).join('')}
            <tr><td>index</td><td>${e.index}</td></tr>
            <tr><td>sourcetype</td><td>${e.sourcetype}</td></tr>
            <tr><td>source</td><td>${e.source}</td></tr></table>
          <div class="ev-tags">
            <span class="ev-tag" onclick='addTerm("student_id=\\"${e.student_id}\\"")'>+ student_id</span>
            <span class="ev-tag" onclick='addTerm("src_ip=\\"${e.src_ip}\\"")'>+ src_ip</span>
            <span class="ev-tag" onclick='addTerm("behaviour=${e.behaviour}")'>+ behaviour</span>
            <span class="ev-tag" onclick='addTerm("status=${e.status}")'>+ status</span>
            <span class="ev-tag" onclick='notifyFromEvent(${e._id})'>🔔 Notify on this event</span>
          </div>
        </div>
      </div>
    </div>`).join('');

  const btn = (label, page, dis, cur) =>
    `<button ${dis?'disabled':''} class="${cur?'cur':''}" onclick="EV_PAGE=${page};renderEvents();window.scrollTo({top:document.getElementById('evList').offsetTop-80,behavior:'smooth'})">${label}</button>`;
  let nums = '';
  const from = Math.max(0, Math.min(EV_PAGE-2, pages-5)), to = Math.min(pages, from+5);
  for(let p = from; p < to; p++) nums += btn(String(p+1), p, false, p === EV_PAGE);
  $('evPager').innerHTML =
    btn('‹ Prev', Math.max(0,EV_PAGE-1), EV_PAGE === 0) + nums +
    btn('Next ›', Math.min(pages-1,EV_PAGE+1), EV_PAGE >= pages-1) +
    `<span style="margin-left:10px;">${fmt(total)} events · page ${EV_PAGE+1} of ${pages}</span>`;
}

function addTerm(t){
  const el = $('spl');
  if(el.value.indexOf(t) === -1) el.value = el.value.trim() + ' ' + t;
  runSearch();
}

function notifyFromEvent(id){
  const e = EVENTS.find(x => x._id === id);
  if(!e) return;
  openNotifyModal('Search — raw event', {
    student_id: e.student_id, role: e.role, src_ip: e.src_ip,
    behaviour: e.behaviour, status: e.status, req_per_min: e.req_per_min,
    time: e.time, severity: e.behaviour === 'normal' ? 'low' : (e.req_per_min > 500 ? 'high' : 'medium')
  }, 'ev-' + id);
}

function renderFieldsPanel(events){
  const sel = ['host','source','sourcetype'];
  const interesting = ['behaviour','role','student_id','src_ip','status','action','req_per_min','auth_fail','hour','uri','user_agent'];
  const row = f => {
    const n = new Set(events.map(e => e[f])).size;
    return `<div class="fp-item" onclick='showFieldValues("${f}")'><span>${f}</span><span class="cnt">${n}</span></div>`;
  };
  $('fpSelected').innerHTML = sel.map(row).join('');
  $('fpInteresting').innerHTML = interesting.map(row).join('');
}

function showFieldValues(f){
  const evs = SEARCH_EVENTS;
  if(!evs.length) return;
  const g = groupCount(evs, [f]).slice(0,10);
  const total = evs.length;
  $('infoTitle').textContent = f;
  $('infoBody').innerHTML =
    `<div class="hint">${fmt(new Set(evs.map(e=>e[f])).size)} distinct values in ${fmt(total)} events. Click a value to add it to the search.</div>
     <table class="sp-table"><thead><tr><th>Value</th><th style="width:70px;">Count</th><th style="width:110px;">%</th></tr></thead><tbody>` +
    g.map(x => {
      const pct = 100*x.count/total;
      return `<tr class="drill" onclick='closeModal("infoModal");addTerm(${JSON.stringify(f + '="' + x.key[0] + '"')})'>
        <td class="mono" style="color:var(--teal);">${esc(x.key[0])}</td><td>${x.count}</td>
        <td><div style="background:var(--border-soft);height:8px;border-radius:2px;overflow:hidden;">
          <div style="width:${pct.toFixed(1)}%;height:100%;background:var(--blue);"></div></div>
          <span style="font-size:10px;color:var(--text-faint);">${pct.toFixed(2)}%</span></td></tr>`;
    }).join('') + '</tbody></table>';
  openModal('infoModal');
}

function renderSearchTimeline(events){
  const counts = DATA.days.map((_,i) => events.filter(e => e.dayIdx === i).length);
  mkChart('chartSearchTimeline', {
    type:'bar',
    data:{ labels: DATA.days, datasets:[{ data: counts, backgroundColor: C.blue, borderRadius:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{ ...commonGrid, ticks:{ color:C.dim, font:{size:9.5} } }, y: commonGrid } }
  });
}

function renderStatsFromEvents(events){
  const fields = ['time','student_id','role','src_ip','behaviour','status','req_per_min','bytes'];
  renderStatsTable(fields, events.slice(0,200).map(e => fields.map(f => e[f])));
}
function renderStatsTable(fields, rows){
  $('statsHead').innerHTML = '<tr>' + fields.map(f => `<th>${esc(f)}</th>`).join('') + '</tr>';
  $('statsBody').innerHTML = rows.length
    ? rows.slice(0,500).map(r => '<tr>' + r.map(v => `<td>${esc(v)}</td>`).join('') + '</tr>').join('')
    : `<tr><td colspan="${fields.length}" style="color:var(--text-faint);">No results.</td></tr>`;
}

function renderVizControls(events){
  const opts = ['behaviour','role','status','src_ip','student_id','hour','host','action'];
  $('vizField').innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join('');
  drawViz();
}
function drawViz(){
  if(!SEARCH_EVENTS.length){ return; }
  const f = $('vizField').value || 'behaviour';
  const g = groupCount(SEARCH_EVENTS, [f]).slice(0,12);
  paintViz('chartSearchViz', $('vizType').value, g.map(x => x.key[0]), g.map(x => x.count), f);
}
function renderVizFromTable(fields, rows){
  $('vizField').innerHTML = `<option value="${esc(fields[0])}">${esc(fields[0])}</option>`;
  const valIx = fields.length - 1;
  paintViz('chartSearchViz', $('vizType').value,
    rows.slice(0,15).map(r => String(r[0])), rows.slice(0,15).map(r => +r[valIx] || 0), fields[valIx]);
}
function paintViz(canvasId, type, labels, values, label){
  const isPie = type === 'doughnut';
  mkChart(canvasId, {
    type: type === 'hbar' ? 'bar' : type,
    data:{ labels, datasets:[{
      label: label || 'count', data: values,
      backgroundColor: isPie ? PALETTE : (type === 'line' ? 'rgba(91,155,213,.15)' : C.blue),
      borderColor: type === 'line' ? C.blue : '#1b1e23',
      borderWidth: isPie ? 2 : (type === 'line' ? 2 : 0),
      borderRadius: isPie ? 0 : 2, fill: type === 'line', tension:.3
    }]},
    options:{
      indexAxis: type === 'hbar' ? 'y' : 'x',
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display: isPie, position:'right', labels:{ boxWidth:10, usePointStyle:true, font:{size:10} } } },
      scales: isPie ? {} : { x:{ ...commonGrid, ticks:{ color:C.dim, font:{size:9.5} } }, y: commonGrid }
    }
  });
}

function switchStab(name){
  $$('#searchTabs .st').forEach(t => t.classList.toggle('active', t.dataset.stab === name));
  $$('.stab').forEach(t => t.classList.toggle('active', t.id === 'stab-' + name));
  if(name === 'viz') drawViz();
}

/* ---------------- CSV ---------------- */
function toCSV(fields, rows){
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g,'""') + '"';
  return [fields.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\r\n');
}
function downloadCSV(name, csv){
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  showToast('Exported <b>' + esc(name) + '</b>');
}
function exportCurrentSearch(){
  if(!SEARCH_RESULT || !SEARCH_RESULT.ok){ showToast('Nothing to export', 'err'); return; }
  if(SEARCH_RESULT.kind === 'table') downloadCSV('search_results.csv', toCSV(SEARCH_RESULT.fields, SEARCH_RESULT.rows));
  else{
    const f = ['time','host','student_id','role','src_ip','action','uri','status','bytes','req_per_min','auth_fail','behaviour'];
    downloadCSV('events.csv', toCSV(f, SEARCH_EVENTS.map(e => f.map(k => e[k]))));
  }
}

/* =========================================================
   Reports
========================================================= */
const BUILTIN_REPORTS = [
  { id:'r1', title:'Suspicious events by behaviour', desc:'Which detection rule is firing most across the window', spl:'index=campus_siem behaviour!=normal | stats count by behaviour', viz:'doughnut' },
  { id:'r2', title:'Top offending source IPs', desc:'Client addresses generating the most flagged traffic', spl:'index=campus_siem behaviour!=normal | top src_ip limit=10', viz:'hbar' },
  { id:'r3', title:'Midnight download offenders', desc:'Accounts pulling course material between 00:00 and 05:00', spl:'index=campus_siem behaviour=midnight_download | top student_id limit=10', viz:'hbar' },
  { id:'r4', title:'Authentication failures per day', desc:'401/403 responses trended over the indexed window', spl:'index=campus_siem auth_fail=1 | timechart count', viz:'bar' },
  { id:'r5', title:'Students hitting DB admin endpoints', desc:'Privilege boundary violations by student-role accounts', spl:'index=campus_siem behaviour=db_admin_access role=student | top student_id limit=15', viz:'hbar' },
  { id:'r6', title:'Bulk transfer volume by account', desc:'Total bytes moved during mass_download activity', spl:'index=campus_siem behaviour=mass_download | stats sum(bytes) by student_id | head 12', viz:'hbar' },
  { id:'r7', title:'HTTP status distribution', desc:'Response code mix across all indexed events', spl:'index=campus_siem | stats count by status', viz:'doughnut' },
  { id:'r8', title:'Scripted (non-browser) clients', desc:'Accounts whose user agent looks automated', spl:'index=campus_siem user_agent=python-requests* | top student_id limit=10', viz:'hbar' },
  { id:'r9', title:'Peak request rate per account', desc:'Highest sustained requests-per-minute seen per account', spl:'index=campus_siem req_per_min>150 | stats max(req_per_min) by student_id | head 12', viz:'hbar' },
  { id:'r10', title:'Suspicious activity by hour of day', desc:'When flagged behaviour clusters during the day', spl:'index=campus_siem behaviour!=normal | stats count by hour', viz:'bar' }
];
let REPORTS = Store.get('reports', null) || BUILTIN_REPORTS.map(r => Object.assign({ owner:'admin', sharing:'App', lastRun:null }, r));
let editingReportId = null;

function saveReports(){ Store.set('reports', REPORTS); }

function renderReports(){
  const q = ($('reportFilter').value || '').toLowerCase();
  const list = REPORTS.filter(r => !q || (r.title + ' ' + r.desc + ' ' + r.spl).toLowerCase().indexOf(q) !== -1);
  $('reportCount').textContent = `${list.length} of ${REPORTS.length} reports`;
  $('tblReports').innerHTML = list.length ? list.map(r => `
    <tr>
      <td><span class="lnk" onclick="openReport('${r.id}')">${esc(r.title)}</span></td>
      <td style="color:var(--text-dim);">${esc(r.desc || '—')}</td>
      <td>${esc(r.owner || 'admin')}</td>
      <td>${esc(r.sharing || 'App')}</td>
      <td style="color:var(--text-faint);">${r.lastRun ? esc(r.lastRun) : 'never'}</td>
      <td><div class="row-actions">
        <button class="btn secondary small" onclick="openReport('${r.id}')">Open</button>
        <button class="btn secondary small" onclick="editReport('${r.id}')">Edit</button>
        <button class="btn secondary small" onclick="gotoSearch(${JSON.stringify(r.spl).replace(/"/g,'&quot;')})">Search</button>
        <button class="btn secondary small" onclick="deleteReport('${r.id}')">Delete</button>
      </div></td>
    </tr>`).join('')
    : '<tr><td colspan="6" style="color:var(--text-faint);">No reports match that filter.</td></tr>';
}

function openReport(id){
  const r = REPORTS.find(x => x.id === id);
  if(!r) return;
  const res = runSPL(r.spl);
  $('reportResultPanel').style.display = '';
  $('reportResultTitle').textContent = r.title;
  $('reportResultTag').textContent = r.spl;
  $('btnReportSearch').onclick = () => gotoSearch(r.spl);

  if(!res.ok){
    $('reportChartWrap').style.display = 'none';
    $('reportHead').innerHTML = '';
    $('reportBody').innerHTML = `<tr><td style="color:var(--red);">${res.error}</td></tr>`;
    return;
  }
  let fields, rows;
  if(res.kind === 'table'){ fields = res.fields; rows = res.rows; }
  else{
    fields = ['time','student_id','role','src_ip','behaviour','status'];
    rows = res.events.slice(0,100).map(e => fields.map(f => e[f]));
  }
  $('reportHead').innerHTML = '<tr>' + fields.map(f => `<th>${esc(f)}</th>`).join('') + '</tr>';
  $('reportBody').innerHTML = rows.length
    ? rows.slice(0,100).map(row => '<tr>' + row.map(v => `<td>${esc(v)}</td>`).join('') + '</tr>').join('')
    : `<tr><td colspan="${fields.length}" style="color:var(--text-faint);">No results.</td></tr>`;

  if(r.viz === 'none' || !rows.length || fields.length < 2){
    $('reportChartWrap').style.display = 'none';
  }else{
    $('reportChartWrap').style.display = '';
    const valIx = fields.indexOf('count') !== -1 ? fields.indexOf('count') : fields.length - 1;
    paintViz('chartReport', r.viz, rows.slice(0,15).map(x => String(x[0])), rows.slice(0,15).map(x => +x[valIx] || 0), fields[valIx]);
  }

  r.lastRun = new Date().toLocaleString();
  saveReports(); renderReports();
  $('btnReportCsv').onclick = () => downloadCSV(r.title.toLowerCase().replace(/[^a-z0-9]+/g,'_') + '.csv', toCSV(fields, rows));
  $('reportResultPanel').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function editReport(id){
  const r = REPORTS.find(x => x.id === id);
  if(!r) return;
  editingReportId = id;
  $('reportModalTitle').textContent = 'Edit Report';
  $('rpTitle').value = r.title; $('rpDesc').value = r.desc || '';
  $('rpSearch').value = r.spl;  $('rpViz').value = r.viz || 'bar';
  setStatus('rpStatus','');
  openModal('reportModal');
}
function deleteReport(id){
  const r = REPORTS.find(x => x.id === id);
  if(!r) return;
  if(!confirm(`Delete report "${r.title}"?`)) return;
  REPORTS = REPORTS.filter(x => x.id !== id);
  saveReports(); renderReports();
  showToast('Report deleted');
}

/* =========================================================
   Alerts
========================================================= */
const BUILTIN_ALERTS = [
  { id:'a1', title:'Mass download burst', spl:'index=campus_siem behaviour=mass_download req_per_min>500', op:'gt', threshold:5,  severity:'high',   cron:'*/5 * * * *', email:true, ticket:true, enabled:true },
  { id:'a2', title:'Student role hitting DB admin endpoints', spl:'index=campus_siem behaviour=db_admin_access role=student', op:'gt', threshold:20, severity:'high', cron:'0 * * * *', email:true, ticket:true, enabled:true },
  { id:'a3', title:'Out-of-hours bulk download', spl:'index=campus_siem behaviour=midnight_download', op:'gt', threshold:15, severity:'medium', cron:'0 * * * *', email:true, ticket:true, enabled:true },
  { id:'a4', title:'Repeated authentication failure', spl:'index=campus_siem auth_fail=1', op:'gt', threshold:25, severity:'medium', cron:'*/5 * * * *', email:true, ticket:true, enabled:true },
  { id:'a5', title:'Scripted client detected', spl:'index=campus_siem user_agent=python-requests*', op:'gt', threshold:10, severity:'medium', cron:'0 * * * *', email:true, ticket:false, enabled:true },
  { id:'a6', title:'Shared NAT address used by admin account', spl:'index=campus_siem src_ip=103.41.173.48 role=admin', op:'gt', threshold:0, severity:'high', cron:'0 * * * *', email:true, ticket:true, enabled:false },
  { id:'a7', title:'HTTP 403 spike', spl:'index=campus_siem status=403', op:'gt', threshold:30, severity:'low', cron:'0 0 * * *', email:false, ticket:true, enabled:true }
];
let ALERTS = Store.get('alerts', null) || BUILTIN_ALERTS.map(a => Object.assign({ lastTriggered:null }, a));
let FIRED = Store.get('fired', []);
let editingAlertId = null;

function saveAlerts(){ Store.set('alerts', ALERTS); }
function saveFired(){ Store.set('fired', FIRED); }

function evalAlert(a){
  const res = runSPL(a.spl);
  if(!res.ok) return { ok:false, error:res.error, matches:0 };
  const matches = res.kind === 'events' ? res.events.length : res.rows.length;
  const triggered = a.op === 'gt' ? matches > a.threshold
                  : a.op === 'lt' ? matches < a.threshold
                  : matches === a.threshold;
  return { ok:true, matches, triggered, res };
}

function opLabel(op){ return op === 'gt' ? '>' : op === 'lt' ? '<' : '='; }

function renderAlerts(){
  $('alertEmailState').innerHTML = mailStateLabel();
  const q = ($('alertFilter').value || '').toLowerCase();
  const list = ALERTS.filter(a => !q || (a.title + ' ' + a.spl).toLowerCase().indexOf(q) !== -1);
  $('alertCount').textContent = `${list.length} of ${ALERTS.length} rules · ${ALERTS.filter(a=>a.enabled).length} enabled`;

  $('tblAlerts').innerHTML = list.length ? list.map(a => {
    const ev = evalAlert(a);
    const sev = a.severity === 'high' ? 'high' : a.severity === 'medium' ? 'med' : 'low';
    const hot = ev.ok && ev.triggered;
    return `<tr>
      <td><span class="lnk" onclick="editAlert('${a.id}')">${esc(a.title)}</span>
          <div class="mono" style="font-size:10px;margin-top:2px;">${esc(a.cron)}</div></td>
      <td class="mono" style="font-size:10.5px;color:var(--text-dim);">count ${opLabel(a.op)} ${a.threshold}
          <div style="color:var(--teal);margin-top:2px;">${esc(a.spl)}</div></td>
      <td><span class="badge ${sev}">${esc(a.severity)}</span></td>
      <td style="color:${hot ? 'var(--red)' : 'var(--text-dim)'};font-weight:${hot?'600':'400'};">
          ${ev.ok ? fmt(ev.matches) + (hot ? ' ⚠' : '') : '<span style="color:var(--red);">error</span>'}</td>
      <td><span class="sw ${a.enabled?'on':''}" onclick="toggleAlert('${a.id}')" title="Enable / disable"></span></td>
      <td style="color:var(--text-faint);">${a.lastTriggered ? esc(a.lastTriggered) : 'never'}</td>
      <td><div class="row-actions">
        <button class="btn small${hot?'':' secondary'}" onclick="runAlert('${a.id}')">Run now</button>
        <button class="btn secondary small" onclick="gotoSearch(${JSON.stringify(a.spl).replace(/"/g,'&quot;')})">Search</button>
        <button class="btn secondary small" onclick="deleteAlert('${a.id}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" style="color:var(--text-faint);">No alert rules match that filter.</td></tr>';

  renderFired();
}

function renderFired(){
  $('firedTag').textContent = `${FIRED.length} fired`;
  $('tblFired').innerHTML = FIRED.length ? FIRED.map(f => `
    <tr>
      <td class="mono">${esc(f.at)}</td>
      <td>${esc(f.title)}</td>
      <td><span class="badge ${f.severity === 'high' ? 'high' : f.severity === 'medium' ? 'med' : 'low'}">${esc(f.severity)}</span></td>
      <td>${fmt(f.matches)}</td>
      <td>${f.emailSent ? `<span class="badge sent">sent · ${esc(f.via)}</span>`
                        : (f.emailError ? `<span class="badge high" title="${esc(f.emailError)}">failed</span>`
                                        : '<span class="badge open">not sent</span>')}</td>
      <td class="mono">${f.ticket ? esc(f.ticket) : '—'}</td>
      <td><button class="btn secondary small" onclick="gotoSearch(${JSON.stringify(f.spl).replace(/"/g,'&quot;')})">Investigate</button></td>
    </tr>`).join('')
    : '<tr><td colspan="7" style="color:var(--text-faint);">No alerts have fired in this session.</td></tr>';
}

function toggleAlert(id){
  const a = ALERTS.find(x => x.id === id);
  if(!a) return;
  a.enabled = !a.enabled;
  saveAlerts(); renderAlerts();
  showToast(`Alert <b>${esc(a.title)}</b> ${a.enabled ? 'enabled' : 'disabled'}`);
}
function deleteAlert(id){
  const a = ALERTS.find(x => x.id === id);
  if(!a || !confirm(`Delete alert "${a.title}"?`)) return;
  ALERTS = ALERTS.filter(x => x.id !== id);
  saveAlerts(); renderAlerts();
  showToast('Alert deleted');
}
function editAlert(id){
  const a = ALERTS.find(x => x.id === id);
  if(!a) return;
  editingAlertId = id;
  $('alertModalTitle').textContent = 'Edit Alert';
  $('alTitle').value = a.title; $('alSearch').value = a.spl;
  $('alOp').value = a.op; $('alThreshold').value = a.threshold;
  $('alSeverity').value = a.severity; $('alCron').value = a.cron;
  $('alActEmail').checked = a.email; $('alActTicket').checked = a.ticket; $('alActEnabled').checked = a.enabled;
  $('alActEmailTo').textContent = MAIL.to || '(set a recipient in Settings)';
  setStatus('alStatus','');
  openModal('alertModal');
}

function alertIncident(a, ev){
  // Pull the worst offender out of the matches so the report names a subject
  // rather than just a count.
  let lead = {};
  if(ev.res.kind === 'events' && ev.res.events.length){
    const top = groupCount(ev.res.events, ['student_id'])[0];
    const sample = ev.res.events.find(e => String(e.student_id) === top.key[0]) || ev.res.events[0];
    lead = {
      student_id: sample.student_id, role: sample.role, src_ip: sample.src_ip,
      behaviour: sample.behaviour, req_per_min: sample.req_per_min,
      events_for_account: top.count
    };
  }else if(ev.res.rows && ev.res.rows.length){
    lead = { top_result: ev.res.rows[0].join(' · ') };
  }

  return buildIncident({
    source: a.title,
    severity: a.severity,
    fields: Object.assign({ alert: a.title }, lead),
    spl: a.spl,
    matches: ev.matches,
    summary: `The correlation rule "${a.title}" matched ${ev.matches} events, crossing its ` +
             `trigger condition of count ${opLabel(a.op)} ${a.threshold}. ` +
             `The account shown below accounts for the largest share of the matches and should be triaged first.`
  });
}

async function runAlert(id, silent){
  const a = ALERTS.find(x => x.id === id);
  if(!a) return null;
  const ev = evalAlert(a);
  if(!ev.ok){ showToast('Alert search failed: ' + esc(ev.error), 'err'); return null; }
  if(!ev.triggered){
    if(!silent) showToast(`<b>${esc(a.title)}</b> — ${fmt(ev.matches)} matches, below threshold. Not triggered.`, 'info');
    return null;
  }

  const incident = alertIncident(a, ev);
  const subject = incident.subject;
  const body = incident.text;

  if(a.email && PREFS.confirmEmail && !silent){
    currentRowContext = {
      panel:'Alert — ' + a.title,
      row:{ alert:a.title, matches:ev.matches, severity:a.severity, search:a.spl },
      rowId:'alert-' + a.id,
      alertId:a.id, alertMatches:ev.matches, alertSpl:a.spl, incident
    };
    $('modalTo').value = MAIL.to || '';
    $('modalSubject').value = subject;
    $('modalPriority').value = a.severity;
    $('modalBody').value = body;
    setStatus('modalStatus','');
    openModal('notifyModal');
    runFlowAnimation(['trigger','build']);
    return null;
  }

  let emailSent = false, via = '', emailError = '';
  if(a.email){
    const r = await sendMail({ to: MAIL.to, cc: MAIL.cc, subject, body, html: incident.html, priority:a.severity, meta:{ alert:a.title, matches:ev.matches, spl:a.spl } });
    emailSent = r.sent; via = r.via; emailError = r.error || '';
  }

  let ticketId = null;
  if(a.ticket){
    const t = pushTicket({
      panel:'Alert — ' + a.title,
      row:{ alert:a.title, matches:ev.matches, severity:a.severity },
      rowId:'alert-' + a.id,
      priority:a.severity,
      status: emailSent ? 'sent' : 'open',
      sentTo: emailSent ? (MAIL.to || '—') : '—'
    });
    ticketId = t.id;
  }

  a.lastTriggered = new Date().toLocaleString();
  saveAlerts();
  FIRED.unshift({ at:new Date().toLocaleString(), title:a.title, severity:a.severity, matches:ev.matches, spl:a.spl, emailSent, via, emailError, ticket:ticketId });
  FIRED = FIRED.slice(0,50); saveFired();
  pushNotification(`${a.title}`, `${ev.matches} matches · severity ${a.severity}` + (emailSent ? ' · email sent' : ''), a.spl);
  renderAlerts();

  if(!silent){
    if(a.email && emailSent)      showToast(`Alert fired — email sent via <b>${esc(via)}</b>`);
    else if(a.email && !emailSent && via === 'mailto') showToast('Alert fired — mail client opened (no relay configured)', 'info');
    else if(a.email && !emailSent) showToast('Alert fired but email failed: ' + esc(emailError), 'err');
    else                           showToast(`Alert fired — ticket ${esc(ticketId || '')} created`);
  }
  return a;
}

async function runAllAlerts(){
  const enabled = ALERTS.filter(a => a.enabled);
  let fired = 0;
  for(const a of enabled){
    const r = await runAlert(a.id, true);
    if(r) fired++;
  }
  renderAlerts();
  showToast(`Ran ${enabled.length} enabled rule${enabled.length===1?'':'s'} — <b>${fired}</b> triggered`, fired ? 'err' : 'info');
}

/* =========================================================
   Tickets + notifications
========================================================= */
let TICKETS = Store.get('tickets', []);
let NOTES = Store.get('notes', []);
let currentRowContext = null;

function saveTickets(){ Store.set('tickets', TICKETS); }
function saveNotes(){ Store.set('notes', NOTES); }

function newTicketId(){ return 'TCK-' + Math.random().toString(36).slice(2,7).toUpperCase(); }

function pushTicket(t){
  const ticket = Object.assign({ id:newTicketId(), created:new Date().toLocaleString() }, t);
  ticket.student = t.row.student_id || t.row.alert || t.row.role || '—';
  TICKETS.unshift(ticket);
  saveTickets(); renderTickets();
  const btn = $('notifyBtn-' + t.rowId);
  if(btn){ btn.classList.add('ticketed'); btn.textContent = '✓ Ticketed'; }
  return ticket;
}

function pushNotification(title, msg, spl){
  NOTES.unshift({ id:Date.now() + '-' + Math.random().toString(36).slice(2,6), title, msg, spl, at:new Date().toLocaleTimeString() });
  NOTES = NOTES.slice(0,30);
  saveNotes(); renderBell();
}

function renderBell(){
  const openCount = TICKETS.filter(t => t.status !== 'resolved').length + NOTES.length;
  const badge = $('bellBadge');
  badge.textContent = openCount > 99 ? '99+' : openCount;
  badge.classList.toggle('show', openCount > 0);
  $('bellList').innerHTML = NOTES.length ? NOTES.map(n => `
    <div class="bm-item" onclick="gotoSearch(${JSON.stringify(n.spl || 'index=campus_siem').replace(/"/g,'&quot;')});closeBell();">
      <div class="t">⚠ ${esc(n.title)}</div>
      <div class="m">${esc(n.msg)} · ${esc(n.at)}</div>
    </div>`).join('')
    : '<div class="bm-empty">No new notifications.<br>Fire an alert or click Notify on a flagged row.</div>';
}
function closeBell(){ $('bellWrap').classList.remove('open'); }

function ticketStatusBadge(status){
  const cls = ({ open:'open', sent:'sent', escalated:'escalated' })[status] || 'open';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

function renderTickets(){
  $('ticketCountTag').textContent = `${TICKETS.length} ticket${TICKETS.length === 1 ? '' : 's'}`;
  const cnt = $('cntTickets'); if(cnt) cnt.textContent = `${TICKETS.length} tickets`;
  renderBell();
  const tbody = $('tblTickets');
  if(!TICKETS.length){
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--text-faint);">No tickets yet — click Notify on a flagged row above.</td></tr>';
    return;
  }
  tbody.innerHTML = TICKETS.map(t => `
    <tr>
      <td class="mono">${esc(t.id)}</td>
      <td>${esc(t.panel)}</td>
      <td>${esc(t.student)}</td>
      <td style="text-transform:capitalize;">${esc(t.priority)}</td>
      <td>${ticketStatusBadge(t.status)}</td>
      <td>${esc(t.created)}</td>
      <td class="mono">${esc(t.sentTo)}</td>
      <td><div class="row-actions">
        <button class="btn secondary small" onclick="escalateTicket('${t.id}')">Escalate</button>
        <button class="btn secondary small" onclick="resolveTicket('${t.id}')">Resolve</button>
      </div></td>
    </tr>`).join('');
}

function escalateTicket(id){
  const t = TICKETS.find(x => x.id === id);
  if(!t) return;
  t.status = 'escalated';
  saveTickets(); renderTickets();
  showToast(`Ticket ${esc(id)} escalated`);
}
function resolveTicket(id){
  TICKETS = TICKETS.filter(x => x.id !== id);
  saveTickets(); renderTickets();
  showToast(`Ticket ${esc(id)} resolved`);
}

/* ---------------- notify modal ---------------- */
function openNotifyModal(panel, row, rowId){
  const priority = row.severity || MAIL.priority || 'medium';
  const incident = buildIncident({
    source: panel,
    severity: ['high','medium','low'].indexOf(priority) !== -1 ? priority : 'medium',
    fields: row
  });
  currentRowContext = { panel, row, rowId, incident };

  $('modalTo').value = MAIL.to || DEFAULT_MAIL.to;
  $('modalSubject').value = incident.subject;
  $('modalPriority').value = ['high','medium','low'].indexOf(priority) !== -1 ? priority : 'medium';
  $('modalBody').value = incident.text;
  setStatus('modalStatus', mailConfigured()
    ? `Sending for real via <b>${esc(MAIL.provider)}</b>.`
    : 'No relay configured — this will open your mail client instead. Set one up under <b>Settings → Email Delivery</b> to send automatically.',
    mailConfigured() ? 'ok' : 'info');
  openModal('notifyModal');
  runFlowAnimation(['trigger','build']);
}
function closeNotifyModal(keepFlow){
  closeModal('notifyModal');
  // on a successful send, leave the trigger -> build -> email -> ticket
  // pipeline lit for a moment so the run is actually visible
  if(keepFlow) setTimeout(resetFlowNodes, 4000);
  else resetFlowNodes();
  currentRowContext = null;
}

let flowTimers = [];
function runFlowAnimation(steps){
  resetFlowNodes();
  steps.forEach((step, idx) => {
    flowTimers.push(setTimeout(() => {
      const el = $('flowNode-' + step);
      if(el) el.classList.add(idx === steps.length - 1 ? 'active' : 'done');
    }, idx * 260));
  });
}
function resetFlowNodes(){
  // drop pending steps from an earlier run, otherwise a re-trigger
  // leaves stale classes stacked on the same node
  flowTimers.forEach(clearTimeout);
  flowTimers = [];
  ['trigger','build','email','ticket'].forEach(s => {
    const el = $('flowNode-' + s);
    if(el) el.classList.remove('active','done','fail');
  });
}

function createTicketOnly(){
  if(!currentRowContext) return;
  runFlowAnimation(['trigger','build','ticket']);
  const t = pushTicket({
    panel: currentRowContext.panel, row: currentRowContext.row, rowId: currentRowContext.rowId,
    priority: $('modalPriority').value, status:'open', sentTo:'—'
  });
  showToast(`Ticket <b>${esc(t.id)}</b> created`);
  setTimeout(closeNotifyModal, 350);
}

async function sendEmailAndTicket(){
  if(!currentRowContext) return;
  const to = $('modalTo').value.trim();
  const subject = $('modalSubject').value;
  const body = $('modalBody').value;
  if(!to){ setStatus('modalStatus','Enter a recipient address first.','err'); return; }

  const btn = $('btnSendEmail');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Sending…';
  runFlowAnimation(['trigger','build','email']);
  setStatus('modalStatus','Contacting mail relay…','info');

  // If the analyst edited the body, the stored HTML no longer matches it —
  // fall back to text-only rather than mailing something they did not approve.
  const inc = currentRowContext.incident;
  const edited = !inc || body !== inc.text;

  const r = await sendMail({
    to, cc: MAIL.cc, subject, body,
    html: edited ? null : inc.html,
    priority: $('modalPriority').value,
    meta: { panel: currentRowContext.panel, row: currentRowContext.row }
  });

  btn.disabled = false; btn.textContent = 'Send Email';

  if(r.sent){
    runFlowAnimation(['trigger','build','email','ticket']);
    const t = pushTicket({
      panel: currentRowContext.panel, row: currentRowContext.row, rowId: currentRowContext.rowId,
      priority: $('modalPriority').value, status:'sent', sentTo: to
    });
    pushNotification(currentRowContext.panel, `Email sent to ${to} · ticket ${t.id}`, null);
    setStatus('modalStatus', `Email delivered via <b>${esc(r.via)}</b>. Ticket <b>${esc(t.id)}</b> opened.`, 'ok');
    showToast(`Email sent via <b>${esc(r.via)}</b> · ticket ${esc(t.id)}`);
    if(currentRowContext.alertId) recordAlertFire(currentRowContext, true, r.via, '');
    setTimeout(() => closeNotifyModal(true), 1400);
  }else if(r.via === 'mailto'){
    const t = pushTicket({
      panel: currentRowContext.panel, row: currentRowContext.row, rowId: currentRowContext.rowId,
      priority: $('modalPriority').value, status:'open', sentTo: to
    });
    setStatus('modalStatus', `Mail client opened. Ticket <b>${esc(t.id)}</b> logged. Configure a relay under <b>Settings</b> to send without leaving the page.`, 'info');
    if(currentRowContext.alertId) recordAlertFire(currentRowContext, false, 'mailto', '');
    setTimeout(closeNotifyModal, 1400);
  }else{
    $('flowNode-email').classList.remove('active','done');
    $('flowNode-email').classList.add('fail');
    setStatus('modalStatus', `Could not send: ${esc(r.error)}`, 'err');
    showToast('Email failed — see the message in the dialog', 'err');
    if(currentRowContext.alertId) recordAlertFire(currentRowContext, false, 'error', r.error);
  }
}

function recordAlertFire(ctx, emailSent, via, err){
  const a = ALERTS.find(x => x.id === ctx.alertId);
  if(!a) return;
  a.lastTriggered = new Date().toLocaleString();
  saveAlerts();
  FIRED.unshift({ at:new Date().toLocaleString(), title:a.title, severity:a.severity,
    matches: ctx.alertMatches, spl: ctx.alertSpl, emailSent, via, emailError: err || '',
    ticket: TICKETS[0] ? TICKETS[0].id : null });
  FIRED = FIRED.slice(0,50); saveFired();
  pushNotification(a.title, `${ctx.alertMatches} matches · severity ${a.severity}`, a.spl);
  if(CURRENT_VIEW === 'alerts') renderAlerts();
}

/* =========================================================
   Modals
========================================================= */
function openModal(id){ $(id).classList.add('show'); }
function closeModal(id){ $(id).classList.remove('show'); }

/* =========================================================
   Settings
========================================================= */
function fillSettings(){
  $('setProvider').value = MAIL.provider;
  $('setKey').value = MAIL.key;
  $('setTo').value = MAIL.to;
  $('setCc').value = MAIL.cc;
  $('setFromName').value = MAIL.fromName;
  $('setPriority').value = MAIL.priority;
  $('setRefresh').value = String(PREFS.refresh);
  $('setPageSize').value = String(PREFS.pageSize);
  $('setConfirmEmail').checked = !!PREFS.confirmEmail;
  updateProviderHint();
  const cnt = $('cntTickets'); if(cnt) cnt.textContent = `${TICKETS.length} tickets`;
}

function updateProviderHint(){
  const p = $('setProvider').value;
  $('setKeyHint').innerHTML = PROVIDER_HINT[p];
  const labels = { none:'Endpoint (not used)', formspree:'Formspree endpoint URL', web3forms:'Web3Forms access key', webhook:'Webhook URL' };
  const ph = { none:'—', formspree:'https://formspree.io/f/xxxxxxx', web3forms:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', webhook:'https://your-endpoint.example.com/hook' };
  $('setKeyLabel').textContent = labels[p];
  $('setKey').placeholder = ph[p];
  $('setKey').disabled = p === 'none';
}

function validateMailCfg(){
  const p = $('setProvider').value, k = $('setKey').value.trim();
  if(p === 'none') return null;
  if(p === 'resend'){
    if(k && !/^\/|^https?:\/\//i.test(k)) return 'Leave blank to use <b>/api/send</b>, or give a full URL / absolute path.';
    if(/^re_/.test(k)) return 'That looks like a Resend <b>API key</b>. Never put it here — it would ship in the page source. Add it in Vercel as <b>RESEND_API_KEY</b> and leave this field blank.';
    return null;
  }
  if(!k) return 'Enter the endpoint or access key for ' + p + '.';
  if(p === 'formspree' && !/^https:\/\/formspree\.io\/f\/\w+/.test(k))
    return 'A Formspree endpoint looks like <b>https://formspree.io/f/abcdwxyz</b>.';
  if(p === 'web3forms' && !/^[0-9a-f-]{20,}$/i.test(k))
    return 'A Web3Forms access key is a long UUID, e.g. <b>a1b2c3d4-e5f6-...</b>';
  if(p === 'webhook' && !/^https?:\/\//i.test(k))
    return 'The webhook must be a full http(s) URL.';
  return null;
}

function saveMailSettings(){
  const err = validateMailCfg();
  if(err){ setStatus('setStatus', err, 'err'); return false; }
  MAIL = {
    provider: $('setProvider').value,
    key: $('setKey').value.trim(),
    to: $('setTo').value.trim(),
    cc: $('setCc').value.trim(),
    fromName: $('setFromName').value.trim() || 'Campus SIEM',
    priority: $('setPriority').value
  };
  Store.set('mail', MAIL);
  $('cfgToEmail').value = MAIL.to;
  $('cfgCcEmail').value = MAIL.cc;
  $('cfgPriority').value = MAIL.priority;
  $('alertEmailState').innerHTML = mailStateLabel();
  setStatus('setStatus', mailConfigured()
    ? `Saved. Alerts will be delivered through <b>${esc(MAIL.provider)}</b>.`
    : 'Saved. No relay selected — alert actions will open your mail client.', 'ok');
  return true;
}

async function sendTestEmail(){
  if(!saveMailSettings()) return;
  const btn = $('btnTestMail');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Sending…';
  setStatus('setStatus','Contacting mail relay…','info');
  // Send the real report shape, not a bare "hello" — the point of the test is
  // to show exactly what a live alert will look like in the inbox.
  const incident = buildIncident({
    source: 'Delivery self-test',
    severity: 'low',
    fields: { alert:'Delivery self-test', provider: MAIL.provider, recipient: MAIL.to },
    summary: `This is a delivery self-test from ${ORG.system}. It was sent through the ` +
             `${MAIL.provider} relay to confirm that live incident notifications reach this mailbox. ` +
             `No action is required — the layout below is what a real alert will look like.`
  });
  const r = await sendMail({
    to: MAIL.to, subject: incident.subject, body: incident.text,
    html: incident.html, priority: 'low', meta: { test:true }
  });
  btn.disabled = false; btn.textContent = 'Send Test Email';
  if(r.sent)                setStatus('setStatus', `Test email sent via <b>${esc(r.via)}</b>. Check the inbox registered with your ${esc(MAIL.provider)} endpoint.`, 'ok');
  else if(r.via === 'mailto') setStatus('setStatus','No relay selected, so your mail client was opened with the test message.','info');
  else                      setStatus('setStatus', `Test failed: ${esc(r.error)}`, 'err');
}

/* saveNotifySettings() — the inline control on the dashboard panel */
function saveNotifySettings(){
  MAIL.to = $('cfgToEmail').value.trim();
  MAIL.cc = $('cfgCcEmail').value.trim();
  MAIL.priority = $('cfgPriority').value;
  Store.set('mail', MAIL);
  showToast(mailConfigured()
    ? 'Notification settings saved'
    : 'Saved — set up a relay under <b>Settings</b> to send real email');
}

function savePrefs(){
  PREFS = {
    refresh: parseInt($('setRefresh').value,10) || 0,
    pageSize: parseInt($('setPageSize').value,10) || 20,
    confirmEmail: $('setConfirmEmail').checked
  };
  Store.set('prefs', PREFS);
  applyRefresh();
  if(SEARCH_RAN) renderEvents();
  showToast('Preferences saved');
}

let refreshTimer = null;
function applyRefresh(){
  clearInterval(refreshTimer);
  if(PREFS.refresh > 0){
    refreshTimer = setInterval(() => {
      if(CURRENT_VIEW === 'dashboards') renderDashboard();
      if(CURRENT_VIEW === 'alerts') renderAlerts();
    }, PREFS.refresh * 1000);
  }
}
