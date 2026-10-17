# PATHGUARD

<p align="center">
  <strong>Find your way. Walk with confidence.</strong><br/>
  An OpenStreetMap-powered pedestrian safety and route-planning platform.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-TypeScript-3178C6?logo=react&logoColor=white" alt="React and TypeScript"/>
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/Maps-MapLibre-396CB2" alt="MapLibre"/>
  <img src="https://img.shields.io/badge/Data-OpenStreetMap-7EBC6F?logo=openstreetmap&logoColor=white" alt="OpenStreetMap"/>
</p>

---


<p align="center">
 
## Demo

<p align="center">
  <img src="https://media.giphy.com/media/lcRCJBzSscaA0tLJz1/giphy.gif"
       width="100%"
       alt="Animated city walking visual"/>
  <em>Interactive pedestrian map and street-level safety overlay</em>
</p>


## Features

- **Interactive maps** — explore streets using MapLibre and OpenStreetMap.
- **Pedestrian network** — retrieve walkable street graphs using OSMnx.
- **Safety scoring** — estimate street suitability from available mapped attributes.
- **Walking routes** — calculate graph-based routes using shortest, balanced, or safest modes.
- **Route insights** — view distance, estimated walking time, and route-level score summaries.
- **Multi-city support** — explore supported Indian cities.

## Tech Stack

| Frontend | Backend & Data |
|---|---|
| React, TypeScript, Vite | Python, FastAPI |
| MapLibre GL JS | OSMnx, NetworkX |
| Lucide React, CSS | OpenStreetMap, GeoJSON |

## Getting Started

**Prerequisites:** Node.js, Python 3.12, Git, and internet access.

### 1. Clone the repository

```bash
git clone https://github.com/lelixn/PATHGUARD.git
cd PATHGUARD
```

Replace the repository URL if your GitHub repository uses a different name or owner.

### 2. Start the backend

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API documentation: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 3. Start the frontend

Open a second terminal:

```powershell
cd D:\pathguard
npm install
npm run dev
```

Open the local URL printed by Vite, usually [http://localhost:5173](http://localhost:5173).

Ensure the Vite development proxy forwards `/api` requests to `http://127.0.0.1:8000`.

## Safety Disclaimer

PATHGUARD's current safety scores are **heuristic estimates**, not verified crime statistics or validated personal-safety predictions. Missing map attributes do not prove that a street is unsafe or safe. Walking times are estimates, and route availability depends on mapped pedestrian infrastructure.

Always use your judgment when choosing a route.

## Roadmap

- [x] Interactive map foundation
- [x] OpenStreetMap pedestrian-network API
- [x] Initial street-scoring engine
- [x] Graph-based walking-route API
- [ ] Frontend route integration and end-to-end testing
- [ ] Verified safety datasets and improved risk modelling
- [ ] Production deployment

## Contributing

Issues and pull requests are welcome. Test changes locally and document known limitations.

## Data Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

---

<p align="center">
  Built with curiosity to make walking routes more informed.
</p>
