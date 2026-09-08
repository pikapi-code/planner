# Planner

A daily time-blocking planner that runs entirely in the browser. Plan a day as a sequence
of time blocks, each with one primary task and a checklist of subtasks — no account, no
backend, no tracking.

**Live app:** https://pikapi-code.github.io/planner/

## Features

- **Three views** — List, Day (calendar-style grid), and Month, kept in sync
- **Time blocks** with a primary task, subtasks, custom hours, start time, and color coding
- **Drag to reorder** blocks and subtasks
- **Undo / redo** with coalesced history (`Ctrl/⌘Z`, `Ctrl/⌘Y` or `Ctrl/⌘⇧Z`)
- **Full keyboard control** — navigate, create, edit, and delete blocks without a mouse
  (press `?` in the app for the full shortcut list)
- **Data export / import** to a JSON file, so a day (or your whole planner) is portable
  and backed up outside `localStorage`
- **Light / dark / custom themes** with your own token-based color editor
- **Responsive layout** — usable down to mobile widths, including the mobile keyboard
  input fix that keeps iOS Safari from zooming in on focus
- **No account required** — all data stays in the browser's `localStorage`

## Commands

```bash
npm install
npm run dev       # start the dev server
npm run build     # build the static site to dist/
npm run preview   # preview the production build locally
```

## Stack

- [Astro](https://astro.build) static app (no client framework — plain TypeScript + DOM)
- TypeScript
- CSS design tokens (Inter / JetBrains Mono, light and dark themes)

## Project structure

```
src/
  lib/       # pure logic: types, calendar/time math, storage (export/import), themes
  planner/   # app state (store.ts), rendering (view.ts, html.ts), event wiring (main.ts)
  pages/     # Astro page entry
  layouts/   # base HTML layout
  styles/    # global + planner CSS
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site with
Astro and publishes it to GitHub Pages.
