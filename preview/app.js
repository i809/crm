// RubberTrack preview — data-driven SPA
const NAV = [
  { id: 'dashboard', label: 'Dashboard', ico: '◈', grp: 'Core' },
  { id: 'search',    label: 'Search', ico: '⌕' },
  { id: 'orders',    label: 'Order Records', ico: '▤' },
  { id: 'suppliers', label: 'Suppliers', ico: '◉' },
  { id: 'customers', label: 'Customers', ico: '◧' },
  { id: 'issues',    label: 'Issues', ico: '⚠' },
  { grp: 'Team' },
  { id: 'attendance', label: 'Attendance', ico: '⏱' },
  { grp: 'Control' },
  { id: 'news',      label: 'News Feed', ico: '◆' },
  { id: 'docs',      label: 'Doc Tools', ico: '▦' },
  { id: 'doccheck',  label: 'Doc Checker', ico: '⇄' },
  { id: 'checklists', label: 'Checklists', ico: '✓' },
  { id: 'ai',        label: 'AI Assistant', ico: '✦' },
  { id: 'insights',  label: 'Insights', ico: '✧' },
  { id: 'tenants',   label: 'Tenants', ico: '⧉' },
  { id: 'branding',  label: 'Branding', ico: '◈' },
  { id: 'portal',    label: 'Customer Portal', ico: '⊕' },
  { id: 'config',    label: 'Screen Config', ico: '⚙' },
];

const DATA = {
  tenant: 'RubberTrack Demo',
  ticker: [
    ['TSR-20','$1.87/kg','+0.8%','up'], ['RSS-3','$2.24/kg','−0.3%','down'],
    ['Latex 60%','$2.31/kg','+1.2%','up'], ['SICOM 20','IDR 14,650/kg','+0.4%','up'],
    ['Cup Lump','THB 68.5','+2.1%','up'], ['Natural + Styrene','spread +0.5','+stable','up'],
  ],
  kpis: [
    { lbl:'Open Orders', val:37, sub:'+4 this week', dir:'up', c:'--amber' },
    { lbl:'Active MT', val:'612.4', sub:'across 19 FCL', dir:'up', c:'--teal' },
    { lbl:'Revenue (Aug)', val:'$1.28M', sub:'−2.1% vs Jul', dir:'down', c:'--green' },
    { lbl:'Open Issues', val:6, sub:'2 quality · 3 doc · 1 shipment', dir:'down', c:'--red' },
    { lbl:'Suppliers', val:12, sub:'4 TH · 4 ID · 3 MY · 1 VN', dir:'up', c:'--amber' },
    { lbl:'Customers', val:9, sub:'BKT · JK · MRF · CEAT +5', dir:'up', c:'--teal' },
  ],
  trendMonths: ['Mar','Apr','May','Jun','Jul','Aug'],
  trendMT:      [420, 486, 512, 588, 604, 612.4],
  trendRev:     [0.92, 1.04, 1.11, 1.24, 1.31, 1.28],
  grades: [
    { name:'TSR-20', mt:286.2, fcl:11 },
    { name:'RSS-3',  mt:201.6, fcl:8 },
    { name:'Latex 60%', mt:88.4, fcl:3 },
    { name:'SICOM 20', mt:36.2, fcl:2 },
  ],
  orders: [
    ['ORD-2026-0042','JK Tyre','Tiong Huat','TSR-20','100.8','4','$1,875','In Production','teal'],
    ['ORD-2026-0039','BKT','Lexley Rubber','T30M','50.4','2','$2,240','Docs Pending','amber'],
    ['ORD-2026-0038','MRF','Vietnam Rubber','RSS-3','100.8','4','$2,020','Shipped','green'],
    ['ORD-2026-0035','CEAT','SMR Malaysia','Latex 60%','21.0','1','$2,310','Docs Pending','amber'],
    ['ORD-2026-0031','Apollo','SICOM Indonesia','SICOM 20','16.0','1','$1,840','Quality Issue','red'],
    ['ORD-2026-0027','JK Tyre','Lexley Rubber','TSR-20','100.8','4','$1,890','Delivered','green'],
    ['ORD-2026-0022','BKT','Tiong Huat','RSS-3','50.4','2','$2,150','Delivered','green'],
  ],
  issues: [
    ['#Q-118','Quality','SMR moisture above spec (0.9%)','Open','red'],
    ['#Q-117','Quality','VOCB check failed on 2 lots','Open','red'],
    ['#D-204','Document','Missing COO for O-0035','Open','amber'],
    ['#D-203','Document','B/L amendment pending','Open','amber'],
    ['#S-071','Shipment','Vessel rollover ETA +9d','Monitoring','teal'],
    ['#S-067','Shipment','QA container damage (photos recvd)','Resolved','green'],
  ],
  feed: [
    ['⚡','Price alert: TSR-20 +0.8% on SICOM close','12m ago','danger'],
    ['◉','BKT requested revised PI for O-0038','40m ago'],
    ['⚠','Issue #Q-118 assigned to QA team','2h ago','danger'],
    ['✓','Docs complete: O-0031 cleared for shipping','5h ago'],
    ['▤','New order O-0042 created for JK Tyre','1d ago'],
  ],
  checklist: [
    ['Verify FFA % on 14_CL001 (must be < 1.0%)', false],
    ['Confirm HS Code 4001.10 with broker', true],
    ['Attach packing list (PDF ≤ 2MB) to PI', false],
    ['Request TDS/SDS from supplier', true],
    ['Log container seals in Doc Tools', false],
    ['Update Incoterms DAP → FOB quote', true],
  ],
  employees: [
    ['A. Checkout (Sales)','IN','IN','IN','OUT','IN'],
    ['B. Docs (Logistics)','IN','IN','IN','IN','IN'],
    ['C. Tech (QA)','OUT','IN','IN','IN','IN'],
    ['D. Ops (Admin)','IN','OUT','OUT','IN','OUT'],
    ['E. Finance','IN','IN','IN','IN','IN'],
  ],
  suppliers: ['Lexley Rubber (TH)','Tiong Huat (ID)','SMR Malaysia','Vietnam Rubber','SICOM Indonesia','PT Halcyon','Halycon Binh'],
  customers: ['BKT','JK Tyre','MRF','CEAT','Apollo','Titan Tires','Maxxis','Yokohama','TriDe'],
};

// ---------- Router ----------
const content = document.getElementById('content');
const navEl = document.getElementById('nav');
navEl.innerHTML = NAV.map(n => n.grp
  ? `<div class="grp">${n.grp}</div>`
  : `<a href="#/${n.id}" data-id="${n.id}"><span class="ico">${n.ico}</span>${n.label}</a>`).join('');

const bottomnav = document.getElementById('bottomnav');
const primary5 = ['dashboard','orders','issues','ai','config'];
bottomnav.innerHTML = primary5.map(id => {
  const n = NAV.find(x => x.id === id);
  return `<a href="#/${n.id}" data-id="${n.id}"><span class="ico">${n.ico}</span>${n.label.split(' ')[0]}</a>`;
}).join('');

