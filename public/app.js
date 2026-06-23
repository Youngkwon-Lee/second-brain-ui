const apiBase = location.protocol === "file:" ? "http://localhost:4178" : "";
const graphEl = document.getElementById("graph");
const hoverCard = document.createElement("div");
hoverCard.className = "hover-card";
document.querySelector(".main").appendChild(hoverCard);
const majorLabels = document.createElement("div");
majorLabels.className = "major-labels";
document.querySelector(".main").appendChild(majorLabels);

function initialLocale() {
  const stored = localStorage.getItem("secondBrainLocale");
  if (stored === "ko" || stored === "en") return stored;
  return navigator.language?.toLowerCase().startsWith("ko") ? "ko" : "en";
}

function initialNotePanePosition() {
  return localStorage.getItem("secondBrainNotePanePosition") === "left" ? "left" : "right";
}

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
  activeView: "linked",
  health: null,
  candidates: null,
  activeHealthQueue: "isolated",
  askResults: [],
  askMode: false,
  evidenceMode: false,
  locale: initialLocale(),
  notePanePosition: initialNotePanePosition(),
  notePaneDismissed: false,
  currentEmptyPreviewGroup: null,
  foldoutsInitialized: false
};
window.__vaultApp = state;

const dictionaries = {
  en: {
    connecting: "Connecting vault",
    refresh: "Refresh",
    searchPlaceholder: "Search notes, tags, links",
    overview: "Overview",
    notes: "Notes",
    edges: "Edges",
    tags: "Tags",
    unresolved: "Unresolved",
    brainHealth: "Brain Health",
    candidateQueue: "Candidate Queue",
    keep: "Keep",
    promote: "Promote",
    archive: "Archive",
    reviewReady: "Review ready",
    recentCandidateStatus: "Recent Candidate Status",
    recentNotes: "Recent Notes",
    findEvidence: "Find evidence",
    localMarkdownRetrieval: "local markdown retrieval",
    evidencePlaceholder: "Search evidence notes",
    openObsidian: "Open Obsidian",
    selectedNote: "Selected Note",
    loading: "Loading",
    readingVault: "Reading vault.",
    openInObsidian: "Open in Obsidian",
    graphContext: "Graph Context",
    collapsePanel: "Collapse panel",
    moveCard: "Move card",
    hideCard: "Hide card",
    path: "Path",
    degree: "Degree",
    healthQueue: "Health Queue",
    backlinks: "Backlinks",
    outlinks: "Outlinks",
    markdownPreview: "Markdown Preview",
    noReviewReady: "No review-ready candidates.",
    healthUnavailable: "Could not read health.json.",
    noQueueItems: "No items in this queue.",
    healthItem: "Health item",
    healthQueueCaption: "Health queue",
    healthMissingFromGraph: "This item exists in the context graph health report but is not included in the current canonical scan graph.",
    hoverLocation: "Cursor position",
    fullGraph: "Full linked graph",
    noLinkedNotes: "No linked notes to display",
    noLinkedNotesBody: "No linked notes match the current filter. Use the chips below to return to the full graph.",
    previewMissing: "No preview text available.",
    evidenceSearch: "Evidence search",
    insufficientEvidence: "Not enough evidence to build a grounded result.",
    noEvidenceTitle: "No related notes found",
    noEvidenceBody: (query) => `No title, tag, path, or preview directly matches "${query}". Try different keywords.`,
    ready: "ready",
    searching: "searching",
    noMatch: "no match",
    linked: "linked",
    full: "Full",
    oneHop: "1-hop",
    twoHop: "2-hop",
    filters: "Filters",
    perspective: "perspective",
    hubs: "hubs",
    recent: "recent",
    isolated: "isolated",
    frontmatter: "frontmatter",
    promotion: "promotion",
    context: "Context",
    linkedNotesCount: (linked, total) => `${linked} linked / ${total} notes`,
    sourcesCount: (count) => `${count} sources`,
    linksCount: (count) => `${count} links`,
    filteredBy: (group) => `${group} filter`,
    score: "score",
    matched: "matched",
    vaultConnectFailed: "Vault connection failed",
    fileServerHint: "This is a server app. Open http://localhost:4178 to connect to the Obsidian vault."
  },
  ko: {
    connecting: "vault 연결 중",
    refresh: "새로고침",
    searchPlaceholder: "노트, 태그, 링크 검색",
    overview: "개요",
    notes: "노트",
    edges: "링크",
    tags: "태그",
    unresolved: "미해결 링크",
    brainHealth: "브레인 상태",
    candidateQueue: "후보 큐",
    keep: "Keep",
    promote: "Promote",
    archive: "Archive",
    reviewReady: "검토 대기",
    recentCandidateStatus: "최근 후보 상태",
    recentNotes: "최근 노트",
    findEvidence: "근거 찾기",
    localMarkdownRetrieval: "로컬 마크다운 검색",
    evidencePlaceholder: "근거 노트 검색",
    openObsidian: "Obsidian 열기",
    selectedNote: "선택된 노트",
    loading: "로딩 중",
    readingVault: "vault를 읽고 있습니다.",
    openInObsidian: "Obsidian에서 열기",
    graphContext: "그래프 맥락",
    collapsePanel: "패널 접기",
    moveCard: "카드 위치 이동",
    hideCard: "카드 숨기기",
    path: "경로",
    degree: "연결 수",
    healthQueue: "상태 큐",
    backlinks: "백링크",
    outlinks: "아웃링크",
    markdownPreview: "마크다운 미리보기",
    noReviewReady: "검토 대기 candidate가 없습니다.",
    healthUnavailable: "health.json을 읽지 못했습니다.",
    noQueueItems: "현재 큐에 항목이 없습니다.",
    healthItem: "상태 항목",
    healthQueueCaption: "상태 큐",
    healthMissingFromGraph: "이 항목은 context graph health report에는 있지만 현재 canonical scan graph에는 포함되지 않았습니다.",
    hoverLocation: "커서 위치",
    fullGraph: "전체 연결 그래프",
    noLinkedNotes: "표시할 연결 노트가 없습니다",
    noLinkedNotesBody: "현재 필터에 해당하는 연결 노트가 메인 그래프 안에 없습니다. 하단의 전체 칩을 누르면 다시 전체 연결 그래프로 돌아갑니다.",
    previewMissing: "미리보기 텍스트가 없습니다.",
    evidenceSearch: "근거 검색",
    insufficientEvidence: "답변을 만들 근거가 부족합니다.",
    noEvidenceTitle: "관련 노트를 찾지 못했습니다",
    noEvidenceBody: (query) => `"${query}"와 직접 연결되는 제목, 태그, 경로, 미리보기가 없습니다. 다른 키워드로 다시 검색해 보세요.`,
    ready: "준비",
    searching: "검색 중",
    noMatch: "결과 없음",
    linked: "연결",
    full: "전체",
    oneHop: "1-hop",
    twoHop: "2-hop",
    filters: "필터",
    perspective: "관점",
    hubs: "허브",
    recent: "최근",
    isolated: "고립",
    frontmatter: "프론트매터",
    promotion: "승격",
    context: "맥락",
    linkedNotesCount: (linked, total) => `${linked} 연결 / ${total} 노트`,
    sourcesCount: (count) => `${count}개 근거`,
    linksCount: (count) => `${count}개 링크`,
    filteredBy: (group) => `${group} 필터`,
    score: "점수",
    matched: "매칭",
    vaultConnectFailed: "vault 연결 실패",
    fileServerHint: "이 파일은 서버 앱입니다. http://localhost:4178 로 열면 Obsidian vault와 정상 연결됩니다."
  }
};

