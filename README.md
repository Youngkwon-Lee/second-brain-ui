# Second Brain UI

A local control panel for an Obsidian-style markdown second brain.

It reads markdown files directly from a local vault folder. Notes are not copied into this repository, and no hosted AI API is called by default.

## Features

- 3D graph for `[[wiki links]]` and markdown `.md` links
- Evidence Search over local markdown chunks with source notes, scores, match reasons, and matched terms
- `Full / 1-hop / 2-hop` graph modes around the selected note
- Backlinks, outlinks, markdown preview, note path, and degree context
- Candidate Queue with safe `Keep / Promote / Archive` review actions
- Brain Health summary from `operations/context-graph/health.json` when available
- EN/KO UI toggle with local preference storage
- Movable and hideable selected-note card
- Obsidian URL handoff for the vault or selected note

## Run

```bash
OBSIDIAN_VAULT="/path/to/your/vault" PORT=4178 npm start
```

Then open:

```bash
http://localhost:4178
```

If `OBSIDIAN_VAULT` is omitted, the app looks for:

```bash
$HOME/Documents/second-brain
```

You can also create a local `.env` file:

```bash
cp .env.example .env
```

Then edit:

```bash
OBSIDIAN_VAULT=/path/to/your/obsidian-vault
PORT=4178
```

## Connect an Obsidian Vault

Second Brain UI does not require an Obsidian plugin.

It connects by reading the local vault folder that already contains your `.md` files.

1. Open Obsidian.
2. Find the vault folder on your computer.
3. Start this app with that folder as `OBSIDIAN_VAULT`.
4. Open `http://localhost:4178`.

Example:

```bash
OBSIDIAN_VAULT="/path/to/your/obsidian-vault" PORT=4178 npm start
```

The app can open notes back in Obsidian through `obsidian://` links when the Obsidian desktop app is installed.

Candidate review actions edit local markdown frontmatter in your vault. They do not upload notes and do not move files into canonical folders.

## Workflow

1. Search for evidence in the top bar.
2. Pick a result from Recent Notes or the graph.
3. Use `1-hop` or `2-hop` to inspect local context around the selected note.
4. Open the Context panel for backlinks, outlinks, and markdown preview.
5. Review `candidates/` items with `Keep / Promote / Archive`.

Candidate actions only update frontmatter:

- `Keep`: `status: keep`, `review_decision: keep`
- `Promote`: `status: review`, `review_decision: promote`
- `Archive`: `status: discard`, `review_decision: archive`

They do not move or merge notes into canonical folders.

## CLI

After cloning locally, you can link the command:

```bash
npm link
OBSIDIAN_VAULT="/path/to/your/vault" PORT=4178 second-brain-ui
```

## How It Works

Second Brain UI scans local `.md` files, extracts note titles, frontmatter, tags, wiki links, markdown links, backlinks, outlinks, and top-level folders, then builds a browser-based graph.

Evidence Search scores local markdown chunks by exact phrase, title, section heading, path, tag, body occurrence, graph degree, recency, and canonical/perspective hints. It returns source notes and excerpts instead of calling a hosted model.

The graph scan intentionally excludes local implementation artifacts such as `.obsidian`, `.omo`, templates, raw handoffs, lint reports, and generated context-graph outputs.

## Privacy

This repository should contain only the app code. Do not commit your Obsidian vault, `.env`, screenshots with private note titles, exported personal data, API keys, tokens, or local machine paths.

`.env` is ignored by git so each user can keep their local vault path private.

Before publishing a fork or screenshot, check for:

- private note titles, folder names, or filenames
- absolute local machine paths
- `.env` values
- generated exports, screenshots, or logs
- tokens, API keys, or credentials

## Checks

```bash
node --check server.js
node --check public/app.js
```
