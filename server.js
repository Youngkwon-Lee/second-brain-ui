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
const port = Number(process.env.PORT || 4177);

const ignoredDirs = new Set([
  ".git",
  ".obsidian",
  ".trash",
  "node_modules",
  ".pytest_cache",
  ".claude"
]);

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
    if (entry.name.startsWith(".") && ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function stripFrontmatter(text) {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  return end === -1 ? text : text.slice(end + 4);
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
      layer: note.layer,
      perspective: note.perspective,
      group: (note.path || note.id).split("/")[0] || "root",
      degree: degreeById.get(note.id) || 0,
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
      unresolved: unresolved.size
    },
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

function tokenizeQuery(query) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9가-힣_/-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function askVault(vault, query) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return { query, total: 0, results: [] };

  const chunkMatches = [];
  for (const chunk of vault.searchChunks || []) {
    const score = scoreChunk(chunk, chunk, tokens, query) + Math.min(4, (chunk.degree || 0) / 10);
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
      score
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
      : "관련 노트를 찾지 못했습니다.",
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
  return `"${query}"에 대한 vault 기반 답변입니다.\n\n핵심 근거는 ${sources[0].title}에서 가장 강하게 잡히고, 관련 맥락은 ${groups || "vault"} 영역에 걸쳐 있습니다. 아래 source 조각들이 현재 답변의 근거입니다.\n\n${sourceLines}`;
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
  let score = phrase.length > 2 && text.includes(phrase) ? 12 : 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 8;
    if (heading.includes(token)) score += 5;
    if (pathText.includes(token)) score += 4;
    if (tags.some((tag) => tag.includes(token))) score += 4;
    score += Math.min(10, occurrenceCount(text, token) * 2);
  }
  return score;
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
    const key = `${match.id}:${match.heading}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(match);
  }
  return results;
}

async function serveStatic(res, pathname) {
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
    if (url.pathname === "/api/graph") {
      const vault = await getVault();
      return sendJson(res, {
        vaultRoot: vault.vaultRoot,
        generatedAt: vault.generatedAt,
        stats: vault.stats,
        nodes: vault.nodes,
        edges: vault.edges,
        tags: vault.tags
      });
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
      return sendJson(res, { ...note, content, backlinks });
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
