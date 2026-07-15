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

async function openGenerate(theme) {
  state.currentTheme = theme;
  document.getElementById('gen-theme-name').textContent = theme.name;
  document.getElementById('gen-theme-desc').textContent = theme.description || '';
  document.getElementById('worlds-grid').innerHTML = '';
  document.getElementById('diversity-report').classList.add('hidden');
  document.getElementById('gen-status').textContent = '';
  showScreen('generate');

  // Default the start seed to one past the highest seed already generated
  // for this theme, so repeat clicks produce a fresh batch instead of
  // silently regenerating (and overwriting) the same worlds.
  const seedInput = document.getElementById('gen-start-seed');
  seedInput.value = 1;
  try {
    const { worlds } = await api(`/api/list-worlds?theme=${encodeURIComponent(theme.id)}`);
    if (worlds.length) {
      seedInput.value = Math.max(...worlds.map(w => w.seed)) + 1;
    }
  } catch (err) {
    // No worlds yet for this theme (or list failed) — leave default at 1.
  }
}

// =========================================
// GENERATE
// =========================================
document.getElementById('btn-generate').addEventListener('click', async () => {
  if (!state.currentTheme) return;
  const count = Number(document.getElementById('gen-count').value) || 20;
  const startSeed = Number(document.getElementById('gen-start-seed').value) || 1;
  const statusEl = document.getElementById('gen-status');
  const btn = document.getElementById('btn-generate');

  btn.disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = `Generating ${count} worlds (seed ${startSeed})…`;

  try {
    const { worlds, report } = await api('/api/generate-worlds', {
      method: 'POST',
      body: JSON.stringify({ themeId: state.currentTheme.id, count, startSeed })
    });
    state.lastWorlds = worlds;
    statusEl.textContent = `Generated ${worlds.length} worlds (seed ${startSeed}–${startSeed + worlds.length - 1}).`;
    renderDiversityReport(report);
    renderWorldsGrid(worlds);
    document.getElementById('gen-start-seed').value = startSeed + worlds.length;
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
  const coverage = report.milestoneCoverage || { sampled: 0, total: 0 };
  const finalMilestone = report.mostCommonFinalMilestone;
  el.innerHTML = `
    <div class="stat-row">
      <div class="stat"><strong>${report.total}</strong>worlds generated</div>
      <div class="stat"><strong>${chainPct}%</strong>unique world paths</div>
      <div class="stat"><strong>${coverage.sampled}/${coverage.total}</strong>milestones sampled</div>
      <div class="stat"><strong>${finalMilestone ? `${finalMilestone.count}/${report.total}` : '—'}</strong>${finalMilestone ? `end at ${esc(finalMilestone.label)}` : 'most common final milestone'}</div>
    </div>
    <div class="flags">${(report.flags || []).map(f => `<div class="flag">⚠ ${esc(f)}</div>`).join('')}</div>
  `;
}

function renderWorldsGrid(worlds) {
  const grid = document.getElementById('worlds-grid');
  grid.innerHTML = '';
  worlds.forEach(world => grid.appendChild(worldCard(world)));
}

// Fetch an already-rendered story/scene script by worldId, for the case
// where a world card is showing hasStory/hasSceneScript = true (e.g. the
// same seed range was regenerated) but this page load hasn't rendered it
// itself and so has no in-memory copy yet.
async function fetchExistingStory(themeId, worldId) {
  const { stories } = await api(`/api/list-stories?theme=${encodeURIComponent(themeId)}`);
  return stories.find(s => s.worldId === worldId) || null;
}
async function fetchExistingSceneScript(themeId, worldId) {
  const { sceneScripts } = await api(`/api/list-scenes?theme=${encodeURIComponent(themeId)}`);
  return sceneScripts.find(s => s.worldId === worldId) || null;
}

function worldCard(world) {
  const card = document.createElement('div');
  card.className = 'card world-card';
  const branchCount = world.steps.filter(s => s.isBranchPoint).length;
  const divergenceCount = world.generation?.divergenceCount;
  card.innerHTML = `
    <h3>${esc(world.worldId)}</h3>
    <p>${esc(world.trajectoryDescription)}</p>
    <div class="steps">
      ${world.steps.map(s => `<span>${esc(s.occurredAt || s.date)} — ${esc(s.label)}${s.isBranchPoint ? ` ↝ ${esc(s.chosenOutcome?.label || s.chosenAlternative?.id || 'branch')}` : ''}</span>`).join('')}
    </div>
    <div class="tag-row">
      <span class="tag branch">${branchCount} branch point${branchCount === 1 ? '' : 's'}</span>
      ${Number.isInteger(divergenceCount) ? `<span class="tag branch">${divergenceCount} divergence${divergenceCount === 1 ? '' : 's'}</span>` : ''}
      <span class="tag rendered tag-story ${world.hasStory ? '' : 'hidden'}">story ✓</span>
      <span class="tag rendered tag-scenes ${world.hasSceneScript ? '' : 'hidden'}">scenes ✓</span>
    </div>
    <label class="extrapolate-toggle" title="Continue roughly 10 years past this world's last milestone, into territory the model invents itself. Only applies the first time a world is rendered.">
      <input type="checkbox" class="chk-extrapolate">Extrapolate ~10y
    </label>
    <div class="actions">
      <button class="btn btn-small btn-render-story">${world.hasStory ? 'View story' : 'Render story'}</button>
      <button class="btn btn-small btn-render-scenes">${world.hasSceneScript ? 'View scenes' : 'Render scenes'}</button>
    </div>
  `;

  // Once a world has been rendered (this session or a previous one), that
  // version stays — the button switches to just viewing it and never calls
  // the model again on repeat clicks. Rendering a fresh version requires
  // deleting the saved file (or picking a different seed) outside the UI.
  let story = null;
  let sceneScript = null;
  const extrapolateChk = card.querySelector('.chk-extrapolate');

  const storyBtn = card.querySelector('.btn-render-story');
  storyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (story) { openStoryReader(world, story); return; }
    storyBtn.disabled = true;
    storyBtn.textContent = world.hasStory ? 'Loading…' : 'Rendering…';
    try {
      if (world.hasStory) {
        story = await fetchExistingStory(state.currentTheme.id, world.worldId);
      } else {
        const res = await api('/api/render-story', {
          method: 'POST',
          body: JSON.stringify({
            themeId: state.currentTheme.id,
            worldId: world.worldId,
            extrapolate: extrapolateChk.checked
          })
        });
        story = res.story;
        world.hasStory = true;
        card.querySelector('.tag-story').classList.remove('hidden');
        extrapolateChk.disabled = true;
      }
      openStoryReader(world, story);
      storyBtn.textContent = 'View story';
    } catch (err) {
      storyBtn.textContent = 'Failed — retry';
      alert(err.message);
    } finally {
      storyBtn.disabled = false;
    }
  });

  const scenesBtn = card.querySelector('.btn-render-scenes');
  scenesBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (sceneScript) { openSceneReader(world, sceneScript); return; }
    scenesBtn.disabled = true;
    scenesBtn.textContent = world.hasSceneScript ? 'Loading…' : 'Rendering…';
    try {
      if (world.hasSceneScript) {
        sceneScript = await fetchExistingSceneScript(state.currentTheme.id, world.worldId);
      } else {
        const res = await api('/api/render-scene', {
          method: 'POST',
          body: JSON.stringify({
            themeId: state.currentTheme.id,
            worldId: world.worldId,
            extrapolate: extrapolateChk.checked
          })
        });
        sceneScript = res.sceneScript;
        world.hasSceneScript = true;
        card.querySelector('.tag-scenes').classList.remove('hidden');
        extrapolateChk.disabled = true;
      }
      openSceneReader(world, sceneScript);
      scenesBtn.textContent = 'View scenes';
    } catch (err) {
      scenesBtn.textContent = 'Failed — retry';
      alert(err.message);
    } finally {
      scenesBtn.disabled = false;
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
    const [{ worlds }, { stories }, { sceneScripts }] = await Promise.all([
      api(`/api/list-worlds?theme=${encodeURIComponent(themeId)}`),
      api(`/api/list-stories?theme=${encodeURIComponent(themeId)}`),
      api(`/api/list-scenes?theme=${encodeURIComponent(themeId)}`)
    ]);
    const storyByWorld = Object.fromEntries(stories.map(s => [s.worldId, s]));
    const sceneScriptByWorld = Object.fromEntries(sceneScripts.map(s => [s.worldId, s]));

    if (worlds.length === 0) {
      grid.innerHTML = '<p class="muted">No worlds generated yet for this theme. Go to Generate.</p>';
      return;
    }

    grid.innerHTML = '';
    worlds.forEach(world => {
      const story = storyByWorld[world.worldId];
      const sceneScript = sceneScriptByWorld[world.worldId];
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${esc(world.worldId)}</h3>
        <p>${esc(world.trajectoryDescription)}</p>
        <div class="tag-row">
          ${story ? `<span class="tag rendered">${story.wordCount} words${story.extrapolated ? ` +${story.extrapolationYears || 10}y` : ''}</span>` : '<span class="tag">no story</span>'}
          ${sceneScript ? `<span class="tag rendered">${sceneScript.scenes.length} scenes${sceneScript.extrapolated ? ` +${sceneScript.extrapolationYears || 10}y` : ''}</span>` : '<span class="tag">no scenes</span>'}
        </div>
        <div class="actions">
          <button class="btn btn-small btn-view-story" ${story ? '' : 'disabled'}>Read story</button>
          <button class="btn btn-small btn-view-scenes" ${sceneScript ? '' : 'disabled'}>View scenes</button>
        </div>
      `;
      if (story) {
        card.querySelector('.btn-view-story').addEventListener('click', (e) => {
          e.stopPropagation();
          openStoryReader(world, story);
        });
      }
      if (sceneScript) {
        card.querySelector('.btn-view-scenes').addEventListener('click', (e) => {
          e.stopPropagation();
          openSceneReader(world, sceneScript);
        });
      }
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

document.getElementById('btn-clear-library').addEventListener('click', async () => {
  const sel = document.getElementById('library-theme-select');
  const themeId = sel.value;
  if (!themeId) return;

  const themeName = state.themes.find(t => t.id === themeId)?.name || themeId;
  const ok = confirm(
    `Delete ALL generated worlds, rendered stories, and scene scripts for "${themeName}"?\n\n` +
    `Rendered prose and scenes cost API calls to regenerate. This cannot be undone.`
  );
  if (!ok) return;

  const statusEl = document.getElementById('library-status');
  const btn = document.getElementById('btn-clear-library');
  btn.disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = 'Clearing…';

  try {
    const { worldsDeleted, storiesDeleted, scenesDeleted } = await api('/api/clear-library', {
      method: 'POST',
      body: JSON.stringify({ themeId })
    });
    statusEl.textContent = `Deleted ${worldsDeleted} world${worldsDeleted === 1 ? '' : 's'}, ${storiesDeleted} stor${storiesDeleted === 1 ? 'y' : 'ies'}, and ${scenesDeleted} scene script${scenesDeleted === 1 ? '' : 's'}.`;

    // The Generate screen is intentionally session-local: it keeps the last
    // generated batch in memory instead of refetching it on every tab switch.
    // A full reset must invalidate that cached batch too, or deleted worlds
    // (and their rendered-status tags/buttons) remain visible until reload.
    if (state.currentTheme?.id === themeId) {
      state.lastWorlds = [];
      document.getElementById('worlds-grid').innerHTML = '<p class="muted">No worlds generated yet for this theme.</p>';
      const reportEl = document.getElementById('diversity-report');
      reportEl.innerHTML = '';
      reportEl.classList.add('hidden');
      document.getElementById('gen-start-seed').value = 1;
      const genStatus = document.getElementById('gen-status');
      genStatus.className = 'status';
      genStatus.textContent = `Cleared all saved worlds and renders for ${themeName}.`;
    }
    reader.classList.add('hidden');
    loadLibrary();
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// =========================================
// READER
// =========================================
const reader = document.getElementById('reader');
document.getElementById('reader-close').addEventListener('click', () => reader.classList.add('hidden'));
reader.addEventListener('click', (e) => { if (e.target === reader) reader.classList.add('hidden'); });

function openStoryReader(world, story) {
  const content = document.getElementById('reader-content');
  const paragraphs = story.text.split(/\n\n+/).filter(p => p.trim()).map(p => `<p>${esc(p.trim())}</p>`).join('');
  content.innerHTML = `
    <h3>${esc(world.worldId)}</h3>
    <div class="reader-meta">${esc(world.trajectoryDescription)} · ${story.wordCount} words · ${esc(story.model)}${story.extrapolated ? ` · <span class="extrapolated-badge">extrapolated +${story.extrapolationYears || 10}y</span>` : ''}</div>
    <div class="story-body">${paragraphs}</div>
    <div class="world-path">
      <h4>Chosen path</h4>
      ${world.steps.map(s => `
        <div class="path-step">
          <strong>${esc(s.occurredAt || s.date)} — ${esc(s.label)}</strong><br>
          ${s.chosenOutcome ? esc(s.chosenOutcome.description) : s.chosenAlternative ? esc(s.chosenAlternative.description) : esc(s.description)}
        </div>
      `).join('')}
    </div>
  `;
  reader.classList.remove('hidden');
}

function openSceneReader(world, sceneScript) {
  const content = document.getElementById('reader-content');
  const stepByMilestone = Object.fromEntries(world.steps.map(s => [s.milestoneId, s]));
  content.innerHTML = `
    <h3>${esc(world.worldId)}</h3>
    <div class="reader-meta">${esc(world.trajectoryDescription)} · ${sceneScript.scenes.length} scenes · ${esc(sceneScript.model)}${sceneScript.extrapolated ? ` · <span class="extrapolated-badge">extrapolated +${sceneScript.extrapolationYears || 10}y</span>` : ''}</div>
    <div class="style-guide"><strong>Style guide</strong><p>${esc(sceneScript.styleGuide)}</p></div>
    <div class="scene-list">
      ${sceneScript.scenes.map((scene, i) => {
        const step = stepByMilestone[scene.milestoneId];
        return `
          <div class="scene-block">
            <div class="scene-heading">Scene ${i + 1}${step ? ` — ${esc(step.occurredAt || step.date)} — ${esc(step.label)}` : scene.isExtrapolated ? ' — invented continuation' : ''}${scene.pacingSeconds ? ` <span class="scene-pacing">${scene.pacingSeconds}s</span>` : ''}</div>
            <div class="scene-field"><span class="scene-label">Visual</span>${esc(scene.visualDirection)}</div>
            <div class="scene-field"><span class="scene-label">Narration</span>${esc(scene.narration)}</div>
          </div>
        `;
      }).join('')}
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