function t(key, ...args) {
  const dictionary = dictionaries[state.locale] || dictionaries.en;
  const value = dictionary[key] ?? dictionaries.en[key] ?? key;
  return typeof value === "function" ? value(...args) : value;
}

function translatedViewLabel(viewId) {
  return t(viewId);
}

function actionLabel(action) {
  const labels = {
    en: {
      "review": "review",
      "promote": "promote",
      "promoted": "promoted",
      "kept": "kept",
      "reference": "reference",
      "archived": "archived"
    },
    ko: {
      "review": "검토",
      "promote": "승격",
      "promoted": "승격됨",
      "kept": "보관",
      "reference": "참고",
      "archived": "아카이브"
    }
  };
  return labels[state.locale]?.[action] || action;
}

function reasonLabel(reason) {
  const labels = {
    en: {
      "exact title": "exact title",
      "exact heading": "exact heading",
      "exact text": "exact text",
      "exact path": "exact path",
      title: "title",
      heading: "heading",
      path: "path",
      tag: "tag",
      body: "body"
    },
    ko: {
      "exact title": "제목 정확일치",
      "exact heading": "섹션 정확일치",
      "exact text": "본문 정확일치",
      "exact path": "경로 정확일치",
      title: "제목",
      heading: "섹션",
      path: "경로",
      tag: "태그",
      body: "본문"
    }
  };
  return labels[state.locale]?.[reason] || reason;
}

