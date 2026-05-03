# Timepilot Map

A static navigable star-map website based on the supplied chart. It supports pan, wheel zoom, system selection, search, and a details panel.

Selecting a system updates the details panel without moving the current map view. Pan and zoom are controlled manually.
The system details panel is populated from `data/system-details.json`. The Star System View lazy-loads generated planet and moon data from `data/star-systems/`.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static file server.

With Docker:

```powershell
docker compose up --build
```

Then browse to `http://localhost:8080`.

## Edit systems

Systems, coordinates, ratings, colors, and routes live in `js/map-data.js`.
Wiki-derived system facts live in `data/system-details.json`.
Star System View object data is generated from the Starfield Fandom wiki into `data/star-systems/`. The generator writes a manifest, one `planets.json` per system, and one moons JSON file per planet. It pulls system planet/moon lists and each object's General Information panel when an object page exists.

Regenerate planet and moon data with:

```powershell
node scripts\update-star-system-objects.mjs
```

## Code notes

When updating the code in this project, add concise comments for non-obvious logic and behavior.
Document intent, assumptions, and tricky calculations, but avoid comments that only restate the code.

Each system uses the source chart's coordinate space:

```js
{ name: "Sol", x: 321, y: 560, rating: 1, group: "green" }
```

Valid groups are `green`, `blue`, `yellow`, `orange`, and `red`.

## Deploy to HexOS or TrueNAS

### Static share

Copy these files to a web-served dataset or app volume:

- `index.html`
- `styles.css`
- `js/`

Any Nginx, Caddy, Apache, or TrueNAS static web app can serve them because there is no backend.

### Docker app

Build and run the included Nginx container:

```powershell
docker compose up -d --build
```

On the server, change the host port in `docker-compose.yml` if `8080` is already in use.
