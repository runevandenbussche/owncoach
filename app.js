// ─────────────────────────────────────────
// CONFIG FALLBACK (als config.js niet geladen is)
// ─────────────────────────────────────────
if (typeof CONFIG === 'undefined') {
    window.CONFIG = {
        STRAVA_CLIENT_ID: '249009',
        STRAVA_CLIENT_SECRET: '0d66a873186009a98220f36068f5940d5e414a09',
        STRAVA_REFRESH_TOKEN: 'f242db2c0984c407363578a52d2ba97e8ebf04ac',
        PROFIEL: {
            naam: 'Rune',
            doel_trainingen_per_week: 4,
            doel_km_per_week_lopen: 25,
            favoriete_sporten: ['lopen', 'padel'],
            niveau: 'gemiddeld',
            doel: 'conditie verbeteren',
            padel_duur_minuten: 90,
            padel_kcal_per_uur: 450,
        }
    };
}

// ─────────────────────────────────────────
// TABS CONFIG
// ─────────────────────────────────────────
const TABS = [
    { id: 'home',         label: 'Home' },
    { id: 'activiteiten', label: 'Activiteiten' },
    { id: 'week',         label: 'Week' },
    { id: 'statistieken', label: 'Statistieken' },
];

// ─────────────────────────────────────────
// PADEL SESSIES (lokaal opgeslagen)
// ─────────────────────────────────────────
function getPadelSessies() {
    try {
        return JSON.parse(localStorage.getItem('padel_sessies') || '[]');
    } catch { return []; }
}

function savePadelSessie(datum, duurMinuten) {
    const sessies = getPadelSessies();
    const kcal = Math.round((CONFIG.PROFIEL.padel_kcal_per_uur / 60) * duurMinuten);
    sessies.push({ datum, duurMinuten, kcal });
    localStorage.setItem('padel_sessies', JSON.stringify(sessies));
}

function deletePadelSessie(index) {
    const sessies = getPadelSessies();
    sessies.splice(index, 1);
    localStorage.setItem('padel_sessies', JSON.stringify(sessies));
    const activeTab = document.querySelector('.tab.active')?.getAttribute('onclick')?.match(/'(\w+)'/)?.[1] || 'home';
    renderPages();
    const tabEl = [...document.querySelectorAll('.tab')].find(t => t.getAttribute('onclick')?.includes(`'${activeTab}'`));
    if (tabEl) showTab(activeTab, tabEl);
}

function getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function getPadelDezeWeek() {
    const weekStart = getWeekStart();
    return getPadelSessies().filter(s => new Date(s.datum) >= weekStart);
}

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
}

async function fetchActivities() {
    const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${weekAgo}&per_page=20`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const list = await res.json();

    // Haal detail op per activiteit om calorieën te krijgen
    stravaActivities = await Promise.all(list.map(async a => {
        try {
            const detail = await fetch(
                `https://www.strava.com/api/v3/activities/${a.id}`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            return await detail.json();
        } catch {
            return a; // fallback naar lijst-data
        }
    }));
}

async function fetchAthleteStats() {
    // Haal eerst athlete op als id ontbreekt
    if (!athleteId) {
        const athleteRes = await fetch('https://www.strava.com/api/v3/athlete',
            { headers: { Authorization: `Bearer ${accessToken}` } });
        const athlete = await athleteRes.json();
        athleteId = athlete.id;
    }
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
    } catch(e) {
        console.error('Strava fout:', e);
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
    const weekStart = getWeekStart();
    const weekData = days.map((d, i) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        return { day: d, date: date.getDate(), cal: 0, done: false, today: i === todayIdx, padel: false };
    });

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    stravaActivities.forEach(a => {
        const d = new Date(a.start_date_local);
        if (d < weekStart || d >= weekEnd) return; // alleen huidige kalenderweek
        const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        weekData[dayIdx].cal += a.calories || 0;
        weekData[dayIdx].done = true;
    });

    getPadelDezeWeek().forEach(s => {
        const d = new Date(s.datum);
        const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        weekData[dayIdx].cal += s.kcal;
        weekData[dayIdx].done = true;
        weekData[dayIdx].padel = true;
    });

    const maxCal = Math.max(...weekData.map(d => d.cal), 1);
    weekData.forEach(d => { d.pct = Math.round((d.cal / maxCal) * 100); });
    return weekData;
}

