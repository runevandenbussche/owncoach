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

function getPadelDezeWeek() {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return getPadelSessies().filter(s => new Date(s.datum).getTime() > weekAgo);
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
    } catch(e) {
        console.error('Strava fout:', e);
    }
}

// ─────────────────────────────────────────
// GROQ AI COACH
// ─────────────────────────────────────────
async function fetchAICoachAdvice() {
    const p = CONFIG.PROFIEL;
    const padelDezeWeek = getPadelDezeWeek();
    const padelCount = padelDezeWeek.length;
    const padelKcal = padelDezeWeek.reduce((s, x) => s + x.kcal, 0);

    const stravaCount = stravaActivities.length;
    const totalKm = stravaActivities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
    const totalKcal = stravaActivities.reduce((s, a) => s + (a.calories || 0), 0) + padelKcal;
    const totalTrainingen = stravaCount + padelCount;
    const resterendeTrainingen = Math.max(p.doel_trainingen_per_week - totalTrainingen, 0);
    const resterendeKm = Math.max(p.doel_km_per_week_lopen - totalKm, 0);

    const activiteitenTekst = stravaActivities.map(a =>
        `- ${a.name} (${a.type}): ${(a.distance/1000).toFixed(1)}km, ${Math.round(a.moving_time/60)}min${a.average_heartrate ? `, ${Math.round(a.average_heartrate)} bpm` : ''}`
    ).join('\n') || 'Geen Strava activiteiten';

    const padelTekst = padelDezeWeek.map(s =>
        `- Padel: ${s.duurMinuten} min, ${s.kcal} kcal (${s.datum})`
    ).join('\n') || 'Geen padel sessies';

    const prompt = `Je bent de persoonlijke sportcoach van ${p.naam}. Geef motiverend, concreet advies in het Nederlands op basis van zijn data.

PROFIEL:
- Doel: ${p.doel}
- Niveau: ${p.niveau}
- Doelstelling: ${p.doel_trainingen_per_week}x sporten per week, ${p.doel_km_per_week_lopen} km lopen per week
- Favoriete sporten: ${p.favoriete_sporten.join(', ')}

DEZE WEEK:
Strava activiteiten:
${activiteitenTekst}

Padel sessies:
${padelTekst}

SAMENVATTING:
- Totaal trainingen: ${totalTrainingen}/${p.doel_trainingen_per_week}
- Totaal km gelopen: ${totalKm.toFixed(1)}/${p.doel_km_per_week_lopen} km
- Totaal kcal verbrand: ${totalKcal}
- Nog te doen: ${resterendeTrainingen} training(en), ${resterendeKm.toFixed(1)} km

Geef je antwoord ALLEEN in dit JSON formaat, geen markdown:
{
  "samenvatting": "Persoonlijke samenvatting in 1-2 zinnen, gebruik de naam ${p.naam}",
  "tips": [
    {"icon": "emoji", "titel": "Korte titel", "tekst": "Concreet advies in 1-2 zinnen"},
    {"icon": "emoji", "titel": "Korte titel", "tekst": "Concreet advies in 1-2 zinnen"},
    {"icon": "emoji", "titel": "Korte titel", "tekst": "Concreet advies in 1-2 zinnen"}
  ],
  "volgende_stap": "Wat moet ${p.naam} nu concreet doen? Wees specifiek (bv. 'Ga morgen 8km lopen aan rustig tempo')"
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
            max_tokens: 700,
        }),
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    try {
        return JSON.parse(text);
    } catch { return null; }
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
    const weekData = days.map((d, i) => ({ day: d, cal: 0, done: false, today: i === todayIdx, padel: false }));

    stravaActivities.forEach(a => {
        const d = new Date(a.start_date_local);
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
function renderActiviteiten() {
    const padelDezeWeek = getPadelDezeWeek();

    const stravaItems = stravaActivities.map(a => `
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

    const padelItems = padelDezeWeek.map(s => `
    <div class="activity-item">
      <div class="activity-dot">🎾</div>
      <div class="activity-info">
        <div class="name">Padel</div>
        <div class="date">${s.datum} · ${s.duurMinuten} min</div>
      </div>
      <div class="activity-stats">
        <div class="cal">${s.kcal} cal</div>
        <div class="dist">manueel</div>
      </div>
    </div>
  `).join('');

    if (!stravaActivities.length && !padelDezeWeek.length) {
        return `
      <div class="page-title"><span>Activiteiten</span></div>
      <div class="empty-state">
        <div class="emoji">📂</div>
        <p>Geen activiteiten gevonden<br>deze week.</p>
      </div>
    `;
    }

    return `
    <div class="page-title"><span>Activiteiten</span></div>
    ${stravaItems}
    ${padelItems}
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
// COACH
// ─────────────────────────────────────────
function renderCoach() {
    return `
    <div class="page-title"><span>Coach</span></div>
    <div class="coach-header">
      <div class="coach-avatar">🤖</div>
      <h2>Jouw AI Coach</h2>
      <p>Persoonlijk advies voor ${CONFIG.PROFIEL.naam}</p>
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
    <div class="coach-tip" style="border-left-color:var(--red)">
      <div class="tip-label">📊 Samenvatting</div>
      <p>${advice.samenvatting}</p>
    </div>
    ${tipsHtml}
    <div class="coach-tip" style="border-left-color:#00c853">
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