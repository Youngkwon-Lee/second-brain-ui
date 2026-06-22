const apiBase = location.protocol === "file:" ? "http://localhost:4177" : "";
const graphEl = document.getElementById("graph");
const hoverCard = document.createElement("div");
hoverCard.className = "hover-card";
document.querySelector(".main").appendChild(hoverCard);
const majorLabels = document.createElement("div");
majorLabels.className = "major-labels";
document.querySelector(".main").appendChild(majorLabels);

const state = {
  graph: null,
  notes: [],
  selected: null,
  hovered: null,
  forceGraph: null,
  motionTimer: null,
  controlsTimer: null,
  cameraOrbitAngle: 0,
  sceneRotationPausedUntil: 0,
  hoverClearTimer: null,
  activeGroup: null,
  askResults: [],
  askMode: false
};
window.__vaultApp = state;

const groupColors = {
  personal: "#8b5cf6",
  projects: "#4ea8ff",
  research: "#54d18a",
  operations: "#f6b44b",
  company: "#ff5c7a",
  candidates: "#bfb8ff",
  _inbox: "#ff5c7a",
  root: "#f1f1f5"
};
const fallbackGroupColors = ["#8b5cf6", "#4ea8ff", "#54d18a", "#f6b44b", "#ff5c7a", "#bfb8ff", "#5eead4", "#f472b6"];

