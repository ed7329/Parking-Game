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
| Shift up / down (manual gearbox) | `E` / `Q` | ▲ ▼ |
| Horn | `H` | 📯 |
| First person on/off (interior, mirror, backup camera when reversing) | `V` | 👁 |
| Cycle cameras: chase / top-down / first person | `C` | 🎥 |
| Mute | `M` | 🔊 |
| Restart level | `R` | ↻ |
| Menu | `Esc` | ☰ |

Get the vehicle fully inside the glowing bay, lined up, and stopped for one second.
Crashes dent the bodywork and break lights; reach 100% damage and the vehicle is written off.

**Settings** (top of the menu):
- **Steering:** right-hand drive (default) or left-hand drive. Moves the driver's seat, wheel and camera.
- **Gearbox:** automatic, or **manual** for extra difficulty. In manual you start in neutral and shift
  through R, N and 1–5 yourself. `S` only brakes; it won't put you in reverse. Shifting into reverse
  (or back into a forward gear) while moving grinds and is refused, and letting the revs drop in
  2nd gear or above stalls the engine (shift to N or 1 to restart). Levels finished in manual get a badge.

Stars are awarded for beating par time and avoiding bumps. Timed levels are failed if the
clock runs out. Progress is saved in your browser.

## Levels

1. **First Spot**: straight in.
2. **Turn In**: 90° turn into a bay.
3. **Back It In**: must finish nose-out, so you have to reverse in.
4. **Parallel Park**: between two cars along a curb.
5. **Tight Garage**: indoor lot with cones and pillars.
6. **Rush Hour**: traffic circles the lot while you park.
7. **SUV Squeeze**: a bigger vehicle in the same-sized gaps.
8. **Loading Dock**: reverse a box truck into a dock.
9. **Beat the Clock**: weave through barriers before time runs out.
10. **City Street**: timed parallel parking with traffic in both directions.
11. **Angle Parking**: nose-in angled bays in a pickup truck.
12. **Van Delivery**: parallel park a delivery van on a busy street.
13. **Bus Depot**: line up a 12-metre city bus between other buses.
14. **Night Shift**: park in the dark with headlights and street lamps.
15. **Roundabout**: cross circling traffic, then park a taxi, against the clock.
16. **Ambulance Bay**: reverse an ambulance between bollards with traffic passing.

**Expert levels.** Each was tuned to the tightest size that our physics search could still solve:

17. **Needle's Eye**: parallel park into a bay only 0.7 m longer than the car.
18. **Truck Curbside**: parallel park the box truck.
19. **Pillar Hell**: reverse in from a 5.2 m aisle lined with pillars.
20. **Bus Reverse**: back a bus in with 0.55 m clearance on either side.
21. **Cone Gauntlet**: five 3 m cone gates and a tight bay in 30 seconds.
22. **Gridlock**: reverse a van in while four cars circle round you.

**Free Drive** (from the menu): pick any of the 10 vehicles (sedan, hatchback, SUV, pickup,
delivery van, taxi, police car, ambulance, box truck, city bus) and explore a big lot with traffic.

Traffic stops for you (and honks if you block it for too long), but bumping into it counts as a hit.
All sounds (engine, crashes, parking-sensor beeps, horn) are synthesised live with the Web Audio API,
so there are no audio files.

## Put it on the web (GitHub Pages)

The repo includes `.github/workflows/pages.yml`, which publishes the game automatically.

1. Merge this work into a branch called `main`.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` now redeploys the game to `https://<user>.github.io/<repo>/`.
   You can also run the workflow by hand from the **Actions** tab.

GitHub Pages is free for public repositories; private repositories need a paid GitHub plan.
Any static host works too (Netlify, Vercel, Cloudflare Pages): point it at the repo, with no build command.

## Code layout

- `index.html`, `style.css`: page, HUD, menus, touch controls
- `src/main.js`: scene, level building, game loop, camera, HUD and input
- `src/car.js`: player vehicle physics (kinematic bicycle model) and the manual gearbox
- `src/interior.js`: first-person cabin, live gauges and the rear-view mirror
- `src/damage.js`: crumples the bodywork around crash points
- `src/vehicles.js`: vehicle specs and 3D models (cars, SUV, pickup, van, truck, bus and liveried variants)
- `src/traffic.js`: AI traffic that follows spline paths
- `src/audio.js`: synthesised engine, crash, sensor and horn sounds
- `src/collision.js`: 2D oriented-box collision (separating axis test)
- `src/levels.js`: level layouts; add a new level by adding an entry here
