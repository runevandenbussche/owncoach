// ─────────────────────────────────────────
// TABS CONFIG
// ─────────────────────────────────────────
const TABS = [
    { id: 'home',         label: 'Home' },
    { id: 'activiteiten', label: 'Activiteiten' },
    { id: 'week',         label: 'Week' },
    { id: 'coach',        label: 'Coach' },
    { id: 'statistieken', label: 'Statistieken' },
];

// ─────────────────────────────────────────
// STRAVA API
// ─────────────────────────────────────────
let accessToken = null;
let stravaActivities = [];
let stravaStats = null;
let athleteId = null;

async function getAccessToken() {
    const res = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id:     CONFIG.STRAVA_CLIENT_ID,
            client_secret: CONFIG.STRAVA_CLIENT_SECRET,
            refresh_token: CONFIG.STRAVA_REFRESH_TOKEN,
            grant_type:    'refresh_token',
        }),
    });
    const data = await res.json();
    accessToken = data.access_token;
    athleteId   = data.athlete?.id;
    return accessToken;
}

async function fetchActivities() {
    const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${weekAgo}&per_page=20`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    stravaActivities = await res.json();
}

async function fetchAthleteStats() {
    if (!athleteId) return;
    const res = await fetch(
        `https://www.strava.com/api/v3/athletes/${athleteId}/stats`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    stravaStats = await res.json();
}

async function loadStravaData() {
    try {
        await getAccessToken();
        await Promise.all([fetchActivities(), fetchAthleteStats()]);
        renderPages();
        animateRing();
    } catch (e) {
        console.error('Strava fout:', e);
    }
}