async function fetchJson(url) {
  const res = await fetch(`${apiBase}${url}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function groupForNode(node) {
  return (node.path || node.id || "").split("/")[0] || "root";
}

function colorForNode(node) {
  const group = groupForNode(node);
  return groupColors[group] || fallbackGroupColors[Math.abs(hashString(group)) % fallbackGroupColors.length];
}

function radiusForNode(node) {
  return Math.min(4.4, 1 + Math.sqrt(node.degree || 0) * 0.28);
}

function isFocusedNode(node) {
  if (!node) return false;
  if (state.hovered && node.id === state.hovered.id) return true;
  if (state.selected && node.id === state.selected.id) return true;
  return false;
}

function activeFocusId() {
  return state.hovered?.id || state.selected?.id || null;
}

function isLinkedToFocus(link) {
  const focus = activeFocusId();
  if (!focus) return false;
  const source = typeof link.source === "object" ? link.source.id : link.source;
  const target = typeof link.target === "object" ? link.target.id : link.target;
  return source === focus || target === focus;
}

function hasFocus() {
  return Boolean(activeFocusId());
}

function renderSidebar() {
  const { graph } = state;
  document.getElementById("vaultPath").textContent = graph.vaultRoot;
  document.getElementById("statNotes").textContent = graph.stats.notes.toLocaleString();
  document.getElementById("statEdges").textContent = graph.stats.edges.toLocaleString();
  document.getElementById("statTags").textContent = graph.stats.tags.toLocaleString();

  const noteList = document.getElementById("noteList");
  noteList.innerHTML = "";
  for (const note of state.notes.slice(0, 80)) {
    const item = document.createElement("div");
    item.className = `note-item${state.selected?.id === note.id ? " active" : ""}`;
    item.innerHTML = `<strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.path)} · ${(note.links || []).length} links</span>`;
    item.addEventListener("click", () => selectNote(note.id));
    noteList.appendChild(item);
  }

  const tagList = document.getElementById("tagList");
  tagList.innerHTML = "";
  for (const tag of graph.tags.slice(0, 30)) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.innerHTML = `<span class="dot"></span>${escapeHtml(tag.tag)} ${tag.count}`;
    chip.addEventListener("click", () => {
      document.getElementById("searchInput").value = tag.tag;
      searchNotes(tag.tag);
    });
    tagList.appendChild(chip);
  }

  const graphHud = document.getElementById("graphHud");
  graphHud.innerHTML = "";
  const countChip = document.createElement("button");
  countChip.className = `chip${state.activeGroup === null ? " active" : ""}`;
  const linkedCount = graph.nodes.filter((node) => node.degree > 0).length;
  countChip.innerHTML = `<span class="dot"></span>${linkedCount.toLocaleString()} linked / ${graph.stats.notes.toLocaleString()} notes`;
  countChip.addEventListener("click", () => applyGraphGroupFilter(null));
  graphHud.appendChild(countChip);
  for (const { label, color } of availableGroups(graph).slice(0, 7)) {
    const chip = document.createElement("button");
    chip.className = `chip${state.activeGroup === label ? " active" : ""}`;
    chip.innerHTML = `<span class="dot" style="background:${color}"></span>${label}`;
    chip.addEventListener("click", () => applyGraphGroupFilter(state.activeGroup === label ? null : label));
    graphHud.appendChild(chip);
  }
}

function availableGroups(graph) {
  const counts = new Map();
  for (const node of graph.nodes.filter((item) => item.degree > 0)) {
    const group = groupForNode(node);
    counts.set(group, (counts.get(group) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => ({ label, color: groupColors[label] || fallbackGroupColors[Math.abs(hashString(label)) % fallbackGroupColors.length] }));
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}

function graphDataFromVault(graph) {
  const linkedNodes = graph.nodes.filter((node) => node.degree > 0);
  const linkedIds = new Set(linkedNodes.map((node) => node.id));
  const linkedEdges = graph.edges.filter((edge) => linkedIds.has(edge.source) && linkedIds.has(edge.target));
  const visibleIds = largestComponentIds(linkedNodes, linkedEdges);
  const groupFilteredIds = new Set(
    linkedNodes
      .filter((node) => visibleIds.has(node.id))
      .filter((node) => !state.activeGroup || groupForNode(node) === state.activeGroup)
      .map((node) => node.id)
  );
  return {
    nodes: linkedNodes.filter((node) => groupFilteredIds.has(node.id)).map((node) => ({
      ...node,
      color: colorForNode(node),
      val: radiusForNode(node),
      phase: seededPhase(node.id),
      orbitDepth: Math.sin(seededPhase(node.id) * 2.17),
      orbitTilt: Math.cos(seededPhase(node.id) * 1.31)
    })),
    links: linkedEdges
      .filter((edge) => groupFilteredIds.has(edge.source) && groupFilteredIds.has(edge.target))
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        type: edge.type
      }))
  };
}

function applyGraphGroupFilter(group) {
  state.activeGroup = group;
  state.hovered = null;
  updateHoverCard(null);
  if (state.graph) {
    installGraph(state.graph);
    renderSidebar();
    const firstNode = state.forceGraph?.graphData().nodes[0];
    if (firstNode) {
      renderNodePreview(firstNode, group ? `${group} 필터` : "전체 연결 그래프");
    } else {
      renderEmptyPreview(group);
    }
  }
}

function seededPhase(value) {
  let seed = 0;
  for (let i = 0; i < value.length; i++) seed = (seed * 31 + value.charCodeAt(i)) >>> 0;
  return (seed % 6283) / 1000;
}

function largestComponentIds(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    adjacency.get(edge.source).push(edge.target);
    adjacency.get(edge.target).push(edge.source);
  }
  const visited = new Set();
  let largest = new Set();
  for (const id of ids) {
    if (visited.has(id)) continue;
    const component = new Set();
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const current = stack.pop();
      component.add(current);
      for (const next of adjacency.get(current) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    if (component.size > largest.size) largest = component;
  }
  return largest;
}

function installGraph(graph) {
  const data = graphDataFromVault(graph);
  if (state.motionTimer) {
    clearInterval(state.motionTimer);
    state.motionTimer = null;
  }
  if (state.controlsTimer) {
    clearInterval(state.controlsTimer);
    state.controlsTimer = null;
  }
  graphEl.innerHTML = "";
  majorLabels.innerHTML = "";
  const rect = graphEl.getBoundingClientRect();
  const graphWidth = Math.max(640, Math.floor(rect.width || graphEl.clientWidth || window.innerWidth - 260));
  const graphHeight = Math.max(520, Math.floor(rect.height || graphEl.clientHeight || window.innerHeight));

  state.forceGraph = ForceGraph3D()(graphEl)
    .width(graphWidth)
    .height(graphHeight)
    .backgroundColor("rgba(5,5,6,0)")
    .graphData(data)
    .nodeId("id")
    .nodeVal("val")
    .nodeRelSize(1.75)
    .nodeResolution(10)
    .nodeOpacity(0.94)
    .nodeColor((node) => node.color)
    .nodeLabel((node) => `${node.title}\n${node.path}`)
    .enableNavigationControls(true)
    .enablePointerInteraction(true)
    .enableNodeDrag(false)
    .linkColor((link) => {
      if (isLinkedToFocus(link)) return "rgba(250,247,255,0.98)";
      return hasFocus() ? "rgba(176,184,202,0.12)" : "rgba(205,212,228,0.34)";
    })
    .linkWidth((link) => isLinkedToFocus(link) ? 1.55 : hasFocus() ? 0.32 : 0.58)
    .linkOpacity(0.56)
    .linkDirectionalParticles((link) => {
      if (isLinkedToFocus(link)) return 5;
      return isImportantLink(link) ? 1 : 0;
    })
    .linkDirectionalParticleColor((link) => isLinkedToFocus(link) ? "rgba(255,255,255,0.9)" : "rgba(199,207,226,0.52)")
    .linkDirectionalParticleWidth((link) => isLinkedToFocus(link) ? 1.75 : 0.7)
    .linkDirectionalParticleSpeed((link) => isLinkedToFocus(link) ? 0.012 : 0.0035)
    .cooldownTicks(260)
    .onNodeHover((node) => {
      if (state.hoverClearTimer) clearTimeout(state.hoverClearTimer);
      if (node) {
        setHoveredNode(node);
      } else {
        graphEl.style.cursor = "grab";
        state.hoverClearTimer = setTimeout(() => {
          setHoveredNode(null);
        }, 180);
      }
    })
    .onNodeClick((node) => {
      selectNote(node.id);
      const distance = 520;
      const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
      state.forceGraph.cameraPosition(
        { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
        node,
        900
      );
    });

  state.forceGraph
    .d3Force("charge")
    .strength((node) => node.degree > 24 ? -135 : -72);
  state.forceGraph
    .d3Force("link")
    .distance((link) => {
      const source = typeof link.source === "object" ? link.source : null;
      const target = typeof link.target === "object" ? link.target : null;
      const degree = Math.max(source?.degree || 0, target?.degree || 0);
      return degree > 20 ? 82 : 120;
    })
    .strength(0.2);

  state.forceGraph.cameraPosition({ x: 0, y: 88, z: 430 }, { x: 0, y: 0, z: 0 }, 0);

  const controls = state.forceGraph.controls();
  controls.enabled = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.zoomSpeed = 1.1;
  controls.rotateSpeed = 0.72;
  controls.panSpeed = 0.8;
  controls.autoRotate = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;

  setTimeout(() => {
    state.forceGraph.cameraPosition({ x: 0, y: 240, z: 1176 }, { x: 0, y: 0, z: 0 }, 1300);
    setTimeout(updateMajorLabels, 1320);
  }, 900);
  state.motionTimer = setInterval(() => {
    if (!state.forceGraph) return;
    const alpha = activeFocusId() ? 0.08 : 0.018;
    if (state.forceGraph.d3AlphaTarget) state.forceGraph.d3AlphaTarget(alpha);
  }, 1800);
  state.controlsTimer = setInterval(() => {
    const graph = state.forceGraph;
    if (!graph) return;
    const controls = graph.controls();
    if (controls?.update) controls.update();
    rotateSceneWhenIdle();
  }, 16);
}

function rotateSceneWhenIdle() {
  if (!state.forceGraph) return;
  const scene = state.forceGraph.scene?.();
  if (!scene) return;
  scene.rotation.y += 0.00075;
  scene.rotation.x = Math.sin(Date.now() * 0.00008) * 0.08;
  updateMajorLabels();
}

function updateHoverCard(node) {
  if (!node) {
    hoverCard.style.display = "none";
    return;
  }
  hoverCard.innerHTML = `<strong>${escapeHtml(node.title)}</strong><span>${escapeHtml(node.path)} · ${node.degree || 0} links</span>`;
  hoverCard.style.display = "block";
}

function createLabeledNode(node) {
  return null;
}

function updateMajorLabels() {
  if (!state.forceGraph) return;
  const canvas = graphEl.querySelector("canvas");
  if (!canvas) return;
  const labels = state.forceGraph.graphData().nodes
    .filter((node) => (node.degree || 0) >= 24 && Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 14);

  majorLabels.innerHTML = "";
  const rect = canvas.getBoundingClientRect();
  const mainRect = document.querySelector(".main").getBoundingClientRect();
  for (const node of labels) {
    const point = state.forceGraph.graph2ScreenCoords(node.x, node.y, node.z);
    const x = rect.left - mainRect.left + point.x;
    const y = rect.top - mainRect.top + point.y;
    if (x < 12 || x > mainRect.width - 250 || y < 72 || y > mainRect.height - 58) continue;
    const el = document.createElement("div");
    el.className = "major-label";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.textContent = node.title.slice(0, 34);
    majorLabels.appendChild(el);
  }
}

function setHoveredNode(node) {
  if (state.hoverClearTimer) clearTimeout(state.hoverClearTimer);
  state.hovered = node || null;
  graphEl.style.cursor = node ? "pointer" : "grab";
  updateHoverCard(node);
  if (!state.askMode || document.activeElement?.id !== "askInput") {
    renderNodePreview(node || state.selected, node ? "커서 위치" : "선택된 노트");
  }
  update3dFocusStyles();
}

function nearestNodeFromPointer(event) {
  if (!state.forceGraph) return null;
  const canvas = graphEl.querySelector("canvas");
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let best = null;
  let bestDistance = 30;
  for (const node of state.forceGraph.graphData().nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)) continue;
    const point = state.forceGraph.graph2ScreenCoords(node.x, node.y, node.z);
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

function renderNodePreview(node, label = "선택된 노트") {
  if (!node) return;
  document.querySelector("#notePane .caption").textContent = label;
  document.getElementById("noteTitle").textContent = node.title;
  document.getElementById("notePreview").textContent = node.preview || "미리보기 텍스트가 없습니다.";
  document.getElementById("selectedPath").textContent = node.path || "-";
  document.getElementById("selectedDegree").textContent = node.degree ?? "-";

  const tags = document.getElementById("noteTags");
  tags.innerHTML = "";
  for (const tag of (node.tags || []).slice(0, 8)) {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = `#${tag}`;
    tags.appendChild(el);
  }
}

