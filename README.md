# agy-open

Open a folder in the [Antigravity](https://antigravity.google/) macOS app and start a new conversation, from the terminal.

```bash
cd ~/Projects/my-app
agy-open .
```

Requirements: macOS, Node.js 22+, [pnpm](https://pnpm.io/), Antigravity at `/Applications/Antigravity.app`.

## Install

```bash
git clone <this-repo-url>
cd agy-open
pnpm install
pnpm build
pnpm add -g .
```

`pnpm add -g .` registers the `agy-open` bin globally ([pnpm link --global was removed](https://pnpm.io/cli/link)).

Optional alias:

```bash
alias 'agy app'='agy-open'
```

## Usage

```text
agy-open [path]
agy-open --help
agy-open --version
```

`path` defaults to the current directory. The directory must already exist.

## How it works

1. Finds or creates `~/.gemini/config/projects/<id>.json` for the folder.
2. Sets the selected project in `~/Library/Application Support/Antigravity/app_storage.json`. That file is read-modify-written while the app may be running, so a concurrent UI write can be lost.
3. If Antigravity is running, uses the Chromium DevTools port to open a new conversation. If it is not running, launches the app, waits for that port, then does the same.
4. Focuses the Antigravity window (`open -a Antigravity`).

This uses undocumented local files and the DevTools debug port. Antigravity updates can break it.

Design: [`docs/superpowers/specs/2026-09-16-agy-open-design.md`](docs/superpowers/specs/2026-09-16-agy-open-design.md).

## Development

```bash
pnpm install
pnpm test
pnpm build
node dist/cli.js .
```

## Manual checks

- Quit Antigravity, run `agy-open .` in this repo: app starts, new conversation, this folder selected.
- With Antigravity already open on another project: run `agy-open .` here; window focuses and a new conversation opens for this folder.
- Run `agy-open .` a second time: reuses the same project id (no extra JSON file).
- `agy-open "/path/with spaces/my dir"`: opens that directory.

## License

MIT
