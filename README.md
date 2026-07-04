# Iran–Israel Conflict Dashboard

Interactive dashboard cross-referencing conflict statistics, a 2023–2026 event timeline, OSINT attack-wave data, coalition strike maps, and missile/bomb inventories.

**Live site:** [https://iran-war-rho.vercel.app](https://iran-war-rho.vercel.app)

## What it shows

| Tab | Description |
|-----|-------------|
| **Map & timeline** | Leaflet map with Iranian attack arcs, US bases, coalition/ISW strike points, and a scrubbable playback with date jumps |
| **Conflict overview** | Daily Iran/Israel statistics — missile/drone attacks, casualties, infrastructure damage |
| **Timeline & context** | Searchable narrative timeline (Oct 2023–Jul 2026) with phase filters and expandable event cards |
| **Attack waves (OSINT)** | Wave-by-wave breakdown of Iranian operations (True Promise 1–4) with interception analytics |
| **Cross-reference** | Inventory systems vs. reported attack categories |
| **Missile inventory** | GlobalMilitary.net missile and bomb catalogs with guestimated use counts |

A **current status** panel at the top summarizes the post–Islamabad MOU diplomatic situation.

## Data sources

- **Conflict stats** — [Kaggle: iran-israel-conflict](https://www.kaggle.com/datasets/misbahfakhar/iran-israel-conflict) (daily Iran/Israel metrics)
- **Event timeline** — [Kaggle: iran-usa-conflict-2023-2026](https://www.kaggle.com/datasets/muhammadshayan5839/iran-usa-conflict-2023-2026) (narrative events; extended locally through Jul 2026)
- **Iran attack waves** — [danielrosehill/Iran-Israel-War-2026-OSINT-Data](https://github.com/danielrosehill/Iran-Israel-War-2026-OSINT-Data) (cached on first build)
- **Coalition strikes** — Curated seed data + [ISW/CTP ArcGIS story map](https://storymaps.arcgis.com/stories/089bc1a2fe684405a67d67f13bd31324)
- **Ordnance catalogs** — [GlobalMilitary.net missiles](https://www.globalmilitary.net/missiles/category/ballistic/) and [bombs](https://www.globalmilitary.net/bombs/)

Munitions-expenditure figures are **estimates** derived from OSINT wave counts and coalition reporting — not official government data.

## Project structure

```
iran-war/
├── web/                  # React + Vite dashboard (deployed to Vercel)
│   ├── src/              # UI components
│   └── public/data/      # Built dashboard.json + conflict.geojson
├── scripts/
│   ├── build_data.py     # Data pipeline → web/public/data/
│   └── *_seed.json       # Coalition strikes, GlobalMilitary inventory seeds
├── data/                 # Kaggle CSVs, ISW cache, notebooks
├── dashboard/            # Optional Streamlit app (local only)
├── vercel.json           # Vercel build config (root → web/)
└── package.json            # Root scripts
```

## Local development

### Prerequisites

- Node.js 20+
- Python 3.10+

### Web dashboard

```bash
# Install frontend dependencies
npm install --prefix web

# Run dev server (http://localhost:5173)
npm run dev

# Production build
npm run build
```

### Refresh data

Rebuild `dashboard.json` and `conflict.geojson` from bundled datasets and live APIs (OSINT, ISW):

```bash
npm run data
# or: python3 scripts/build_data.py
```

On first run, OSINT wave data is fetched from GitHub and cached under `data/osint/` (gitignored). ISW strike points are cached in `data/isw/`.

To download the Kaggle timeline zip manually:

```bash
curl -sL "https://www.kaggle.com/api/v1/datasets/download/muhammadshayan5839/iran-usa-conflict-2023-2026" \
  -o data/iran-usa-conflict.zip
```

Optional: copy `.env.example` to `.env.local` and set `KAGGLE_API_TOKEN` if you automate Kaggle downloads.

### Streamlit dashboard (optional)

A separate Plotly/Streamlit view over the Iran–Israel conflict CSV:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run dashboard/app.py
```

This is not deployed to Vercel.

## Deployment

The web app deploys to [Vercel](https://vercel.com) from the repo root. `vercel.json` points the build at the `web/` subdirectory:

- **Install:** `npm install --prefix web`
- **Build:** `npm run build --prefix web`
- **Output:** `web/dist`

After changing timeline CSVs, seed JSON, or `build_data.py`, run `npm run data` and commit the updated files under `web/public/data/` before deploying.

## License

Data remains subject to the terms of each upstream source (Kaggle, ISW, OSINT repo, GlobalMilitary.net). Code in this repository is private unless otherwise noted.
