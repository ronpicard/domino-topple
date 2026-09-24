# Domino Topple

Domino Topple is a 3D chain-reaction puzzle game that runs in the browser. Each level is a tabletop in a furnished room, a study, a garage workshop or a playroom, with a trigger, such as a swinging pendulum, a wind-up car or a marble chute, and a goal, such as a bell, a flag or a cup. You build the chain between them from dominoes, stairs, bridges, levers, marbles, ramps and springs, then press GO and watch it fall. Play the [live demo](https://ronpicard.github.io/domino-topple/). It works on both phones and desktops.

## How to play

1. A domino is ready in the dock when a level opens. Pick another piece from the dock, or pick Hand to move the view.
2. Tap the table to place one piece, or drag across it to lay a whole row of dominoes along your finger. Green Start and orange Goal tags float over the trigger and the goal, and the line above the dock says what to do next.
3. Tap a placed piece to select it. Turn or remove it with the buttons that appear above it, or drag it to move it. Dragging a piece back onto the dock removes it.
4. Press GO to run the physics. STOP returns to building with your layout intact, and `½×` plays the run in slow motion.

Each level awards up to three stars: one for reaching the goal, one for using no more pieces than par, and one for knocking over the star token. Your stars are saved in your browser; the table starts empty each time a level opens.

| Keys | Action |
| --- | --- |
| `1`–`8` | Select a piece in the dock |
| `0` or `Esc` | Deselect the tool or piece |
| `V` | Hand tool |
| Arrow keys | Nudge the preview or the selected piece |
| `Enter` | Place a piece at the preview |
| `Q` / `E` | Rotate by 15° either way |
| `R` | Rotate by 90° |
| `Delete` | Remove the selected piece |
| `Ctrl`/`Cmd`+`Z`, `Ctrl`/`Cmd`+`Shift`+`Z` | Undo, redo |
| `Space` | GO or STOP |
| `S` | Slow motion |
| `[` / `]` | Turn the view |
| `+` / `-` | Zoom in or out |
| `T` | Top view |
| `C` | Reset the camera |
| `H` | Help |

Dragging on the table always builds; it never turns the view. The camera buttons on the right turn the view, zoom, switch to a top view and reset it. With the Hand tool, drag the table to slide the view. On a touch screen, drag with two fingers to slide the view and pinch to zoom. With a mouse, middle-drag slides the view and the wheel zooms toward the cursor. The camera frames the whole table around the on-screen controls, and follows the chain during a run until you move it yourself. Zooming out past that framing lowers the camera to show the room; it never leaves the room's walls.

## Levels

Fifteen levels in three chapters, each unlocked by finishing the one before. The Sandbox has every piece, unlimited, on a large table.

| # | Chapter | Level | Teaches |
| --- | --- | --- | --- |
| 1 | The Desk | First Row | Drawing a row of dominoes |
| 2 | The Desk | Around the Block | Curving a row around an obstacle |
| 3 | The Desk | The Long Stretch | Tall dominoes cover more ground |
| 4 | The Desk | The Fork | Splitting one row into two |
| 5 | The Desk | Grand Row | Everything from the chapter |
| 6 | The Workshop | Step Down | Stairs carry a chain down a level |
| 7 | The Workshop | Gap Crossing | Bridges span a gap between platforms |
| 8 | The Workshop | Whip Around | A lever flings a marble |
| 9 | The Workshop | Downhill Roll | Ramps and a rolling marble |
| 10 | The Workshop | The Workshop Run | Bridge, stairs and lever together |
| 11 | The Playroom | Wind-Up Row | A toy car starts the chain |
| 12 | The Playroom | Chute Chain | A marble chute starts the chain |
| 13 | The Playroom | Over the Wall | Springs bounce a marble over a wall |
| 14 | The Playroom | Sink It | Lobbing a marble into a cup |
| 15 | The Playroom | Big Rig | Two triggers, one long chain |

## The physics

Every run is a real rigid-body simulation with [Rapier](https://rapier.rs/), in centimetres and seconds, stepped at a fixed 120 steps a second. Dominoes are solid blocks with real mass and friction. The pendulum, lever and bridge swing on hinges, and marbles use continuous collision detection so they never tunnel through a thin domino. A run succeeds the moment the goal is reached, and fails once everything has come to rest without reaching it, or after 40 seconds.

The browser and the test suite use the same simulation code, and a run with the same layout always plays out the same way. Every level ships with a reference solution, and the tests run it headlessly and check that it earns all three stars. They also check that the level can't be finished from an empty table.

## Phones and slow devices

The layout follows the screen: a single dock along the bottom with GO at its end on wide screens, and a taller dock above a full-width GO button on phones held upright. On a portrait screen the camera turns to look down the table's long side, so the whole level fits. Touch targets are sized for thumbs, and the safe areas around notches are respected.

The graphics come in three tiers. High adds ambient occlusion, a tilt-shift depth of field, bloom and anti-aliasing. Medium keeps bloom and the vignette. Low renders directly with no post-processing. With the Quality setting on Auto, the game measures its own frame time when a level opens and picks a tier. Reduced motion, from the Settings dialog or the system preference, turns off the camera follow, confetti and the menu's attract loop.

## Tech stack

- React 19 and TypeScript for the menu, level select, HUD, dock and dialogs
- react-three-fiber, drei and three.js for the dioramas: physically based materials, soft shadows, an environment light, and instanced dominoes, so a long row costs one draw call
- @react-three/postprocessing for ambient occlusion, bloom, tilt-shift and tone mapping
- Rapier (`@dimforge/rapier3d-compat`), used directly instead of through a React wrapper, so the browser and the Node tests share one deterministic simulation
- Web Audio, synthesised in code at runtime, with no audio files
- Vite for building and development
- Node's built-in test runner (`node:test`), with no separate test framework
- No backend: progress and settings live in `localStorage`
- GitHub Actions and GitHub Pages for continuous deployment

## Project layout

The game logic is kept separate from rendering and input, so the pieces, levels, editor, rules and physics can be unit tested without a browser or a canvas:

```text
src/game/         piece catalogue, level data, the build-mode editor, placement rules, scoring, storage, routes, and the Rapier simulation
src/game/levels/  the three chapters of levels and the sandbox
src/scene/        the react-three-fiber scene: diorama, pieces, camera and gesture controls, run driver, post-processing
src/ui/           React components for the menu, play screen, HUD, dock and dialogs
src/audio.ts      synthesised sound effects
scripts/          the headless level runner
```

## Development

Requires Node >= 22.12.

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the dev server |
| `npm test` | Run the editor, placement, rules, storage, route, physics and level tests, including every level's reference solution |
| `npm run try-level -- <id>` | Run one level's reference solution headlessly and print the outcome. Add `--empty` to run it with no pieces placed |
| `npm run typecheck` | Type-check the project |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |

## Deployment

Pushes to `main` run a GitHub Actions workflow that installs dependencies, runs the test suite, builds the production bundle, and publishes the `dist` output to GitHub Pages.

Vite is configured with a relative `base` in `vite.config.ts`, so the built asset paths resolve correctly whether the site is served from the domain root or from a repository subpath like `/domino-topple/`.

## License

[MIT](LICENSE)
