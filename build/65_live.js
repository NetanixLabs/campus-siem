
/* =========================================================
   Live pipeline
   A SIEM is never static: the indexer keeps ingesting, the
   throughput moves, and a real-time search tails new events
   as they land. This drives all of that off the existing
   chrome — no new panels, no layout change.
========================================================= */

const LIVE = {
  eps: 62,          // events per second, drifts
  timer: null,
  stream: null,
  streamed: 0,
  seq: 900000
};

/* ---------- indexing throughput readout ---------- */
function tickThroughput(){
  // random walk with the occasional burst, so it reads like real ingest
  const burst = Math.random() < 0.06;
  const drift = (Math.random() - 0.48) * 14;
  LIVE.eps = Math.max(18, Math.min(burst ? 340 : 145, LIVE.eps + drift + (burst ? 120 : 0)));
  const el = $('epsRate');
  if(el) el.textContent = Math.round(LIVE.eps).toLocaleString('en-US') + ' eps';
}

function startThroughput(){
  tickThroughput();
  clearInterval(LIVE.timer);
  LIVE.timer = setInterval(tickThroughput, 1600);
}

/* ---------- real-time event tail ---------- */

/* Clone a representative event and stamp it to now, so the tail shows
   plausible traffic rather than replaying the historical window. */
function synthLiveEvent(){
  const base = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  const now = new Date();
  const e = Object.assign({}, base, {
    _id: ++LIVE.seq,
    _time: now.getTime(),
    time: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ` +
          `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`,
    hour: now.getHours(),
    session_id: Math.abs(Math.floor(Math.random()*0xffffffff)).toString(16).padStart(8,'0'),
    live: true
  });
  return e;
}

function prependLiveEvent(){
  const e = synthLiveEvent();
  EVENTS.unshift(e);
  LIVE.streamed++;

  // keep the sample bounded so memory and search cost stay flat
  if(EVENTS.length > 3200) EVENTS.length = 3200;

  // if a real-time search is on screen, tail it into the results
  if(CURRENT_VIEW === 'search' && SCOPE.rt && SEARCH_RESULT && SEARCH_RESULT.ok && SEARCH_RESULT.kind === 'events'){
    const clauses = parseFilters($('spl').value.split('|')[0]);
    const raw = rawLine(e);
    const matches = clauses.every(c => matchClause(e, c, raw));
    if(matches){
      SEARCH_EVENTS.unshift(e);
      $('sbCount').textContent = fmt(SEARCH_EVENTS.length);
      if(EV_PAGE === 0){
        renderEvents();
        const first = $('evList').querySelector('.ev');
        if(first && !REDUCED){
          first.classList.add('live-in');
          setTimeout(() => first.classList.remove('live-in'), 1500);
        }
      }
    }
  }

  // nudge the headline counter on the dashboard
  if(CURRENT_VIEW === 'dashboards' && SCOPE.rt){
    const el = $('kpiTotal');
    if(el){
      const cur = parseInt(String(el.textContent).replace(/[^0-9]/g,''), 10) || 0;
      el.textContent = fmt(cur + 1);
    }
    if(e.behaviour !== 'normal'){
      const s = $('kpiSuspicious');
      if(s){
        const cur = parseInt(String(s.textContent).replace(/[^0-9]/g,''), 10) || 0;
        s.textContent = fmt(cur + 1);
      }
    }
  }
}

function startRealtime(){
  stopRealtime();
  LIVE.streamed = 0;
  document.body.classList.add('realtime');
  // irregular arrival, the way real traffic lands
  const schedule = () => {
    LIVE.stream = setTimeout(() => {
      prependLiveEvent();
      schedule();
    }, 400 + Math.random() * 1400);
  };
  schedule();
}

function stopRealtime(){
  clearTimeout(LIVE.stream);
  LIVE.stream = null;
  document.body.classList.remove('realtime');
}

/* ---------- alert rules re-evaluate on a cycle ---------- */
let alertCycle = null;
function startAlertCycle(){
  clearInterval(alertCycle);
  alertCycle = setInterval(() => {
    if(CURRENT_VIEW !== 'alerts') return;
    // refresh live match counts without stealing focus from the table
    const active = document.activeElement;
    if(active && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
    renderAlerts();
    const tag = $('alertCount');
    if(tag && !REDUCED){
      tag.style.transition = 'opacity .2s';
      tag.style.opacity = '.35';
      setTimeout(() => tag.style.opacity = '1', 220);
    }
  }, 20000);
}
