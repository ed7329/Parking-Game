# Park It! — 3D Parking Game

A browser-based 3D parking game built with [Three.js](https://threejs.org/).
No build step and no server code: it's a static site that runs on desktop and mobile.

## Play locally

ES modules need to be served over HTTP (opening `index.html` directly won't work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate | `W` / `↑` | GAS |
| Brake / reverse | `S` / `↓` (hold when stopped to reverse) | BRAKE / REV |
| Steer | `A` `D` / `←` `→` | ◀ ▶ |
| Handbrake | `Space` | — |
| Toggle chase / top-down camera | `C` | 🎥 |
| Restart level | `R` | ↻ |
| Menu | `Esc` | ☰ |

Get the car fully inside the glowing bay, lined up, and stopped for one second.
Stars are awarded for beating par time and avoiding bumps. Progress is saved in your browser.

## Levels

1. **First Spot**: straight in.
2. **Turn In**: 90° turn into a bay.
3. **Back It In**: must finish nose-out, so you have to reverse in.
4. **Parallel Park**: between two cars along a curb.
5. **Tight Garage**: indoor lot with cones and pillars.

## Deploy (GitHub Pages)

In the repository settings, go to **Pages**, set the source to *Deploy from a branch*, and pick
the branch and `/ (root)`. The game will be live at `https://<user>.github.io/<repo>/`.
Any static host works the same way (Netlify, Vercel, Cloudflare Pages).

## Code layout

- `index.html`, `style.css`: page, HUD, menus, touch controls
- `src/main.js`: scene, level building, game loop, camera, HUD and input
- `src/car.js`: car model and physics (kinematic bicycle model)
- `src/collision.js`: 2D oriented-box collision (separating axis test)
- `src/levels.js`: level layouts; add a new level by adding an entry here
