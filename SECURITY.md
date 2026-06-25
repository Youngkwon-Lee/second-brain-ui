# Security and Privacy

Second Brain UI is designed as a local-first app.

## Data Handling

- The app reads markdown files from the local `OBSIDIAN_VAULT` path.
- The app does not upload notes to a hosted service.
- Evidence Search is local markdown retrieval and does not call a hosted AI API by default.
- Candidate actions update local markdown frontmatter only.

## Do Not Commit

Before publishing changes, check that the repository does not include:

- `.env` or other local config files
- Obsidian vault contents
- screenshots or recordings with private note titles
- exported chat archives, documents, logs, or generated reports
- local machine paths
- API keys, tokens, credentials, private keys, or certificates

## Reporting Issues

If you find a privacy or security issue, open a GitHub issue with reproduction steps, but do not include private vault contents or secrets.