function getTodayStats() {
    const today = new Date().toDateString();
    const todayActs = stravaActivities.filter(a => new Date(a.start_date_local).toDateString() === today);
    const todayPadel = getPadelDezeWeek().filter(s => new Date(s.datum).toDateString() === today);
    return {
        calories: todayActs.reduce((s, a) => s + (a.calories || 0), 0) + todayPadel.reduce((s, x) => s + x.kcal, 0),
        heartrate: todayActs.length ? Math.round(todayActs.reduce((s, a) => s + (a.average_heartrate || 0), 0) / todayActs.length) : null,
        count: todayActs.length + todayPadel.length,
    };
}

function getWeekStats() {
    const padelDezeWeek = getPadelDezeWeek();
    const totalKcalPadel = padelDezeWeek.reduce((s, x) => s + x.kcal, 0);
    const total = stravaActivities.reduce((s, a) => ({
        cal:      s.cal + (a.calories || 0),
        distance: s.distance + (a.distance || 0),
        time:     s.time + (a.moving_time || 0),
        count:    s.count + 1,
    }), { cal: 0, distance: 0, time: 0, count: 0 });

    const totalTrainingen = total.count + padelDezeWeek.length;
    const p = CONFIG.PROFIEL;

    return [
        { label: 'Trainingen',       value: `${totalTrainingen} / ${p.doel_trainingen_per_week}` },
        { label: 'Km gelopen',       value: `${(total.distance/1000).toFixed(1)} / ${p.doel_km_per_week_lopen} km` },
        { label: 'Totale calorieën', value: `${(total.cal + totalKcalPadel).toLocaleString('nl-BE')} kcal` },
        { label: 'Padel sessies',    value: `${padelDezeWeek.length}x` },
    ];
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
    const p = CONFIG.PROFIEL;

    return `
    <div class="greeting">
      <div class="day">${todayName()}</div>
      <h1>${greeting()}, <span>${p.naam}</span></h1>
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
        <div class="sub">deze week: ${stravaActivities.length + getPadelDezeWeek().length}</div>
      </div>
    </div>
    <div class="padel-card">
      <div class="padel-info">
        <div class="padel-icon">🎾</div>
        <div>
          <div class="padel-title">Padel gespeeld?</div>
          <div class="padel-sub">+${Math.round(CONFIG.PROFIEL.padel_kcal_per_uur * CONFIG.PROFIEL.padel_duur_minuten / 60)} kcal voor ${CONFIG.PROFIEL.padel_duur_minuten} min</div>
        </div>
      </div>
      <button class="padel-btn" onclick="logPadel()">+ Log</button>
    </div>
  `;
}

function logPadel() {
    // Toon een mooi formulier als overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
    position:fixed; top:0; left:0; right:0; bottom:0;
    background:rgba(0,0,0,0.85); z-index:999;
    display:flex; align-items:center; justify-content:center; padding:20px;
  `;

    const vandaag = new Date().toISOString().split('T')[0];

    overlay.innerHTML = `
    <div style="background:#1e1e1e; border-radius:20px; padding:24px; width:100%; max-width:340px; border:1px solid #2a2a2a;">
      <h2 style="font-family:'Bebas Neue',sans-serif; font-size:26px; margin-bottom:6px; letter-spacing:1px;">🎾 Padel loggen</h2>
      <p style="color:#666; font-size:13px; margin-bottom:20px;">Voeg een padel sessie toe</p>

      <label style="font-size:13px; color:#888; text-transform:uppercase; letter-spacing:1px;">Datum</label>
      <input type="date" id="padel-datum" value="${vandaag}" max="${vandaag}"
        style="width:100%; background:#0d0d0d; border:1px solid #2a2a2a; border-radius:10px;
               color:white; padding:12px; font-size:15px; margin:8px 0 16px; box-sizing:border-box;">

      <label style="font-size:13px; color:#888; text-transform:uppercase; letter-spacing:1px;">Duur (minuten)</label>
      <input type="number" id="padel-duur" value="${CONFIG.PROFIEL.padel_duur_minuten}" min="15" max="240"
        style="width:100%; background:#0d0d0d; border:1px solid #2a2a2a; border-radius:10px;
               color:white; padding:12px; font-size:15px; margin:8px 0 24px; box-sizing:border-box;">

      <div style="display:flex; gap:10px;">
        <button onclick="this.closest('div').parentElement.parentElement.remove()"
          style="flex:1; padding:14px; background:#2a2a2a; color:#888; border:none;
                 border-radius:12px; font-size:15px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif;">
          Annuleer
        </button>
        <button id="padel-save-btn"
          style="flex:1; padding:14px; background:linear-gradient(135deg,#ff6a00,#e8001d);
                 color:white; border:none; border-radius:12px; font-size:15px;
                 font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif;">
          Opslaan ✓
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);

    document.getElementById('padel-save-btn').addEventListener('click', () => {
        const datum = document.getElementById('padel-datum').value;
        const minuten = parseInt(document.getElementById('padel-duur').value) || CONFIG.PROFIEL.padel_duur_minuten;
        savePadelSessie(datum, minuten);
        overlay.remove();
        renderPages();
        animateRing();
    });
}