function formatEvidenceMeta(note) {
  const reasons = (note.matchReasons || []).slice(0, 3).map(reasonLabel).join(", ");
  const terms = (note.matchedTerms || []).slice(0, 3).join(", ");
  const parts = [`${t("score")} ${Math.round(Number(note.score || 0))}`];
  if (reasons) parts.push(reasons);
  if (terms) parts.push(`${t("matched")} ${terms}`);
  return parts.join(" · ");
}

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
const graphViews = [
  { id: "linked", label: "linked" },
  { id: "perspective", label: "perspective" },
  { id: "hubs", label: "hubs" },
  { id: "recent", label: "recent" },
  { id: "isolated", label: "isolated" }
];

function applyLocale() {
  document.documentElement.lang = state.locale === "ko" ? "ko" : "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    if (element.id === "noteMode" && state.graph) return;
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.title = t(element.dataset.i18nTitle);
  });
  const localeToggle = document.getElementById("localeToggle");
  if (localeToggle) {
    localeToggle.textContent = state.locale.toUpperCase();
    localeToggle.title = state.locale === "ko" ? "한국어" : "English";
  }
  const askInput = document.getElementById("askInput");
  const askStatus = document.getElementById("askStatus");
  if (askInput && askStatus && askInput.value.trim().length < 2) askStatus.textContent = t("ready");
}

function setLocale(locale) {
  state.locale = locale === "ko" ? "ko" : "en";
  localStorage.setItem("secondBrainLocale", state.locale);
  applyLocale();
  if (state.graph) {
    renderSidebar();
    renderHealthList();
    refreshActivePreview();
  }
}

function applyNotePanePosition() {
  const pane = document.getElementById("notePane");
  pane.classList.toggle("left", state.notePanePosition === "left");
  pane.classList.toggle("right", state.notePanePosition !== "left");
}

function showNotePane() {
  state.notePaneDismissed = false;
  document.getElementById("notePane").classList.remove("hidden");
}

function hideNotePane() {
  state.notePaneDismissed = true;
  document.getElementById("notePane").classList.add("hidden");
}

function toggleNotePanePosition() {
  state.notePanePosition = state.notePanePosition === "left" ? "right" : "left";
  localStorage.setItem("secondBrainNotePanePosition", state.notePanePosition);
  applyNotePanePosition();
}

async function fetchJson(url) {
  const res = await fetch(`${apiBase}${url}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function postJson(url, payload) {
  const res = await fetch(`${apiBase}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `${res.status} ${res.statusText}`);
  }
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
  document.getElementById("statUnresolved").textContent = graph.stats.unresolved.toLocaleString();
  renderHealthSummary();
  renderCandidateQueue();

  const noteList = document.getElementById("noteList");
  noteList.innerHTML = "";
  for (const note of state.notes.slice(0, 80)) {
    noteList.appendChild(createNoteListItem(note, state.evidenceMode ? formatEvidenceMeta(note) : ""));
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
  const linkedCount = graph.nodes.filter((node) => node.degree > 0).length;
  const primaryHud = document.createElement("div");
  primaryHud.className = "hud-row primary";
  primaryHud.appendChild(createHudChip(t("full"), state.activeView === "linked" && state.activeGroup === null, () => applyGraphFilter({ view: "linked", group: null })));
  primaryHud.appendChild(createHudChip(t("oneHop"), state.activeView === "context1", () => applyGraphFilter({ view: "context1", group: null }), null, !state.selected));
  primaryHud.appendChild(createHudChip(t("twoHop"), state.activeView === "context2", () => applyGraphFilter({ view: "context2", group: null }), null, !state.selected));
  const count = document.createElement("span");
  count.className = "hud-count";
  count.textContent = t("linkedNotesCount", linkedCount.toLocaleString(), graph.stats.notes.toLocaleString());
  primaryHud.appendChild(count);
  graphHud.appendChild(primaryHud);

  const secondaryHud = document.createElement("details");
  secondaryHud.className = "hud-filters";
  const summary = document.createElement("summary");
  summary.textContent = t("filters");
  secondaryHud.appendChild(summary);
  const filterRow = document.createElement("div");
  filterRow.className = "hud-row filters";
  for (const view of graphViews.slice(1)) {
    filterRow.appendChild(createHudChip(translatedViewLabel(view.id), state.activeView === view.id, () => applyGraphFilter({ view: view.id })));
  }
  for (const { label, color } of availableGroups(graph).slice(0, 7)) {
    filterRow.appendChild(createHudChip(label, state.activeGroup === label, () => applyGraphFilter({ group: state.activeGroup === label ? null : label }), color));
  }
  secondaryHud.appendChild(filterRow);
  graphHud.appendChild(secondaryHud);
}