function route(){
  const id = (location.hash.split('/')[1] || 'dashboard');
  const n = NAV.find(x => x.id === id) || {label:'Dashboard'};
  document.title = 'RubberTrack — ' + n.label;
  const title = document.getElementById('pageTitle');
  const crumb = document.getElementById('pageCrumb');
  if (title) title.textContent = n.label;
  if (crumb) crumb.textContent = DATA.tenant + ' · ' + n.label;
  render(id);
  document.querySelectorAll('.nav a, .bottomnav a').forEach(a => a.classList.toggle('active', a.dataset.id === id));
}
window.addEventListener('hashchange', route);

// ---------- Views ----------
const charts = [];
function render(id){
  charts.forEach(c => c.dispose()); charts.length = 0;
  content.innerHTML = VIEWS[id] ? VIEWS[id]() : VIEWS.dashboard();
  if (window.echarts) initCharts();
}
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function chartBase(){ return {
  textStyle:{fontFamily:'IBM Plex Mono',color:css('--muted')},
  grid:{left:8,right:14,top:26,bottom:6,containLabel:true},
};}
function initCharts(){
  document.querySelectorAll('[data-chart]').forEach(el => {
    const c = echarts.init(el, null, {renderer:'canvas'});
    c.setOption(CHARTS[el.dataset.chart]());
    charts.push(c);
  });
}
window.addEventListener('resize', () => charts.forEach(c => c.resize()));

const CHARTS = {
  trend: () => ({
    ...chartBase(),
    tooltip:{trigger:'axis'},
    legend:{data:['Volume (MT)','Revenue ($M)'],textStyle:{color:css('--muted')},top:0},
    xAxis:{type:'category',data:DATA.trendMonths,axisLine:{lineStyle:{color:css('--line')}}},
    yAxis:[{type:'value',axisLine:{show:false},splitLine:{lineStyle:{color:css('--line')}}},
           {type:'value',axisLine:{show:false},splitLine:{show:false}}],
    series:[
      {name:'Volume (MT)',type:'bar',data:DATA.trendMT,barWidth:16,
        itemStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'#2dd4bf'},{offset:1,color:'#1a4f45'}]}}},
      {name:'Revenue ($M)',type:'line',yAxisIndex:1,data:DATA.trendRev,smooth:true,symbol:'circle',symbolSize:7,
        lineStyle:{color:css('--amber'),width:2.5},itemStyle:{color:css('--amber')}},
    ] }),
  grades: () => ({
    ...chartBase(),
    tooltip:{trigger:'axis'},
    xAxis:{type:'category',data:DATA.grades.map(g=>g.name),axisLabel:{color:css('--muted')},axisLine:{lineStyle:{color:css('--line')}}},
    yAxis:{type:'value',name:'MT',axisLine:{show:false},splitLine:{lineStyle:{color:css('--line')}}},
    series:[{type:'bar',data:DATA.grades.map(g=>g.mt),barWidth:22,
      itemStyle:{color:p=>['#f5a524','#2dd4bf','#8fd169','#f27171'][p.dataIndex]}}],
  }),
  issues: () => ({
    ...chartBase(),
    tooltip:{trigger:'item'},
    series:[{type:'pie',radius:['52%','78%'],itemStyle:{borderColor:'transparent'},
      label:{color:css('--muted')},
      data:(DATA.issueMix || [{category:'Quality',value:2},{category:'Document',value:3},{category:'Shipment',value:1}])
        .map((m,i)=>({name:m.category[0].toUpperCase()+m.category.slice(1), value:m.value,
          itemStyle:{color:['#f87171','#f5a524','#2dd4bf','#8fd169','#a78bfa'][i%5]}})),
    }],
  }),
};

