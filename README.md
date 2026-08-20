# Campus SIEM

A Splunk-style SIEM console for campus behaviour analytics, built as a single self-contained
`index.html` — no backend, no build step, no external requests at runtime. Deploys to Vercel as
a static site.

Behind it sits `campus_siem.log`: 50,000 events, 1,674 students, 5,439 source IPs, 3–13 July 2026.

## What's in it

**Dashboards** — the original behaviour-analytics dashboard: KPIs, suspicious-vs-normal timeline,
behaviour breakdown, hour-of-day distribution, top source IPs and students, midnight downloads,
auth failures, status codes, role split, and detail tables for mass download / DB admin access /
request-rate bursts.

Everything on it is live: KPI tiles and every chart segment drill down into Search, the time-range
and role pickers re-scope the whole page, panels have a `⋯` menu (refresh / open in search /
export CSV / hide), and Edit mode remembers which panels you hid.

**Search** — a working SPL subset over the indexed events, with the field sidebar, expandable raw
events, a timeline histogram, and Events / Statistics / Visualization tabs.

```
index=campus_siem behaviour=mass_download req_per_min>500
index=campus_siem behaviour!=normal | top src_ip limit=10
index=campus_siem auth_fail=1 | timechart count
index=campus_siem user_agent=python-requests* | stats count by student_id
```

Supported: `field=value` / `!=` / `>` / `<`, `*` wildcards, `NOT`, quoted phrases, bare-term
full-text match, and the commands `stats` (count/sum/avg/max/dc), `chart`, `timechart`, `top`,
`rare`, `table`, `fields`, `where`, `sort`, `head`, `tail`, `dedup`. Anything else returns a
Splunk-style error rather than failing silently.

**Reports** — 10 saved reports that actually run. Open, edit, delete, export CSV, or save the
current search as a new one.

**Alerts** — 7 correlation rules with live match counts, enable/disable toggles, thresholds,
severity, schedule, and per-rule alert actions. *Run now* evaluates the rule, sends the email,
opens a ticket, and records the firing. *Preview matches* tells you whether a rule would trigger
before you save it.

**Settings** — email delivery, index configuration, dashboard preferences, and data export.

## Sending real email

The page is static, so outbound mail goes through a form-relay service. Pick one under
**Settings → Email Delivery**, paste the endpoint, hit **Send Test Email**:

| Provider | What to paste | Free tier |
|---|---|---|
| [Formspree](https://formspree.io) | `https://formspree.io/f/xxxxxxx` | 50 submissions/mo |
| [Web3Forms](https://web3forms.com) | access key (a UUID; no account needed) | 250 submissions/mo |
| Custom webhook | any URL — n8n, Make, Zapier, Discord, your own | yours |

Both hosted providers deliver to the mailbox the form or key was registered with, so register it
with the address that should receive the alerts. The *To* field is carried in the message body and
used as reply-to. A custom webhook receives the whole alert as JSON
(`{to, cc, subject, body, priority, meta}`) and must allow CORS from this origin.

With no provider configured nothing breaks — **Notify** falls back to opening your mail client with
the message pre-filled, and the UI says so.

## Data and state

The dashboard aggregates are the real numbers parsed from `campus_siem.log`. Search, Reports and
Alerts run against a deterministic 1:19 sample of those events (2,599 rows) generated in-browser
from the same daily / hourly / behaviour / status / role distributions — same seed every load, so
results are stable. When a role or time filter is applied the dashboard shows a scaled estimate
from that sample and labels it as such; unfiltered, it shows the exact aggregates.

Tickets, alerts, reports, settings and hidden panels live in `localStorage` under `campus-siem:*`
— per browser, nothing leaves the page except the mail you send. **Settings → Reset all saved
settings** puts everything back.

## Layout

```
index.html      the deployed artifact — open it directly, no server needed
build/          the pieces it is assembled from
  00_head.html    <head> + inlined Chart.js 4.4.4
  10_css_orig.css original dashboard stylesheet, unmodified
  30_css_add.css  styles for the added views
  40_body.html    markup for all five views
  20_data.js      aggregates parsed from campus_siem.log
  50_core.js      storage, event index, SPL engine, mail delivery
  60_views.js     dashboard, search, reports, alerts, settings, ticketing
  70_init.js      event wiring and boot
build.sh        concatenates build/* back into index.html
```

Edit the pieces in `build/`, then:

```sh
./build.sh
```

Editing `index.html` directly is fine too — it is the source of truth for what ships.
