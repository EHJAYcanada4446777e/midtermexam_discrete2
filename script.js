/**
 * Smart Campus Navigation System
 * app.js — Graph logic, Dijkstra's algorithm, canvas rendering
 */

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════

let nodes        = {};   // { id: { id, name, x, y } }
let edges        = [];   // [{ from, to, weight }]
let nodeCounter  = 0;
let weighted     = false;

let highlightPath  = [];         // array of node ids forming the shortest path
let highlightEdges = new Set();  // "fromId-toId" keys on the shortest path

// Canvas interaction state
let dragging   = null;
let dragOffX   = 0, dragOffY = 0;
let isPanning  = false;
let panStartX  = 0, panStartY  = 0;
let panOriginX = 0, panOriginY = 0;

// Viewport transform
let viewOX    = 0;
let viewOY    = 0;
let viewScale = 1;

const NODE_RADIUS = 22;

// ═══════════════════════════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('mapCanvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

window.addEventListener('resize', resizeCanvas);

// ═══════════════════════════════════════════════════════════
//  COORDINATE HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Convert canvas client coordinates to world coordinates.
 */
function toWorld(cx, cy) {
  return {
    x: (cx - viewOX) / viewScale,
    y: (cy - viewOY) / viewScale
  };
}

/**
 * Return the node under world point (wx, wy), or null.
 */
function nodeAt(wx, wy) {
  for (const n of Object.values(nodes)) {
    if (Math.hypot(n.x - wx, n.y - wy) <= NODE_RADIUS) return n;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
//  DRAWING
// ═══════════════════════════════════════════════════════════

function draw() {
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(viewOX, viewOY);
  ctx.scale(viewScale, viewScale);

  drawEdges();
  drawNodes();

  ctx.restore();
}

function drawEdges() {
  edges.forEach((e) => {
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (!a || !b) return;

    const key1   = `${e.from}-${e.to}`;
    const key2   = `${e.to}-${e.from}`;
    const isPath = highlightEdges.has(key1) || highlightEdges.has(key2);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);

    if (isPath) {
      ctx.strokeStyle = '#00e0a0';
      ctx.lineWidth   = 3.5;
      ctx.setLineDash([]);

      // Animated glow effect
      ctx.shadowColor = '#00e0a0';
      ctx.shadowBlur  = 10;
    } else {
      ctx.strokeStyle = '#1c2840';
      ctx.lineWidth   = 1.8;
      ctx.setLineDash([5, 5]);
      ctx.shadowBlur  = 0;
    }

    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Weight label (weighted mode only)
    if (weighted && e.weight !== 1) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;

      ctx.font         = '700 10px IBM Plex Mono, monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      const label = `${e.weight}m`;
      const tw    = ctx.measureText(label).width;

      ctx.fillStyle = 'rgba(8, 13, 24, 0.85)';
      ctx.fillRect(mx - tw / 2 - 5, my - 9, tw + 10, 18);

      ctx.fillStyle = '#ffcc44';
      ctx.fillText(label, mx, my);
    }
  });
}

function drawNodes() {
  Object.values(nodes).forEach((n) => {
    const isStart = highlightPath.length > 0 && n.id === highlightPath[0];
    const isEnd   = highlightPath.length > 0 && n.id === highlightPath[highlightPath.length - 1];
    const isOnPath = highlightPath.includes(n.id);
    const r = NODE_RADIUS;

    // Glow
    if (isOnPath) {
      ctx.shadowColor = (isStart || isEnd) ? '#ff6b35' : '#00d4ff';
      ctx.shadowBlur  = 18;
    }

    // Circle fill
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

    if (isStart || isEnd) {
      ctx.fillStyle = '#ff6b35';
    } else if (isOnPath) {
      ctx.fillStyle = '#00d4ff';
    } else {
      ctx.fillStyle = '#151e2e';
    }

    ctx.fill();
    ctx.shadowBlur = 0;

    // Stroke ring
    ctx.lineWidth   = isOnPath ? 2.5 : 1.5;
    ctx.strokeStyle = (isStart || isEnd) ? '#ff6b35'
                    : isOnPath           ? '#00d4ff'
                    :                      '#253448';
    ctx.stroke();

    // Label text
    const labelText = n.name.length > 9 ? n.name.slice(0, 8) + '…' : n.name;
    ctx.font         = '700 10px Outfit, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = (isStart || isEnd) ? '#000' : isOnPath ? '#000' : '#dde6f0';
    ctx.fillText(labelText, n.x, n.y);
  });
}

