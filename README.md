# agy-open

From the terminal, open a folder in the [Antigravity](https://antigravity.google/) macOS app and start a new conversation.

```bash
pnpm add -g agy-open   # or: npm i -g agy-open
cd ~/Projects/my-app
agy-open               # current directory; or: agy-open /path/to/project
```

Needs macOS, Node.js 22+, and Antigravity at `/Applications/Antigravity.app`.

Uses unofficial local config and the DevTools debug port, so Antigravity updates can break it. MIT.