function renderHealthSummary() {
  const health = state.health;
  const stats = health?.stats || {};
  const isolatedCount = stats.isolated_canonical_non_literature ?? health?.isolated?.length ?? 0;
  const frontmatterCount = stats.missing_frontmatter ?? health?.missingFrontmatter?.length ?? 0;
  const promotionCount = stats.candidate_promotion_hints ?? health?.candidatePromotions?.length ?? 0;
  setHealthCard("healthIsolated", isolatedCount, "isolated");
  setHealthCard("healthFrontmatter", frontmatterCount, "missingFrontmatter");
  setHealthCard("healthPromotions", promotionCount, "candidatePromotions");
  const total = Number(isolatedCount || 0) + Number(frontmatterCount || 0) + Number(promotionCount || 0);
  document.getElementById("healthSummaryBadge").textContent = total.toLocaleString();
  updateHealthQueueVisibility();
}

function setHealthCard(id, count, queueName) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.toggle("active", state.activeHealthQueue === queueName);
  card.querySelector("strong").textContent = Number(count || 0).toLocaleString();
  card.onclick = () => {
    state.activeHealthQueue = queueName;
    renderHealthList();
    renderHealthSummary();
  };
}

function renderCandidateQueue() {
  const candidates = state.candidates;
  const readyCount = Number(candidates?.reviewReady || 0);
  document.getElementById("candidateReady").textContent = readyCount.toLocaleString();
  document.getElementById("candidateSummaryBadge").textContent = readyCount.toLocaleString();
  const list = document.getElementById("candidateList");
  list.innerHTML = "";
  const readyNotes = candidates?.readyNotes || [];
  if (!readyNotes.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state success";
    empty.textContent = t("noReviewReady");
    list.appendChild(empty);
  }
  for (const note of readyNotes.slice(0, 8)) {
    list.appendChild(createCandidateListItem(note, true));
  }

  const archiveList = document.getElementById("candidateArchiveList");
  archiveList.innerHTML = "";
  for (const note of (candidates?.archiveNotes || []).slice(0, 5)) {
    archiveList.appendChild(createCandidateListItem(note, false));
  }
  syncFoldoutDefaults();
}

function syncFoldoutDefaults() {
  if (state.foldoutsInitialized || !state.health || !state.candidates) return;
  const healthOpen = Number(document.getElementById("healthSummaryBadge")?.textContent.replace(/,/g, "") || 0) > 0;
  const candidateOpen = Number(document.getElementById("candidateSummaryBadge")?.textContent.replace(/,/g, "") || 0) > 0;
  document.getElementById("brainHealthFoldout").open = healthOpen;
  document.getElementById("candidateQueueFoldout").open = candidateOpen;
  state.foldoutsInitialized = true;
}

function renderHealthList() {
  const list = document.getElementById("healthList");
  if (!list) return;
  list.innerHTML = "";
  const items = healthItemsForQueue(state.activeHealthQueue);
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.health?.available === false ? t("healthUnavailable") : t("noQueueItems");
    list.appendChild(empty);
    return;
  }
  for (const item of items.slice(0, 14)) {
    const note = graphNodeForHealthItem(item);
    const row = document.createElement("div");
    row.className = "note-item health-item";
    row.innerHTML = `<strong>${escapeHtml(item.title || item.id || "Untitled")}</strong><span>${escapeHtml(item.id || item.path || "")} · ${t("degree")} ${item.degree ?? "-"}</span>`;
    row.addEventListener("click", () => {
      if (note) selectNote(note.id);
      else renderHealthPreview(item);
    });
    list.appendChild(row);
  }
  updateHealthQueueVisibility();
}

function updateHealthQueueVisibility() {
  const section = document.getElementById("healthQueueSection");
  if (!section) return;
  const hasIssues = ["isolated", "missingFrontmatter", "candidatePromotions"].some((queueName) => healthItemsForQueue(queueName).length > 0);
  section.hidden = !hasIssues;
}