function renderEmptyPreview(group) {
  document.querySelector("#notePane .caption").textContent = group ? `${group} 필터` : "전체 연결 그래프";
  document.getElementById("noteTitle").textContent = "표시할 연결 노트가 없습니다";
  document.getElementById("notePreview").textContent = "현재 필터에 해당하는 연결 노트가 메인 그래프 안에 없습니다. 하단의 전체 칩을 누르면 다시 전체 연결 그래프로 돌아갑니다.";
  document.getElementById("selectedPath").textContent = group || "-";
  document.getElementById("selectedDegree").textContent = "0";
  document.getElementById("noteTags").innerHTML = "";
}

function update3dFocusStyles() {
  if (!state.forceGraph) return;
  const focused = hasFocus();
  for (const node of state.forceGraph.graphData().nodes) {
    if (!node.__object || !node.__core || !node.__halo) continue;
    const isFocus = isFocusedNode(node);
    const isLinked = isNodeLinkedToFocus(node);
    const dimmed = focused && !isFocus && !isLinked;
    node.__core.material.opacity = isFocus ? 1 : dimmed ? 0.2 : 0.88;
    node.__halo.material.opacity = isFocus ? 0.34 : isLinked ? 0.24 : dimmed ? 0.035 : 0.14;
    const scale = isFocus ? 1.42 : isLinked ? 1.16 : 1;
    node.__object.scale.setScalar(scale);
  }
}

