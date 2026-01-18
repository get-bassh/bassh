# bassh

Multi-tenant static site hosting on Cloudflare Pages. Users deploy sites with one command without needing their own Cloudflare account.

## Architecture

- **CLI** (`bassh`): Bash script that zips a directory and POSTs to the worker
- **Worker** (`src/index.js`): Cloudflare Worker that deploys to Pages via CF API
- **Config** (`wrangler.toml`): Wrangler configuration for the worker

## Project Structure

```
bassh/
├── bassh          # Bash CLI script
├── src/
│   └── index.js        # Cloudflare Worker (deployment backend)
├── wrangler.toml       # Worker config
└── README.md           # User documentation
```

## Development

### Deploy the worker

```bash
wrangler login
wrangler deploy
wrangler secret put CF_API_TOKEN
wrangler secret put CF_ACCOUNT_ID
```

### Test the CLI

```bash
./bassh ./test-folder
./bassh ./test-folder -p mypassword
./bassh ./test-folder -e "user@example.com"
```

## Key Files

- `bassh`: CLI entrypoint - handles argument parsing, zipping, and curl to worker
- `src/index.js`: Worker handles CF Pages project creation/deployment and Access policy setup

## Dependencies

- CLI requires: `curl`, `zip` (standard unix tools)
- Worker: no npm dependencies, uses native fetch/FormData

## Environment Variables

- `BASSH_API`: Override worker URL (for CLI users)
- `CF_API_TOKEN`: Cloudflare API token (worker secret)
- `CF_ACCOUNT_ID`: Cloudflare account ID (worker secret)