// ═══════════════════════════════════════════════════════════
//  MOUSE / POINTER INTERACTIONS
// ═══════════════════════════════════════════════════════════

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx   = e.clientX - rect.left;
  const cy   = e.clientY - rect.top;
  const w    = toWorld(cx, cy);
  const hit  = nodeAt(w.x, w.y);

  if (hit) {
    dragging  = hit;
    dragOffX  = w.x - hit.x;
    dragOffY  = w.y - hit.y;
  } else {
    isPanning  = true;
    panStartX  = cx;
    panStartY  = cy;
    panOriginX = viewOX;
    panOriginY = viewOY;
  }
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx   = e.clientX - rect.left;
  const cy   = e.clientY - rect.top;

  if (dragging) {
    const w    = toWorld(cx, cy);
    dragging.x = w.x - dragOffX;
    dragging.y = w.y - dragOffY;
    draw();
  } else if (isPanning) {
    viewOX = panOriginX + (cx - panStartX);
    viewOY = panOriginY + (cy - panStartY);
    draw();
  }
});

canvas.addEventListener('mouseup', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx   = e.clientX - rect.left;
  const cy   = e.clientY - rect.top;

  if (!dragging && isPanning) {
    const moved = Math.hypot(cx - panStartX, cy - panStartY);
    if (moved < 5) {
      // Treated as a click — place a new node
      const name = prompt('Enter location name:');
      if (name && name.trim()) {
        const w = toWorld(cx, cy);
        addNodeAtPosition(name.trim(), w.x, w.y);
      }
    }
  }

  dragging  = null;
  isPanning = false;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect   = canvas.getBoundingClientRect();
  const cx     = e.clientX - rect.left;
  const cy     = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.12 : 0.9;

  viewOX    = cx - (cx - viewOX) * factor;
  viewOY    = cy - (cy - viewOY) * factor;
  viewScale = Math.min(4, Math.max(0.15, viewScale * factor));

  draw();
}, { passive: false });

// ═══════════════════════════════════════════════════════════
//  VIEWPORT CONTROLS
// ═══════════════════════════════════════════════════════════

function zoomIn()    { applyZoom(1.2); }
function zoomOut()   { applyZoom(0.85); }

function applyZoom(factor) {
  const cx = canvas.offsetWidth  / 2;
  const cy = canvas.offsetHeight / 2;
  viewOX    = cx - (cx - viewOX) * factor;
  viewOY    = cy - (cy - viewOY) * factor;
  viewScale = Math.min(4, Math.max(0.15, viewScale * factor));
  draw();
}

function resetView() {
  viewOX    = 0;
  viewOY    = 0;
  viewScale = 1;
  draw();
}

// ═══════════════════════════════════════════════════════════
//  GRAPH OPERATIONS — Nodes
// ═══════════════════════════════════════════════════════════

/**
 * Read name from input and add a node at a random canvas position.
 */
function addNode() {
  const input = document.getElementById('nodeInput');
  const name  = input.value.trim();

  if (!name) { showToast('⚠ Enter a location name.'); return; }

  const exists = Object.values(nodes).some(
    (n) => n.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) { showToast('Location already exists!'); return; }

  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  const x = 80 + Math.random() * (W - 160);
  const y = 80 + Math.random() * (H - 160);

  addNodeAtPosition(name, x, y);
  input.value = '';
  input.focus();
}

/**
 * Create a node at a specific world position.
 */
function addNodeAtPosition(name, x, y) {
  const id = `n${++nodeCounter}`;
  nodes[id] = { id, name, x, y };

  refreshSelects();
  refreshLists();
  updateStats();
  draw();
  showToast(`✓ Added: ${name}`);
}

/**
 * Remove a node and all its connected edges.
 */
function removeNode(id) {
  const name = nodes[id]?.name || id;
  delete nodes[id];
  edges = edges.filter((e) => e.from !== id && e.to !== id);
  clearHighlight();
  refreshSelects();
  refreshLists();
  updateStats();
  draw();
  showToast(`🗑 Removed: ${name}`);
}

// ═══════════════════════════════════════════════════════════
//  GRAPH OPERATIONS — Edges
// ═══════════════════════════════════════════════════════════

