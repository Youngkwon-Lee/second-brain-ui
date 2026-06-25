#!/usr/bin/env node
import http from "node:http";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
loadDotEnv(path.join(__dirname, ".env"));
const defaultVault = path.join(process.env.HOME || process.cwd(), "Documents", "second-brain");
const vaultRoot = path.resolve(process.env.OBSIDIAN_VAULT || defaultVault);
const port = Number(process.env.PORT || 4178);

const ignoredDirs = new Set([
  ".git",
  ".obsidian",
  ".omo",
  ".trash",
  "node_modules",
  ".pytest_cache",
  ".claude",
  "_templates",
  "operations/context-graph",
  "operations/raw",
  "operations/raw-handoff-digests",
  "operations/lint-reports",
  "operations/artifacts",
  "operations/auto-apply-notes",
  "_inbox/raw",
  "_inboxraw"
]);

const scanPolicy = {
  excluded: [...ignoredDirs].sort(),
  source: "canonical-review"
};

let cache = null;
let cacheTime = 0;
const cacheMs = 2500;

function loadDotEnv(filePath) {
  try {
    const text = requireEnvFile(filePath);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      const value = rawValue.replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Optional local config.
  }
}

function requireEnvFile(filePath) {
  return readFileSync(filePath, "utf8");
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(vaultRoot, fullPath).split(path.sep).join("/");
    if (isIgnoredPath(relativePath)) continue;
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function isIgnoredPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/\/$/, "");
  if (!normalized) return false;
  const parts = normalized.split("/");
  if (ignoredDirs.has(parts[0])) return true;
  return [...ignoredDirs].some((ignored) => normalized === ignored || normalized.startsWith(`${ignored}/`));
}

function stripFrontmatter(text) {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  return end === -1 ? text : text.slice(end + 4);
}

function frontmatterBounds(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const closeEnd = text.indexOf("\n", end + 4);
  return {
    start: 0,
    bodyStart: 3,
    bodyEnd: end,
    end: closeEnd === -1 ? text.length : closeEnd + 1
  };
}

function extractFrontmatter(text) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const body = text.slice(3, end).trim();
  const data = {};
  let currentKey = null;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s+-\s+/.test(line) && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(parseFrontmatterValue(line.replace(/^\s+-\s+/, "")));
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    currentKey = match[1];
    const value = match[2].trim();
    data[currentKey] = value ? parseFrontmatterValue(value) : [];
  }
  return data;
}

