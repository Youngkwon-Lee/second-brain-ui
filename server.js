import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
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

function titleFromMarkdown(text, relativePath) {
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
    const note = {
      id: key,
      path: relativePath,
      title: titleFromMarkdown(raw, relativePath),
      preview: previewFromMarkdown(raw),
      tags: extractTags(raw),
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
    updatedAt: note.updatedAt,
    degree: edges.filter((edge) => edge.source === note.id || edge.target === note.id).length
  }));

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

  const results = vault.nodes
    .map((note) => {
      const group = (note.path || note.id).split("/")[0] || "root";
      const haystack = `${note.title} ${note.path} ${note.preview} ${note.tags.join(" ")}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (note.title.toLowerCase().includes(token)) score += 7;
        if (note.path.toLowerCase().includes(token)) score += 4;
        if (note.tags.some((tag) => tag.toLowerCase().includes(token))) score += 4;
        if (note.preview.toLowerCase().includes(token)) score += 2;
        if (haystack.includes(token)) score += 1;
      }
      score += Math.min(5, (note.degree || 0) / 8);
      return {
        id: note.id,
        path: note.path,
        title: note.title,
        preview: note.preview,
        tags: note.tags,
        degree: note.degree,
        group,
        score
      };
    })
    .filter((note) => note.score > 0)
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
  const sources = results.slice(0, 4);
  const sourceLines = sources
    .map((note) => {
      const preview = note.preview ? note.preview.replace(/\s+/g, " ").slice(0, 150) : "요약 가능한 본문 미리보기가 없습니다.";
      return `- ${note.title}: ${preview}`;
    })
    .join("\n");

  return `"${query}"에 대해서 vault 안에서는 ${sources[0].title}를 가장 강한 근거로 볼 수 있습니다.\n\n관련 맥락은 ${sources.map((note) => note.group).filter(Boolean).slice(0, 3).join(", ")} 영역에 걸쳐 있고, 연결도가 높은 노트부터 보면 다음과 같습니다.\n\n${sourceLines}`;
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