/**
 * Read selects and add an edge.
 */
function addEdge() {
  const from = document.getElementById('edgeFrom').value;
  const to   = document.getElementById('edgeTo').value;

  if (!from || !to)     { showToast('⚠ Select both locations.'); return; }
  if (from === to)      { showToast('⚠ Cannot connect a location to itself.'); return; }

  const exists = edges.some(
    (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from)
  );
  if (exists) { showToast('Connection already exists!'); return; }

  const rawWeight = parseFloat(document.getElementById('weightInput').value);
  const weight    = weighted && !isNaN(rawWeight) && rawWeight > 0 ? rawWeight : 1;

  edges.push({ from, to, weight });
  clearHighlight();
  refreshLists();
  updateStats();
  draw();

  const label = weighted ? ` [${weight}m]` : '';
  showToast(`⟷ ${nodes[from].name} ↔ ${nodes[to].name}${label}`);
}

/**
 * Remove an edge by its index in the edges array.
 */
function removeEdge(index) {
  edges.splice(index, 1);
  clearHighlight();
  refreshLists();
  updateStats();
  draw();
  showToast('🗑 Connection removed');
}

/**
 * Find the shortest path between startId and endId.
 * Returns { path: [id, ...], totalDist: number } or null if unreachable.
 *
 * Time complexity: O((V + E) log V) with a simple sorted-array PQ.
 */
function dijkstra(startId, endId) {
  const dist    = {};   // { nodeId: shortestDistanceFromStart }
  const prev    = {};   // { nodeId: previousNodeId }
  const visited = new Set();

  // Initialise distances to Infinity
  Object.keys(nodes).forEach((id) => {
    dist[id] = Infinity;
    prev[id] = null;
  });
  dist[startId] = 0;

  // Priority queue: array sorted ascending by distance
  const pq = [{ id: startId, d: 0 }];

  while (pq.length > 0) {
    // Pop node with smallest tentative distance
    pq.sort((a, b) => a.d - b.d);
    const { id: u } = pq.shift();

    if (visited.has(u)) continue;
    visited.add(u);

    if (u === endId) break; // Early exit

    // Relax neighbours
    edges.forEach((e) => {
      let neighbor = null;
      if (e.from === u) neighbor = e.to;
      else if (e.to === u) neighbor = e.from;

      if (!neighbor || !nodes[neighbor] || visited.has(neighbor)) return;

      const alt = dist[u] + e.weight;
      if (alt < dist[neighbor]) {
        dist[neighbor] = alt;
        prev[neighbor] = u;
        pq.push({ id: neighbor, d: alt });
      }
    });
  }

  // Unreachable
  if (dist[endId] === Infinity) return null;

  // Reconstruct path
  const path = [];
  let cur = endId;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur];
  }

  return { path, totalDist: dist[endId] };
}

// ═══════════════════════════════════════════════════════════
//  NAVIGATION ACTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Find and display the shortest path between two selected nodes.
 */
function findPath() {
  const from   = document.getElementById('pathFrom').value;
  const to     = document.getElementById('pathTo').value;
  const result = document.getElementById('pathResult');

  clearHighlight();

  if (!from || !to) {
    setResult(result, 'error', '⚠ Select a start location and a destination.');
    return;
  }

  if (from === to) {
    setResult(result, 'info', '✓ You are already at the destination!');
    return;
  }

  const found = dijkstra(from, to);

  if (!found) {
    setResult(result, 'error', `✗ No path found between <strong>${nodes[from].name}</strong> and <strong>${nodes[to].name}</strong>.`);
    draw();
    return;
  }

  // Update visual state
  highlightPath = found.path;
  for (let i = 0; i < found.path.length - 1; i++) {
    highlightEdges.add(`${found.path[i]}-${found.path[i + 1]}`);
    highlightEdges.add(`${found.path[i + 1]}-${found.path[i]}`);
  }
  draw();

  // Build path pills HTML
  const pillsHtml = found.path.map((id, idx) => {
    const pill = `<span class="step-pill">${nodes[id].name}</span>`;
    return idx < found.path.length - 1 ? `${pill}<span class="step-sep">→</span>` : pill;
  }).join('');

  const steps    = found.path.length - 1;
  const distLine = weighted
    ? `Steps: <strong>${steps}</strong> &nbsp;|&nbsp; Distance: <strong>${found.totalDist}m</strong>`
    : `Steps: <strong>${steps}</strong>`;

  setResult(result, 'success',
    `✓ Shortest path found!<br><small style="color:#5a7090">${distLine}</small>
     <div class="path-steps">${pillsHtml}</div>`
  );

  // Auto-switch to navigate tab
  switchTab('find', document.querySelector('[data-tab="find"]'));
}

