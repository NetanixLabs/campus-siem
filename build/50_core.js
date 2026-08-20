
/* =========================================================
   Campus SIEM — application core
   Static build: all state in localStorage, all mail via a
   form-relay provider configured under Settings.
========================================================= */

/* ---------------------------------------------------------
   ▼▼▼  EMAIL DELIVERY — EDIT THIS BLOCK  ▼▼▼

   Baked-in defaults, so a fresh visitor gets a working
   dashboard without touching the Settings tab. Anything a
   user saves under Settings overrides these for that browser
   only (Settings -> Reset all saved settings clears it).

   provider : 'resend' | 'web3forms' | 'webhook' | 'none'
   key      : Resend    -> leave blank; uses this site's own
                           /api/send route, which reads
                           RESEND_API_KEY from the environment
              Web3Forms -> your access key (a UUID)
              webhook   -> the full https:// URL
              none      -> leave blank; falls back to mailto:
   to       : recipient. Resend delivers here directly. Until a
              domain is verified it must be the address the
              Resend account was created with.
--------------------------------------------------------- */
const DEFAULT_MAIL = {
  provider : 'resend',
  key      : '',
  to       : 'keedhecker@gmail.com',
  cc       : '',
  fromName : 'Campus SIEM',
  priority : 'medium'
};

/* Bump when DEFAULT_MAIL changes in a way that must win over whatever a
   browser already has saved. Settings persist to localStorage, so without
   this a returning visitor keeps the old provider forever. */
const MAIL_CONFIG_VERSION = 2;
/* ---------------  ▲▲▲  END EDIT BLOCK  ▲▲▲  --------------- */

const C = {
  teal:'#3ec9c0', green:'#65a637', gold:'#f2b02a', red:'#dc4e41',
  purple:'#9d6fd4', blue:'#5b9bd5', orange:'#ff6a1a', dim:'#9299a3', grid:'#262a30'
};
const PALETTE = [C.blue,C.red,C.gold,C.purple,C.teal,C.green,C.orange,'#7a828c','#4a5058','#c98a3e'];

Chart.defaults.color = C.dim;
Chart.defaults.font.size = 11;
Chart.defaults.borderColor = C.grid;

const fmt = n => (typeof n === 'number' ? n : 0).toLocaleString('en-US');
const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const $  = id => document.getElementById(id);
const $$ = sel => Array.prototype.slice.call(document.querySelectorAll(sel));

/* ---------------- persistent store ---------------- */
const NS = 'campus-siem:';
const Store = {
  get(k, fallback){
    try{ const v = localStorage.getItem(NS+k); return v == null ? fallback : JSON.parse(v); }
    catch(e){ return fallback; }
  },
  set(k, v){
    try{ localStorage.setItem(NS+k, JSON.stringify(v)); return true; }
    catch(e){ return false; }
  },
  del(k){ try{ localStorage.removeItem(NS+k); }catch(e){} },
  clearAll(){
    try{
      Object.keys(localStorage).filter(k => k.indexOf(NS) === 0).forEach(k => localStorage.removeItem(k));
    }catch(e){}
  }
};

/* ---------------- toast ---------------- */
let toastTimer = null;
function showToast(msg, kind){
  const t = $('toast');
  t.className = 'toast show' + (kind ? ' ' + kind : '');
  t.innerHTML = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3400);
}
function setStatus(id, msg, kind){
  const el = $(id);
  if(!el) return;
  if(!msg){ el.className = 'status-line'; el.innerHTML = ''; return; }
  el.className = 'status-line show ' + (kind || 'info');
  el.innerHTML = msg;
}

/* =========================================================
   Synthetic event index
   A deterministic 1:N sample of the 50,000 indexed events,
   shaped to the same daily / hourly / behaviour / status /
   role distributions the aggregates were built from. This is
   what Search, Reports and Alerts actually run against.
========================================================= */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260713);

