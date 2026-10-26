# Visual Fidelity Evidence (G7)

**Status: BLOCKED pending owner approval.** A new Web set was captured on 2026-10-26 from the local QA stack (tiles loaded). See `VISUAL_APPROVAL_PACKAGE.md` and `docs/release/evidence/local/qa05/`. That package is not an approval. Native screens were still not captured. The older files below remain the `4678f78` reconstruction, when tiles did not load.

No approved visual masters exist in the repository or in the available project artifacts:
- the Responsive Production Master;
- the Journey G01 Visual Master V1;
- the Product V2 four-panel master;
- State Matrix V2.

The previous audit (`docs/audit/CHECKPOINT-02.md`) found the same. Nothing here replaces a master. Everything below is a **PROPOSED RECONSTRUCTION**.

## What was applied (owner direction, 2026-10-22)

"Maintain dark navy and amber/gold visual language across Web and Mobile."
- One palette, `src/theme/navy-amber.ts` ("Night Chart"), used by:
  - the mobile UI kit;
  - web CSS custom properties.
- `tests/theme-parity.test.ts` fails if web and mobile drift apart, or if any text or state colour falls below WCAG AA 4.5:1 on any surface.
- State is never carried by colour alone: every state has a glyph and a text label.
- Basemap tiles stay the light OpenStreetMap raster, and the map overlay colours are tuned for that basemap. A dark basemap style is a candidate for the owner to decide.

## Reconstruction candidates (screenshots)

All files are in `docs/release/evidence/local/`. They come from the production build at commit `4678f78` with local fixtures. Tiles are blocked in the sandbox, so the basemap shows its honest "not loaded" state.

| Viewport | Files |
|---|---|
| Desktop 1536×960 | `desktop-01-home`, `-02-map-search`, `-03-map-inspector`, `-04-place`, `-05-decide-results`, `-06-privacy`, `-07-report-unverified`, `-09-place-known`, `-10-notifications`, `-11-journey-active`, `-13…15-admin-*` |
| Tablet 820×1180 | `tablet-01-home`, `-02-map-search`, `-03-map-inspector`, `-04-place`, `-05-decide-results` |
| Mobile 390×844 | `mobile-01…05`, `mobile-08-report-corroborated`, `mobile-16-email-verified`, `mobile-17-forgot-sent`, `mobile-18-reset-done` |
| Landscape 844×390 | `mobile-landscape-12-journey` |

Native app screens are not captured: no simulator or device is available in this environment.

## Defects found and fixed during this pass

- Tablet (761–900 px): the top navigation wrapped onto two lines. These widths now use the bottom tab bar, and the map and journey heights account for it.
- Map attribution failed contrast when its stylesheet became page-scoped. It now has a dark background and amber links.
- The map status toast shifted layout (CLS). It is now anchored to the top.

## Owner decisions needed

1. Approve or replace the Night Chart reconstruction.
2. Supply the masters (above) so they can be compared screen by screen.
3. Choose the basemap: light OSM raster or a dark vector style (the latter needs a tile provider and key).