/**
 * Check whether two nodes are connected at all.
 */
function checkConnectivity() {
  const a  = document.getElementById('connA').value;
  const b  = document.getElementById('connB').value;
  const el = document.getElementById('connResult');

  if (!a || !b) { setResult(el, 'error', '⚠ Select both locations.'); return; }
  if (a === b)  { setResult(el, 'info',  '✓ Same location selected.'); return; }

  const found = dijkstra(a, b);
  if (found) {
    setResult(el, 'success',
      `✓ <strong>${nodes[a].name}</strong> and <strong>${nodes[b].name}</strong> are connected.
       <br><small style="color:#5a7090">${found.path.length - 1} step(s) apart</small>`
    );
  } else {
    setResult(el, 'error',
      `✗ <strong>${nodes[a].name}</strong> and <strong>${nodes[b].name}</strong> are NOT connected.`
    );
  }
}

// ═══════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════

function setResult(el, type, html) {
  el.className = `result-box ${type}`;
  el.innerHTML = html;
}

function clearHighlight() {
  highlightPath = [];
  highlightEdges.clear();
}

function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

  if (btn) btn.classList.add('active');
  else document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

  const panel = document.getElementById(`tab-${tabName}`);
  if (panel) panel.classList.add('active');
}

function toggleWeight() {
  weighted = document.getElementById('weightToggle').checked;
  document.getElementById('weightGroup').style.display = weighted ? 'block' : 'none';
  document.getElementById('modeBadge').textContent = weighted ? 'Weighted' : 'Unweighted';

  if (!weighted) {
    edges.forEach((e) => (e.weight = 1));
  }

  refreshLists();
  draw();
}

/**
 * Rebuild all <select> dropdowns preserving previously-selected values.
 */
function refreshSelects() {
  const optionsHtml = '<option value="">— select —</option>' +
    Object.values(nodes)
      .map((n) => `<option value="${n.id}">${n.name}</option>`)
      .join('');

  ['edgeFrom', 'edgeTo', 'pathFrom', 'pathTo', 'connA', 'connB'].forEach((id) => {
    const el   = document.getElementById(id);
    const prev = el.value;
    el.innerHTML = optionsHtml;
    if (nodes[prev]) el.value = prev;
  });
}

/**
 * Rebuild the node and edge lists in the Data tab.
 */
function refreshLists() {
  const nl = document.getElementById('nodeList');
  const el = document.getElementById('edgeList');

  // Nodes
  if (Object.keys(nodes).length === 0) {
    nl.innerHTML = '<div class="empty-state">No locations added yet.</div>';
  } else {
    nl.innerHTML = Object.values(nodes).map((n) => `
      <div class="list-item">
        <span class="list-dot dot-node"></span>
        <span class="list-name">${n.name}</span>
        <button class="btn-del" onclick="removeNode('${n.id}')">✕</button>
      </div>
    `).join('');
  }

  // Edges
  if (edges.length === 0) {
    el.innerHTML = '<div class="empty-state">No connections added yet.</div>';
  } else {
    el.innerHTML = edges.map((e, i) => `
      <div class="list-item">
        <span class="list-dot dot-edge"></span>
        <span class="list-name">${nodes[e.from]?.name ?? '?'} ↔ ${nodes[e.to]?.name ?? '?'}</span>
        ${weighted ? `<span class="list-weight">${e.weight}m</span>` : ''}
        <button class="btn-del" onclick="removeEdge(${i})">✕</button>
      </div>
    `).join('');
  }

  // Update count badges
  document.getElementById('countNodes').textContent = Object.keys(nodes).length;
  document.getElementById('countEdges').textContent = edges.length;
}

/**
 * Recompute and display graph-level stats.
 */