const VIEWS = {
  search: () => `
    <div class="card span-12">
      <h3>Global Search <span class="tag teal" style="font-size:10px">tsvector + pg_trgm hybrid · RLS-scoped</span></h3>
      <div class="ai-input"><input id="searchQ" placeholder="Search orders, parties, issues, feed…" autocomplete="off" onkeydown="if(event.key==='Enter')runSearch()">
        <button class="btn" onclick="runSearch()">Search</button></div>
      <div id="searchOut" style="margin-top:14px;color:var(--muted);font-family:var(--font-m);font-size:12px">Type a query to search across all tenant data.</div>
    </div>`,
  dashboard: () => `
    <section class="kpis">${DATA.kpis.map(k=>`
      <div class="kpi" style="--c:var(${k.c})">
        <div class="lbl">${k.lbl}</div>
        <div class="val">${k.val}</div>
        <div class="sub"><span class="delta ${k.dir}">${k.dir==='down'?'▼':'▲'}</span> ${k.sub}</div>
      </div>`).join('')}</section>
    <div class="card span-12"><h3>Data Channels <span class="tag teal" style="font-size:10px">multi-source · live</span></h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${[
        ['Orders','/data/orders','teal'],['KPIs','/data/dashboard','amber'],['Issues','/data/issues','red'],
        ['Parties','/data/parties','green'],['Search','/search','teal'],['AI','/ai/chat','amber'],
        ['Insights','/ai/insights','green'],['Screen Config','/data/screen-config','teal']
      ].map(([n,u,c])=>`<span class="tag ${c}" style="cursor:pointer" onclick="location.hash='#/${n.toLowerCase().replace(/\\s/g,'')}'">${n}</span>`).join('')}</div>
      <p style="color:var(--muted);font-family:var(--font-m);font-size:11px;margin-top:8px">Company template: <b>${DATA.tenant}</b> — switchable via tenant selector. Each channel fetches from a dedicated BFF endpoint, RLS-scoped per tenant.</p></div>
    <section class="grid">
      <div class="card span-8"><h3>Volume &amp; Revenue — 6 months</h3><div class="chart" data-chart="trend"></div></div>
      <div class="card span-4"><h3>Active grades</h3><div class="chart" data-chart="grades"></div></div>
      <div class="card span-4"><h3>Issue mix</h3><div class="chart chart-sm" data-chart="issues"></div></div>
      <div class="card span-8"><h3>Recent orders</h3>${ordersTable(DATA.orders.slice(0,4))}</div>
      <div class="card span-6"><h3>Live feed</h3>${feedList(DATA.feed)}</div>
      <div class="card span-6"><h3>Open issues</h3>${issuesTable(DATA.issues.slice(0,5))}</div>
    </section>`,
  orders: () => `
    <div class="card span-12"><h3>Order Records — ${DATA.orders.length} open</h3>${ordersTable(DATA.orders)}</div>`,
  issues: () => `
    <section class="grid">
      <div class="card span-7"><h3>Issues</h3>${issuesTable(DATA.issues)}</div>
      <div class="card span-5"><h3>Issue mix</h3><div class="chart" data-chart="issues"></div></div>
    </section>`,
  attendance: () => `
    <div class="card span-12"><h3>Attendance — Week 34</h3>${attTable(DATA.employees)}</div>`,
  news: () => `
    <div class="card span-12"><h3>News Feed</h3>${feedList(DATA.feed.concat(DATA.feed.slice(0,4)))}</div>`,
  docs: () => `
    <div class="card span-12"><h3>Document Tools</h3>
      <p style="color:var(--muted);font-family:var(--font-m);font-size:12px">PI · PO · Invoice · B/L · COO · Packing List — attach, sign, version.</p>
      ${feedList([['▦','PI-2026-0042 signed (JK Tyre)','today'],['▦','B/L amendment requested (O-0035)','1d'],['▦','Packing list re-upload for O-0031','2d']])}</div>`,
  checklists: () => `
    <div class="card span-12"><h3>Checklists</h3><div class="check">${DATA.checklist.map(([t,done])=>
      `<label class="${done?'done':''}"><input type="checkbox" ${done?'checked':''}>${t}</label>`).join('')}</div></div>`,
  suppliers: () => `<div class="card span-12"><h3>Suppliers (${DATA.suppliers.length})</h3>${pillList(DATA.suppliers)}</div>`,
  customers: () => `<div class="card span-12"><h3>Customers (${DATA.customers.length})</h3>${pillList(DATA.customers)}</div>`,
  doccheck: () => `
    <section class="grid">
      <div class="card span-6"><h3>Document A</h3>
        <textarea id="docA" class="doc-diff" placeholder="Paste PI / B/L text…">PROFORMA INVOICE No. PI-2026-0042
Seller: Tiong Huat (ID)
Buyer: JK Tyre (IN)
Grade: TSR-20 · Qty: 100.8 MT · 4 FCL
Unit price: USD 1,875/MT
Incoterms: FOB Belawan</textarea></div>
      <div class="card span-6"><h3>Document B</h3>
        <textarea id="docB" class="doc-diff" placeholder="Paste revised doc text…">PROFORMA INVOICE No. PI-2026-0042
Seller: Tiong Huat (ID)
Buyer: JK Tyre (IN)
Grade: TSR-20 · Qty: 100.8 MT · 4 FCL
Unit price: USD 1,890/MT
Incoterms: DAP Mundra</textarea></div>
      <div class="card span-12"><h3>Diff <button class="btn" onclick="runDiff()">Compare</button></h3>
        <div id="diffOut" class="diff-out"><span style="color:var(--muted);font-family:var(--font-m);font-size:12px">Click Compare to highlight line-level differences.</span></div></div>
    </section>`,
  ai: () => `
    <div class="card span-12 ai-card">
      <h3>AI Assistant <span class="tag teal" style="font-size:10px">Agent · streaming · tools · RLS-scoped</span></h3>
      <div id="aiLog" class="ai-log">
        <div class="ai-msg bot">I plan a tool sequence, run it against your tenant data, then synthesize — streaming token by token. Ask about orders, issues, suppliers, or request an overview.</div>
      </div>
      <div id="aiTools" class="ai-tools"></div>
      <div class="ai-input"><input id="aiText" placeholder="e.g. Which orders have quality issues? / give me an overview" autocomplete="off">
        <button class="btn" onclick="sendAI()">Send</button></div>
      <div id="aiUsage" style="margin-top:8px;color:var(--muted);font-family:var(--font-m);font-size:11px"></div>
    </div>`,
  insights: () => `
    <div class="card span-12">
      <h3>AI Insights <span class="tag teal" style="font-size:10px">computed from tenant KPIs</span></h3>
      <p style="color:var(--muted);font-family:var(--font-m);font-size:12px">Auto-generated nightly + on-demand. Grounded in your live data.</p>
      <button class="btn primary" onclick="genInsights()">Generate insights</button>
      <div id="insightsOut" style="margin-top:14px;color:var(--muted);font-family:var(--font-m);font-size:12px">Click Generate to compute fresh insights.</div>
      <div id="aiUsagePanel" style="margin-top:18px"></div>
      <button class="btn" style="margin-top:10px" onclick="loadUsage()">View AI usage</button>
    </div>`,
  tenants: () => `
    <div class="card span-12">
      <h3>Tenant Management <span class="tag teal" style="font-size:10px">admin · tier escalation · backups</span></h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:14px">
        <label style="font-size:12px;color:var(--muted)">ID<input id="ntId" placeholder="acme" style="display:block;margin-top:2px"></label>
        <label style="font-size:12px;color:var(--muted)">Label<input id="ntLabel" placeholder="Acme Trading" style="display:block;margin-top:2px"></label>
        <label style="font-size:12px;color:var(--muted)">Template<select id="ntTemplate" style="display:block;margin-top:2px"><option>rubbertrack</option></select></label>
        <label style="font-size:12px;color:var(--muted)">Tier<select id="ntTier" style="display:block;margin-top:2px"><option>A</option><option>B</option><option>C</option></select></label>
        <label style="font-size:12px"><input type="checkbox" id="ntClone" style="margin-right:4px">Clone template data</label>
        <button class="btn primary" onclick="onboardTenant()">Onboard</button>
      </div>
      <button class="btn" onclick="loadTenants()">Refresh list</button>
      <div id="tenantsList" style="margin-top:14px"></div>
    </div>`,
  branding: () => `
    <div class="card span-12">
      <h3>White-Label Branding <span class="tag teal" style="font-size:10px">per-tenant theme.json · live preview</span></h3>
      <p style="color:var(--muted);font-family:var(--font-m);font-size:12px">Customize colors + logo text for the current tenant. Saved to DB, applied on load.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px">
        <label style="font-size:12px;color:var(--muted)">Logo text<input id="brLogo" placeholder="RubberTrack" style="display:block;margin-top:2px"></label>
        <label style="font-size:12px;color:var(--muted)">Primary<input id="brPrimary" type="color" value="#2dd4bf" style="display:block;margin-top:2px;width:60px;height:34px"></label>
        <label style="font-size:12px;color:var(--muted)">Accent<input id="brAccent" type="color" value="#f5a524" style="display:block;margin-top:2px;width:60px;height:34px"></label>
        <label style="font-size:12px;color:var(--muted)">Background<input id="brBg" type="color" value="#0b0f0e" style="display:block;margin-top:2px;width:60px;height:34px"></label>
        <label style="font-size:12px;color:var(--muted)">Panel<input id="brPanel" type="color" value="#121a18" style="display:block;margin-top:2px;width:60px;height:34px"></label>
        <label style="font-size:12px;color:var(--muted)">Text<input id="brText" type="color" value="#e8efe9" style="display:block;margin-top:2px;width:60px;height:34px"></label>
        <button class="btn primary" onclick="saveBranding()">Save theme</button>
        <button class="btn" onclick="resetBranding()">Reset</button>
      </div>
      <div id="brandingMsg" style="margin-top:10px;color:var(--muted);font-family:var(--font-m);font-size:12px">Loading current theme…</div>
    </div>`,
  portal: () => `
    <div class="card span-12">
      <h3>Customer Portal <span class="tag teal" style="font-size:10px">external login · scoped to one customer · RLS</span></h3>
      <p style="color:var(--muted);font-family:var(--font-m);font-size:12px">A customer logs in and sees only their own orders + issues. In production this is JWT-gated; here pick a customer to preview.</p>
      <div class="ai-input" style="margin-bottom:12px"><input id="portalCustomer" placeholder="e.g. JK Tyre" autocomplete="off" value="JK Tyre">
        <button class="btn primary" onclick="loadPortal()">View my orders</button></div>
      <div id="portalOut" style="color:var(--muted);font-family:var(--font-m);font-size:12px">Enter a customer name to preview their portal.</div>
    </div>`,
  config: () => `
    <div class="card span-12"><h3>Screen Configuration <span style="color:var(--muted);font-size:11px;font-weight:400">— re-arrange dashboard panels (saved per tenant)</span></h3>
      <div id="cfgPanels" class="cfg-panels"></div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="addPanel()">+ Add panel</button>
        <button class="btn primary" onclick="saveConfig()">Save layout</button>
        <button class="btn" onclick="exportData()">Export Records (xlsx)</button>
        <label class="btn" style="cursor:pointer">Import (xlsx)<input type="file" id="impFile" accept=".xlsx,.csv" hidden onchange="importData(this)"></label>
      </div>
      <div id="cfgMsg" style="margin-top:8px;color:var(--muted);font-family:var(--font-m);font-size:12px"></div>
    </div>`,
};