function parseFrontmatterValue(value) {
  const unquoted = value.replace(/^["']|["']$/g, "");
  if (unquoted === "true") return true;
  if (unquoted === "false") return false;
  return unquoted;
}

function serializeFrontmatterValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  const stringValue = String(value ?? "");
  return /[:#\[\]{},"']/.test(stringValue) ? JSON.stringify(stringValue) : stringValue;
}

function upsertFrontmatter(text, updates) {
  const bounds = frontmatterBounds(text);
  const current = bounds ? extractFrontmatter(text) : {};
  const next = { ...current, ...updates };
  const lines = Object.entries(next).map(([key, value]) => {
    const serialized = serializeFrontmatterValue(value);
    if (Array.isArray(serialized)) {
      return [ `${key}:`, ...serialized.map((item) => `  - ${serializeFrontmatterValue(item)}`) ].join("\n");
    }
    return `${key}: ${serialized}`;
  });
  const block = `---\n${lines.join("\n")}\n---\n`;
  if (!bounds) return `${block}\n${text.replace(/^\s+/, "")}`;
  return `${block}${text.slice(bounds.end)}`;
}

function titleFromMarkdown(text, relativePath) {
  const frontmatter = extractFrontmatter(text);
  if (frontmatter.title && typeof frontmatter.title === "string") return frontmatter.title;
  const match = stripFrontmatter(text).match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : path.basename(relativePath, ".md");
}

function previewFromMarkdown(text) {
  const cleaned = stripFrontmatter(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_>`~-]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  return cleaned.slice(0, 220);
}

function extractWikiLinks(text) {
  const links = [];
  const regex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = regex.exec(text))) {
    const target = match[1].trim();
    if (target) links.push(target.replace(/\.md$/, ""));
  }
  return links;
}

function extractMarkdownLinks(text) {
  const links = [];
  const regex = /\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g;
  let match;
  while ((match = regex.exec(text))) {
    const target = decodeURIComponent(match[1]).replace(/^\.\//, "").replace(/\.md$/, "");
    if (!target.startsWith("http")) links.push(target);
  }
  return links;
}

function extractTags(text) {
  const tags = new Set();
  const regex = /(^|[\s([{])#([A-Za-z0-9_\-/가-힣]+)/g;
  let match;
  while ((match = regex.exec(text))) {
    const tag = match[2].replace(/\/$/, "");
    if (tag && !/^\d+$/.test(tag)) tags.add(tag);
  }
  return [...tags];
}

function noteKey(relativePath) {
  return relativePath.replace(/\.md$/, "");
}

async function buildVault() {
  const files = await walk(vaultRoot);
  const notes = [];
  const byKey = new Map();
  const byBase = new Map();

  for (const fullPath of files) {
    const relativePath = path.relative(vaultRoot, fullPath);
    const raw = await fs.readFile(fullPath, "utf8");
    const key = noteKey(relativePath);
    const frontmatter = extractFrontmatter(raw);
    const note = {
      id: key,
      path: relativePath,
      title: titleFromMarkdown(raw, relativePath),
      preview: previewFromMarkdown(raw),
      tags: extractTags(raw),
      kind: frontmatter.kind || "",
      status: frontmatter.status || frontmatter.canonical_status || "",
      reviewDecision: frontmatter.review_decision || "",
      layer: frontmatter.layer || "",
      perspective: frontmatter.perspective === true || frontmatter.perspective === "true",
      links: [...extractWikiLinks(raw), ...extractMarkdownLinks(raw)],
      updatedAt: (await fs.stat(fullPath)).mtimeMs,
      content: raw
    };
    notes.push(note);
    byKey.set(key, note);
    byBase.set(path.basename(key), note);
  }

  const edges = [];
  const unresolved = new Map();
  for (const note of notes) {
    for (const link of note.links) {
      const normalized = link.replace(/^\//, "");
      const target = byKey.get(normalized) || byBase.get(path.basename(normalized));
      if (target && target.id !== note.id) {
        edges.push({ source: note.id, target: target.id, type: "wiki" });
      } else {
        unresolved.set(normalized, (unresolved.get(normalized) || 0) + 1);
      }
    }
  }

  const tagCounts = new Map();
  for (const note of notes) {
    for (const tag of note.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }

  const nodes = notes.map((note) => ({
    id: note.id,
    path: note.path,
    title: note.title,
    preview: note.preview,
    tags: note.tags,
    kind: note.kind,
    status: note.status,
    reviewDecision: note.reviewDecision,
    layer: note.layer,
    perspective: note.perspective,
    updatedAt: note.updatedAt,
    degree: edges.filter((edge) => edge.source === note.id || edge.target === note.id).length
  }));
  const degreeById = new Map(nodes.map((node) => [node.id, node.degree || 0]));
  const searchChunks = notes.flatMap((note) =>
    chunksForNote(note).map((chunk) => ({
      id: note.id,
      path: note.path,
      title: note.title,
      tags: note.tags,
      kind: note.kind,
      status: note.status,
      reviewDecision: note.reviewDecision,
      layer: note.layer,
      perspective: note.perspective,
      group: (note.path || note.id).split("/")[0] || "root",
      degree: degreeById.get(note.id) || 0,
      updatedAt: note.updatedAt,
      heading: chunk.heading,
      text: chunk.text,
      snippet: chunk.snippet
    }))
  );

  return {
    vaultRoot,
    generatedAt: new Date().toISOString(),
    stats: {
      notes: notes.length,
      edges: edges.length,
      tags: tagCounts.size,
      unresolved: unresolved.size,
      excludedRules: scanPolicy.excluded.length
    },
    scanPolicy,
    nodes,
    edges,
    tags: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 80),
    searchChunks,
    fullNotes: notes,
    notes: notes
      .map(({ content, ...note }) => note)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  };
}

async function readHealthReport() {
  const filePath = path.join(vaultRoot, "operations", "context-graph", "health.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const report = JSON.parse(raw);
    return {
      available: true,
      path: path.relative(vaultRoot, filePath),
      stats: report.stats || {},
      topHubs: (report.top_hubs || []).slice(0, 8),
      isolated: (report.isolated || []).slice(0, 12),
      missingFrontmatter: (report.missing_frontmatter || []).slice(0, 12),
      candidatePromotions: (report.candidate_promotions || []).slice(0, 12),
      routerLeaf: (report.router_leaf || []).slice(0, 12),
      rawLikeCount: (report.raw_like || []).length,
      artifactLikeCount: (report.artifact_like || []).length
    };
  } catch (error) {
    return {
      available: false,
      path: path.relative(vaultRoot, filePath),
      error: error.message
    };
  }
}

function candidatePriority(note) {
  const text = `${note.title} ${note.preview} ${note.path} ${note.content || ""}`.toLowerCase();
  let score = 0;
  if (["candidates/README.md", "candidates/RULES_v1.md", "candidates/catalog.md"].includes(note.path)) return 0;
  if (note.path === "candidates/inbox.md") {
    return text.includes("pending candidate 없음") ? 0 : 20;
  }
  if (["keep", "promote", "archive"].includes(note.reviewDecision)) return 0;
  if (["keep", "discard", "promoted"].includes(note.status)) return 0;
  if (note.status === "review") score += 12;
  if (note.status === "pending" || note.status === "candidate") score += 10;
  score += Math.min(6, (note.degree || 0) / 2);
  return score;
}

function candidateQueue(vault) {
  const notes = vault.fullNotes
    .filter((note) => note.path.startsWith("candidates/"))
    .map((note) => ({
      ...stripNoteContent(note),
      reviewScore: candidatePriority(note),
      actionHint: candidateActionHint(note)
    }))
    .sort((a, b) => b.reviewScore - a.reviewScore || b.updatedAt - a.updatedAt);
  const readyNotes = notes.filter((note) => note.reviewScore >= 12);
  const archiveNotes = notes.filter((note) => note.reviewScore < 12);
  return {
    total: notes.length,
    reviewReady: readyNotes.length,
    readyNotes: readyNotes.slice(0, 80),
    archiveNotes: archiveNotes.slice(0, 80),
    notes: notes.slice(0, 80)
  };
}

function candidateActionHint(note) {
  const text = `${note.title} ${note.preview} ${note.content || ""}`.toLowerCase();
  if (["candidates/README.md", "candidates/RULES_v1.md", "candidates/catalog.md"].includes(note.path)) return "reference";
  if (note.path === "candidates/inbox.md" && text.includes("pending candidate 없음")) return "empty";
  if (note.reviewDecision === "keep") return "kept";
  if (note.reviewDecision === "promote") return "promotion requested";
  if (note.reviewDecision === "archive") return "archived";
  if (note.status === "keep") return "kept";
  if (note.status === "discard") return "discarded";
  if (note.status === "promoted") return "promoted";
  if (text.includes("promote") || text.includes("승격")) return "review for promotion";
  if (text.includes("discard") || text.includes("폐기")) return "check discard";
  if (note.status === "review") return "review";
  return "triage";
}

function stripNoteContent(note) {
  const { content, ...rest } = note;
  return rest;
}

async function getVault() {
  const now = Date.now();
  if (cache && now - cacheTime < cacheMs) return cache;
  cache = await buildVault();
  cacheTime = now;
  return cache;
}

function sendJson(res, data) {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*"
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*"
  });
  res.end(JSON.stringify({ error: message }));
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10000) throw new Error("Request body too large");
  }
  return body ? JSON.parse(body) : {};
}

function candidateActionPatch(action) {
  const reviewedAt = new Date().toISOString();
  if (action === "keep") {
    return { status: "keep", review_decision: "keep", reviewed_at: reviewedAt };
  }
  if (action === "promote") {
    return { status: "review", review_decision: "promote", reviewed_at: reviewedAt };
  }
  if (action === "archive") {
    return { status: "discard", review_decision: "archive", reviewed_at: reviewedAt };
  }
  return null;
}

async function updateCandidateReview({ id, action }) {
  const patch = candidateActionPatch(action);
  if (!patch) {
    const error = new Error("Invalid candidate action");
    error.status = 400;
    throw error;
  }
  const relativePath = `${String(id || "").replace(/\.md$/, "")}.md`;
  if (!relativePath.startsWith("candidates/")) {
    const error = new Error("Candidate action only supports candidates/");
    error.status = 400;
    throw error;
  }
  const fullPath = path.normalize(path.join(vaultRoot, relativePath));
  if (!fullPath.startsWith(vaultRoot)) {
    const error = new Error("Invalid candidate path");
    error.status = 400;
    throw error;
  }
  const current = await fs.readFile(fullPath, "utf8");
  await fs.writeFile(fullPath, upsertFrontmatter(current, patch), "utf8");
  cache = null;
  cacheTime = 0;
  return {
    ok: true,
    id: relativePath.replace(/\.md$/, ""),
    path: relativePath,
    action,
    patch
  };
}

function tokenizeQuery(query) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9가-힣_/-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
  return [...new Set(tokens.flatMap((token) => [token, ...expandedQueryTokens(token)]))];
}

function expandedQueryTokens(token) {
  const synonyms = {
    "옵시디언": ["obsidian"],
    "트렌드": ["trend", "trends"],
    "위키": ["wiki"],
    "세컨드": ["second"],
    "브레인": ["brain"],
    "후보": ["candidate"],
    "승격": ["promotion", "promote"],
    "근거": ["evidence", "source"],
    obsidian: ["옵시디언"],
    trend: ["트렌드"],
    trends: ["트렌드"],
    wiki: ["위키"],
    second: ["세컨드"],
    brain: ["브레인"],
    candidate: ["후보"],
    promotion: ["승격"],
    promote: ["승격"],
    evidence: ["근거"],
    source: ["근거"]
  };
  return synonyms[token] || [];
}

function askVault(vault, query) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return { query, total: 0, results: [] };

  const chunkMatches = [];
  for (const chunk of vault.searchChunks || []) {
    const scored = scoreChunk(chunk, chunk, tokens, query);
    if (scored.score <= 0) continue;
    const graphBoost = Math.min(4, (chunk.degree || 0) / 10);
    const score = scored.score + graphBoost + authorityBoost(chunk) + recencyBoost(chunk.updatedAt);
    if (score <= 0) continue;
    chunkMatches.push({
      id: chunk.id,
      path: chunk.path,
      title: chunk.title,
      preview: chunk.snippet,
      excerpt: chunk.snippet,
      heading: chunk.heading,
      tags: chunk.tags,
      degree: chunk.degree,
      group: chunk.group,
      score: Math.round(score * 10) / 10,
      matchReasons: scored.reasons,
      matchedTerms: scored.matchedTerms
    });
  }

  const results = dedupeChunkMatches(chunkMatches)
    .sort((a, b) => b.score - a.score || b.degree - a.degree)
    .slice(0, 12);

  return {
    query,
    total: results.length,
    answer: results.length
      ? buildVaultAnswer(query, results)
      : "관련 근거 노트를 찾지 못했습니다.",
    results
};
}

function buildVaultAnswer(query, results) {
  const sources = results.slice(0, 5);
  const sourceLines = sources
    .map((note) => {
      const heading = note.heading ? ` (${note.heading})` : "";
      const preview = note.excerpt ? note.excerpt.replace(/\s+/g, " ").slice(0, 220) : "요약 가능한 본문 근거가 없습니다.";
      return `- ${note.title}${heading}: ${preview}`;
    })
    .join("\n");

  const groups = [...new Set(sources.map((note) => note.group).filter(Boolean))].slice(0, 4).join(", ");
  return `"${query}"에 대한 local markdown 근거 검색 결과입니다.\n\n가장 강한 근거는 ${sources[0].title}에서 잡히고, 관련 맥락은 ${groups || "vault"} 영역에 걸쳐 있습니다. 아래 source 조각들은 생성 답변이 아니라 검색 근거입니다.\n\n${sourceLines}`;
}

function chunksForNote(note) {
  const cleaned = stripFrontmatter(note.content)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_>`~-]/g, "");
  const chunks = [];
  let heading = note.title;
  let buffer = [];

  function flush() {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (text.length >= 40) {
      chunks.push({
        heading,
        text,
        snippet: text.slice(0, 360)
      });
    }
    buffer = [];
  }

  for (const line of cleaned.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buffer.join(" ").length > 700) flush();
      continue;
    }
    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      flush();
      heading = headingMatch[1].trim();
      continue;
    }
    buffer.push(trimmed.replace(/^[-*]\s+/, ""));
    if (buffer.join(" ").length > 900) flush();
  }
  flush();
  return chunks.length ? chunks : [{ heading: note.title, text: note.preview, snippet: note.preview }];
}

