// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const TABS = [
    { id: 'home',         label: 'Home' },
    { id: 'activiteiten', label: 'Activiteiten' },
    { id: 'week',         label: 'Week' },
    { id: 'coach',        label: 'Coach' },
    { id: 'statistieken', label: 'Statistieken' },
];

// ─────────────────────────────────────────
// DATA (later vervangen door echte Garmin data)
// ─────────────────────────────────────────
const data = {
    caloriesBurned: 487,
    caloriesGoal: 700,
    steps: 6240,
    stepsGoal: 10000,
    heartrate: 72,
    nextTraining: { name: 'Duurloop', time: '07:00', distance: '8 km', emoji: '🏃' },
    week: [
        { day: 'Ma', pct: 90, done: true },
        { day: 'Di', pct: 60, done: true },
        { day: 'Wo', pct: 75, done: true },
        { day: 'Do', pct: 40, today: true },
        { day: 'Vr', pct: 0 },
        { day: 'Za', pct: 0 },
        { day: 'Zo', pct: 0 },
    ],
    weekStats: [
        { label: 'Totale calorieën', value: '1.840 kcal' },
        { label: 'Trainingen',       value: '3 / 5' },
        { label: 'Actieve tijd',     value: '2u 45m' },
        { label: 'Afstand',          value: '18.4 km' },
    ],
    coachTips: [
        { icon: '💡', label: 'Tip van de dag',   text: 'Je hebt deze week al 3 trainingen gedaan. Zorg voor een rustdag morgen om herstel te bevorderen voor je weekendtraining.' },
        { icon: '🎯', label: 'Doel deze week',   text: 'Nog 2 trainingen te gaan. Een duurloop van 8 km en een korte intervaltraining van 5 km zouden perfect zijn.' },
        { icon: '⚡', label: 'Aandachtspunt',    text: 'Je gemiddelde hartslag tijdens training lag deze week iets hoger. Overweeg je tempo iets te verlagen bij de volgende duurloop.' },
    ],
    statBars: [
        { label: 'Ma', pct: 90,  val: '700' },
        { label: 'Di', pct: 55,  val: '430' },
        { label: 'Wo', pct: 75,  val: '580' },
        { label: 'Do', pct: 40,  val: '310' },
    ],
};

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function greeting() {
    const hour = new Date().getHours();
    if (hour < 6)  return 'Goedenacht';
    if (hour < 12) return 'Goedemorgen';
    if (hour < 18) return 'Goedemiddag';
    return 'Goedenavond';
}

function todayName() {
    const days = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
    return days[new Date().getDay()];
}

// ─────────────────────────────────────────
// RENDER TABS
// ─────────────────────────────────────────
function renderTabs() {
    const nav = document.getElementById('topnav');
    nav.innerHTML = TABS.map(t => `
    <div class="tab ${t.id === 'home' ? 'active' : ''}" onclick="showTab('${t.id}', this)">
      ${t.label}
    </div>
  `).join('');
}

// ─────────────────────────────────────────
// RENDER PAGES
// ─────────────────────────────────────────
function renderPages() {
    const app = document.getElementById('app');
    app.innerHTML = TABS.map(t => `
    <div class="page ${t.id === 'home' ? 'active' : ''}" id="page-${t.id}">
      ${renderPage(t.id)}
      <div class="bottom-safe"></div>
    </div>
  `).join('');
}

function renderPage(id) {
    switch(id) {
        case 'home':         return renderHome();
        case 'activiteiten': return renderActiviteiten();
        case 'week':         return renderWeek();
        case 'coach':        return renderCoach();
        case 'statistieken': return renderStatistieken();
    }
}

