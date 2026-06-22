# Second Brain UI

A local web UI for visualizing an Obsidian markdown vault as a living 3D graph.

It reads markdown files directly from a local vault folder. Your notes are not copied into this repository.

## Features

- 3D force graph for `[[wiki links]]` and markdown `.md` links
- Obsidian-style dark interface
- Folder/group filters
- Tags, backlinks, previews, and note details
- Local "Ask your vault" interface backed by markdown search and source notes
- Opens the configured vault in Obsidian

## Run

```bash
npm start
```

By default the app looks for:

```bash
$HOME/Documents/second-brain
```

To use another Obsidian vault:

```bash
OBSIDIAN_VAULT="/path/to/your/vault" npm start
```

Or create a local `.env` file:

```bash
cp .env.example .env
```

Then edit:

```bash
OBSIDIAN_VAULT=/path/to/your/obsidian-vault
PORT=4177
```

Then open:

```bash
http://localhost:4177
```

## CLI

After cloning locally, you can also link the command:

```bash
npm link
OBSIDIAN_VAULT="/path/to/your/vault" second-brain-ui
```

## How It Works

Second Brain UI scans local `.md` files, extracts note titles, tags, wiki links, markdown links, backlinks, and top-level folders, then builds a browser-based 3D graph.

The Ask interface uses local retrieval over markdown body chunks. It returns a short vault-grounded answer with source notes and excerpts. No hosted AI API is called by default.

## Privacy

This repository should contain only the app code. Do not commit your Obsidian vault, `.env`, screenshots with private note titles, or exported personal data.

`.env` is ignored by git so each user can keep their local vault path private.

## Notes

- This is a local-first tool. It does not upload your vault.
- The `Ask your vault` feature is local markdown retrieval-augmented generation. It searches note body chunks and shows source notes, but it does not call hosted AI by default.
- The app code is safe to publish, but your Obsidian vault should stay private unless you intentionally publish it.
