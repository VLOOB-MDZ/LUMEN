# ✶ LUMEN

**Every wish becomes a star.**

LUMEN is a shared night sky. Every star in it is a wish someone released — a hope, a prayer, a small promise to themselves. Write a wish and release it: it becomes a star, placed gently in the sky. Travel the sky, open the stars of strangers, and wish upon the ones that move you.

## Features

- **Procedural galaxy landing page** — a slowly rotating spiral galaxy rendered on canvas, with mouse/gyroscope parallax and a dive-in transition
- **Infinite pannable sky** — drag, scroll-zoom, pinch-zoom, and double-tap through a seamlessly wrapping starfield with a fractal-noise nebula
- **Wishes as stars** — write a wish (signed or anonymous), choose how long it shines (forever → 1 month), and watch it launch as a shooting star
- **Wish upon a star** — every wish received makes a star burn a little brighter
- **Tonight's constellation** — the most wished-upon stars, drawn as a constellation
- **My Wishes** — visit, rewrite, or let your stars rest (persisted in local storage)
- **Ambient music** — space ambient via YouTube, with a Web Audio synth fallback
- **Zoom-out exit** — pull all the way out and the sky hands you back to the shore

## Tech

React 18 + Vite. No backend — wishes live in the browser's local storage.

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Deploy (Vercel)

Push to GitHub, then import the repo at [vercel.com/new](https://vercel.com/new). Vercel auto-detects Vite — no configuration needed.

---

*made for everyone who still looks up*