function healthItemsForQueue(queueName) {
  if (!state.health?.available) return [];
  return {
    isolated: state.health.isolated || [],
    missingFrontmatter: state.health.missingFrontmatter || [],
    candidatePromotions: state.health.candidatePromotions || [],
    routerLeaf: state.health.routerLeaf || []
  }[queueName] || [];
}

function graphNodeForHealthItem(item) {
  const id = String(item.id || "").replace(/\.md$/, "");
  return state.graph?.nodes.find((node) => node.id === id || node.path === item.id) || null;
}

function renderHealthPreview(item) {
  showNotePane();
  setNotePaneMeta(t("healthQueueCaption"), item.id || "-", item.degree ?? "-");
  document.getElementById("noteTitle").textContent = item.title || item.id || t("healthItem");
  document.getElementById("notePreview").textContent = t("healthMissingFromGraph");
  document.getElementById("selectedPath").textContent = item.id || "-";
  document.getElementById("selectedDegree").textContent = item.degree ?? "-";
  document.getElementById("noteTags").innerHTML = "";
}

function createNoteListItem(note, meta = "") {
  const item = document.createElement("div");
  item.className = `note-item${state.selected?.id === note.id ? " active" : ""}`;
  const detail = meta || t("linksCount", (note.links || []).length);
  item.innerHTML = `<strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.path)} · ${escapeHtml(detail)}</span>`;
  item.addEventListener("click", () => selectNote(note.id));
  return item;
}

function createCandidateListItem(note, showActions) {
  const item = createNoteListItem(note, `${actionLabel(note.actionHint)} · ${t("score")} ${Math.round(note.reviewScore || 0)}`);
  item.classList.add("candidate-item");
  if (!showActions) return item;
  const actions = document.createElement("div");
  actions.className = "candidate-actions";
  for (const action of ["keep", "promote", "archive"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = t(action);
    button.className = `candidate-action ${action}`;
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await applyCandidateAction(note.id, action, button);
    });
    actions.appendChild(button);
  }
  item.appendChild(actions);
  return item;
}

async function applyCandidateAction(id, action, button) {
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = "...";
  try {
    await postJson("/api/candidate-action", { id, action });
    state.candidates = await fetchJson("/api/candidates");
    state.graph = await fetchJson("/api/graph");
    renderSidebar();
  } catch (error) {
    button.textContent = "!";
    setTimeout(() => {
      button.textContent = previous;
      button.disabled = false;
    }, 1400);
    console.error(error);
  }
}