const ordersTable = rows => `<table class="tbl">
  <thead><tr><th>Order</th><th>Customer</th><th>Supplier</th><th>Grade</th><th>MT</th><th>FCL</th><th>Price (USD)</th><th>Status</th></tr></thead>
  <tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td><td>${r[6]}</td><td><span class="tag ${r[8]}">${r[7]}</span></td></tr>`).join('')}</tbody></table>`;

const issuesTable = rows => `<table class="tbl">
  <thead><tr><th>ID</th><th>Type</th><th>Summary</th><th>Status</th></tr></thead>
  <tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td><span class="tag ${r[4]}">${r[1]}</span></td><td style="font-family:var(--font-b)">${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table>`;

const feedList = items => `<div class="feed">${items.map(f=>`
  <div class="feed-item"><div class="ic">${f[0]}</div><div><div class="t">${f[1]}</div><div class="m">${f[2]}</div></div></div>`).join('')}</div>`;

const attTable = rows => `<table class="tbl">
  <thead><tr><th>Employee</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th></tr></thead>
  <tbody>${rows.map(r=>`<tr><td style="font-family:var(--font-b)">${r[0]}</td>${r.slice(1).map(d=>`<td><span class="tag ${d==='IN'?'green':'red'}">${d}</span></td>`).join('')}</tr>`).join('')}</tbody></table>`;

const pillList = items => `<div style="display:flex;flex-wrap:wrap;gap:8px">${items.map(s=>`<span class="tag teal">${s}</span>`).join('')}</div>`;

// ---------- Doc Checker (field extraction + line diff + mismatch flags) ----------
// Extracts structured PI fields from free text so diffs flag *what* changed
// (price, qty, Incoterms) not just that a line differs.
function extractFields(text){
  const f = {};
  const m = (re) => { const r = text.match(re); return r ? r[1].trim() : ''; };
  f.invoice   = m(/(?:PROFORMA\s+INVOICE|Invoice)\s*(?:No\.?|#)?\s*([A-Z0-9-]+)/i) || m(/^([A-Z]+-\d{4}-\d+)/);
  f.seller    = m(/Seller:?\s*(.+)/i);
  f.buyer     = m(/Buyer:?\s*(.+)/i);
  f.grade     = m(/Grade:?\s*([A-Z0-9% -]+)/i);
  f.qty       = m(/Qty:?\s*([\d.]+)\s*MT/i);
  f.fcl       = m(/(\d+)\s*FCL/i);
  f.price     = m(/(?:Unit\s+price|Price):?\s*(?:USD|US\$|\$)?\s*([\d,]+)\/?MT/i);
  f.incoterms = m(/Incoterms:?\s*([A-Z]{3}\s+\w+)/i);
  return f;
}
window.runDiff = function(){
  const a = document.getElementById('docA').value;
  const b = document.getElementById('docB').value;
  const fa = extractFields(a), fb = extractFields(b);
  // Field-level mismatch flags (the high-value signals for a trader).
  const fields = ['invoice','seller','buyer','grade','qty','fcl','price','incoterms'];
  const flags = fields.filter(k => fa[k] && fb[k] && fa[k].toUpperCase() !== fb[k].toUpperCase())
    .map(k => `<div class="d-line flag">⚠ ${k}: "${esc(fa[k])}" → "${esc(fb[k])}"</div>`);
  let out = flags.length ? `<div style="margin-bottom:10px;color:var(--amber);font-weight:600">Field mismatches (${flags.length})</div>${flags.join('')}<div style="margin:12px 0 6px;color:var(--muted);font-size:11px">Line-level diff</div>` : '';
  // Line-level diff.
  const la = a.split('\n'), lb = b.split('\n'), max = Math.max(la.length, lb.length);
  for (let i=0; i<max; i++){
    const xa = la[i] ?? '', xb = lb[i] ?? '';
    if (xa === xb) out += `<div class="d-line eq">${i+1}  ${esc(xa)}</div>`;
    else { if (xa) out += `<div class="d-line del">- ${esc(xa)}</div>`; if (xb) out += `<div class="d-line add">+ ${esc(xb)}</div>`; }
  }
  document.getElementById('diffOut').innerHTML = out || '<span style="color:var(--muted)">No differences.</span>';
};
function esc(s){ return (s||'').replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

// ---------- AI Assistant (streaming agent) ----------
window.sendAI = async function(){
  const inp = document.getElementById('aiText');
  const q = inp.value.trim(); if (!q) return;
  const log = document.getElementById('aiLog');
  const toolsEl = document.getElementById('aiTools');
  const usageEl = document.getElementById('aiUsage');
  log.insertAdjacentHTML('beforeend', `<div class="ai-msg user">${esc(q)}</div>`);
  inp.value = '';
  log.insertAdjacentHTML('beforeend', `<div class="ai-msg bot thinking"></div>`);
  const bubble = log.lastChild;
  if (toolsEl) toolsEl.innerHTML = '';
  if (usageEl) usageEl.textContent = '';
  let text = '';
  const sessionId = 'web:' + (DATA.tenant || 'default');
  try{
    const res = await fetch('/ai/chat/stream', {method:'POST', headers:{'content-type':'application/json','x-tenant-id':currentTenant}, body: JSON.stringify({message:q, session_id:sessionId})});
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let chartSpec = null;
    while (true){
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream:true });
      const events = buf.split('\n\n'); buf = events.pop();
      for (const ev of events){
        const lines = ev.split('\n');
        const evt = (lines.find(l=>l.startsWith('event:'))||'event:token').slice(6).trim();
        const data = JSON.parse((lines.find(l=>l.startsWith('data:'))||'data:{}').slice(5));
        if (evt === 'tool' && toolsEl) toolsEl.insertAdjacentHTML('beforeend', `<span class="tag teal" style="margin-right:6px">🔧 ${esc(data.name)}</span>`);
        else if (evt === 'observation' && toolsEl) toolsEl.insertAdjacentHTML('beforeend', `<span class="tag" style="margin-right:6px">${data.count} rows</span>`);
        else if (evt === 'token'){ text += data.text; bubble.classList.remove('thinking'); bubble.textContent = text; }
        else if (evt === 'chart'){ chartSpec = data; }
        else if (evt === 'done' && usageEl){ usageEl.textContent = `provider: ${data.usage.provider} · tools: ${(data.tools||[]).join(', ')} · ${data.usage.latency_ms}ms · req ${data.usage.request_id.slice(0,8)}`; if (data.chart) chartSpec = data.chart; }
        else if (evt === 'start' && usageEl) usageEl.textContent = `provider: ${data.provider}…`;
      }
      log.scrollTop = log.scrollHeight;
    }
    if (!text){ bubble.classList.remove('thinking'); bubble.textContent = '(empty response)'; }
    if (chartSpec) renderChatChart(chartSpec, log);
  }catch(e){ bubble.classList.remove('thinking'); bubble.textContent = 'AI service unavailable.'; }
  log.scrollTop = log.scrollHeight;
};
document.addEventListener('keydown', e => { if (e.key==='Enter' && e.target?.id==='aiText'){ window.sendAI(); }});

// Render an inline chart inside the AI Assistant from a chart spec.
function renderChatChart(spec, log){
  if (!window.echarts) return;
  log.insertAdjacentHTML('beforeend', `<div class="ai-msg bot" style="width:min(100%,520px);align-self:stretch"><div class="chart-title" style="font-size:11px;color:var(--muted);margin-bottom:6px">${esc(spec.title||'chart')}</div><div class="chart chart-inline" style="height:180px"></div></div>`);
  const el = log.lastChild.querySelector('.chart-inline');
  if (!el) return;
  const c = echarts.init(el, null, {renderer:'canvas'});
  const colors = ['#2dd4bf','#f5a524','#a78bfa','#f87171','#3b82f6'];
  c.setOption({
    textStyle:{fontFamily:'IBM Plex Mono',color:css('--muted')},
    grid:{left:4,right:10,top:16,bottom:4,containLabel:true},
    tooltip:{trigger:'axis'},
    xAxis:{type:'category',data:spec.labels,axisLabel:{color:css('--muted')},axisLine:{lineStyle:{color:css('--line')}}},
    yAxis:{type:'value',axisLine:{show:false},splitLine:{lineStyle:{color:css('--line')}}},
    series:[{type:spec.type==='line'?'line':'bar',data:spec.values,...(spec.type==='line'?{smooth:true,symbol:'circle',symbolSize:6}:{barWidth:14}),itemStyle:{color:spec.type==='line'?css('--amber'):colors[0]},areaStyle:spec.type==='line'?{color:'rgba(45,212,191,.15)'}:undefined}],
  });
  window.addEventListener('resize', () => c.resize(), { once:true });
}

// ---------- Insights generator ----------
window.genInsights = async function(){
  const out = document.getElementById('insightsOut');
  out.innerHTML = '<span style="color:var(--muted)">Generating…</span>';
  try{
    const res = await fetch('/ai/insights', {method:'POST', headers:{'x-tenant-id':currentTenant}, body:'{}'});
    const d = await res.json();
    if (d.insights){
      out.innerHTML = d.insights.map((s,i)=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${i+1}.</b> ${esc(s)}</div>`).join('')
        + `<div style="margin-top:8px;color:var(--muted);font-size:11px">generated ${new Date(d.generated_at).toLocaleString()} · ${d.usage.provider}</div>`;
    } else { out.innerHTML = '<span style="color:var(--red)">Error: ' + esc(d.error||'unknown') + '</span>'; }
  }catch(e){ out.innerHTML = '<span style="color:var(--red)">Insights failed.</span>'; }
};