function weightedPick(entries){          // entries: [[value, weight], ...]
  const total = entries.reduce((s,e) => s + e[1], 0);
  let r = rnd() * total;
  for(const [v,w] of entries){ r -= w; if(r <= 0) return v; }
  return entries[entries.length-1][0];
}
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const randInt = (a,b) => a + Math.floor(rnd() * (b - a + 1));

const HOSTS = ['campus-web-01','campus-web-02','campus-lms-01','campus-auth-01'];
const BROWSER_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) Firefox/127.0',
  'Mozilla/5.0 (Linux; Android 13) Chrome/125.0.0.0 Mobile Safari/537.36'
];
const SCRIPT_UAS = ['python-requests/2.31.0','curl/8.4.0','Wget/1.21.4'];
const URIS = {
  mass_download:    ['/lms/api/resource/%ID%/download','/lms/api/course/%ID%/materials.zip','/files/export/bulk?ids=%ID%'],
  midnight_download:['/lms/api/resource/%ID%/download','/library/api/thesis/%ID%.pdf','/files/archive/%ID%.zip'],
  db_admin_access:  ['/admin/db/query','/admin/db/console','/api/v1/admin/students/export','/phpmyadmin/index.php'],
  file_download:    ['/lms/api/resource/%ID%/download','/notices/%ID%.pdf'],
  normal:           ['/lms/dashboard','/lms/api/course/%ID%','/lms/api/assignment/%ID%','/portal/attendance','/portal/profile','/api/v1/notifications','/static/js/app.js']
};
const ACTIONS = {
  mass_download:'file_download', midnight_download:'file_download', file_download:'file_download',
  db_admin_access:'admin_query', normal:'page_view'
};

function randomIpv4(){ return `${pick([103,113,110,160,202,27])}.${randInt(0,255)}.${randInt(0,255)}.${randInt(1,254)}`; }
function randomIpv6(){
  const h = () => randInt(0,65535).toString(16);
  return `${pick(['2400:1a00','2404:7c00','2405:acc0','2407:1400'])}:${h()}:${h()}:${h()}:${h()}:${h()}:${h()}`;
}
function randomStudentId(){
  const yr = pick(['21','22','23','24','25','26']);
  return yr + String(randInt(0,999)).padStart(4,'0').slice(1);
}

const SAMPLE_SIZE = 2600;
const SUSP_BEHAVIOURS = ['db_admin_access','mass_download','midnight_download','file_download'];