function scoreChunk(note, chunk, tokens, query) {
  const title = note.title.toLowerCase();
  const pathText = note.path.toLowerCase();
  const tags = note.tags.map((tag) => tag.toLowerCase());
  const text = chunk.text.toLowerCase();
  const heading = (chunk.heading || "").toLowerCase();
  const phrase = query.toLowerCase().trim();
  let score = 0;
  const reasons = [];
  const matchedTerms = new Set();

  function add(points, reason, token = "") {
    score += points;
    if (!reasons.includes(reason)) reasons.push(reason);
    if (token) matchedTerms.add(token);
  }

  if (phrase.length > 2) {
    if (title.includes(phrase)) add(24, "exact title", phrase);
    if (heading.includes(phrase)) add(18, "exact heading", phrase);
    if (text.includes(phrase)) add(14, "exact text", phrase);
    if (pathText.includes(phrase)) add(10, "exact path", phrase);
  }

  for (const token of tokens) {
    if (title.includes(token)) add(10, "title", token);
    if (heading.includes(token)) add(7, "heading", token);
    if (pathText.includes(token)) add(5, "path", token);
    if (tags.some((tag) => tag.includes(token))) add(7, "tag", token);
    const occurrences = occurrenceCount(text, token);
    if (occurrences) add(Math.min(12, occurrences * 2), "body", token);
  }

  return {
    score,
    reasons: reasons.slice(0, 5),
    matchedTerms: [...matchedTerms].slice(0, 8)
  };
}