// Auto-load the latest stored snapshot when the Insights screen opens.
window.loadLatestInsights = async function(){
  const out = document.getElementById('insightsOut');
  if (!out) return;
  out.innerHTML = '<span style="color:var(--muted)">Loading latest insights…</span>';
  try{
    const res = await fetch('/ai/insights/latest', { headers: { 'x-tenant-id': currentTenant } });
    const d = await res.json();
    if (d.insights && d.insights.length){
      out.innerHTML = d.insights.map((s,i)=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${i+1}.</b> ${esc(s)}</div>`).join('')
        + `<div style="margin-top:8px;color:var(--muted);font-size:11px">latest snapshot: ${new Date(d.generated_at).toLocaleString()} · ${d.provider||'cron'}</div>`;
    } else {
      out.innerHTML = '<span style="color:var(--muted)">No snapshot yet — click Generate to compute one. A cron job will populate this automatically every 30 min.</span>';
    }
  }catch(e){ out.innerHTML = '<span style="color:var(--muted)">Loading snapshot failed. Click Generate.</span>'; }
};
window.loadUsage = async function(){
  const panel = document.getElementById('aiUsagePanel');
  panel.innerHTML = '<span style="color:var(--muted)">Loading…</span>';
  try{
    const res = await fetch('/ai/usage?limit=10', { headers: { 'x-tenant-id': currentTenant } });
    const d = await res.json();
    let html = '<h4 style="margin:14px 0 6px">By provider</h4>';
    html += d.by_provider.map(p=>`<div class="ai-msg bot" style="max-width:100%;margin-bottom:6px"><b>${esc(p.provider)}</b> · ${p.calls} calls · ${p.tokens} tokens · $${p.cost.toFixed(4)}</div>`).join('') || '<span style="color:var(--muted)">No usage yet.</span>';
    html += '<h4 style="margin:14px 0 6px">Recent calls</h4>';
    html += d.recent.length ? `<table class="tbl"><thead><tr><th>Provider</th><th>Tool</th><th>Tokens out</th><th>Latency</th><th>When</th></tr></thead><tbody>${d.recent.map(r=>`<tr><td>${esc(r.provider)}</td><td>${esc(r.tool)}</td><td>${r.tokens_out}</td><td>${r.latency_ms}ms</td><td style="color:var(--muted)">${new Date(r.created_at).toLocaleTimeString()}</td></tr>`).join('')}</tbody></table>` : '<span style="color:var(--muted)">No calls yet.</span>';
    panel.innerHTML = html;
  }catch(e){ panel.innerHTML = '<span style="color:var(--red)">Failed.</span>'; }
};

// ---------- Tenant Management (admin) ----------
window.loadTenants = async function(){
  const el = document.getElementById('tenantsList');
  el.innerHTML = '<span style="color:var(--muted)">Loading…</span>';
  try{
    const res = await fetch('/tenants');
    const d = await res.json();
    el.innerHTML = d.tenants.length ? `<table class="tbl"><thead><tr><th>ID</th><th>Label</th><th>Template</th><th>Tier</th><th>Status</th><th>Actions</th></tr></thead><tbody>${d.tenants.map(t=>`<tr><td><b>${esc(t.id)}</b></td><td>${esc(t.label)}</td><td>${esc(t.template)}</td><td><span class="tag ${t.tier==='C'?'amber':t.tier==='B'?'teal':''}">${t.tier}</span></td><td>${esc(t.status)}</td><td><button class="btn" style="font-size:11px;padding:3px 8px" onclick="escalateTenant('${t.id}','${t.tier}')">Escalate</button> <a class="btn" style="font-size:11px;padding:3px 8px" href="/tenants/${t.id}/backup" download>Backup</a></td></tr>`).join('')}</tbody></table>` : '<span style="color:var(--muted)">No tenants.</span>';
  }catch(e){ el.innerHTML = '<span style="color:var(--red)">Failed.</span>'; }
};
window.onboardTenant = async function(){
  const id = document.getElementById('ntId').value.trim();
  const label = document.getElementById('ntLabel').value.trim();
  if (!id || !label){ alert('ID and Label required'); return; }
  const body = { id, label, template: document.getElementById('ntTemplate').value, tier: document.getElementById('ntTier').value, cloneTemplate: document.getElementById('ntClone').checked };
  try{
    const res = await fetch('/tenants', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)});
    const d = await res.json();
    if (d.onboarded){ alert(`Onboarded ${d.id} (${d.tier})` + (d.cloned && d.cloned.records ? ` — cloned ${d.cloned.records} records` : '')); document.getElementById('ntId').value=''; document.getElementById('ntLabel').value=''; loadTenants(); }
    else { alert('Error: ' + (d.error||JSON.stringify(d))); }
  }catch(e){ alert('Onboard failed'); }
};
window.escalateTenant = async function(id, fromTier){
  const toTier = fromTier === 'A' ? 'B' : 'C';
  if (!confirm(`Escalate ${id} from tier ${fromTier} → ${toTier}?`)) return;
  try{
    const res = await fetch(`/tenants/${id}/escalate`, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({toTier})});
    const d = await res.json();
    alert(d.escalated ? `Escalated ${id} → ${toTier} (${d.isolation})` : `No change: ${d.note||JSON.stringify(d)}`);
    loadTenants();
  }catch(e){ alert('Escalation failed'); }
};

// ---------- White-label branding (Phase 5a) ----------
window.loadBranding = async function(){
  const msg = document.getElementById('brandingMsg');
  try{
    const res = await fetch(`/tenants/${currentTenant}/theme`);
    const d = await res.json();
    const t = d.theme || {};
    if (t.logoText) document.getElementById('brLogo').value = t.logoText;
    if (t.primary) document.getElementById('brPrimary').value = t.primary;
    if (t.accent) document.getElementById('brAccent').value = t.accent;
    if (t.bg) document.getElementById('brBg').value = t.bg;
    if (t.panel) document.getElementById('brPanel').value = t.panel;
    if (t.text) document.getElementById('brText').value = t.text;
    msg.textContent = `Current theme for ${d.label} loaded.` + (Object.keys(t).length ? ' (custom)' : ' (default)');
  }catch(e){ msg.textContent = 'Failed to load theme.'; }
};
window.saveBranding = async function(){
  const theme = {
    logoText: document.getElementById('brLogo').value.trim(),
    primary: document.getElementById('brPrimary').value,
    accent: document.getElementById('brAccent').value,
    bg: document.getElementById('brBg').value,
    panel: document.getElementById('brPanel').value,
    text: document.getElementById('brText').value,
  };
  try{
    const res = await fetch(`/tenants/${currentTenant}/theme`, {method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({theme})});
    const d = await res.json();
    applyTheme(d.theme);
    document.getElementById('brandingMsg').textContent = '✓ Theme saved + applied.';
  }catch(e){ document.getElementById('brandingMsg').textContent = '✗ Save failed.'; }
};
window.resetBranding = async function(){
  if (!confirm('Reset theme to default?')) return;
  try{
    await fetch(`/tenants/${currentTenant}/theme`, {method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({theme:{}})});
    applyTheme({});
    document.getElementById('brLogo').value = '';
    document.getElementById('brandingMsg').textContent = '✓ Reset to default.';
  }catch(e){ document.getElementById('brandingMsg').textContent = '✗ Reset failed.'; }
};

// ---------- Customer portal (Phase 5b) ----------
window.loadPortal = async function(){
  const customer = document.getElementById('portalCustomer').value.trim();
  const out = document.getElementById('portalOut');
  if (!customer){ out.innerHTML = '<span style="color:var(--amber)">Enter a customer name.</span>'; return; }
  out.innerHTML = '<span style="color:var(--muted)">Loading…</span>';
  try{
    const res = await fetch('/portal/overview', { headers: { 'x-tenant-id': currentTenant, 'x-customer': customer } });
    const d = await res.json();
    if (d.error){ out.innerHTML = '<span style="color:var(--red)">' + esc(d.error) + '</span>'; return; }
    const k = d.kpi || {};
    let html = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <div class="kpi" style="--c:var(--teal)"><div class="lbl">My Orders</div><div class="val">${k.orders||0}</div></div>
      <div class="kpi" style="--c:var(--amber)"><div class="lbl">Total MT</div><div class="val">${(k.mt||0).toFixed(1)}</div></div>
      <div class="kpi" style="--c:var(--green)"><div class="lbl">Revenue</div><div class="val">$${((k.revenue||0)/1e6).toFixed(2)}M</div></div>
      <div class="kpi" style="--c:var(--red)"><div class="lbl">Open Issues</div><div class="val">${d.issues.length}</div></div></div>`;
    html += d.orders.length ? `<table class="tbl"><thead><tr><th>Order</th><th>Grade</th><th>MT</th><th>FCL</th><th>Price</th><th>Status</th><th>Date</th></tr></thead><tbody>${d.orders.map(o=>`<tr><td>${esc(o.order_id)}</td><td>${esc(o.grade)}</td><td>${o.mt}</td><td>${o.fcl}</td><td>$${o.price_usd}</td><td><span class="tag">${esc(o.status)}</span></td><td style="color:var(--muted)">${o.date||''}</td></tr>`).join('')}</tbody></table>` : '<span style="color:var(--muted)">No orders found for this customer.</span>';
    if (d.issues.length) html += `<h4 style="margin:14px 0 6px">My Issues</h4><table class="tbl"><thead><tr><th>ID</th><th>Category</th><th>Status</th><th>Description</th></tr></thead><tbody>${d.issues.map(i=>`<tr><td>${esc(i.ticket_id)}</td><td>${esc(i.category)}</td><td><span class="tag">${esc(i.status)}</span></td><td>${esc(i.description)}</td></tr>`).join('')}</tbody></table>`;
    out.innerHTML = html;
  }catch(e){ out.innerHTML = '<span style="color:var(--red)">Portal failed.</span>'; }
};

// ---------- Global Search ----------
window.runSearch = async function(){
  const inp = document.getElementById('searchQ');
  const out = document.getElementById('searchOut');
  const q = inp.value.trim(); if (!q) return;
  out.innerHTML = '<span style="color:var(--muted)">Searching…</span>';
  try{
    const res = await fetch('/search?q=' + encodeURIComponent(q), { headers: { 'x-tenant-id': currentTenant } });
    const d = await res.json();
    const sect = (title, rows, fmt) => rows.length
      ? `<div style="margin-top:12px"><b style="color:var(--text)">${title} (${rows.length})</b>${rows.map(fmt).join('')}</div>` : '';
    const row = (html) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${html}</div>`;
    let html =
      sect('Orders', d.records, r => row(`<span class="tag">${esc(r.order_id)}</span> ${esc(r.customer)} · ${esc(r.grade)} · ${r.mt} MT · ${esc(r.status)}`)) +
      sect('Parties', d.parties, r => row(`${esc(r.name)} <span class="tag teal">${esc(r.type)}</span>`)) +
      sect('Issues', d.tickets, r => row(`<span class="tag amber">${esc(r.ticket_id)}</span> ${esc(r.snippet)} <span class="tag">${esc(r.status)}</span>`)) +
      sect('Feed', d.feed, r => row(`<span class="tag">${esc(r.category)}</span> ${esc(r.title)}`)) +
      sect('Semantic matches', d.semantic, r => row(`<span class="tag teal">${esc(r.source_type)}</span> ${esc(r.snippet)} <span style="color:var(--muted)">(${(r.score*100).toFixed(0)}%)</span>`));
    out.innerHTML = html || '<span style="color:var(--muted)">No results for “' + esc(q) + '”.</span>';
  }catch(e){ out.innerHTML = '<span style="color:var(--red)">Search failed.</span>'; }
};

// ---------- Screen Config editor ----------
let cfgPanels = [];
const PANEL_SOURCES = ['open_orders','active_mt','suppliers','customers','open_issues','orders','issues','feed'];
const PANEL_TYPES = ['kpi','table','feed','chart'];
window.renderCfgPanels = function(){
  const el = document.getElementById('cfgPanels');
  if (!el) return;
  el.innerHTML = cfgPanels.map((p,i)=>`
    <div class="cfg-row">
      <select data-i="${i}" data-k="type">${PANEL_TYPES.map(t=>`<option ${p.type===t?'selected':''}>${t}</option>`).join('')}</select>
      <input data-i="${i}" data-k="source" value="${esc(p.source||'')}" placeholder="source">
      <input data-i="${i}" data-k="title" value="${esc(p.title||'')}" placeholder="title">
      <button class="btn sm" onclick="rmPanel(${i})">✕</button>
    </div>`).join('') || '<span style="color:var(--muted);font-family:var(--font-m);font-size:12px">No panels — add one.</span>';
  el.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', e => {
    cfgPanels[+e.target.dataset.i][e.target.dataset.k] = e.target.value;
  }));
};
window.addPanel = function(){ cfgPanels.push({type:'kpi', source:'open_orders', title:'New KPI'}); window.renderCfgPanels(); };
window.rmPanel = function(i){ cfgPanels.splice(i,1); window.renderCfgPanels(); };
window.saveConfig = async function(){
  const msg = document.getElementById('cfgMsg');
  try{
    const r = await fetch('/data/screen-config', {method:'PUT', headers:{'content-type':'application/json','x-tenant-id':currentTenant}, body: JSON.stringify({screen:'dashboard', config:{panels:cfgPanels}})});
    const d = await r.json();
    msg.textContent = `✓ Saved (id ${d.id}). Dashboard will use this layout.`;
  }catch(e){ msg.textContent = 'Save failed — BFF unreachable.'; }
};
async function loadConfig(){
  try{
    const r = await fetch('/data/screen-config?screen=dashboard', {headers:{'x-tenant-id':currentTenant}});
    const d = await r.json();
    if (d.config?.panels){ cfgPanels = d.config.panels; }
  }catch(e){}
  window.renderCfgPanels();
}
// Hook: when config screen renders, load + render panels.
const _render = render;
render = function(id){ _render(id); if (id==='config') loadConfig(); if (id==='branding') loadBranding(); if (id==='insights') loadLatestInsights(); };

// ---------- Import / Export ----------
window.exportData = function(){
  const a = document.createElement('a');
  a.href = `/data/export?type=records&x=${currentTenant}`;
  a.setAttribute('download', `records-${currentTenant}.xlsx`);
  // Use fetch to attach tenant header, then download blob.
  fetch('/data/export?type=records', {headers:{'x-tenant-id':currentTenant}})
    .then(r => r.blob()).then(b => {
      const u = URL.createObjectURL(b);
      a.href = u; a.click(); URL.revokeObjectURL(u);
    });
};
window.importData = async function(input){
  const f = input.files[0]; if (!f) return;
  const msg = document.getElementById('cfgMsg');
  const fd = new FormData(); fd.append('type','records'); fd.append('file', f);
  try{
    const r = await fetch('/data/import', {method:'POST', headers:{'x-tenant-id':currentTenant}, body: fd});
    const d = await r.json();
    msg.textContent = d.imported ? `✓ Imported ${d.imported} ${d.type}` : `Import: ${JSON.stringify(d)}`;
    loadLiveData().then(()=>route());
  }catch(e){ msg.textContent = 'Import failed.'; }
};

// ---------- Ticker ----------
const track = document.getElementById('tickerTrack');
const items = DATA.ticker.map(([sym,p,chg,dir]) =>
  `<span><b>${sym}</b> ${p} <span class="${dir}">${chg}</span></span>`);
track.innerHTML = items.join('') + items.join(''); // duplicate for seamless loop

// ---------- Theme toggle ----------
document.getElementById('themeBtn').addEventListener('click', () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
  charts.forEach(c => c.dispose()); charts.length = 0;
  initCharts();
});

// ---------- Per-tenant white-label branding (Phase 5a) ----------
// theme = {primary, accent, bg, panel, text, logoText} — overrides CSS vars live.
function applyTheme(theme){
  const root = document.documentElement;
  const vars = { primary:'--teal', accent:'--amber', bg:'--bg', bg2:'--bg2', panel:'--panel', panel2:'--panel2', text:'--text' };
  // Clear any prior branding overrides so toggling tenants reverts cleanly.
  Object.values(vars).forEach(v => root.style.removeProperty(v));
  if (theme.primary) root.style.setProperty('--teal', theme.primary);
  if (theme.accent) root.style.setProperty('--amber', theme.accent);
  if (theme.bg) { root.style.setProperty('--bg', theme.bg); root.style.setProperty('--bg2', theme.bg); }
  if (theme.panel) { root.style.setProperty('--panel', theme.panel); root.style.setProperty('--panel2', theme.panel); }
  if (theme.text) root.style.setProperty('--text', theme.text);
  if (theme.logoText){
    const name = document.querySelector('.brand-name');
    const mark = document.querySelector('.brand-mark');
    if (name) name.textContent = theme.logoText;
    if (mark) mark.textContent = theme.logoText.slice(0,2).toUpperCase();
  }
  // Re-render charts with new colors.
  if (charts.length){ charts.forEach(c => c.dispose()); charts.length = 0; initCharts(); }
}

// ---------- Mobile menu ----------
const sidebar = document.getElementById('sidebar');
const scrim = document.getElementById('scrim');
document.getElementById('menuBtn').addEventListener('click', () => {
  sidebar.classList.toggle('open'); scrim.classList.toggle('on');
});
scrim.addEventListener('click', () => { sidebar.classList.remove('open'); scrim.classList.remove('on'); });
window.addEventListener('hashchange', () => { sidebar.classList.remove('open'); scrim.classList.remove('on'); });

// ---------- Search (demo) ----------
document.getElementById('globalSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.value.trim()){
    content.innerHTML = `<div class="card span-12"><h3>Search: “${e.target.value}”</h3>
      <p style="color:var(--muted);font-family:var(--font-m);font-size:12px">Hybrid search (keyword + semantic) lands in Phase 2 — powered by pgvector + tsvector + trigram.</p></div>`;
  }
});

// ---------- Tenant select (live switch) ----------
const TENANT_MAP = { 'RubberTrack Demo':'rubbertrack', 'Lexley Rubber':'lexley', 'Tiong Huat Trading':'tiong' };
const TENANT_LABEL = Object.fromEntries(Object.entries(TENANT_MAP).map(([k,v])=>[v,k]));
document.getElementById('tenantSelect').addEventListener('change', e => {
  const id = TENANT_MAP[e.target.value] || 'rubbertrack';
  currentTenant = id;
  document.getElementById('tenantName').textContent = e.target.value;
  loadLiveData().then(()=>route());
});
let currentTenant = 'rubbertrack';

// ---------- Live data loader (BFF → Postgres RLS) ----------
// Fetches from the BFF and merges into DATA. Falls back to static data if the
// BFF is unreachable, so the preview never breaks offline. Layout adapts to
// whatever data shape arrives (counts, columns auto-driven).
// BFF serves both the static UI and /data/* on the same origin (single tunnel).
const BFF = '';
async function loadLiveData(){
  try{
    const hdr = { 'x-tenant-id': currentTenant };
    const dash = await fetch(`${BFF}/data/dashboard`, {headers:hdr}).then(r=>r.json());
    const parts = await fetch(`${BFF}/data/parties`, {headers:hdr}).then(r=>r.json()).catch(()=>({}));
    if (dash.kpi){
      DATA.kpis = [
        { lbl:'Open Orders', val:+dash.kpi.open_orders, sub:'live from BFF', dir:'up', c:'--amber' },
        { lbl:'Active MT',   val:(+dash.kpi.active_mt).toFixed(1), sub:'across FCL', dir:'up', c:'--teal' },
        { lbl:'Revenue (Aug)', val:'$1.28M', sub:'est.', dir:'down', c:'--green' },
        { lbl:'Open Issues', val:+dash.kpi.open_issues, sub:'quality · doc · ship', dir:'down', c:'--red' },
        { lbl:'Suppliers', val:dash.kpi.suppliers, sub:'live', dir:'up', c:'--amber' },
        { lbl:'Customers', val:dash.kpi.customers, sub:'live', dir:'up', c:'--teal' },
      ];
      DATA.orders = dash.orders.map(o=>[o.order_id,o.customer,o.supplier,o.grade,o.mt,o.fcl,o.price_usd,o.status]);
      DATA.issues = dash.issues.map(i=>[i.ticket_id,i.category,i.description,i.status]);
      DATA.feed = dash.feed.map(f=>[['⚡','◉','⚠','✓','▤'][['price','order','issue','doc','news'].indexOf(f.category)]||'◆', f.title, timeAgo(f.published_at)]);
    }
    if (parts.suppliers) DATA.suppliers = parts.suppliers;
    if (parts.customers) DATA.customers = parts.customers;
    // Phase 5a: apply per-tenant white-label branding (theme.json from DB).
    const themeRes = await fetch(`${BFF}/tenants/${currentTenant}/theme`).then(r=>r.json()).catch(()=>null);
    applyTheme(themeRes?.theme || {});
    // KPI charts (Phase 2a): trend + grades + issue mix from the KPI engine.
    const [trend, grades, issueKpi] = await Promise.all([
      fetch(`${BFF}/data/kpi/trend`, {headers:hdr}).then(r=>r.json()).catch(()=>null),
      fetch(`${BFF}/data/kpi/grades`, {headers:hdr}).then(r=>r.json()).catch(()=>null),
      fetch(`${BFF}/data/kpi/issues`, {headers:hdr}).then(r=>r.json()).catch(()=>null),
    ]);
    if (trend?.months?.length){
      DATA.trendMonths = trend.months.map(m => new Date(m+'-01').toLocaleString('en',{month:'short'}));
      DATA.trendMT = trend.mt;
      DATA.trendRev = trend.revenue.map(v => +(v/1e6).toFixed(3));
    }
    if (grades?.grades?.length) DATA.grades = grades.grades.map(g => ({name:g.grade, mt:g.mt}));
    if (issueKpi?.by_category?.length) DATA.issueMix = issueKpi.by_category;
    DATA.tenant = TENANT_LABEL[currentTenant] || currentTenant;
  }catch(e){ console.warn('BFF unreachable, using static data', e); }
}
function timeAgo(iso){
  const d=(Date.now()-new Date(iso).getTime())/1000;
  if (d<3600) return Math.round(d/60)+'m ago';
  if (d<86400) return Math.round(d/3600)+'h ago';
  return Math.round(d/86400)+'d ago';
}

// Initial load — called last so all functions/vars are defined (TDZ-safe).
loadLiveData().then(()=>route()).catch(()=>route());

// Auto-refresh: poll live data every 30s and re-render the current view if the
// data changed. Keeps KPIs/charts fresh without a manual refresh. Skipped when
// the tab is hidden (Page Visibility API) to avoid wasted fetches.
setInterval(() => {
  if (document.hidden) return;
  loadLiveData().then(() => {
    const id = (location.hash.split('/')[1] || 'dashboard');
    // Only re-render data-driven views; editing views (config) manage their own state.
    if (['dashboard','orders','issues','suppliers','customers','agenda'].includes(id)) render(id);
  }).catch(() => {});
}, 30000);