function buildEventIndex(){
  const days = DATA.days;
  const grand = DATA.daily_susp.reduce((a,b)=>a+b,0) + DATA.daily_norm.reduce((a,b)=>a+b,0);
  const suspBehavWeights = SUSP_BEHAVIOURS.map(b => [b, DATA.behaviour_counts[b] || 0]);
  const statusNormal = [['200',10784],['204',20773],['304',14749],['201',1717],['404',314]];
  const statusSusp   = [['200',60],['403',1121],['401',540],['204',80],['404',60],['500',1],['400',1]];
  const roleWeights  = [['student',48721],['staff',859],['admin',408],['parent',12]];
  const topIps       = DATA.top_ips.map(x => x[0]);
  const topStudents  = DATA.top_students.map(x => x[0]);
  const namedAccounts= DATA.mass_dl_top.map(r => r.student_id).filter(s => /[a-z]/i.test(s));

  const events = [];
  let seq = 0;

  for(let d = 0; d < days.length; d++){
    const dayTotal = DATA.daily_susp[d] + DATA.daily_norm[d];
    const n = Math.max(0, Math.round(SAMPLE_SIZE * dayTotal / grand));
    const suspRatio = dayTotal ? DATA.daily_susp[d] / dayTotal : 0;

    for(let i = 0; i < n; i++){
      const suspicious = rnd() < suspRatio;
      let behaviour = suspicious ? weightedPick(suspBehavWeights) : 'normal';

      let hour;
      if(behaviour === 'midnight_download')      hour = randInt(0,4);
      else if(suspicious)                        hour = +weightedPick(DATA.hourly_susp.map((w,h) => [h,w]));
      else                                       hour = +weightedPick([[8,6],[9,9],[10,11],[11,10],[12,7],[13,8],[14,9],[15,8],[16,6],[17,5],[18,4],[19,3],[20,3],[21,2],[22,2],[23,1],[7,3],[6,1]]);

      const role = behaviour === 'db_admin_access'
        ? (rnd() < 0.93 ? 'student' : pick(['staff','admin']))
        : weightedPick(roleWeights);

      let student_id;
      if(suspicious && rnd() < 0.42)      student_id = pick(topStudents);
      else if(suspicious && rnd() < 0.10) student_id = pick(namedAccounts);
      else if(role === 'staff')           student_id = 'stw' + String(randInt(1,300)).padStart(4,'0');
      else if(role === 'admin')           student_id = pick(['softwarica.admin','stw.exam','sysadmin']);
      else                                student_id = randomStudentId();

      const src_ip = suspicious && rnd() < 0.38
        ? pick(topIps)
        : (rnd() < 0.55 ? randomIpv6() : randomIpv4());

      const status = weightedPick(suspicious ? statusSusp : statusNormal);
      const auth_fail = (status === '401' || status === '403') ? 1 : 0;

      let req_per_min;
      if(behaviour === 'mass_download')        req_per_min = randInt(160, 2400);
      else if(behaviour === 'db_admin_access') req_per_min = randInt(40, 420);
      else if(suspicious)                      req_per_min = randInt(60, 260);
      else                                     req_per_min = randInt(1, 45);

      const bytes = behaviour === 'normal' ? randInt(220, 24000)
                  : (behaviour === 'db_admin_access' ? randInt(500, 9000) : randInt(180000, 9400000));

      const uri = pick(URIS[behaviour]).replace('%ID%', String(randInt(1000,9999)));
      const ts = new Date(Date.UTC(2026, 6, 3 + d, hour, randInt(0,59), randInt(0,59)));

      events.push({
        _id: ++seq,
        _time: ts.getTime(),
        time: `2026-07-${String(3+d).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(ts.getUTCMinutes()).padStart(2,'0')}:${String(ts.getUTCSeconds()).padStart(2,'0')}`,
        day: days[d],
        dayIdx: d,
        hour,
        index: 'campus_siem',
        sourcetype: 'campus:siem',
        source: 'campus_siem.log',
        host: behaviour === 'db_admin_access' ? 'campus-db-01' : pick(HOSTS),
        student_id, role, src_ip, behaviour,
        action: ACTIONS[behaviour],
        uri, status,
        bytes, req_per_min, auth_fail,
        session_id: Math.abs(Math.floor(rnd()*0xffffffff)).toString(16).padStart(8,'0'),
        // scripted clients only show up on flagged activity — normal browsing is always a real browser
        user_agent: suspicious && rnd() < (behaviour === 'mass_download' ? 0.55 : 0.22)
          ? pick(SCRIPT_UAS) : pick(BROWSER_UAS)
      });
    }
  }
  events.sort((a,b) => b._time - a._time);
  return events;
}

const EVENTS = buildEventIndex();
const SCALE = DATA.kpi.total_events / EVENTS.length;   // sample -> population estimate

const RAW_FIELDS = ['host','student_id','role','src_ip','action','uri','status','bytes','req_per_min','auth_fail','behaviour','session_id','user_agent'];
function rawLine(e){
  return `${e.time} host=${e.host} student_id=${e.student_id} role=${e.role} src_ip=${e.src_ip} ` +
         `action=${e.action} uri="${e.uri}" status=${e.status} bytes=${e.bytes} req_per_min=${e.req_per_min} ` +
         `auth_fail=${e.auth_fail} behaviour=${e.behaviour} session_id=${e.session_id} user_agent="${e.user_agent}"`;
}