// ─────────────────────────────────────────
// GROQ AI COACH
// ─────────────────────────────────────────
async function fetchAICoachAdvice() {
    const count = stravaActivities.length;
    const totalCal = stravaActivities.reduce((s, a) => s + (a.calories || 0), 0);
    const totalDist = stravaActivities.reduce((s, a) => s + (a.distance || 0), 0);
    const totalTime = stravaActivities.reduce((s, a) => s + (a.moving_time || 0), 0);
    const avgHR = stravaActivities.filter(a => a.average_heartrate).length
        ? Math.round(stravaActivities.reduce((s, a) => s + (a.average_heartrate || 0), 0) / stravaActivities.filter(a => a.average_heartrate).length)
        : null;

    const activitiesSummary = stravaActivities.map(a =>
        `- ${a.name} (${a.type}): ${(a.distance/1000).toFixed(1)}km, ${Math.round(a.moving_time/60)}min, ${a.calories || '?'} cal${a.average_heartrate ? `, ${Math.round(a.average_heartrate)} bpm gem` : ''}`
    ).join('\n');

    const prompt = `Je bent een persoonlijke sportcoach. Analyseer deze trainingsdata van de afgelopen week en geef kort, motiverend advies in het Nederlands.

Activiteiten deze week (${count} totaal):
${activitiesSummary || 'Geen activiteiten deze week'}

Totaal: ${(totalDist/1000).toFixed(1)}km, ${Math.round(totalTime/60)} min, ${totalCal} kcal${avgHR ? `, gem hartslag ${avgHR} bpm` : ''}

Geef je antwoord in dit JSON formaat (geen markdown, alleen JSON):
{
  "samenvatting": "Korte samenvatting van de week in 1-2 zinnen",
  "tips": [
    {"icon": "emoji", "titel": "Korte titel", "tekst": "Advies in 1-2 zinnen"},
    {"icon": "emoji", "titel": "Korte titel", "tekst": "Advies in 1-2 zinnen"},
    {"icon": "emoji", "titel": "Korte titel", "tekst": "Advies in 1-2 zinnen"}
  ],
  "volgende_stap": "Wat moet de atleet nu concreet doen deze week?"
}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'llama3-8b-8192',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 600,
        }),
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function greeting() {
    const h = new Date().getHours();
    if (h < 6)  return 'Goedenacht';
    if (h < 12) return 'Goedemorgen';
    if (h < 18) return 'Goedemiddag';
    return 'Goedenavond';
}

function todayName() {
    return ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'][new Date().getDay()];
}

function activityEmoji(type) {
    const map = { Run: '🏃', Ride: '🚴', Swim: '🏊', Walk: '🚶', Hike: '🥾', WeightTraining: '🏋️' };
    return map[type] || '⚡';
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

function formatDistance(meters) {
    return (meters / 1000).toFixed(1) + ' km';
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────
// WEEK DATA
// ─────────────────────────────────────────
function getWeekData() {
    const days = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
    const today = new Date().getDay();
    const todayIdx = today === 0 ? 6 : today - 1;
    const weekData = days.map((d, i) => ({ day: d, cal: 0, done: false, today: i === todayIdx }));
    stravaActivities.forEach(a => {
        const d = new Date(a.start_date_local);
        const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        weekData[dayIdx].cal += a.calories || 0;
        weekData[dayIdx].done = true;
    });
    const maxCal = Math.max(...weekData.map(d => d.cal), 1);
    weekData.forEach(d => { d.pct = Math.round((d.cal / maxCal) * 100); });
    return weekData;
}

function getTodayStats() {
    const today = new Date().toDateString();
    const todayActs = stravaActivities.filter(a => new Date(a.start_date_local).toDateString() === today);
    return {
        calories: todayActs.reduce((s, a) => s + (a.calories || 0), 0),
        heartrate: todayActs.length ? Math.round(todayActs.reduce((s, a) => s + (a.average_heartrate || 0), 0) / todayActs.length) : null,
        count: todayActs.length,
    };
}

function getWeekStats() {
    const total = stravaActivities.reduce((s, a) => ({
        cal:      s.cal + (a.calories || 0),
        distance: s.distance + (a.distance || 0),
        time:     s.time + (a.moving_time || 0),
        count:    s.count + 1,
    }), { cal: 0, distance: 0, time: 0, count: 0 });
    return [
        { label: 'Totale calorieën', value: total.cal ? `${total.cal.toLocaleString('nl-BE')} kcal` : '—' },
        { label: 'Trainingen',       value: `${total.count}` },
        { label: 'Actieve tijd',     value: total.time ? formatDuration(total.time) : '—' },
        { label: 'Afstand',          value: total.distance ? formatDistance(total.distance) : '—' },
    ];
}

function getNextTraining() {
    const today = new Date().toDateString();
    const todayActs = stravaActivities.filter(a => new Date(a.start_date_local).toDateString() === today);
    if (todayActs.length === 0) return { name: 'Geen training vandaag', time: '—', distance: '—', emoji: '😴' };
    return { name: 'Duurloop', time: '07:00', distance: '8 km', emoji: '🏃' };
}

// ─────────────────────────────────────────
// RENDER TABS
// ─────────────────────────────────────────
function renderTabs() {
    document.getElementById('topnav').innerHTML = TABS.map(t => `
    <div class="tab ${t.id === 'home' ? 'active' : ''}" onclick="showTab('${t.id}', this)">
      ${t.label}
    </div>
  `).join('');
}

// ─────────────────────────────────────────
// RENDER PAGES
// ─────────────────────────────────────────
function renderPages() {
    document.getElementById('app').innerHTML = TABS.map(t => `
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
    const today = getTodayStats();
    const caloriesGoal = 700;
    const burned = today.calories || 0;
    const remaining = Math.max(caloriesGoal - burned, 0);
    const next = getNextTraining();

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
          <circle class="ring-fill" cx="100" cy="100" r="80" id="calRing"
            data-burned="${burned}" data-goal="${caloriesGoal}"
            style="stroke-dashoffset:502"/>
        </svg>
        <div class="ring-center">
          <div class="cal-burned">${burned}</div>
          <div class="cal-label">kcal verbrand</div>
          <div class="cal-goal">doel: <span>${caloriesGoal}</span> kcal</div>
        </div>
      </div>
      <div class="ring-subtitle">Nog <b>${remaining} kcal</b> te gaan vandaag</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="icon">❤️</div>
        <div class="value">${today.heartrate ?? '—'}</div>
        <div class="label">Hartslag</div>
        <div class="sub">${today.heartrate ? 'gem. vandaag' : 'geen data'}</div>
      </div>
      <div class="stat-card">
        <div class="icon">🏃</div>
        <div class="value">${today.count}</div>
        <div class="label">Trainingen vandaag</div>
        <div class="sub">deze week: ${stravaActivities.length}</div>
      </div>
    </div>
    <div class="next-training">
      <div class="training-icon">${next.emoji}</div>
      <div class="training-info">
        <div class="label">Volgende training</div>
        <div class="name">${next.name}</div>
        <div class="meta">${next.time !== '—' ? `Morgen om <span>${next.time}</span> · ${next.distance}` : 'Rust dag vandaag'}</div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────
// ACTIVITEITEN
// ─────────────────────────────────────────
function renderActiviteiten() {
    if (!stravaActivities.length) {
        return `
      <div class="page-title"><span>Activiteiten</span></div>
      <div class="empty-state">
        <div class="emoji">📂</div>
        <p>Geen activiteiten gevonden<br>deze week.</p>
      </div>
    `;
    }
    const items = stravaActivities.map(a => `
    <div class="activity-item">
      <div class="activity-dot">${activityEmoji(a.type)}</div>
      <div class="activity-info">
        <div class="name">${a.name}</div>
        <div class="date">${formatDate(a.start_date_local)} · ${formatDuration(a.moving_time)}</div>
        ${a.average_heartrate ? `<div class="date">❤️ ${Math.round(a.average_heartrate)} bpm gem.</div>` : ''}
      </div>
      <div class="activity-stats">
        <div class="cal">${a.calories ? a.calories + ' cal' : '—'}</div>
        <div class="dist">${formatDistance(a.distance)}</div>
      </div>
    </div>
  `).join('');
    return `
    <div class="page-title"><span>Activiteiten</span></div>
    ${items}
  `;
}

// ─────────────────────────────────────────
// WEEK
// ─────────────────────────────────────────
function renderWeek() {
    const weekData = getWeekData();
    const weekStats = getWeekStats();
    const bars = weekData.map(d => `
    <div class="week-day ${d.done ? 'done' : ''} ${d.today ? 'today' : ''}">
      <div class="day-label">${d.day}</div>
      <div class="day-bar-wrap">
        <div class="day-bar" style="height:${d.pct}%"></div>
      </div>
      <div class="day-dot"></div>
    </div>
  `).join('');
    const rows = weekStats.map(s => `
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
    return `
    <div class="page-title"><span>Coach</span></div>
    <div class="coach-header">
      <div class="coach-avatar">🤖</div>
      <h2>Jouw AI Coach</h2>
      <p>Gebaseerd op jouw Strava data deze week</p>
    </div>
    <div id="coach-content">
      <div class="empty-state">
        <div class="emoji">⏳</div>
        <p>Coach is aan het analyseren...</p>
      </div>
    </div>
    <button class="coach-btn" onclick="refreshCoach()">🔄 Nieuw advies</button>
  `;
}

async function refreshCoach() {
    const el = document.getElementById('coach-content');
    if (!el) return;
    el.innerHTML = `
    <div class="empty-state">
      <div class="emoji">⏳</div>
      <p>Coach is aan het analyseren...</p>
    </div>
  `;
    const advice = await fetchAICoachAdvice();
    if (!advice) {
        el.innerHTML = `<div class="empty-state"><div class="emoji">😕</div><p>Kon geen advies ophalen.<br>Probeer opnieuw.</p></div>`;
        return;
    }
    const tipsHtml = (advice.tips || []).map(t => `
    <div class="coach-tip">
      <div class="tip-label">${t.icon} ${t.titel}</div>
      <p>${t.tekst}</p>
    </div>
  `).join('');
    el.innerHTML = `
    <div class="coach-tip" style="border-left-color: var(--red)">
      <div class="tip-label">📊 Samenvatting</div>
      <p>${advice.samenvatting}</p>
    </div>
    ${tipsHtml}
    <div class="coach-tip" style="border-left-color: #00c853">
      <div class="tip-label">🎯 Volgende stap</div>
      <p>${advice.volgende_stap}</p>
    </div>
  `;
}

// ─────────────────────────────────────────
// STATISTIEKEN
// ─────────────────────────────────────────
function renderStatistieken() {
    const recent = stravaActivities.slice(0, 4);
    const maxCal = Math.max(...recent.map(a => a.calories || 0), 1);
    const bars = recent.map(a => `
    <div class="mini-bar-row">
      <div class="mini-bar-label">${activityEmoji(a.type)}</div>
      <div class="mini-bar-track">
        <div class="mini-bar-fill" style="width:${Math.round(((a.calories||0)/maxCal)*100)}%"></div>
      </div>
      <div class="mini-bar-val">${a.calories || '—'}</div>
    </div>
  `).join('');
    const totalDist = stravaStats?.all_run_totals?.distance
        ? formatDistance(stravaStats.all_run_totals.distance)
        : '—';
    return `
    <div class="page-title"><span>Statistieken</span></div>
    <div class="stat-big-card">
      <h3>Calorieën per activiteit (deze week)</h3>
      ${bars || '<p style="color:var(--muted);font-size:14px;">Geen data</p>'}
    </div>
    <div class="stat-big-card">
      <h3>Totale afstand ooit (lopen)</h3>
      <span class="big-num">${totalDist}</span>
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
    if (id === 'coach') refreshCoach();
}

// ─────────────────────────────────────────
// RING ANIMATION
// ─────────────────────────────────────────
function animateRing() {
    const ring = document.getElementById('calRing');
    if (!ring) return;
    const burned = parseFloat(ring.dataset.burned) || 0;
    const goal   = parseFloat(ring.dataset.goal)   || 700;
    const offset = 502 * (1 - Math.min(burned / goal, 1));
    setTimeout(() => { ring.style.strokeDashoffset = offset; }, 300);
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
async function init() {
    renderTabs();
    renderPages();
    await loadStravaData();
    refreshCoach();
}

init();