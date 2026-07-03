// =========================================
// public/js/app.js — Monte Carlo Fiction frontend
// Vanilla JS, no build step. Talks to the api/*.js handlers via
// server.js (or Vercel, if deployed there later).
// =========================================

const state = {
  themes: [],
  currentTheme: null, // theme summary object
  lastWorlds: []
};

// --- DOM refs ---
const screens = {
  home:     document.getElementById('screen-home'),
  generate: document.getElementById('screen-generate'),
  library:  document.getElementById('screen-library')
};
const navLinks = document.querySelectorAll('.nav-link');

// --- Navigation ---
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => el.classList.toggle('active', key === name));
  navLinks.forEach(btn => btn.classList.toggle('active', btn.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const target = el.dataset.nav;
    if (target === 'library') loadLibrary();
    showScreen(target);
  });
});

// --- Fetch helper ---
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

// =========================================
// HOME — theme picker
// =========================================
async function loadThemes() {
  const grid = document.getElementById('theme-grid');
  try {
    const { themes } = await api('/api/list-themes');
    state.themes = themes;
    document.getElementById('theme-count-label').textContent =
      `${themes.length} theme${themes.length === 1 ? '' : 's'}`;

    if (themes.length === 0) {
      grid.innerHTML = '<p class="muted">No themes yet. Copy themes/_template/ to add one.</p>';
      return;
    }

    grid.innerHTML = '';
    themes.forEach(theme => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${esc(theme.name)}</h3>
        <p>${esc(theme.description || '')}</p>
        <div class="tag-row">${(theme.axes || []).map(a => `<span class="tag">${esc(a)}</span>`).join('')}</div>
      `;
      card.addEventListener('click', () => openGenerate(theme));
      grid.appendChild(card);
    });

    // Populate library theme selector too
    const sel = document.getElementById('library-theme-select');
    sel.innerHTML = themes.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    sel.addEventListener('change', () => loadLibrary());

  } catch (err) {
    grid.innerHTML = `<p class="muted">Could not load themes: ${esc(err.message)}</p>`;
  }
}

function openGenerate(theme) {
  state.currentTheme = theme;
  document.getElementById('gen-theme-name').textContent = theme.name;
  document.getElementById('gen-theme-desc').textContent = theme.description || '';
  document.getElementById('worlds-grid').innerHTML = '';
  document.getElementById('diversity-report').classList.add('hidden');
  document.getElementById('gen-status').textContent = '';
  showScreen('generate');
}

// =========================================
// GENERATE
// =========================================
document.getElementById('btn-generate').addEventListener('click', async () => {
  if (!state.currentTheme) return;
  const count = Number(document.getElementById('gen-count').value) || 20;
  const statusEl = document.getElementById('gen-status');
  const btn = document.getElementById('btn-generate');

  btn.disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = `Generating ${count} worlds…`;

  try {
    const { worlds, report } = await api('/api/generate-worlds', {
      method: 'POST',
      body: JSON.stringify({ themeId: state.currentTheme.id, count })
    });
    state.lastWorlds = worlds;
    statusEl.textContent = `Generated ${worlds.length} worlds.`;
    renderDiversityReport(report);
    renderWorldsGrid(worlds);
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

function renderDiversityReport(report) {
  const el = document.getElementById('diversity-report');
  el.classList.remove('hidden');
  const chainPct = (report.chainDiversityRatio * 100).toFixed(0);
  const repeatPct = (report.repeatedEndingRate * 100).toFixed(0);
  el.innerHTML = `
    <div class="stat-row">
      <div class="stat"><strong>${report.total}</strong>worlds generated</div>
      <div class="stat"><strong>${chainPct}%</strong>unique milestone chains</div>
      <div class="stat"><strong>${report.uniqueTerminals}</strong>unique endings</div>
      <div class="stat"><strong>${repeatPct}%</strong>repeated-ending rate</div>
    </div>
    <div class="flags">${(report.flags || []).map(f => `<div class="flag">⚠ ${esc(f)}</div>`).join('')}</div>
  `;
}

function renderWorldsGrid(worlds) {
  const grid = document.getElementById('worlds-grid');
  grid.innerHTML = '';
  worlds.forEach(world => grid.appendChild(worldCard(world)));
}

function worldCard(world) {
  const card = document.createElement('div');
  card.className = 'card world-card';
  const branchCount = world.steps.filter(s => s.isBranchPoint).length;
  card.innerHTML = `
    <h3>${esc(world.worldId)}</h3>
    <p>${esc(world.trajectoryDescription)}</p>
    <div class="steps">
      ${world.steps.map(s => `<span>${esc(s.date)} — ${esc(s.label)}${s.isBranchPoint ? ' ↝' : ''}</span>`).join('')}
    </div>
    <div class="tag-row">
      <span class="tag branch">${branchCount} branch point${branchCount === 1 ? '' : 's'}</span>
      ${world.hasStory ? '<span class="tag rendered">rendered</span>' : ''}
    </div>
    <div class="actions">
      <button class="btn btn-small btn-render">Render story</button>
    </div>
  `;
  card.querySelector('.btn-render').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Rendering…';
    try {
      const { story } = await api('/api/render-story', {
        method: 'POST',
        body: JSON.stringify({ themeId: state.currentTheme.id, worldId: world.worldId })
      });
      openReader(world, story);
      btn.textContent = 'Rendered ✓';
    } catch (err) {
      btn.textContent = 'Failed — retry';
      btn.disabled = false;
      alert(err.message);
    }
  });
  return card;
}

// =========================================
// LIBRARY
// =========================================
async function loadLibrary() {
  const sel = document.getElementById('library-theme-select');
  if (!sel.value && state.themes.length) sel.value = state.themes[0].id;
  const themeId = sel.value;
  const grid = document.getElementById('library-grid');
  if (!themeId) { grid.innerHTML = '<p class="muted">No themes yet.</p>'; return; }

  grid.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const [{ worlds }, { stories }] = await Promise.all([
      api(`/api/list-worlds?theme=${encodeURIComponent(themeId)}`),
      api(`/api/list-stories?theme=${encodeURIComponent(themeId)}`)
    ]);
    const storyByWorld = Object.fromEntries(stories.map(s => [s.worldId, s]));

    if (worlds.length === 0) {
      grid.innerHTML = '<p class="muted">No worlds generated yet for this theme. Go to Generate.</p>';
      return;
    }

    grid.innerHTML = '';
    worlds.forEach(world => {
      const story = storyByWorld[world.worldId];
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${esc(world.worldId)}</h3>
        <p>${esc(world.trajectoryDescription)}</p>
        <div class="tag-row">
          ${story ? `<span class="tag rendered">${story.wordCount} words</span>` : '<span class="tag">not rendered</span>'}
        </div>
      `;
      if (story) {
        card.addEventListener('click', () => openReader(world, story));
      } else {
        card.style.opacity = '0.6';
      }
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

// =========================================
// READER
// =========================================
const reader = document.getElementById('reader');
document.getElementById('reader-close').addEventListener('click', () => reader.classList.add('hidden'));
reader.addEventListener('click', (e) => { if (e.target === reader) reader.classList.add('hidden'); });

function openReader(world, story) {
  const content = document.getElementById('reader-content');
  const paragraphs = story.text.split(/\n\n+/).filter(p => p.trim()).map(p => `<p>${esc(p.trim())}</p>`).join('');
  content.innerHTML = `
    <h3>${esc(world.worldId)}</h3>
    <div class="reader-meta">${esc(world.trajectoryDescription)} · ${story.wordCount} words · ${esc(story.model)}</div>
    <div class="story-body">${paragraphs}</div>
    <div class="world-path">
      <h4>Chosen path</h4>
      ${world.steps.map(s => `
        <div class="path-step">
          <strong>${esc(s.date)} — ${esc(s.label)}</strong><br>
          ${s.chosenAlternative ? esc(s.chosenAlternative.description) : esc(s.description)}
        </div>
      `).join('')}
    </div>
  `;
  reader.classList.remove('hidden');
}

// --- Utility ---
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Boot ---
loadThemes();
