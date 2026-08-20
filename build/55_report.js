
/* =========================================================
   Incident report builder
   One notification shape for every dispatch path (row Notify,
   alert firing, test), rendered as both a plain-text SOC
   report and a branded HTML report.
========================================================= */

const ORG = {
  name    : 'Softwarica College of IT & E-Commerce',
  unit    : 'Security Operations Centre',
  system  : 'Campus SIEM',
  index   : 'campus_siem',
  officer : 'SOC Duty Officer',
  // Deployed console URL. Every incident report links back to it; blank omits
  // the button. Reports are read outside the network, so this must be absolute.
  console : 'https://campus-siem.vercel.app'
};

const SEV_META = {
  high:   { label:'HIGH',   colour:'#dc4e41', sla:'Triage within 30 minutes' },
  medium: { label:'MEDIUM', colour:'#f2b02a', sla:'Triage within 4 hours' },
  low:    { label:'LOW',    colour:'#3ec9c0', sla:'Review within 1 business day' }
};

function incidentId(){
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `INC-${stamp}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

/* Human-readable labels for the raw event fields */
const FIELD_LABEL = {
  student_id:'Account / Student ID', src_ip:'Source address', count:'Event count',
  severity:'Severity', role:'Account role', peak_rpm:'Peak requests/min',
  req_per_min:'Requests per minute', behaviour:'Detection class', status:'HTTP status',
  time:'Event timestamp', matches:'Matching events', alert:'Correlation rule', search:'Search'
};

/* What the analyst should actually do, per detection class */
const PLAYBOOK = {
  mass_download: [
    'Suspend the account session and force re-authentication.',
    'Confirm whether the transfer volume matches any approved bulk export.',
    'Preserve the LMS access logs for the affected resource IDs.'
  ],
  midnight_download: [
    'Verify the activity against the account holder’s timetable and location.',
    'Check whether the same source address appears on other accounts.',
    'Escalate to the Data Protection Officer if course material left the network.'
  ],
  db_admin_access: [
    'Treat as a privilege boundary violation — confirm the account is not entitled to admin endpoints.',
    'Review application authorisation rules for the /admin path.',
    'Capture full request logs before the retention window closes.'
  ],
  burst: [
    'Rate-limit the source address at the edge.',
    'Determine whether the client is scripted (check the user agent).',
    'Confirm no credential stuffing is running alongside the burst.'
  ],
  auth_fail: [
    'Check for credential stuffing or password spraying across accounts.',
    'Lock the account if failures continue past the threshold.',
    'Confirm the source address is not a shared campus NAT gateway.'
  ],
  generic: [
    'Validate the detection against the raw events in the SIEM.',
    'Confirm whether the activity was authorised.',
    'Escalate to the SOC lead if the behaviour continues.'
  ]
};

function playbookFor(ctx){
  const hay = `${ctx.source || ''} ${JSON.stringify(ctx.fields || {})}`.toLowerCase();
  if(hay.indexOf('mass_download') !== -1 || hay.indexOf('mass download') !== -1) return PLAYBOOK.mass_download;
  if(hay.indexOf('midnight') !== -1 || hay.indexOf('out-of-hours') !== -1)       return PLAYBOOK.midnight_download;
  if(hay.indexOf('db_admin') !== -1 || hay.indexOf('db admin') !== -1)           return PLAYBOOK.db_admin_access;
  if(hay.indexOf('burst') !== -1 || hay.indexOf('request-rate') !== -1)          return PLAYBOOK.burst;
  if(hay.indexOf('auth') !== -1)                                                 return PLAYBOOK.auth_fail;
  return PLAYBOOK.generic;
}

function nowStamp(){
  return new Date().toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', hour12:false
  });
}

/**
 * ctx = {
 *   source   : 'Mass Download Events'      what raised it
 *   severity : 'high'|'medium'|'low'
 *   fields   : { student_id, src_ip, ... } the evidence row
 *   spl      : 'index=campus_siem ...'     the search behind it
 *   matches  : 106                          optional match count
 *   subject  : override
 * }
 */
function buildIncident(ctx){
  const sev = SEV_META[ctx.severity] || SEV_META.medium;
  const id = ctx.id || incidentId();
  const when = nowStamp();
  const fields = ctx.fields || {};
  const entity = fields.student_id || fields.alert || fields.role || 'unidentified';
  const actions = playbookFor(ctx);

  const subject = ctx.subject || `[${ORG.system} | ${sev.label}] ${id} — ${ctx.source} — ${entity}`;

  const rows = Object.entries(fields)
    .filter(([k]) => k !== 'severity')
    .map(([k,v]) => [FIELD_LABEL[k] || k.replace(/_/g,' ').replace(/^./, c => c.toUpperCase()), String(v)]);

  const pad = 22;
  const line = (k,v) => '  ' + (k + ' ').padEnd(pad, '.') + ' ' + v;

  const text = [
    '='.repeat(64),
    `  ${ORG.unit.toUpperCase()}`,
    `  ${ORG.name}`,
    '='.repeat(64),
    '',
    '  SIEM INCIDENT NOTIFICATION',
    '',
    line('Incident ID', id),
    line('Severity', sev.label),
    line('Status', 'OPEN — awaiting analyst triage'),
    line('Response target', sev.sla),
    line('Raised', when),
    line('Detection source', `${ORG.system} · ${ctx.source}`),
    line('Raised by', `${ORG.officer} (automated dispatch)`),
    '',
    '-'.repeat(64),
    '  1. WHAT WAS DETECTED',
    '-'.repeat(64),
    '',
    '  ' + wrapText(ctx.summary || defaultSummary(ctx, entity), 60, '  '),
    '',
    '-'.repeat(64),
    '  2. EVIDENCE',
    '-'.repeat(64),
    '',
    ...rows.map(([k,v]) => line(k, v)),
    ctx.matches != null ? line('Matching events', String(ctx.matches)) : null,
    '',
    ctx.spl ? '  Search that produced this result:' : null,
    ctx.spl ? '    ' + ctx.spl : null,
    ctx.spl ? '' : null,
    '-'.repeat(64),
    '  3. RECOMMENDED ACTIONS',
    '-'.repeat(64),
    '',
    ...actions.map((a,i) => `  ${i+1}. ${wrapText(a, 58, '     ')}`),
    '',
    '-'.repeat(64),
    '  4. SOURCE DATA',
    '-'.repeat(64),
    '',
    line('Index', ORG.index),
    line('Sourcetype', 'campus:siem'),
    line('Source', 'campus_siem.log'),
    line('Window', '03 Jul 2026 – 13 Jul 2026'),
    '',
    '='.repeat(64),
    `  Generated automatically by ${ORG.system}.`,
    '  Do not reply to this address — action the incident in the console.',
    '='.repeat(64)
  ].filter(l => l !== null).join('\n');

  return { id, subject, text, html: buildIncidentHtml({ id, sev, when, ctx, rows, actions, entity }) };
}

function defaultSummary(ctx, entity){
  const n = ctx.matches != null ? ctx.matches : (ctx.fields && ctx.fields.count);
  return `A correlation rule on ${ORG.system} matched activity attributed to ${entity} ` +
         `and crossed its alerting threshold${n ? ` (${n} events)` : ''}. ` +
         `The activity is described under "${ctx.source}" and requires analyst confirmation.`;
}

function wrapText(s, width, indent){
  const words = String(s).split(/\s+/);
  const lines = [];
  let cur = '';
  words.forEach(w => {
    if((cur + ' ' + w).trim().length > width){ lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  });
  if(cur.trim()) lines.push(cur.trim());
  return lines.join('\n' + (indent || ''));
}

function buildIncidentHtml({ id, sev, when, ctx, rows, actions, entity }){
  /* Email HTML rules in force here:
     - tables for layout, inline styles only (Gmail strips <style>)
     - every table gets border-collapse + explicit width so Outlook agrees
     - one shared label column width so all four sections align on a grid  */
  const FONT  = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  const MONO  = "ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace";
  const LABEL_W = 168;

  const tbl = 'width:100%;border-collapse:collapse;';
  const tdLabel = `padding:8px 12px 8px 0;font-family:${FONT};font-size:13px;color:#6b7280;`
                + `width:${LABEL_W}px;vertical-align:top;line-height:1.5;`;
  const tdValue = `padding:8px 0;font-family:${FONT};font-size:13px;color:#111827;`
                + `font-weight:600;vertical-align:top;line-height:1.5;`;

  const kv = (label, value, mono) =>
    `<tr>
       <td style="${tdLabel}">${esc(label)}</td>
       <td style="${tdValue}${mono ? `font-family:${MONO};font-weight:500;word-break:break-all;` : ''}">${esc(value)}</td>
     </tr>`;

  const heading = (n, title) =>
    `<table role="presentation" style="${tbl}" cellpadding="0" cellspacing="0"><tr>
       <td style="font-family:${FONT};font-size:11px;letter-spacing:.11em;color:#9ca3af;
                  text-transform:uppercase;font-weight:700;border-bottom:2px solid #e5e7eb;
                  padding-bottom:8px;">
         <span style="color:${sev.colour};">${n}</span>&nbsp;&nbsp;${esc(title)}
       </td>
     </tr></table>`;

  const evidence = rows.map(([k, v]) => kv(k, v, true)).join('');

  const steps = actions.map((a, i) =>
    `<tr>
       <td style="padding:7px 10px 7px 0;font-family:${FONT};font-size:13px;color:${sev.colour};
                  font-weight:700;width:22px;vertical-align:top;line-height:1.6;">${i + 1}</td>
       <td style="padding:7px 0;font-family:${FONT};font-size:13px;color:#374151;
                  vertical-align:top;line-height:1.6;">${esc(a)}</td>
     </tr>`).join('');

  const section = (n, title, inner, padTop) =>
    `<tr><td style="padding:${padTop || 26}px 32px 0;">
       ${heading(n, title)}
       <table role="presentation" style="${tbl}margin-top:4px;" cellpadding="0" cellspacing="0">${inner}</table>
     </td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(ctx.source)}</title>
</head>
<body style="margin:0;padding:0;background:#eef0f3;-webkit-text-size-adjust:100%;">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${sev.label} &middot; ${esc(id)} &middot; ${esc(ctx.source)} &middot; ${esc(sev.sla)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="width:100%;border-collapse:collapse;background:#eef0f3;">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" width="640" cellpadding="0" cellspacing="0"
         style="width:640px;max-width:640px;border-collapse:collapse;background:#ffffff;
                border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(16,24,40,.10);">

    <!-- masthead -->
    <tr><td style="background:#0d0e10;padding:22px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${tbl}">
        <tr>
          <td align="left" style="vertical-align:middle;font-family:${FONT};">
            <div style="color:#ff6a1a;font-size:10.5px;letter-spacing:.16em;font-weight:700;
                        text-transform:uppercase;line-height:1.4;">${esc(ORG.unit)}</div>
            <div style="color:#ffffff;font-size:16px;font-weight:600;margin-top:4px;
                        line-height:1.35;">${esc(ORG.name)}</div>
          </td>
          <td align="right" style="vertical-align:middle;width:90px;">
            <span style="display:inline-block;background:${sev.colour};color:#ffffff;font-size:10.5px;
                         font-weight:700;letter-spacing:.1em;padding:6px 12px;border-radius:3px;
                         font-family:${FONT};white-space:nowrap;">${sev.label}</span>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="height:3px;background:${sev.colour};font-size:0;line-height:0;">&nbsp;</td></tr>

    <!-- title -->
    <tr><td style="padding:28px 32px 0;font-family:${FONT};">
      <div style="font-size:10.5px;letter-spacing:.12em;color:#9ca3af;text-transform:uppercase;
                  font-weight:700;">SIEM Incident Notification</div>
      <div style="font-size:23px;font-weight:700;color:#111827;margin:8px 0 10px;
                  line-height:1.25;">${esc(ctx.source)}</div>
      <span style="display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;
                   padding:4px 10px;font-size:12px;color:#4b5563;font-family:${MONO};">${esc(id)}</span>
    </td></tr>

    <!-- case summary card -->
    <tr><td style="padding:20px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="${tbl}background:#f9fafb;border:1px solid #e8eaed;border-radius:8px;">
        <tr><td style="padding:6px 18px 8px;">
          <table role="presentation" style="${tbl}" cellpadding="0" cellspacing="0">
            ${kv('Status', 'Open — awaiting analyst triage')}
            ${kv('Response target', sev.sla)}
            ${kv('Raised', when)}
            ${kv('Raised by', ORG.officer + ' (automated)')}
          </table>
        </td></tr>
      </table>
    </td></tr>

    ${section(1, 'What was detected',
      `<tr><td style="padding:10px 0 0;font-family:${FONT};font-size:13.5px;line-height:1.7;
                      color:#374151;">${esc(ctx.summary || defaultSummary(ctx, entity))}</td></tr>`, 28)}

    ${section(2, 'Evidence', evidence)}

    ${ctx.spl ? `<tr><td style="padding:14px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="${tbl}background:#0d0e10;border-radius:6px;">
        <tr><td style="padding:13px 16px;">
          <div style="color:#8b929c;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;
                      margin-bottom:7px;font-family:${FONT};font-weight:600;">Search that produced this result</div>
          <div style="color:#3ec9c0;font-size:12px;font-family:${MONO};line-height:1.6;
                      word-break:break-all;">${esc(ctx.spl)}</div>
        </td></tr>
      </table>
    </td></tr>` : ''}

    ${section(3, 'Recommended actions', steps)}

    ${section(4, 'Source data',
      kv('Index', ORG.index, true) +
      kv('Sourcetype', 'campus:siem', true) +
      kv('Source', 'campus_siem.log', true) +
      kv('Window', '03 Jul 2026 – 13 Jul 2026'))}

    ${ORG.console ? `<tr><td align="center" style="padding:28px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr><td style="background:#0d0e10;border-radius:6px;" align="center">
          <a href="${esc(ORG.console)}"
             style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:13px;
                    font-weight:600;text-decoration:none;font-family:${FONT};letter-spacing:.01em;">
            Open in ${esc(ORG.system)} &rarr;</a>
        </td></tr>
      </table>
    </td></tr>` : ''}

    <!-- footer -->
    <tr><td style="padding:28px 32px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${tbl}">
        <tr><td style="border-top:1px solid #e8eaed;padding-top:18px;font-family:${FONT};
                       font-size:11.5px;color:#9ca3af;line-height:1.7;">
          Generated automatically by <strong style="color:#6b7280;">${esc(ORG.system)}</strong>
          &middot; incident <span style="font-family:${MONO};">${esc(id)}</span><br>
          Do not reply to this message &mdash; action the incident in the console.
        </td></tr>
      </table>
    </td></tr>

  </table>

  <div style="font-family:${FONT};font-size:11px;color:#9aa1ab;padding:16px 8px 0;">
    ${esc(ORG.name)} &middot; ${esc(ORG.unit)}
  </div>

</td></tr>
</table>
</body>
</html>`;
}

/* =========================================================
   Motion helpers — feedback for actions that do real work
========================================================= */

const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Count a number up instead of snapping to it. */
function animateCount(el, to, ms){
  if(!el) return;
  const from = parseInt(String(el.textContent).replace(/[^0-9]/g,''), 10) || 0;
  if(REDUCED || from === to){ el.textContent = fmt(to); return; }
  const dur = ms || 520, t0 = performance.now();
  (function step(now){
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(from + (to - from) * eased));
    if(p < 1) requestAnimationFrame(step);
    else el.textContent = fmt(to);
  })(t0);
}

/* Put a button into a spinner state for the length of an async action. */
async function withBusy(btn, label, fn){
  if(!btn) return fn();
  const original = btn.innerHTML;
  btn.classList.add('busy');
  btn.innerHTML = `<span class="spin"></span>${label}`;
  try{ return await fn(); }
  finally{
    btn.classList.remove('busy');
    btn.innerHTML = original;
  }
}

/* Flash the first row of a table after something was prepended to it. */
function flashFirstRow(tbodyId){
  const tb = $(tbodyId);
  if(!tb || REDUCED) return;
  const tr = tb.querySelector('tr');
  if(!tr) return;
  tr.classList.add('new-row');
  setTimeout(() => tr.classList.remove('new-row'), 1600);
}

/* Draw attention to the bell when something new lands there. */
function pulseBell(){
  if(REDUCED) return;
  const badge = $('bellBadge'), wrap = $('bellWrap');
  if(badge){ badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
  if(wrap){ wrap.classList.remove('ring'); void wrap.offsetWidth; wrap.classList.add('ring');
            setTimeout(() => wrap.classList.remove('ring'), 2400); }
}

/* Skeleton placeholder while a search resolves. */
function skeletonRows(n){
  let h = '<div class="skel">';
  for(let i = 0; i < (n || 6); i++){
    h += '<div style="display:grid;grid-template-columns:150px 1fr;gap:12px;">' +
         '<div class="skel-line s1"></div>' +
         '<div><div class="skel-line s2"></div><div class="skel-line s3"></div></div></div>';
  }
  return h + '</div>';
}