function isImportantLink(link) {
  const source = typeof link.source === "object" ? link.source : null;
  const target = typeof link.target === "object" ? link.target : null;
  if (!source || !target) return false;
  return Math.max(source.degree || 0, target.degree || 0) >= 18;
}

function isNodeLinkedToFocus(node) {
  const focus = activeFocusId();
  if (!focus || node.id === focus || !state.forceGraph) return false;
  const links = state.forceGraph.graphData().links;
  return links.some((link) => {
    const source = typeof link.source === "object" ? link.source.id : link.source;
    const target = typeof link.target === "object" ? link.target.id : link.target;
    return (source === focus && target === node.id) || (target === focus && source === node.id);
  });
}

async function selectNote(id) {
  state.askMode = false;
  const note = await fetchJson(`/api/note?id=${encodeURIComponent(id)}`);
  state.selected = note;
  renderNodePreview(note, "선택된 노트");
  document.getElementById("markdownPreview").textContent = note.content.slice(0, 1800);

  const backlinks = document.getElementById("backlinks");
  backlinks.innerHTML = "";
  for (const backlink of note.backlinks) {
    const item = document.createElement("div");
    item.className = "backlink";
    item.innerHTML = `<strong>${escapeHtml(backlink.title)}</strong><span>${escapeHtml(backlink.path)}</span>`;
    item.addEventListener("click", () => selectNote(backlink.id));
    backlinks.appendChild(item);
  }

  renderSidebar();
  update3dFocusStyles();
}

async function searchNotes(query) {
  state.notes = await fetchJson(`/api/notes?q=${encodeURIComponent(query)}`);
  renderSidebar();
}