/* =========================================================
   SPL engine — a working subset of the search language
========================================================= */
const SEARCHABLE = ['index','sourcetype','source','host','student_id','role','src_ip','action','uri','status','behaviour','session_id','user_agent','bytes','req_per_min','auth_fail','hour','day'];
const NUMERIC = ['bytes','req_per_min','auth_fail','status','hour','count'];

function tokenizeSegment(seg){
  const out = [];
  const re = /("[^"]*"|'[^']*'|\S+)/g;
  let m;
  while((m = re.exec(seg)) !== null) out.push(m[1]);
  return out;
}
function unquote(s){
  if(!s) return s;
  if((s[0] === '"' && s.slice(-1) === '"') || (s[0] === "'" && s.slice(-1) === "'")) return s.slice(1,-1);
  return s;
}

function parseFilters(seg){
  const toks = tokenizeSegment(seg);
  const clauses = [];
  let negateNext = false;

  for(let t of toks){
    const up = t.toUpperCase();
    if(up === 'AND') continue;
    if(up === 'NOT'){ negateNext = true; continue; }
    if(up === 'OR')  continue;               // treated as AND; good enough for this subset
    if(t.toLowerCase() === 'search') continue;

    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)(!=|>=|<=|=|>|<)(.*)$/);
    if(m){
      const [, field, op, rawVal] = m;
      clauses.push({ type:'field', field, op, value: unquote(rawVal), negate: negateNext });
    }else{
      clauses.push({ type:'text', value: unquote(t).toLowerCase(), negate: negateNext });
    }
    negateNext = false;
  }
  return clauses;
}