// ─────────────────────────────────────────
// ACTIVITEITEN
// ─────────────────────────────────────────
function activityItemHtml(emoji, name, dateStr, durationStr, heartrate, cal, dist, deleteBtn) {
    return `
    <div class="activity-item">
      <div class="activity-dot">${emoji}</div>
      <div class="activity-info">
        <div class="name">${name}</div>
        <div class="date">${dateStr}${durationStr ? ' · ' + durationStr : ''}</div>
        ${heartrate ? `<div class="date">❤️ ${heartrate} bpm gem.</div>` : ''}
      </div>
      <div class="activity-stats">
        <div class="cal">${cal}</div>
        <div class="dist">${dist}</div>
      </div>
      ${deleteBtn || ''}
    </div>`;
}

function buildActiviteitItems(stravaList, padelList) {
    const items = [];

    stravaList.forEach(a => {
        items.push({
            ts: new Date(a.start_date_local).getTime(),
            html: activityItemHtml(
                activityEmoji(a.type),
                a.name,
                formatDate(a.start_date_local),
                formatDuration(a.moving_time),
                a.average_heartrate ? Math.round(a.average_heartrate) : null,
                a.calories ? a.calories + ' cal' : '—',
                formatDistance(a.distance),
                ''
            )
        });
    });

    padelList.forEach(s => {
        items.push({
            ts: new Date(s.datum).getTime(),
            html: activityItemHtml(
                '🎾', 'Padel', s.datum, s.duurMinuten + ' min', null,
                s.kcal + ' cal', 'manueel',
                `<button class="delete-padel-btn" onclick="deletePadelSessie(${s._i})" title="Verwijder">🗑</button>`
            )
        });
    });

    return items.sort((a, b) => b.ts - a.ts);
}

let oudeActiviteitenZichtbaar = false;

function toggleOudeActiviteiten() {
    oudeActiviteitenZichtbaar = !oudeActiviteitenZichtbaar;
    const el = document.getElementById('oude-activiteiten');
    const btn = document.getElementById('oude-btn');
    if (!el || !btn) return;
    el.style.display = oudeActiviteitenZichtbaar ? 'block' : 'none';
    btn.textContent = oudeActiviteitenZichtbaar ? '▲ Verbergen' : '📦 Langer dan een week geleden';
}

function renderActiviteiten() {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allSessies = getPadelSessies().map((s, i) => ({ ...s, _i: i }));

    const recenteStrava = stravaActivities.filter(a => new Date(a.start_date_local).getTime() >= sevenDaysAgo);
    const oudeStrava    = stravaActivities.filter(a => new Date(a.start_date_local).getTime() < sevenDaysAgo);

    const recentePadel = allSessies.filter(s => new Date(s.datum).getTime() >= sevenDaysAgo);
    const oudePadel    = allSessies.filter(s => new Date(s.datum).getTime() < sevenDaysAgo);

    const recenteItems = buildActiviteitItems(recenteStrava, recentePadel);
    const oudeItems    = buildActiviteitItems(oudeStrava, oudePadel);

    if (!recenteItems.length && !oudeItems.length) {
        return `
      <div class="page-title"><span>Activiteiten</span></div>
      <div class="empty-state">
        <div class="emoji">📂</div>
        <p>Geen activiteiten gevonden.</p>
      </div>`;
    }

    const oudeHtml = oudeItems.length ? `
    <button id="oude-btn" class="oude-activiteiten-btn" onclick="toggleOudeActiviteiten()">
      📦 Langer dan een week geleden
    </button>
    <div id="oude-activiteiten" style="display:none">
      ${oudeItems.map(i => i.html).join('')}
    </div>` : '';

    return `
    <div class="page-title"><span>Activiteiten</span></div>
    ${recenteItems.length ? recenteItems.map(i => i.html).join('') : '<p style="color:var(--muted);font-size:14px;margin-bottom:16px;">Geen activiteiten de afgelopen 7 dagen.</p>'}
    ${oudeHtml}
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
      <div class="day-date">${d.date}</div>
      <div class="day-bar-wrap">
        <div class="day-bar" style="height:${d.pct}%"></div>
      </div>
      <div class="day-dot">${d.padel ? '🎾' : ''}</div>
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
        ? formatDistance(stravaStats.all_run_totals.distance) : '—';
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
}

init();