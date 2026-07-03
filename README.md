# fleets

Terminal CLI for [Fleets](https://fleets.run). Per-site commands mirror the app UI tabs at `https://fleets.run/app/<slug>/<tab>`.

## Install

```bash
npm install -g fleets
```

## Authenticate

```bash
fleets login
```

Picks between two methods:

1. **browser (default)** — device flow: CLI prints a URL + 8-character code, auto-opens your browser, you click **authorize**, CLI finishes automatically.
2. **paste a token** — mint one in app → account → cli, paste it in.

Skip the prompt with a flag:

```bash
fleets login --browser     # force device flow
fleets login --paste       # force token paste

fleets login --token fl_xxxxxxxxxxxxxxxx   # paste in one shot (CI)
export FLEETS_TOKEN=fl_xxxxxxxxxxxxxxxx     # skip login entirely
```

## Slug-first dispatch

The most intuitive way to run commands is to put the site slug first, like you're "inside" that site:

```bash
fleets fightbets                         # GA4 summary (defaults to stats)
fleets fightbets sources                 # top traffic sources
fleets fightbets funnel session_start view   # conversion funnel
fleets fightbets seo --range 30d         # GSC summary, last 30 days
fleets fightbets open settings           # print app URL
```

The legacy form `fleets <command> <slug>` (e.g. `fleets sources fightbets`) still works.

## Commands

### Setup

| Command | Description |
|---|---|
| `fleets login` | Browser device-flow auth (no paste) |
| `fleets add <domain> [--detect]` | Create a site; `--detect` auto-links GA4 + GSC |
| `fleets connect <slug>` | Auto-detect GA4 + GSC via service account |
| `fleets connect <slug> --property <id>` | Set GA4 property explicitly |
| `fleets connect <slug> --gsc <site-url>` | Set GSC site explicitly |

### Analytics (per-site)

All accept `--range` (default `7d`) and `--json`. Commands with top-N tables also accept `--limit`.

| Command | Tab | Data source |
|---|---|---|
| `fleets list` | — | All your sites with sparkline + Δ7d |
| `fleets <slug>` / `fleets stats <slug>` | day | GA4 summary |
| `fleets <slug> sources` | sources | GA4 traffic sources |
| `fleets <slug> campaigns` | campaigns | GA4 UTM campaigns |
| `fleets <slug> referrals` | referrals | GA4 referrals |
| `fleets <slug> landers` | landers | GA4 landing pages |
| `fleets <slug> events` | events | GA4 events |
| `fleets <slug> users` | users | GA4 country + device breakdown |
| `fleets <slug> funnel <step1> <step2>…` | funnel | GA4 funnel |
| `fleets <slug> seo` | seo | Google Search Console |
| `fleets <slug> edge` | edge | Cloudflare Analytics |
| `fleets <slug> speed` | speed | PageSpeed Insights |

### Utility

| Command | Description |
|---|---|
| `fleets <slug> export` | Daily GA4 CSV/JSON export |
| `fleets <slug> query "<text>"` | Natural-language analytics query |
| `fleets <slug> open [tab]` | Print the app URL for a site |

## MCP server

The same package ships an [MCP](https://modelcontextprotocol.io) server, `fleets-mcp`,
so agents (Claude Code, Claude Desktop, Cursor, …) can pull your live Fleets
analytics as tools. It reuses the CLI's auth — run `fleets login` once (or set
`FLEETS_TOKEN`) and the MCP server picks up the same token from `~/.fleets/config.json`.

### Add it to a client

Claude Code:

```bash
claude mcp add fleets -- fleets-mcp
```

Claude Desktop / Cursor (`claude_desktop_config.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "fleets": {
      "command": "fleets-mcp"
    }
  }
}
```

No global install? Use `npx`:

```json
{
  "mcpServers": {
    "fleets": {
      "command": "npx",
      "args": ["-y", "-p", "fleets", "fleets-mcp"]
    }
  }
}
```

If you authenticate via env instead of `fleets login`, add
`"env": { "FLEETS_TOKEN": "fl_xxx" }` to the server entry.

### Tools

All read-only except `log_change` (writes a change-log entry). Every analytics
tool takes a `slug` (from `list_sites`) and an optional `range` (`7d`, `30d`, `24h`).

| Tool | What it returns |
|---|---|
| `list_sites` | All sites + connected sources (GA4 / Cloudflare / GSC) — start here |
| `stats` | GA4 summary: sessions, users, pageviews, events, engagement, bounce |
| `sources` · `campaigns` · `referrals` · `landers` · `events` | GA4 breakdowns (accept `limit`) |
| `users` · `devices` · `demographics` | GA4 audience breakdowns |
| `funnel` | GA4 conversion funnel across `steps` (2+) |
| `seo` | Google Search Console summary |
| `edge` | Cloudflare edge analytics (bots, humans, cache) |
| `speed` | PageSpeed Insights + Core Web Vitals |
| `insights` | AI-ready signals worth investigating (optionally per `site`) |
| `ask` | Natural-language question answered server-side with citations |
| `log_change` · `recall` | Write / read the per-site change log |

## Environment variables

| Variable | Description |
|---|---|
| `FLEETS_TOKEN` | Personal access token. Skip `fleets login` entirely — useful for CI. Overrides `~/.fleets/config.json`. |

## Range format

All `--range` flags accept:

- `7d` — last 7 days
- `30d` — last 30 days
- `90d` — last 90 days
- `24h` — last 24 hours (rounds to 1 day)

## Requirements

- Node.js >= 22 (LTS)
- Works on macOS, Linux, Windows
