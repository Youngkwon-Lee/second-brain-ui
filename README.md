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

## Notes

- This is a local-first tool. It does not upload your vault.
- The `Ask your vault` feature is local markdown retrieval-augmented generation. It searches note body chunks and shows source notes, but it does not call hosted AI by default.
- The app code is safe to publish, but your Obsidian vault should stay private unless you intentionally publish it.