// ─────────────────────────────────────────
// HOME
// ─────────────────────────────────────────
function renderHome() {
    const remaining = data.caloriesGoal - data.caloriesBurned;
    const pct = data.caloriesBurned / data.caloriesGoal;
    const offset = 502 * (1 - pct);
    const stepPct = Math.round(data.steps / data.stepsGoal * 100);

    return `
    <div class="greeting">
      <div class="day">${todayName()}</div>
      <h1>${greeting()}, <span>Atleet</span></h1>
    </div>

    <div class="ring-section">
      <div class="ring-wrap">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#ff6a00"/>
              <stop offset="100%" style="stop-color:#e8001d"/>
            </linearGradient>
          </defs>
          <circle class="ring-bg" cx="100" cy="100" r="80"/>
          <circle class="ring-fill" cx="100" cy="100" r="80" id="calRing" style="stroke-dashoffset:502"/>
        </svg>
        <div class="ring-center">
          <div class="cal-burned">${data.caloriesBurned}</div>
          <div class="cal-label">kcal verbrand</div>
          <div class="cal-goal">doel: <span>${data.caloriesGoal}</span> kcal</div>
        </div>
      </div>
      <div class="ring-subtitle">Nog <b>${remaining} kcal</b> te gaan vandaag</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="icon">👟</div>
        <div class="value">${data.steps.toLocaleString('nl-BE')}</div>
        <div class="label">Stappen</div>
        <div class="bar-wrap"><div class="bar-fill" style="width:${stepPct}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="icon">❤️</div>
        <div class="value">${data.heartrate}</div>
        <div class="label">Hartslag</div>
        <div class="sub">rust · normaal</div>
      </div>
    </div>

    <div class="next-training">
      <div class="training-icon">${data.nextTraining.emoji}</div>
      <div class="training-info">
        <div class="label">Volgende training</div>
        <div class="name">${data.nextTraining.name}</div>
        <div class="meta">Morgen om <span>${data.nextTraining.time}</span> · ${data.nextTraining.distance}</div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────
// ACTIVITEITEN
// ─────────────────────────────────────────
function renderActiviteiten() {
    return `
    <div class="page-title"><span>Activiteiten</span></div>
    <div class="empty-state">
      <div class="emoji">📂</div>
      <p>Nog geen activiteiten geladen.<br>We koppelen dit later aan Garmin.</p>
      <div class="coming-soon-badge">Komt binnenkort</div>
    </div>
  `;
}

// ─────────────────────────────────────────
// WEEK
// ─────────────────────────────────────────
function renderWeek() {
    const bars = data.week.map(d => `
    <div class="week-day ${d.done ? 'done' : ''} ${d.today ? 'today' : ''}">
      <div class="day-label">${d.day}</div>
      <div class="day-bar-wrap">
        <div class="day-bar" style="height:${d.pct}%"></div>
      </div>
      <div class="day-dot"></div>
    </div>
  `).join('');

    const rows = data.weekStats.map(s => `
    <div class="week-stat-row">
      <span class="wlabel">${s.label}</span>
      <span class="wval">${s.value}</span>
    </div>
  `).join('');

    return `
    <div class="page-title"><span>Week</span> overzicht</div>
    <div class="week-grid">${bars}</div>
    <div class="week-summary">
      <h3>Deze week</h3>
      ${rows}
    </div>
  `;
}

// ─────────────────────────────────────────
// COACH
// ─────────────────────────────────────────
function renderCoach() {
    const tips = data.coachTips.map(t => `
    <div class="coach-tip">
      <div class="tip-label">${t.icon} ${t.label}</div>
      <p>${t.text}</p>
    </div>
  `).join('');

    return `
    <div class="page-title"><span>Coach</span></div>
    <div class="coach-header">
      <div class="coach-avatar">🤖</div>
      <h2>Jouw AI Coach</h2>
      <p>Persoonlijk advies op basis van jouw Garmin data</p>
      <div class="coming-soon-badge">AI koppeling komt binnenkort</div>
    </div>
    ${tips}
  `;
}

// ─────────────────────────────────────────
// STATISTIEKEN
// ─────────────────────────────────────────
function renderStatistieken() {
    const bars = data.statBars.map(b => `
    <div class="mini-bar-row">
      <div class="mini-bar-label">${b.label}</div>
      <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${b.pct}%"></div></div>
      <div class="mini-bar-val">${b.val}</div>
    </div>
  `).join('');

    return `
    <div class="page-title"><span>Statistieken</span></div>
    <div class="stat-big-card">
      <h3>Calorieën deze maand</h3>
      <span class="big-num">8.240</span><span class="big-num-unit">kcal</span>
      ${bars}
    </div>
    <div class="stat-big-card">
      <h3>Gemiddelde hartslag</h3>
      <span class="big-num">68</span><span class="big-num-unit">bpm rust</span>
      <div style="font-size:13px;color:var(--muted);margin-top:8px;">
        Max deze week: <span style="color:var(--orange);font-weight:600;">162 bpm</span>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────
function showTab(id, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('page-' + id).classList.add('active');
    if (id === 'home') animateRing();
}

// ─────────────────────────────────────────
// RING ANIMATION
// ─────────────────────────────────────────
function animateRing() {
    const ring = document.getElementById('calRing');
    if (!ring) return;
    const pct = data.caloriesBurned / data.caloriesGoal;
    const offset = 502 * (1 - pct);
    setTimeout(() => { ring.style.strokeDashoffset = offset; }, 300);
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
function init() {
    renderTabs();
    renderPages();
    animateRing();
}

init();