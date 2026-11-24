# Retired team workspace reference

NitroBison's running product is now a personal, offline-first Markdown workspace. This directory preserves the previous invite-only team implementation for recovery and future reference. It is not imported by the active app, served by the active HTTP server, or included in the active test command.

## Original file relationships

The snapshots retain their original contents rather than compatibility wrappers:

| Reference path | Original repository path and responsibility |
| --- | --- |
| `app.js` | `src/app.js`: team navigation, setup/sign-in/invitation dialogs, member actions, team read-only UI and identity-scoped bookmarks. |
| `src/workspace.js` | `src/workspace.js`: personal/team identity switching, session restoration, IndexedDB caching, team revision merging, and personal/cloud persistence. |
| `src/projects.js` | `src/projects.js`: project models and both personal/team storage summaries. |
| `server/app.js` | `server/app.js`: SQLite accounts, password hashing, cookie sessions, first-owner setup, invitations, membership authorization, team snapshot revisions, request limits and static hosting. |
| `server/index.js` | `server/index.js`: database configuration, setup-token generation and HTTP startup/shutdown. |
| `tests/server.test.js` | `tests/server.test.js`: the original server suite, including team security and persistence tests. |
| `tests/folder-preferences.test.js` | `tests/folder-preferences.test.js`: the original preference suite, including identity-transition and cached-team safeguards. |
| `tests/projects.test.js` | `tests/projects.test.js`: the original project/storage suite, including team-storage states. |
| `Dockerfile`, `compose.yaml`, `vite.config.js` | Original deployment configuration: SQLite data volume, setup/cookie settings and development API proxy. |
| `DESKTOP.md` | Previous desktop packaging assessment, including the retired hosted-team window proposal. |
| `src/core.js`, `src/markdown-model.js`, `src/folder-preferences.js`, `src/folders.js`, `src/examples.js` | Shared module snapshots needed by the archived server/workspace/project tests. |

The archived `server/app.js` imports `../src/core.js`; the archived test imports resolve to the archived `server/` and `src/` snapshots. `app.js` is kept at this directory's root as an application snapshot; in the original app it lived beside `workspace.js` and the other frontend modules in `src/`. This archive is not a second supported application or a runnable replacement frontend.

The old routes were `/api/session`, `/api/setup`, `/api/logout`, `/api/invites`, `/api/invites/accept`, `/api/members`, `/api/members/:id`, and `/api/workspace`. None are active now. The active server serves compiled public files, OAuth callback files and `/api/health`, retaining static-host security headers and path bounds. Use HTTPS at a reverse proxy and configure HSTS there when hosting publicly.

## Data preservation and recovery

No team data is copied into the personal vault, deleted, migrated or reinterpreted. The active workspace always opens the existing `personal` record in the existing `herd-workspaces` IndexedDB database and `vaults` object store. Existing `team:<user-id>`, `active`, recovery records, and `folder-preferences:team:<user-id>` records remain in that browser profile, untouched. Existing identity-scoped bookmark keys likewise remain available. Personal keys, recovery records, private folder preferences, cloud configuration and the cloud snapshot schema keep their existing meanings.

The repository's `data/` directory, including SQLite/WAL/SHM files, is not touched by the new server. Existing Docker named volumes are not deleted; the personal-only deployment no longer mounts or requires them. Do not run `docker compose down -v`, prune volumes, overwrite SQLite files, or clear browser site data when recovering an old team vault. Back up the browser profile and copy the complete SQLite database set while the old server is stopped (or use SQLite's backup facilities) before experimenting. Cloud sync still operates only on personal data and is never a route to old team records.

For historical server/workspace tests, use Node 24 or newer and the repository's installed dependencies, then run explicitly from the repository root:

```sh
node --test reference/team-workspace/tests/*.test.js
```

These are retired-behavior tests, not the current product's acceptance suite. They operate on temporary test data, not the existing `data/` directory. They have not been executed as part of this retirement change.

For a full historical deployment, restore the archived files to their original paths in a separate checkout, place the archived root `app.js` at `src/app.js`, and recover the matching historical frontend modules from version control. The original deployment configuration assumes the repository root is its build context; running Compose directly in this archive is not supported. Never point a historical experiment at the only copy of a real database or browser profile. The archived frontend is not maintained or security-updated as an active product.