function matchClause(e, c, raw){
  let hit;
  if(c.type === 'text'){
    hit = raw.toLowerCase().indexOf(c.value) !== -1;
  }else{
    const fv = e[c.field];
    if(fv === undefined){
      // unknown field: only a wildcard "*" can match
      hit = c.value === '*';
    }else if(c.op === '=' || c.op === '!='){
      const pat = String(c.value);
      if(pat.indexOf('*') !== -1){
        const rx = new RegExp('^' + pat.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*') + '$','i');
        hit = rx.test(String(fv));
      }else{
        hit = String(fv).toLowerCase() === pat.toLowerCase();
      }
      if(c.op === '!=') hit = !hit;
    }else{
      const a = parseFloat(fv), b = parseFloat(c.value);
      if(isNaN(a) || isNaN(b)) hit = false;
      else hit = c.op === '>' ? a > b : c.op === '<' ? a < b : c.op === '>=' ? a >= b : a <= b;
    }
  }
  return c.negate ? !hit : hit;
}

function applyFilters(events, clauses){
  if(!clauses.length) return events.slice();
  return events.filter(e => {
    const raw = rawLine(e);
    for(const c of clauses) if(!matchClause(e, c, raw)) return false;
    return true;
  });
}

function groupCount(events, fields){
  const map = new Map();
  events.forEach(e => {
    const key = fields.map(f => e[f] === undefined ? 'NULL' : String(e[f])).join(' ');
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([k,v]) => ({ key: k.split(' '), count: v }))
    .sort((a,b) => b.count - a.count);
}

/**
 * Run an SPL string. Returns:
 *  { ok:true, kind:'events', events:[...] }
 *  { ok:true, kind:'table',  fields:[...], rows:[[...]] }
 *  { ok:false, error:'message' }
 */
function runSPL(query, opts){
  opts = opts || {};
  const src = (opts.events || EVENTS);
  const parts = String(query || '').split('|').map(s => s.trim());
  const base = parts.shift() || '';

  let clauses;
  try{ clauses = parseFilters(base); }
  catch(err){ return { ok:false, error:'Could not parse the search: ' + err.message }; }

  const bad = clauses.find(c => c.type === 'field' && SEARCHABLE.indexOf(c.field) === -1);
  if(bad) return { ok:false, error:`Unknown field '${esc(bad.field)}'. Known fields: ${SEARCHABLE.join(', ')}` };

  let events = applyFilters(src, clauses);
  let result = { ok:true, kind:'events', events };

  for(const stage of parts){
    if(!stage) continue;
    const cmd = stage.split(/\s+/)[0].toLowerCase();
    const rest = stage.slice(cmd.length).trim();

    if(cmd === 'stats' || cmd === 'chart'){
      if(result.kind !== 'events') return { ok:false, error:`'${cmd}' must follow the base search.` };
      const dc = rest.match(/^dc\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/i);
      if(dc){
        const f = dc[1];
        const n = new Set(result.events.map(e => e[f])).size;
        result = { kind:'table', ok:true, fields:['dc('+f+')'], rows:[[n]], estimate:true };
        continue;
      }
      const byM = rest.match(/\bby\s+(.+)$/i);
      const aggM = rest.match(/^(count|sum\(([A-Za-z_]\w*)\)|avg\(([A-Za-z_]\w*)\)|max\(([A-Za-z_]\w*)\))/i);
      if(!aggM) return { ok:false, error:"Supported aggregations: count, sum(field), avg(field), max(field), dc(field)." };
      const fields = byM ? byM[1].split(/[,\s]+/).filter(Boolean) : [];
      const unknown = fields.find(f => SEARCHABLE.indexOf(f) === -1);
      if(unknown) return { ok:false, error:`Cannot group by unknown field '${esc(unknown)}'.` };

      const aggKind = aggM[1].toLowerCase().split('(')[0];
      const aggField = aggM[2] || aggM[3] || aggM[4];
      const label = aggKind === 'count' ? 'count' : `${aggKind}(${aggField})`;

      if(!fields.length){
        const v = aggKind === 'count' ? result.events.length
          : aggKind === 'sum' ? result.events.reduce((s,e)=>s+(+e[aggField]||0),0)
          : aggKind === 'max' ? result.events.reduce((s,e)=>Math.max(s,+e[aggField]||0),0)
          : Math.round(result.events.reduce((s,e)=>s+(+e[aggField]||0),0) / Math.max(1,result.events.length));
        result = { kind:'table', ok:true, fields:[label], rows:[[v]] };
        continue;
      }
      const groups = new Map();
      result.events.forEach(e => {
        const k = fields.map(f => String(e[f])).join(' ');
        if(!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
      });
      const rows = Array.from(groups.entries()).map(([k, evs]) => {
        const v = aggKind === 'count' ? evs.length
          : aggKind === 'sum' ? evs.reduce((s,e)=>s+(+e[aggField]||0),0)
          : aggKind === 'max' ? evs.reduce((s,e)=>Math.max(s,+e[aggField]||0),0)
          : Math.round(evs.reduce((s,e)=>s+(+e[aggField]||0),0) / evs.length);
        return k.split(' ').concat([v]);
      }).sort((a,b) => b[b.length-1] - a[a.length-1]);
      result = { kind:'table', ok:true, fields: fields.concat([label]), rows };

    }else if(cmd === 'top' || cmd === 'rare'){
      if(result.kind !== 'events') return { ok:false, error:`'${cmd}' must follow the base search.` };
      const lim = (rest.match(/limit\s*=\s*(\d+)/i) || [,'10'])[1];
      const f = rest.replace(/limit\s*=\s*\d+/i,'').trim().split(/[,\s]+/)[0];
      if(!f || SEARCHABLE.indexOf(f) === -1) return { ok:false, error:`'${cmd}' needs a known field name.` };
      let g = groupCount(result.events, [f]);
      if(cmd === 'rare') g = g.slice().reverse();
      const total = result.events.length || 1;
      result = {
        kind:'table', ok:true, fields:[f,'count','percent'],
        rows: g.slice(0, +lim).map(x => [x.key[0], x.count, (100*x.count/total).toFixed(3)])
      };

    }else if(cmd === 'timechart'){
      if(result.kind !== 'events') return { ok:false, error:"'timechart' must follow the base search." };
      const byM = rest.match(/\bby\s+([A-Za-z_]\w*)/i);
      if(byM){
        const f = byM[1];
        if(SEARCHABLE.indexOf(f) === -1) return { ok:false, error:`Cannot split by unknown field '${esc(f)}'.` };
        const series = Array.from(new Set(result.events.map(e => String(e[f])))).slice(0,8);
        const rows = DATA.days.map((d,i) => [d].concat(
          series.map(s => result.events.filter(e => e.dayIdx === i && String(e[f]) === s).length)
        ));
        result = { kind:'table', ok:true, fields:['_time'].concat(series), rows };
      }else{
        const rows = DATA.days.map((d,i) => [d, result.events.filter(e => e.dayIdx === i).length]);
        result = { kind:'table', ok:true, fields:['_time','count'], rows };
      }

    }else if(cmd === 'head'){
      const n = parseInt(rest,10) || 10;
      if(result.kind === 'events') result.events = result.events.slice(0,n);
      else result.rows = result.rows.slice(0,n);

    }else if(cmd === 'tail'){
      const n = parseInt(rest,10) || 10;
      if(result.kind === 'events') result.events = result.events.slice(-n);
      else result.rows = result.rows.slice(-n);

    }else if(cmd === 'sort'){
      const desc = rest.indexOf('-') === 0;
      const f = rest.replace(/^[-+]/,'').trim().split(/[,\s]+/)[0];
      if(result.kind === 'table'){
        const ix = result.fields.indexOf(f);
        if(ix === -1) return { ok:false, error:`Cannot sort by '${esc(f)}' — not in the result set.` };
        result.rows.sort((a,b) => {
          const x = a[ix], y = b[ix];
          const n1 = parseFloat(x), n2 = parseFloat(y);
          const cmpv = (!isNaN(n1) && !isNaN(n2)) ? n1 - n2 : String(x).localeCompare(String(y));
          return desc ? -cmpv : cmpv;
        });
      }else{
        result.events.sort((a,b) => {
          const n1 = parseFloat(a[f]), n2 = parseFloat(b[f]);
          const cmpv = (!isNaN(n1) && !isNaN(n2)) ? n1 - n2 : String(a[f]).localeCompare(String(b[f]));
          return desc ? -cmpv : cmpv;
        });
      }

    }else if(cmd === 'table' || cmd === 'fields'){
      if(result.kind !== 'events') continue;
      const fs = rest.split(/[,\s]+/).filter(Boolean);
      const unknown = fs.find(f => SEARCHABLE.indexOf(f) === -1 && f !== '_time');
      if(unknown) return { ok:false, error:`Unknown field '${esc(unknown)}' in ${cmd}.` };
      result = {
        kind:'table', ok:true, fields: fs,
        rows: result.events.map(e => fs.map(f => f === '_time' ? e.time : e[f]))
      };

    }else if(cmd === 'dedup'){
      if(result.kind !== 'events') continue;
      const f = rest.split(/[,\s]+/)[0];
      const seen = new Set();
      result.events = result.events.filter(e => {
        const k = String(e[f]);
        if(seen.has(k)) return false;
        seen.add(k); return true;
      });

    }else if(cmd === 'where'){
      const m = rest.match(/^([A-Za-z_]\w*)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
      if(!m) return { ok:false, error:"'where' expects: where <field> <op> <value>" };
      const [, f, op, vRaw] = m;
      const v = parseFloat(unquote(vRaw.trim()));
      const test = x => {
        const n = parseFloat(x);
        if(isNaN(n) || isNaN(v)) return String(x) === unquote(vRaw.trim());
        return op === '>' ? n > v : op === '<' ? n < v : op === '>=' ? n >= v
             : op === '<=' ? n <= v : op === '!=' ? n !== v : n === v;
      };
      if(result.kind === 'table'){
        const ix = result.fields.indexOf(f);
        if(ix === -1) return { ok:false, error:`'where' cannot see field '${esc(f)}'.` };
        result.rows = result.rows.filter(r => test(r[ix]));
      }else{
        result.events = result.events.filter(e => test(e[f]));
      }

    }else{
      return { ok:false, error:`Unknown search command '${esc(cmd)}'. Supported: stats, chart, timechart, top, rare, table, fields, where, sort, head, tail, dedup.` };
    }
  }
  return result;
}

/* =========================================================
   Email delivery
========================================================= */
let MAIL = (function(){
  const saved = Store.get('mail', null);
  // Drop settings saved before this config version — they may name a provider
  // that no longer exists, which would silently break sending.
  if(!saved || Store.get('mailVersion', 1) < MAIL_CONFIG_VERSION){
    Store.set('mailVersion', MAIL_CONFIG_VERSION);
    Store.del('mail');
    return Object.assign({}, DEFAULT_MAIL);
  }
  const merged = Object.assign({}, DEFAULT_MAIL, saved);
  if(['resend','web3forms','webhook','none'].indexOf(merged.provider) === -1){
    merged.provider = DEFAULT_MAIL.provider;
    merged.key = DEFAULT_MAIL.key;
  }
  return merged;
})();
let PREFS = Object.assign({ refresh:0, pageSize:20, confirmEmail:true }, Store.get('prefs', {}));

function mailConfigured(){
  if(MAIL.provider === 'none') return false;
  // Resend goes through our own serverless route, so there is no
  // client-side key to check — the endpoint field is only an override
  if(MAIL.provider === 'resend') return true;
  return !!MAIL.key.trim();
}

function mailStateLabel(){
  return mailConfigured()
    ? `&#9993; notify: ${esc(MAIL.to)}`
    : '&#9993; notify: not configured';
}

function mailtoFallback(to, cc, subject, body){
  const url = `mailto:${encodeURIComponent(to)}?${cc ? 'cc=' + encodeURIComponent(cc) + '&' : ''}` +
              `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
}

/**
 * Sends the alert for real when a provider is configured.
 * Resolves { sent:true, via } or { sent:false, via:'mailto'|'error', error }
 */
async function sendMail({ to, cc, subject, body, html, priority, meta }){
  to = (to || MAIL.to || '').trim();
  cc = (cc != null ? cc : MAIL.cc || '').trim();

  if(!mailConfigured()){
    mailtoFallback(to, cc, subject, body);
    return { sent:false, via:'mailto' };
  }

  const endpoint = MAIL.provider === 'web3forms' ? 'https://api.web3forms.com/submit'
                 : MAIL.provider === 'resend'    ? (MAIL.key.trim() || '/api/send')
                 : MAIL.key.trim();
  let payload;

  if(MAIL.provider === 'resend'){
    // the API key never touches the browser — this hits our own
    // Vercel function, which holds RESEND_API_KEY server-side
    payload = { to, cc, subject, text: body, html: html || undefined, priority };
  }else if(MAIL.provider === 'web3forms'){
    payload = {
      access_key: MAIL.key.trim(),
      subject, from_name: MAIL.fromName || 'Campus SIEM',
      replyto: to, ccemail: cc || undefined,
      message: body, priority, recipient: to
    };
  }else{
    payload = { to, cc, subject, body, priority, sentAt: new Date().toISOString(), meta: meta || null };
  }
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  let res;
  try{
    res = await fetch(endpoint, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify(payload)
    });
  }catch(err){
    return { sent:false, via:'error', error:'Network or CORS error reaching the relay. Check the endpoint URL and that it allows requests from this origin.' };
  }

  let json = null;
  try{ json = await res.json(); }catch(e){ /* webhooks often return no body */ }

  if(res.ok && (!json || json.success !== false)){
    return { sent:true, via: MAIL.provider };
  }
  let msg = `Relay responded ${res.status}`;
  if(json){
    if(Array.isArray(json.errors) && json.errors.length) msg = json.errors.map(e => e.message || e.code).join('; ');
    else if(json.message) msg = json.message;
    else if(json.error) msg = json.error;
  }
  return { sent:false, via:'error', error: msg };
}