function createHudChip(label, active, onClick, color = null, disabled = false) {
  const chip = document.createElement("button");
  chip.className = `chip${active ? " active" : ""}`;
  chip.disabled = disabled;
  chip.innerHTML = `<span class="dot"${color ? ` style="background:${color}"` : ""}></span>${escapeHtml(label)}`;
  chip.addEventListener("click", onClick);
  return chip;
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
  const visibleIds = idsForActiveView(graph, linkedNodes, linkedEdges);
  const groupFilteredIds = new Set(
    graph.nodes
      .filter((node) => visibleIds.has(node.id))
      .filter((node) => !state.activeGroup || groupForNode(node) === state.activeGroup)
      .map((node) => node.id)
  );
  return {
    nodes: graph.nodes.filter((node) => groupFilteredIds.has(node.id)).map((node) => ({
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

function idsForActiveView(graph, linkedNodes, linkedEdges) {
  if (state.activeView === "context1" || state.activeView === "context2") {
    return neighborhoodIds(graph, state.selected?.id, state.activeView === "context2" ? 2 : 1);
  }
  if (state.activeView === "isolated") {
    return new Set(graph.nodes.filter((node) => node.degree === 0).map((node) => node.id));
  }
  if (state.activeView === "perspective") {
    const perspectiveIds = new Set(
      graph.nodes
        .filter((node) => perspectiveScore(node) >= 26)
        .sort((a, b) => perspectiveScore(b) - perspectiveScore(a))
        .slice(0, 90)
        .map((node) => node.id)
    );
    for (const edge of linkedEdges) {
      if (perspectiveIds.has(edge.source) || perspectiveIds.has(edge.target)) {
        const source = graph.nodes.find((node) => node.id === edge.source);
        const target = graph.nodes.find((node) => node.id === edge.target);
        if (source && perspectiveScore(source) >= 16) perspectiveIds.add(edge.source);
        if (target && perspectiveScore(target) >= 16) perspectiveIds.add(edge.target);
      }
    }
    return perspectiveIds;
  }
  if (state.activeView === "recent") {
    return new Set(
      linkedNodes
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 160)
        .map((node) => node.id)
    );
  }
  if (state.activeView === "hubs") {
    const sorted = linkedNodes.slice().sort((a, b) => b.degree - a.degree);
    const hubIds = new Set(sorted.slice(0, 45).map((node) => node.id));
    for (const edge of linkedEdges) {
      if (hubIds.has(edge.source) || hubIds.has(edge.target)) {
        hubIds.add(edge.source);
        hubIds.add(edge.target);
      }
      if (hubIds.size > 180) break;
    }
    return hubIds;
  }
  return largestComponentIds(linkedNodes, linkedEdges);
}

function applyGraphFilter({ view = state.activeView, group = state.activeGroup } = {}) {
  if ((view === "context1" || view === "context2") && !state.selected) return;
  state.activeView = view;
  state.activeGroup = view === "context1" || view === "context2" ? null : group;
  state.hovered = null;
  updateHoverCard(null);
  if (state.graph) {
    showNotePane();
    installGraph(state.graph);
    renderSidebar();
    const firstNode = state.forceGraph?.graphData().nodes[0];
    if (firstNode) {
      renderNodePreview(firstNode, labelForCurrentGraph());
    } else {
      renderEmptyPreview(labelForCurrentGraph());
    }
  }
}

function labelForCurrentGraph() {
  if (state.activeView === "context1") return `${t("oneHop")} · ${state.selected?.title || t("selectedNote")}`;
  if (state.activeView === "context2") return `${t("twoHop")} · ${state.selected?.title || t("selectedNote")}`;
  const view = translatedViewLabel(graphViews.find((item) => item.id === state.activeView)?.id || state.activeView);
  return state.activeGroup ? `${view} · ${state.activeGroup}` : view;
}

function neighborhoodIds(graph, rootId, depth) {
  if (!rootId) return new Set();
  const adjacency = new Map(graph.nodes.map((node) => [node.id, new Set()]));
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  }
  const visible = new Set([rootId]);
  let frontier = new Set([rootId]);
  for (let level = 0; level < depth; level++) {
    const next = new Set();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) || []) {
        if (visible.has(neighbor)) continue;
        visible.add(neighbor);
        next.add(neighbor);
      }
    }
    frontier = next;
  }
  return visible;
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
  hoverCard.innerHTML = `<strong>${escapeHtml(node.title)}</strong><span>${escapeHtml(node.path)} · ${t("linksCount", node.degree || 0)}</span>`;
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
    .filter((node) => labelScoreForNode(node) >= 18 && Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z))
    .sort((a, b) => labelScoreForNode(b) - labelScoreForNode(a))
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

function labelScoreForNode(node) {
  return state.activeView === "perspective" ? perspectiveScore(node) : majorLabelScore(node);
}

function majorLabelScore(node) {
  const title = (node.title || "").toLowerCase();
  const pathText = (node.path || node.id || "").toLowerCase();
  const group = groupForNode(node);
  let score = Math.min(36, (node.degree || 0) * 0.8);

  if (["personal", "company"].includes(group)) score += 22;
  if (["research", "projects"].includes(group)) score += 10;
  if (group === "operations") score -= 14;
  if (["_inbox", "_templates", "candidates"].includes(group)) score -= 18;

  if (/(principle|thesis|vision|strategy|identity|belief|taste|philosophy|canon|canonical|index|north star|operating model)/i.test(`${title} ${pathText}`)) score += 18;
  if (/(생각|관점|원칙|철학|정체성|전략|비전|가설|방향|기준|세계관|취향)/.test(`${title} ${pathText}`)) score += 18;
  if (/(google drive|drive|operation|ops|inventory|prompt inventory|full pass|triage|handoff|log|runbook|workflow evidence|daily|meeting|scratch)/i.test(`${title} ${pathText}`)) score -= 30;
  if (title.length > 72) score -= 8;

  return score;
}

