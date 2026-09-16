# agy-open

Open a folder in the [Antigravity](https://antigravity.google/) macOS app and start a new conversation, from the terminal.

Antigravity has a terminal CLI (`agy`) for its TUI, but nothing like `code .` or `cursor .` for the desktop app. `agy-open` fills that gap.

```bash
cd ~/Projects/my-app
agy-open
```

## Install

Requires macOS, Node.js 22+, and Antigravity at `/Applications/Antigravity.app`.

```bash
pnpm add -g agy-open
# or: npm i -g agy-open
```

From source:

```bash
git clone https://github.com/Keyneswu/agy-open.git
cd agy-open
pnpm install
pnpm build
pnpm add -g .
```

## Usage

```text
agy-open              # current directory
agy-open [path]       # that folder (must already exist)
agy-open --help
agy-open --version
```

## How it works

1. Finds or creates a project JSON under `~/.gemini/config/projects/` for that folder.
2. Marks it as the selected project in Antigravity’s `app_storage.json`.
3. If the app is already running, talks to its Chromium DevTools port and opens a new conversation. If not, it launches the app, waits for that port, then does the same.
4. Brings the Antigravity window to the front.

This uses unofficial local files and a debug port. An Antigravity update can break it. While the app is running, rewriting `app_storage.json` can also race with the UI.

Design notes: [`docs/superpowers/specs/2026-09-16-agy-open-design.md`](docs/superpowers/specs/2026-09-16-agy-open-design.md).

## Development

```bash
pnpm install
pnpm test
pnpm build
node dist/cli.js .
```

## License

MIT