async function askVault(query) {
  const askStatus = document.getElementById("askStatus");
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    state.askResults = [];
    askStatus.textContent = "ready";
    return;
  }

  askStatus.textContent = "searching";
  const result = await fetchJson(`/api/ask?q=${encodeURIComponent(trimmed)}`);
  state.askMode = true;
  state.askResults = result.results || [];
  state.notes = state.askResults;
  renderSidebar();

  if (state.askResults.length) {
    const first = state.askResults[0];
    state.selected = first;
    renderAskAnswer(trimmed, result.answer, state.askResults);
    document.getElementById("markdownPreview").textContent = result.answer || "";
    askStatus.textContent = `${state.askResults.length} sources`;
    update3dFocusStyles();
  } else {
    renderEmptyAsk(trimmed);
    askStatus.textContent = "no match";
  }
}

function renderAskAnswer(query, answer, results) {
  document.querySelector("#notePane .caption").textContent = `Ask · ${results.length} sources`;
  document.getElementById("noteTitle").textContent = query;
  document.getElementById("notePreview").textContent = answer || "답변을 만들 근거가 부족합니다.";
  document.getElementById("selectedPath").textContent = results[0]?.path || "-";
  document.getElementById("selectedDegree").textContent = results[0]?.degree ?? "-";

  const tags = document.getElementById("noteTags");
  tags.innerHTML = "";
  for (const note of results.slice(0, 5)) {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = note.title.slice(0, 28);
    tags.appendChild(el);
  }
}

function renderEmptyAsk(query) {
  document.querySelector("#notePane .caption").textContent = "Ask 결과";
  document.getElementById("noteTitle").textContent = "관련 노트를 찾지 못했습니다";
  document.getElementById("notePreview").textContent = `"${query}"와 직접 연결되는 제목, 태그, 경로, 미리보기가 없습니다. 다른 키워드로 다시 질문해 보세요.`;
  document.getElementById("selectedPath").textContent = "-";
  document.getElementById("selectedDegree").textContent = "0";
  document.getElementById("noteTags").innerHTML = "";
}

async function load() {
  if (!window.ForceGraph3D) {
    throw new Error("3d-force-graph 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.");
  }
  state.graph = await fetchJson("/api/graph");
  state.notes = await fetchJson("/api/notes");
  installGraph(state.graph);
  renderSidebar();
  const first = state.graph.nodes.find((node) => node.path === "INDEX.md") || state.graph.nodes[0];
  if (first) await selectNote(first.id);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

let askTimer = null;
document.getElementById("searchInput").addEventListener("input", (event) => searchNotes(event.target.value));
document.getElementById("searchInput").addEventListener("focus", () => {
  state.askMode = false;
});
document.getElementById("askInput").addEventListener("input", (event) => {
  clearTimeout(askTimer);
  askTimer = setTimeout(() => askVault(event.target.value), 180);
});
document.getElementById("askInput").addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!state.askResults.length) await askVault(event.target.value);
  if (state.askResults[0]) selectNote(state.askResults[0].id);
});
document.getElementById("refresh").addEventListener("click", () => load());
document.getElementById("openObsidian").addEventListener("click", () => {
  const vaultPath = state.graph?.vaultRoot || "";
  if (vaultPath) location.href = `obsidian://open?path=${encodeURIComponent(vaultPath)}`;
});
graphEl.addEventListener("mousemove", (event) => {
  const nearest = nearestNodeFromPointer(event);
  if (nearest !== state.hovered) setHoveredNode(nearest);
  if (hoverCard.style.display === "none") return;
  const rect = document.querySelector(".main").getBoundingClientRect();
  const x = event.clientX - rect.left + 14;
  const y = event.clientY - rect.top + 14;
  hoverCard.style.left = `${Math.min(x, rect.width - 340)}px`;
  hoverCard.style.top = `${Math.min(y, rect.height - 92)}px`;
});
graphEl.addEventListener("mouseleave", () => {
  setTimeout(() => {
    if (!state.hovered) hoverCard.style.display = "none";
  }, 80);
});
addEventListener("resize", () => {
  state.forceGraph?.width(graphEl.clientWidth).height(graphEl.clientHeight);
  updateMajorLabels();
});

load().catch((error) => {
  document.getElementById("noteTitle").textContent = "vault 연결 실패";
  document.getElementById("notePreview").textContent = location.protocol === "file:"
    ? "이 파일은 서버 앱입니다. http://localhost:4177 로 열면 Obsidian vault와 디자인이 정상 연결됩니다."
    : error.message;
});