function perspectiveScore(node) {
  const title = (node.title || "").toLowerCase();
  const pathText = (node.path || node.id || "").toLowerCase();
  const combined = `${title} ${pathText}`;
  const group = node.layer || groupForNode(node);
  const kind = (node.kind || "").toLowerCase();
  const status = (node.status || "").toLowerCase();
  let score = 0;

  if (node.perspective === true) score += 46;
  if (status === "canonical") score += 20;
  if (status.includes("canonical")) score += 14;
  if (["principle", "thesis", "self-model", "strategy", "research-axis", "research-agenda", "decision-pattern", "alignment", "business-priority"].includes(kind)) score += 26;
  if (["operation", "source", "log", "template"].includes(kind)) score -= 28;

  if (group === "personal") score += 28;
  if (group === "company") score += 24;
  if (group === "research") score += 12;
  if (group === "operations") score += 4;
  if (["projects", "_inbox", "_templates", "candidates"].includes(group)) score -= 10;

  if (/(identity|philosophy|principle|decision|operating-system|north-star|thesis|vision|strategy|priority|priorities|belief|taste|self-model|mission|values)/i.test(combined)) score += 28;
  if (/(정체성|철학|원칙|판단|의사결정|비전|전략|가설|관점|생각|세계관|미션|가치|우선순위|방향)/.test(combined)) score += 28;
  if (/(current|priority|research-agenda|infrastructure|copilot|principles|thesis|operating-system|decision-pattern|identity|alignment)/i.test(combined)) score += 12;
  if (/(readme|index|catalog|registry|lineage|queue|map)$/i.test(title) || /(\/readme|\/index|catalog|registry|lineage|queue)/i.test(pathText)) score -= 14;
  if (/(research\/literature|research\/papers|papers\/|literature\/)/i.test(pathText) || /_[a-z-]+_\d{4}$/i.test(title)) score -= 34;
  if (/(google drive|drive|operation|ops|inventory|full pass|triage|handoff|log|runbook|workflow|meeting|scratch|template|checklist)/i.test(combined)) score -= 30;

  score += Math.min(10, (node.degree || 0) * 0.25);
  return score;
}