function authorityBoost(note) {
  let boost = 0;
  if (note.status === "canonical") boost += 4;
  if (String(note.status || "").includes("canonical")) boost += 3;
  if (note.perspective) boost += 3;
  if (["principle", "thesis", "self-model", "strategy", "research-axis", "decision-pattern", "business-priority"].includes(note.kind)) boost += 3;
  if (["personal", "company", "research"].includes(note.group)) boost += 1.5;
  if (["candidates", "_inbox"].includes(note.group)) boost -= 4;
  return boost;
}

function recencyBoost(updatedAt) {
  if (!updatedAt) return 0;
  const ageDays = (Date.now() - updatedAt) / 86400000;
  if (ageDays < 14) return 2;
  if (ageDays < 60) return 1;
  return 0;
}

function occurrenceCount(text, token) {
  if (!token) return 0;
  let count = 0;
  let index = text.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(token, index + token.length);
  }
  return count;
}

function dedupeChunkMatches(matches) {
  const seen = new Set();
  const sorted = matches.sort((a, b) => b.score - a.score);
  const results = [];
  for (const match of sorted) {
    const key = match.id;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(match);
  }
  return results;
}

async function serveStatic(res, pathname) {
  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.normalize(path.join(publicDir, requested));
  if (!fullPath.startsWith(publicDir)) return sendError(res, 403, "Forbidden");
  try {
    const data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8"
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(data);
  } catch {
    sendError(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type"
      });
      res.end();
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/candidate-action") {
      const body = await readJsonBody(req);
      return sendJson(res, await updateCandidateReview(body));
    }
    if (req.method !== "GET") return sendError(res, 405, "Method not allowed");
    if (url.pathname === "/api/graph") {
      const vault = await getVault();
      return sendJson(res, {
        vaultRoot: vault.vaultRoot,
        generatedAt: vault.generatedAt,
        stats: vault.stats,
        scanPolicy: vault.scanPolicy,
        nodes: vault.nodes,
        edges: vault.edges,
        tags: vault.tags
      });
    }
    if (url.pathname === "/api/health") {
      return sendJson(res, await readHealthReport());
    }
    if (url.pathname === "/api/candidates") {
      const vault = await getVault();
      return sendJson(res, candidateQueue(vault));
    }
    if (url.pathname === "/api/notes") {
      const vault = await getVault();
      const query = (url.searchParams.get("q") || "").toLowerCase();
      const notes = query
        ? vault.notes.filter((note) =>
            `${note.title} ${note.path} ${note.preview} ${note.tags.join(" ")}`.toLowerCase().includes(query)
          )
        : vault.notes;
      return sendJson(res, notes.slice(0, 300));
    }
    if (url.pathname === "/api/ask") {
      const vault = await getVault();
      const query = url.searchParams.get("q") || "";
      return sendJson(res, askVault(vault, query));
    }
    if (url.pathname === "/api/open") {
      const target = url.searchParams.get("path") || "";
      const fullPath = target ? path.resolve(vaultRoot, target) : vaultRoot;
      if (!fullPath.startsWith(vaultRoot)) return sendError(res, 400, "Invalid path");
      return sendJson(res, { url: `obsidian://open?path=${encodeURIComponent(fullPath)}` });
    }
    if (url.pathname === "/api/note") {
      const vault = await getVault();
      const id = url.searchParams.get("id");
      const fullPath = id ? path.join(vaultRoot, `${id}.md`) : "";
      const normalized = path.normalize(fullPath);
      if (!id || !normalized.startsWith(vaultRoot)) return sendError(res, 400, "Invalid note id");
      const note = vault.nodes.find((item) => item.id === id);
      if (!note) return sendError(res, 404, "Note not found");
      const content = await fs.readFile(normalized, "utf8");
      const backlinks = vault.edges
        .filter((edge) => edge.target === id)
        .map((edge) => vault.nodes.find((node) => node.id === edge.source))
        .filter(Boolean)
        .slice(0, 20);
      const outlinks = vault.edges
        .filter((edge) => edge.source === id)
        .map((edge) => vault.nodes.find((node) => node.id === edge.target))
        .filter(Boolean)
        .slice(0, 20);
      return sendJson(res, { ...note, content, backlinks, outlinks });
    }
    return serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    sendError(res, 500, error.message);
  }
});

server.listen(port, () => {
  console.log(`Obsidian vault app: http://localhost:${port}`);
  console.log(`Vault: ${vaultRoot}`);
});
