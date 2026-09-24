# Changelog

All notable changes to Domino Topple are documented in this file, following the [Keep a Changelog](https://keepachangelog.com/) format.

## [1.1.0] - 2026-09-24

### Added

- Each chapter is now a furnished room around the table: a study with a desk lamp, books, a bookshelf and a window; a garage with a pegboard of tools, a work lamp, a vice and a tool cabinet; and a playroom with blocks, a toy train, a teddy bear, bunting and a rug. The zoom-out button or `-` key, past the level's framing, lowers the camera so the room comes into view.
- Start and Goal tags float over the trigger and the goal, and a pulsing ring marks the goal.
- A selected piece shows Turn and Remove buttons right above it.
- Camera buttons on the right turn the view, zoom, switch to a top view and reset it. `[` and `]` turn the view, `+` and `-` zoom, `T` toggles the top view and `V` picks the Hand tool.

### Changed

- A new look: deep ink-blue glass panels with a gold accent, and glossy ivory dominoes with drilled black pips, an engraved divider and a brass spinner in every chapter.
- All the build tools sit in one dock along the bottom: Hand, the pieces with how many are left, Turn, Undo, Redo, Clear, the piece count against par, and GO.
- Building is the default. A domino is ready whenever build mode starts, so dragging on the table lays a row. The view only turns with the camera buttons or keys; dragging never rotates it. With the Hand tool, or with two fingers, dragging slides the view, and the wheel or a pinch zooms.
- A line above the dock says what to do next, starting with the level's own hint, and the first-visit tip only appears once a few dominoes are down.
- Clear empties the table at once, without a confirmation. Undo brings the pieces back.
- The table starts empty whenever a level opens or the page is reloaded; layouts are no longer saved between visits.

### Fixed

- Watch again on the result card did nothing.
- Tapping a placed domino sometimes did nothing instead of selecting it, and tapping one while a piece was picked in the dock tried to place on top of it.

## [1.0.0] - 2026-09-24

### Added

- A 3D chain-reaction puzzle game in the browser: build a chain on a tabletop diorama from a trigger to a goal, press GO, and watch a real physics simulation knock it down.
- Fifteen levels in three chapters with their own look: The Desk (walnut and green felt), The Workshop (a steel workbench and pegboard) and The Playroom (a checkered playmat and candy-coloured dominoes). Each level is unlocked by finishing the one before.
- A Sandbox with every piece, unlimited, on a large table.
- Eight pieces to build with: dominoes, tall dominoes, stairs, bridges, levers, marbles, ramps and springs. Levels add pendulums, wind-up cars and marble chutes as triggers, and bells, flags and cups as goals.
- Up to three stars a level: reach the goal, stay within the par piece count, and knock over the star token.
- Drag across the table to lay a whole row of dominoes in one stroke. Tap a piece to select, rotate, move or remove it, with undo and redo.
- Slow motion, a camera that follows the chain during a run, and a confetti burst when the goal is reached.
- Keyboard shortcuts for every build action, and touch gestures to orbit, pan and zoom.
- Layouts for phones held upright, with a bottom tray and a full-width GO button, and a camera that frames the whole table on a portrait screen.
- Three graphics tiers, picked automatically from the device's frame rate or set in Settings.
- A reduced motion setting, which follows the system preference by default.
- Synthesised sound effects for clicks, domino taps, bells and springs, with a mute setting.
- Progress, layouts and settings are saved in the browser.