function updateStats() {
  const ids = Object.keys(nodes);
  document.getElementById('statNodes').textContent = ids.length;
  document.getElementById('statEdges').textContent = edges.length;

  const connEl = document.getElementById('statConn');

  if (ids.length < 2) {
    connEl.textContent = '—';
    connEl.style.color = 'var(--muted)';
    return;
  }

  // BFS from the first node to check full connectivity
  const visited = new Set([ids[0]]);
  const queue   = [ids[0]];

  while (queue.length) {
    const u = queue.shift();
    edges.forEach((e) => {
      let nb = null;
      if (e.from === u && nodes[e.to])   nb = e.to;
      else if (e.to === u && nodes[e.from]) nb = e.from;
      if (nb && !visited.has(nb)) { visited.add(nb); queue.push(nb); }
    });
  }

  const isConnected = visited.size === ids.length;
  connEl.textContent   = isConnected ? 'Yes' : 'No';
  connEl.style.color   = isConnected ? 'var(--green)' : 'var(--red)';
}

/**
 * Show a brief toast notification.
 */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ═══════════════════════════════════════════════════════════
//  PRESETS
// ═══════════════════════════════════════════════════════════

function clearAll() {
  if (Object.keys(nodes).length > 0 && !confirm('Clear all locations and connections?')) return;
  nodes    = {};
  edges    = [];
  clearHighlight();
  refreshSelects();
  refreshLists();
  updateStats();
  draw();
  showToast('🗑 Cleared.');
}

/**
 * Load a preset graph.
 * @param {'campus'|'city'} type
 */
function loadPreset(type) {
  nodes = {};
  edges = [];
  clearHighlight();

  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;

  if (type === 'campus') {
    const locations = [
      { name: 'Main Gate',   x: 0.14, y: 0.82 },
      { name: 'Registrar',   x: 0.30, y: 0.60 },
      { name: 'Admin Bldg',  x: 0.50, y: 0.45 },
      { name: 'The Hub',     x: 0.70, y: 0.28 },
      { name: 'Forum',       x: 0.24, y: 0.28 },
      { name: 'Cafeteria',   x: 0.55, y: 0.65 },
      { name: 'Library',     x: 0.82, y: 0.65 },
      { name: 'Second Gate', x: 0.45, y: 0.16 },
      { name: 'Parking',     x: 0.10, y: 0.52 },
      { name: 'SGO',         x: 0.72, y: 0.50 },
    ];

    locations.forEach((l) => {
      const id = `n${++nodeCounter}`;
      nodes[id] = { id, name: l.name, x: l.x * W, y: l.y * H };
    });

    const ids   = Object.keys(nodes);
    const conns = [
      [0,1,80],[1,2,120],[2,3,150],[3,6,200],[2,5,90],
      [5,6,110],[1,4,130],[4,7,160],[7,2,80],[3,9,70],
      [9,5,100],[0,8,50],[8,1,60],[4,0,200],[6,9,85]
    ];
    conns.forEach(([a, b, w]) => edges.push({ from: ids[a], to: ids[b], weight: w }));

  } else {
    // City preset
    const locations = [
      { name: 'Town Plaza',  x: 0.50, y: 0.50 },
      { name: 'Market',      x: 0.25, y: 0.28 },
      { name: 'Hospital',    x: 0.75, y: 0.28 },
      { name: 'City Park',   x: 0.20, y: 0.72 },
      { name: 'School',      x: 0.80, y: 0.72 },
      { name: 'Bus Terminal',x: 0.50, y: 0.87 },
      { name: 'Police Stn',  x: 0.35, y: 0.50 },
    ];

    locations.forEach((l) => {
      const id = `n${++nodeCounter}`;
      nodes[id] = { id, name: l.name, x: l.x * W, y: l.y * H };
    });

    const ids   = Object.keys(nodes);
    const conns = [
      [0,1,200],[0,2,250],[1,3,180],[2,4,190],[0,5,150],
      [3,5,220],[4,5,210],[1,6,100],[6,0,120],[6,3,160]
    ];
    conns.forEach(([a, b, w]) => edges.push({ from: ids[a], to: ids[b], weight: w }));
  }

  // Enable weighted mode for presets
  weighted = true;
  document.getElementById('weightToggle').checked = true;
  document.getElementById('weightGroup').style.display = 'block';
  document.getElementById('modeBadge').textContent = 'Weighted';

  refreshSelects();
  refreshLists();
  updateStats();
  draw();
  showToast('✓ Preset loaded!');
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════

resizeCanvas();
loadPreset('campus');