function setHoveredNode(node) {
  if (state.hoverClearTimer) clearTimeout(state.hoverClearTimer);
  state.hovered = node || null;
  graphEl.style.cursor = node ? "pointer" : "grab";
  updateHoverCard(node);
  if (!state.evidenceMode && (!state.askMode || document.activeElement?.id !== "askInput")) {
    renderNodePreview(node || state.selected, node ? t("hoverLocation") : t("selectedNote"));
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

function renderNodePreview(node, label = t("selectedNote")) {
  if (!node) return;
  state.currentEmptyPreviewGroup = null;
  setNotePaneMeta(label, node.path || "-", node.degree ?? "-");
  document.getElementById("noteTitle").textContent = node.title;
  document.getElementById("notePreview").textContent = node.preview || t("previewMissing");
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

function setNotePaneMeta(label, pathValue, degreeValue) {
  if (!state.notePaneDismissed) document.getElementById("notePane").classList.remove("hidden");
  document.getElementById("noteMode").textContent = label;
  document.getElementById("notePathMini").textContent = pathValue || "-";
  document.getElementById("noteDegreeMini").textContent = `${t("degree")} ${degreeValue ?? "-"}`;
}

function renderEmptyPreview(group) {
  state.currentEmptyPreviewGroup = group || "";
  setNotePaneMeta(group ? t("filteredBy", group) : t("fullGraph"), group || "-", "0");
  document.getElementById("noteTitle").textContent = t("noLinkedNotes");
  document.getElementById("notePreview").textContent = t("noLinkedNotesBody");
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
  state.evidenceMode = false;
  showNotePane();
  const note = await fetchJson(`/api/note?id=${encodeURIComponent(id)}`);
  state.selected = note;
  renderNodePreview(note, t("selectedNote"));
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

  const outlinks = document.getElementById("outlinks");
  outlinks.innerHTML = "";
  for (const outlink of note.outlinks || []) {
    const item = document.createElement("div");
    item.className = "backlink";
    item.innerHTML = `<strong>${escapeHtml(outlink.title)}</strong><span>${escapeHtml(outlink.path)}</span>`;
    item.addEventListener("click", () => selectNote(outlink.id));
    outlinks.appendChild(item);
  }

  if (state.activeView === "context1" || state.activeView === "context2") {
    installGraph(state.graph);
  }
  renderSidebar();
  renderHealthList();
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
    askStatus.textContent = t("ready");
    return;
  }

  askStatus.textContent = t("searching");
  showNotePane();
  const result = await fetchJson(`/api/ask?q=${encodeURIComponent(trimmed)}`);
  state.askMode = true;
  state.evidenceMode = true;
  state.askResults = result.results || [];
  state.notes = state.askResults;
  renderSidebar();

  if (state.askResults.length) {
    const first = state.askResults[0];
    state.selected = first;
    renderAskAnswer(trimmed, result.answer, state.askResults);
    document.getElementById("markdownPreview").textContent = result.answer || "";
    askStatus.textContent = t("sourcesCount", state.askResults.length);
    update3dFocusStyles();
  } else {
    renderEmptyAsk(trimmed);
    askStatus.textContent = t("noMatch");
  }
}

function renderAskAnswer(query, answer, results) {
  setNotePaneMeta(`${t("evidenceSearch")} · ${t("sourcesCount", results.length)}`, results[0]?.path || "-", results[0]?.degree ?? "-");
  document.getElementById("noteTitle").textContent = query;
  document.getElementById("notePreview").textContent = answer || t("insufficientEvidence");
  document.getElementById("selectedPath").textContent = results[0]?.path || "-";
  document.getElementById("selectedDegree").textContent = results[0]?.degree ?? "-";

  const tags = document.getElementById("noteTags");
  tags.innerHTML = "";
  const evidenceChips = [
    ...(results[0]?.matchReasons || []).slice(0, 4).map(reasonLabel),
    ...(results[0]?.matchedTerms || []).slice(0, 4)
  ];
  for (const label of evidenceChips.slice(0, 8)) {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = label.slice(0, 28);
    tags.appendChild(el);
  }
}

function renderEmptyAsk(query) {
  setNotePaneMeta(t("evidenceSearch"), "-", "0");
  document.getElementById("noteTitle").textContent = t("noEvidenceTitle");
  document.getElementById("notePreview").textContent = t("noEvidenceBody", query);
  document.getElementById("selectedPath").textContent = "-";
  document.getElementById("selectedDegree").textContent = "0";
  document.getElementById("noteTags").innerHTML = "";
}

function refreshActivePreview() {
  const askInput = document.getElementById("askInput");
  const query = askInput?.value.trim() || "";
  if (state.askMode && state.askResults.length) {
    const answer = document.getElementById("notePreview").textContent;
    renderAskAnswer(query || document.getElementById("noteTitle").textContent, answer, state.askResults);
    document.getElementById("askStatus").textContent = t("sourcesCount", state.askResults.length);
    return;
  }
  if (state.askMode && query.length >= 2) {
    renderEmptyAsk(query);
    document.getElementById("askStatus").textContent = t("noMatch");
    return;
  }
  if (state.selected) {
    renderNodePreview(state.selected, t("selectedNote"));
    return;
  }
  if (state.currentEmptyPreviewGroup !== null) {
    renderEmptyPreview(state.currentEmptyPreviewGroup);
  }
}

async function load() {
  if (!window.ForceGraph3D) {
    throw new Error("3d-force-graph 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.");
  }
  state.graph = await fetchJson("/api/graph");
  state.health = await fetchJson("/api/health");
  state.candidates = await fetchJson("/api/candidates");
  state.notes = await fetchJson("/api/notes");
  installGraph(state.graph);
  renderSidebar();
  renderHealthList();
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
applyLocale();
applyNotePanePosition();
document.getElementById("searchInput").addEventListener("input", (event) => searchNotes(event.target.value));
document.getElementById("searchInput").addEventListener("focus", () => {
  state.askMode = false;
  state.evidenceMode = false;
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
document.getElementById("localeToggle").addEventListener("click", () => {
  setLocale(state.locale === "en" ? "ko" : "en");
});
document.getElementById("openObsidian").addEventListener("click", () => {
  openInObsidian("");
});
document.getElementById("openSelectedNote").addEventListener("click", () => {
  if (!state.selected?.path) return;
  openInObsidian(state.selected.path);
});
document.getElementById("moveNotePane").addEventListener("click", toggleNotePanePosition);
document.getElementById("closeNotePane").addEventListener("click", hideNotePane);
document.getElementById("toggleContext").addEventListener("click", () => {
  document.getElementById("rightbar").classList.toggle("collapsed");
});
document.getElementById("closeContext").addEventListener("click", () => {
  document.getElementById("rightbar").classList.add("collapsed");
});

async function openInObsidian(relativePath) {
  const result = await fetchJson(`/api/open?path=${encodeURIComponent(relativePath || "")}`);
  location.href = result.url;
}

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
  document.getElementById("noteTitle").textContent = t("vaultConnectFailed");
  document.getElementById("notePreview").textContent = location.protocol === "file:"
    ? t("fileServerHint")
    : error.message;
});
