# cabinetry_designer memory check — 2026-09-21

Question: Chrome tab running the dev server showed ~700–814 MB. Is it a leak?

## Method
- Cloned feature/elevation-mvp and applied the 7 unpushed local commits (step 100, soffits).
- Test-only harness (not committed): stubbed Supabase auth, exposed the Redux store, drove Elevation Lab in headless Chromium with Playwright at 2x pixel density.
- One round = add room → 4 walls → plan view (hover/zoom) → each wall in elevation view → "Add sample runs" → click, hover, zoom → delete room. 40 rounds (160 walls, ~400 runs).
- Measured JS heap after forced GC, DOM nodes, event listeners, canvas count, Konva stages, and the tab's process memory.

## Results
| Build | JS heap after GC (start → 40 rounds) | Tab process, no forced GC |
|---|---|---|
| Dev server | 7 → 12.5 MB, flat from round ~10 | 198 → ~300 MB, plateaus |
| Production build | 3 → 8 MB | 180 → ~265 MB, plateaus |

DOM nodes, listeners, 1 canvas and 1 Konva stage all stayed constant. No console errors.

## Conclusion
There's no leak in the Elevation Lab draw/delete cycle. The tab grows to a ceiling and stays there. The extra memory on Kyle's machine is most likely from the browser environment, not the app:
- Redux DevTools / React DevTools extensions (RTK enables DevTools by default in dev).
- A long dev session with many Vite hot reloads, where old module copies are kept until the page is refreshed.
- Chrome's Task Manager "memory footprint" also counts GPU and canvas memory and space the browser has reserved but isn't using.

Suggested check: open a fresh incognito window (no extensions) → load the page → note the number → repeat delete-all/redraw a few times → confirm it levels off.
