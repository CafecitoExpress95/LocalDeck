# Changelog

All current LocalDeck releases are closed alpha releases. This changelog tracks the public release history and major user-visible changes for the project. Nightly builds may include intermediate work between stable closed alpha milestones and may be less stable than the releases listed here.

## Pre-1.0 Versioning Note

`0.x-CA` releases are closed alpha milestones. Patch-level work may appear first in nightly builds before it is promoted into a stable closed alpha release.

Stable public milestones are expected to follow the closed alpha sequence, such as `0.3-CA`, `0.4-CA`, `0.5-CA`, and later milestones as the project matures. `1.0` will represent the first stable public release target.

## 0.3.1-CA - 2026-05-16

`0.3.1-CA` is a stability release for the `0.3-CA` line. It focuses on custom-field correctness, safer option editing, and clearer recovery when local persistence operations fail.

### Fixed

- Fixed number custom-field clearing so an emptied number input persists as `null` instead of being coerced to `0`.
- Fixed duplicate dropdown and multi-select option handling by deduplicating parsed option drafts before saving.
- Preserved first occurrence order when deduplicating custom-field options.
- Prevented duplicate existing option IDs from being emitted when repeated option names are entered during field editing.

### Stability

- Added a lightweight persistence action wrapper for local board operations.
- Added visible status banner messaging when persistence operations fail.
- Improved recovery after failed persistence operations by reloading the current board snapshot when possible.
- Ensured startup loading state is cleared even if board listing or last-board opening fails.
- Applied persistence failure handling to open, save, delete, import-adjacent, and drag-and-drop finalize paths.
- Added regression coverage for custom-field input coercion and option deduplication.
- Validated with Svelte check, Vite build, and Vitest server tests.

### Known Issues

- Persistence recovery is UI-level and reload-based; failed IndexedDB transactions are not retried automatically.
- If both a persistence mutation and the recovery reload fail, the app may return to the dashboard with an error banner.
- Some broader `.board` validation, CSP hardening, timestamp churn, import conflict preflight, and desktop metadata alignment work remains deferred.

## 0.3-CA

`0.3-CA` expanded LocalDeck from local board editing into portable board ownership workflows.

### Added

- Added board search scope for finding cards and project content more quickly.
- Added archive-oriented workflows for managing inactive or completed content.
- Added JSON export and import support for board data portability.
- Added `.board` packaging as the project archive format for portable board files.
- Added archive validation and import/export paths around the local-first board model.

### Changed

- Extended LocalDeck's local-first persistence model beyond IndexedDB runtime storage into portable board archives.
- Strengthened the separation between active local board state and exported board packages.

### Known Issues

- Some `.board` import validation hardening remains deferred.
- Import conflict preflight may not catch all child ID collisions yet.

## 0.2-CA

`0.2-CA` introduced structured card customization for more flexible project workflows.

### Added

- Added card templates for reusable card structures.
- Added board-scoped custom fields for project-specific card metadata.
- Added support for text, multi-line text, number, checkbox, dropdown/select, multi-select, date, and URL custom-field types.
- Added labels for visual card categorization.
- Added date fields for lightweight scheduling and milestone tracking.

### Changed

- Expanded cards from basic Kanban items into flexible records with reusable board-level structure.
- Established templates as starting structures rather than strict schema enforcement.
- Scoped templates and custom fields to individual boards instead of making them global app settings.

### Known Issues

- Some timestamp churn may remain in field and label maintenance paths.

## 0.1-CA

`0.1-CA` established the first closed alpha foundation for LocalDeck as a local-first Kanban application.

### Added

- Added boards as the top-level workspace for local projects.
- Added stacks for organizing cards into Kanban-style lists.
- Added cards for individual tasks, notes, projects, or work items.
- Added drag-and-drop support for reordering stacks and moving cards.
- Added Markdown descriptions for richer card notes.
- Added card comments and updates.
- Added IndexedDB persistence through the local application storage model.

### Security

- Established the core privacy model: no accounts, no subscriptions, no telemetry, and no forced cloud backend.
- Kept card Markdown as raw Markdown data, with rendering handled at the UI layer.

## Known Limitations

LocalDeck is still in closed alpha. Current limitations include:

- Some `.board` import validation hardening remains deferred.
- Tauri CSP hardening remains deferred.
- Some timestamp churn may remain in field and label maintenance paths.
- Import conflict preflight may not catch all child ID collisions yet.
- Some desktop metadata alignment may still need release hygiene review.
- Nightly builds may be less stable than closed alpha milestone releases.
- The app should not be treated as production-stable until the first stable public release target.
