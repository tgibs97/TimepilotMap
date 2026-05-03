# AGENTS.md

## Project Overview

Timepilot Map is a static frontend application that renders an interactive star map in the browser.
It supports:

- Pan and zoom on an SVG-based map
- Clickable star systems with a details panel
- Search and filtering for systems
- Travel route plotting, including charted and direct legs
- Optional sector grid display

There is no backend in this repository. The app is served as static files and can be opened directly in a browser or hosted with the included Docker and Nginx files.

## Key Files

- `index.html`: Main page structure and UI containers
- `styles.css`: Visual styling for the map and side panels
- `js/app.js`: Main application coordinator and event wiring
- `js/map-data.js`: System positions, ratings, colors, and route links
- `js/system-details.js`: Wiki-derived system metadata
- `js/map-renderer.js`: SVG rendering helpers for background, routes, grid, and systems
- `js/travel-routing.js`: Route graph helpers and travel leg construction
- `js/star-visuals.js`: Star color, radius, and opacity logic
- `js/dom.js`: Centralized DOM element lookups
- `js/utils.js`: Shared utility helpers
- `js/constants.js`: Shared constants and field help text

## Working Guidance

- Preserve the existing static frontend structure unless the task explicitly requires larger changes.
- Keep JavaScript modular and prefer adding shared logic to the existing helper modules instead of growing `js/app.js` unnecessarily.
- Avoid introducing build steps, frameworks, or backend dependencies unless explicitly requested.

## Commenting Rule

When writing or updating code in this project, add concise comments for non-obvious logic.
Comment intent, assumptions, state transitions, and tricky calculations.
Do not add comments that only restate what the code already says plainly.
