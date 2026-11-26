# Medical 101

Health, medicine & biology — in plain language. A public, interactive
reference site: 44 chapters as readable pages, full-text search, a glossary,
reference pages, and interactive 3D models (artery, plaque rupture, liver,
cholesterol pathway) built with Three.js.

Live at **https://medical.parth.page** (GitHub Pages, repo `allinhtml/medical`).

## Tree

```
medical-101-site/
├── index.html          # HTML shell only — no inline <style>, no large inline <script>
├── CNAME               # medical.parth.page (GitHub Pages custom domain)
├── css/
│   └── style.css       # all site styles
├── js/
│   ├── data.js         # var BOOK = {...} — all chapter/glossary/reference content
│   ├── app.js          # site logic: routing, search, chapter rendering, TOC
│   └── models3d.js     # Three.js 3D models (artery, rupture, liver, pathway)
└── assets/
    └── images/
        ├── img-001.jpg … img-060.jpg   # chapter diagrams & photos
```

Script load order in `index.html` (matters — do not reorder):
Three.js CDN → OrbitControls CDN → `js/data.js` → `js/app.js` → `js/models3d.js`.

External dependencies at runtime: Three.js r128 + OrbitControls (CDN),
IBM Plex Sans/Serif (Google Fonts). Everything else is local.

## Privacy rule — read before touching this tree

**This public site uses example numbers only.** Every lab value in it belongs
to one consistent, clearly-labelled *example patient* — not a real person:

- Total cholesterol 212 · HDL 50 · LDL 130 · triglycerides 150 ·
  VLDL ~30 · non-HDL 162 · HbA1c 5.5%
- Consistency: 50 + 130 + 30 = 210 vs measured 212 (parts are estimated, so
  they land close to — not exactly on — the measured total);
  non-HDL = 212 − 50 = 162 = LDL 130 + VLDL ~30 + ~2 from other carriers.

**Real personal numbers live in the private book and must NEVER be
committed here** — no real names, no real lab results, no doctor names, no
clinic names, no prescription dates/doses tied to a person, no check-up dates.
The "Example numbers" page states this explicitly. If a refresh ever brings a
real number back in, remove it before pushing — do not ship first and fix later.

## How to refresh this site

The source of truth for content is the private book. A refresh is:
re-export the site → re-split → re-sanitize → verify → push.

1. **Re-export** the Medical 101 web artifact to a single HTML file
   (`artifact.export`), e.g. `medical-101-reference-book.html`.
2. **Re-split** it into this tree shape: extract the `<style>` block to
   `css/style.css`, the `var BOOK = {...}` script to `js/data.js`, the
   app-logic script to `js/app.js`, the 3D script to `js/models3d.js`, and
   each embedded base64 image to `assets/images/img-NNN.jpg`
   (in order of appearance), replacing each URI with its relative path.
   Keep the two Three.js `<script src>` CDN tags, in this order:
   CDN scripts first, then `data.js`, `app.js`, `models3d.js`.
3. **Re-sanitize** (critical): replace every personal value with the example
   patient set above; remove/rephrase every personal name, doctor/clinic
   name, prescription dose + date, and check-up date. Do NOT ship the
   downloadable PDF — remove the Download PDF button/dropdown and any code
   that links to the PDF file.
4. **Verify** before pushing (see below), then commit + push to
   `allinhtml/medical` (`main` branch, `/` root). GitHub Pages rebuilds
   automatically.

## Verification checklist (run before every push)

```sh
cd ~/workspace/medical-101-site
# JS must parse
node --check js/data.js && node --check js/app.js && node --check js/models3d.js
# The previous real lab values (recorded only in the private book's notes,
# never written in this repo) must not appear anywhere in this tree.
# Grep for each of them — total, LDL, HDL, triglycerides, A1c, non-HDL, VLDL —
# across *.js, *.html and *.css, and expect zero hits. Only the example
# patient set above (212 / 50 / 130 / 150 / 30 / 162 / 5.5) may appear.
# no embedded data URIs, no PDF references
grep -r 'dat[a]:' . ; grep -r -i 'Medical-101-Reference-Book.pd[f]' .
# every image on disk is referenced; every referenced image exists
grep -o 'assets/images/img-[0-9]*\.jpg' js/data.js | sort -u | wc -l   # expect 60
ls assets/images/ | wc -l                                              # expect 60
```

And separately, grep the whole tree for personal identifiers — person names,
doctor and clinic names, personal dates, dose + date — and expect **zero
hits**. (The pattern is the banned-term list in the privacy rule above; it is
deliberately not spelled out in this file so that this file itself stays clean
for that check.)

Known benign remainders (not personal data): the digits `53` survive in a few
places — a future lesson number (53), "a fall of about 53%" (ASTEROID trial
result), a PubMed article ID, and an image filename (`img-053.jpg`). The previous
real lab values do not appear anywhere in this tree — not even in code. The reading link to the public encyclopedia site in Chapter 18
is a public source, not a personal record; the visible text carries no clinic
name. The domain name itself (parth.page) appears in the CNAME and in URLs by
design.
