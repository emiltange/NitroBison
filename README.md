# NitroBison

An MIT-licensed, offline-first Markdown knowledge workspace for connected ideas and projects. Notes stay local unless you explicitly enable Markdown saving to a provider-synchronized desktop folder or connect a cloud provider and sync. The supplied cow mascot remains the project logo, now with a transparent background; the existing application typography is unchanged.

## Your projects

**Home** places the compact mascot introduction beside storage and drives. Below it, newsroom-style cards show the six most recently updated projects. A folder's case-insensitive `README.md`, when present, supplies its introduction and any existing embedded banner; otherwise its latest surviving document supplies the preview. A private banner choice overrides that default locally. Introductions show at most two rendered lines, with the full Markdown preserved. Projects come from your actual top-level folders and include their nested notes; root-level pages appear under **Unfiled pages**, with the root README/banner used there too. Latest activity still controls project ordering, even when the README is older. Empty folders remain available, and example notes are labelled sample content. Opening a project shows its folder frontpage and scopes navigation to that folder and its descendants. Use **Notes** for the full vault, including projects outside the latest six.

Star any folder, including nested folders, to add it to **Favorite folders**. The strip shows up to five names at once (fewer on narrow screens); scroll or use arrow keys to reach the rest. Favorites persist locally per user, remain available outside the six-card set, and do not change note content or cloud-storage scope.

The drives overview distinguishes local storage, saved provider configuration and a connection verified in the current session. A configured client ID is not a live connection: reconnect after a reload. Verified business Google Drive accounts show **EA**; OneDrive and personal labels do not. Unknown metadata is not guessed from email or folder names. Storage cards preview at most three folder references; **All linked folders in Graph** opens their complete submenu list. Account authorization, cloud-folder metadata, a verified local folder and completed uploads are different states. API sync covers the **whole personal vault, including all projects**, not separate project-to-drive assignments. Provider logos are bundled locally.

## Folders and linked documentation

- **New note** uses the explicitly selected folder. With no folder selected, it creates the note at the vault root—even if the note you are reading belongs elsewhere. The selected folder is highlighted; the creation target remains available to screen readers without a visible extra label. **All notes**, **Notes**, or **Home** clears it.
- Opening a folder keeps every other visible folder in the sidebar. **Hide folder** in its action menu hides that folder and its descendants only on this device. Enable **Settings → General → Folders → Show hidden folders** to find and unhide them. This is a browsing preference, not deletion or access control; hidden notes remain in backups and cloud sync and may still be opened through explicit document links.
- On phones, primary navigation is a floating rounded pill with 44-pixel targets. Desktop app navigation omits Install; web/PWA keeps it. The supplied cow artwork and frosted navigation remain. **Saved**, **Saving…** or **Save failed** appears beside Write (Markdown)/Modern write/Read/Split; the sidebar footer retains detailed local/folder status. Success notifications dismiss after seven seconds or with their close button.
- **Toggle note browser** beside the NitroBison title collapses/reopens the second left sidebar on desktop, giving its width to the document, folder or graph. The narrow navigation rail remains available. **Ctrl/⌘ + K** reopens the browser and focuses search. Collapse lasts for the current window; reload starts with the desktop sidebar open. Phone drawers still use the same button and Escape.
- Click a folder name to open its frontpage; only the disclosure arrow expands or collapses its pages. Folders start collapsed. The frontpage pairs a banner on the left with the folder title and the first two rendered lines of its Markdown overview on the right, stacking on narrow screens. **Read full overview** opens the complete text. The sidebar's separate **Unfiled pages** section lists pages whose folder is empty and opens their root overview; it does not create a folder or move any notes.
- **Edit overview** saves ordinary `README.md` in that exact folder, reusing an existing case-insensitive README without overwriting another note. The overview editor keeps existing embedded banners out of the text field; unrelated remote images remain blocked.
- **Choose device folder** links an existing final destination for that exact folder, including nested folders and Unfiled pages. A new desktop folder/project with no selected parent is created under `%APPDATA%\NitroBison\Markdown\<vault folder path>` on Windows, with Markdown saving enabled; macOS uses `~/Library/Application Support/NitroBison/Markdown`. **Choose parent folder** overrides that default: choosing `notes` and naming it `path` produces `notes/path`, with saving enabled there instead. Managing an existing folder and **Show folder path** still select the final destination directly; old links and files are not moved automatically. The absolute path stays private, with **Open folder** available. Enabled saving mirrors real `.md` files while IndexedDB remains authoritative: nothing external is automatically imported or moved. Existing different/external-edited files cause a reported conflict, not a blind overwrite. Disabling/clearing/switching leaves old files in place. The browser keeps name-only references and does not enable native writes. UNC/network paths are unsupported; see [desktop saving and recovery limits](docs/DESKTOP.md#local-folder-paths-and-markdown-saving).
- **Attach banner** accepts PNG/JPEG/WebP files up to 16 MiB and 32 megapixels, prepares a JPEG up to 1280 pixels on its longest side, and requires the result to fit 512 KiB. Choices are private IndexedDB preferences for this browser/device. They appear on the folder frontpage, Home card and full README reading view, but never enter Markdown, JSON backups or cloud uploads. **Remove banner** hides it locally. Existing embedded Markdown banners remain intact as defaults until overridden. Folder renames carry private preferences to the new path; confirmed folder deletion clears descendant preferences and tombstones its notes, without deleting abandoned device files. Clearing browser data removes these private choices. General binary attachments and image cropping are not provided.
- Right-click a folder, use its action button, or press **Shift+F10** while focused on it to create a note or nested folder, open its linked graph, or select the soft-yellow **Manage folder** action. Manage folder is no longer repeated under every expanded folder. Folder stars remain private preferences.
- Drag a page from the note browser onto a folder name or **Unfiled pages** to move it. IDs and content are preserved, and an existing destination page with the same title is never overwritten. The note's **Folder** selector provides the keyboard/touch alternative. These move notes inside the vault, not files on your device.
- **Link documentation** inserts an ordinary Markdown link. Clicking a reference, backlink or rendered internal link opens a small bubble: **Open document**, or **Show reference** at its location in the source document. Repeated references list their individual locations; backlinks locate the occurrence in the linking document. Escape dismisses the bubble. Relationships remain ordinary Markdown, not a separate hidden store. Renaming or moving pages/folders does not automatically rewrite path-based links.
- Graph has its own left submenu instead of the note browser: **Notes/Folders**, scope, search, motion, selectable entities and every linked-folder reference. Controls have equal heights. Selecting a node or linked folder opens its inspector without navigating away; explicit **Open note**, **Open folder** and **Explore folder graph** actions navigate. Empty linked logical folders remain selectable. Drag nodes or the background, zoom, or reset with **100%**. Folder scope includes descendants and directly linked notes outside it, marked with dashed outlines. Keyboard selection and Escape work in the canvas and submenu; phone inspectors appear below the canvas, and reduced motion disables animated settling. Folder/reference menus also have explicit close buttons.
- Graph nodes continuously drift in a bounded pattern while their links follow, with no idle delay. Hover, panning, wheel/pinch zoom, keyboard/search focus and open details do not pause or restart motion. A dragged node stays pinned under the pointer while the others keep moving. Detail-panel controls stay in place during ambient drift. **Pause motion** stops ambient animation; **Resume motion** restarts it immediately. Reduced-motion preferences disable animation, hidden tabs stop frame work, and leaving the graph cancels its frame. Node positions and note content are not saved or rewritten by animation.
- The right panel starts with **Tags** and **Linked documentation** collapsed, showing their counts. Its **Note details** header and close button stay pinned while scrolling; the toolbar button reopens it. The **#** navigation button lists tags across the vault; selecting one shows the documents, occurrence counts, line numbers and highlighted source excerpts where it is used. Individual tag pills open the same view. Tags are case-insensitive; hierarchical tags remain distinct, and code, URL fragments and Markdown link destinations are excluded.
- Connected Google vaults whose content permission is read-only show **Read** without **Write (Markdown)**, **Modern write** or **Split**, plus a permission notice on the left. Folder overview editing, dragging and note mutations are unavailable, but private folder-location and banner choices remain editable without changing cloud notes. Google permissions apply to its whole `vault.json`, not arbitrary individual Drive documents; see [permission detection and local copies](docs/CLOUD.md#read-only-google-vaults).

## Task views & inline list databases

Select **Views** in the primary left rail (which uses crisp line icons alongside the NitroBison logo) to open the sleek sub-left Views menu and switch between **Task table**, **Kanban board**, **Timeline** and **Gallery** over your existing notes—never copied records. Titles open the normal editor; folder and inline-tag filters scope the same data.

The **Kanban board** organizes tasks across **To-do**, **In progress**, **In review** and **Complete** columns with status counts, per-column **+ New page** creation and smooth card reassignment animations. Use **Properties**, Table's inline controls or Board drag-and-drop to update status and inclusive start/end dates inside each note's leading `nitrobison-properties` JSON block while preserving its Markdown body, links, tags and ID.

To embed a Notion-style **List database** directly inside any Markdown document, type `/list` (or `/List view`) on its own line and press **Ctrl/⌘ + Enter**, or click **Insert list database** in the note toolbar. Each `nitrobison-list` fenced block renders a minimal live list of matching vault pages with right-aligned tag, date and interactive status pills, live search/filter/sort controls, and inline **+ New page** creation.

## Run

Requires Node.js 24 or newer. The included HTTP server serves application files only; no database, account or collaboration backend is required.

```sh
npm ci
npm run build
npm start
```

Open <http://localhost:3000>. Personal notes work immediately, without an account. There is no team setup, sign-in or invitation endpoint in the running product.

For frontend development, run `npm run dev`. No second API server or development proxy is required. Offline installation is enabled in the production build, not the development server.

For personal-only use, `dist/` can be served by any static host: no NitroBison backend is required after installation. Direct API cloud sync stores a JSON vault snapshot, not an automatically mirrored directory of `.md` files. For the simplest personal Google Drive/OneDrive setup, install the provider's sync client, choose its real local directory in NitroBison desktop and explicitly enable Markdown saving—**no OAuth registration required**. The OS client handles cloud uploads; a local save is not proof of upload. Hosted/web users can use Markdown export or the separate public-OAuth setup. Follow the [personal setup guide](docs/CLOUD.md#easiest-personal-setup-desktop-and-a-provider-sync-folder).

## What works

- Markdown source, rendered reading view and split view, including tables, fenced code, task lists and locally bundled Mermaid diagrams.
- Folders, full-text note search, wiki links, relative Markdown links, backlinks, outline and an interactive note graph.
- Durable local IndexedDB storage; an offline app shell caches **all** built diagram chunks, not just previously viewed diagrams.
- An installable desktop/mobile PWA and a separate Electron desktop application. Windows x64 installer: `npm run desktop:build`; unpacked Windows app: `release/win-unpacked/NitroBison.exe`. End users need no separately installed Node runtime or server. See [desktop builds, migration and release limits](docs/DESKTOP.md); macOS builds require a Mac and remain unverified.
- Local Markdown import/export and JSON backups/restores. Fresh profiles receive only **Getting started**, with four ordinary editable/deletable notes: README introduction, Feature tour, Markdown examples and AI assistant. Existing vaults—including intentionally empty ones—are never reseeded or automatically deleted. **Manage folder → Delete folder and notes** confirms recursive deletion; keep a backup first.
- Desktop linked-folder Markdown saving, enabled automatically for newly created folders/projects and explicitly for existing references, with private paths/settings, ownership checks, surfaced errors and bounded local preimage recovery. Default new-folder files stay in the per-user NitroBison app-data profile, not beside installed executables. It is outbound-only, not a two-way filesystem vault; old references require opt-in and JSON remains the complete portable backup.
- Direct Google Drive and OneDrive connections with user-configured public OAuth client IDs; provider tokens remain in memory. **Settings → Accounts** opens the provider pages directly, without a Connections subtab. The numbered guides cover personal Google External/Testing users and consent, Microsoft `consumers`, and exact web SPA/native callbacks. Google uses `drive.file` plus `openid profile email` for profile verification. Connecting Google does not create its folder; OneDrive verification may create an empty app folder, but neither uploads notes until **Sync**. See [cloud setup](docs/CLOUD.md).
- Dropbox remains an [implementation proposal](docs/CLOUD.md#dropbox-implementation-proposal), not an available connector. Google Workspace access is limited to the user's app-authorized Drive files; verified business accounts are **EA**, not live-account certification. OneDrive work/school app-folder sync is unverified because Microsoft's documentation conflicts. See the [personal/business account matrix](docs/CLOUD.md#personal-and-business-accounts).
- Team workspaces are removed for now. Their prior UI, server, persistence code, tests, deployment configuration and desktop assessment are preserved under [`reference/team-workspace/`](reference/team-workspace/README.md), outside the active app and test command. Existing cached team records, SQLite files and Docker volumes are left untouched; nothing is copied into personal notes.
- Explicit cloud synchronization, including offline edits and three-way merge. Concurrent changes preserve conflict copies instead of silently choosing a winner.
- Warm-neutral light mode and slate dark mode. Orange **`#D96B43`** actions, typography, reduced-motion safeguards and the soft-yellow Manage folder treatment remain. Settings opens with a theme/connection overview, then separates General, Accounts, Data & files and AI into sub-settings.

## AI writing

Open **Settings → AI** to choose built-in step-by-step guides and one-click endpoint/model presets for **ChatGPT (OpenAI)**, **Claude (Anthropic)**, **Gemini (Google AI Studio)**, **DeepSeek**, **GitHub Copilot / Microsoft Foundry**, and **Local models (Ollama / LM Studio)**—or enter any custom OpenAI-compatible chat-completions URL. Click **Test connection** to verify that your endpoint, model and API key return a live response (with round-trip latency and reply preview) before saving. HTTPS is required except loopback HTTP (`127.0.0.1` / `localhost`) for local models. Web endpoints must allow browser CORS; the desktop app uses a bounded main-process request without browser CORS restrictions.

NitroBison AI maintains **two separate persistent conversation histories** per workspace: one for the full **NitroBison AI** ChatGPT-style view (with its collapsible **Chats** history sidebar to start, revisit or delete threads) and a separate **Ask AI** pill-drop history for quick contextual page questions (accessible via the history list icon in the Ask AI header).

Provider notes: OpenAI API credits are separate from a consumer ChatGPT subscription (`https://api.openai.com/v1/chat/completions`, e.g. `gpt-6.1-sol` or `gpt-6-astra`). Anthropic's OpenAI-compatible endpoint (`https://api.anthropic.com/v1/chat/completions`, e.g. `claude-haiku-5-5` or `claude-opus-5-5`) requires a workspace-scoped API key. Google AI Studio uses `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` (default `gemini-3.5-flash-lite` for high availability, or `gemini-4-hydrogen`). DeepSeek uses `https://api.deepseek.com/chat/completions` (`deepseek-flash` or `deepseek-v4-pro`). GitHub retired `models.github.ai` in July 2026 and consumer Copilot subscriptions do not offer a public third-party REST endpoint—use Microsoft Foundry Models or a local loopback server (`http://127.0.0.1:11434/v1/chat/completions` for Ollama, `http://127.0.0.1:1234/v1/chat/completions` for LM Studio). Transient HTTP 503/529 provider overload spikes are retried automatically with short backoff.
In Write (Markdown) or Split, put `/AI your request` on its own line. Keep the caret on that line and press **Ctrl/⌘ + Enter**, or choose **Generate with AI**. Confirm the prompt with **Generate**, review the returned Markdown, then choose **Insert into note** to replace only the original command line. Surrounding text is preserved. Commands inside fenced/indented code are not executable; reading a document never calls AI.

For a contextual revision, use the **Revise Page** section in the right-hand Note details panel. Your request and the active note's full Markdown/title are sent only after **Generate revision**; no other notes or private device paths are included. Review the full result, then **Apply revision**. The note ID/title/folder are preserved. Local edits, another window's changes or deletion block applying stale results. Combined request/context is limited to 65536 characters; oversized notes are rejected without truncation or transmission.

AI settings default to **this session**. Explicitly select **Remember endpoint, model and API key on this device** to persist them: desktop uses OS-encrypted private storage; web uses browser storage, which is not a secure secret vault. Session-only selection clears previously saved settings; Clear key removes it from both current and remembered configuration. AI settings never enter note backups or cloud sync. Cancel or close aborts generation without editing. Requests time out after 60 seconds; provider charges and generated-content accuracy are your responsibility.

No network is needed for writing, reading, graph navigation or Mermaid rendering after **Ready offline** appears. Cloud authorization/synchronization requires connectivity. Keep the application open while synchronizing. Browser storage can be evicted or cleared: regularly export a backup or synchronize externally. Clearing site data removes local notes and offline files.

Online page loads request the current application HTML; offline loads fall back to the installed shell. A downloaded offline update waits until all app tabs and installed app windows are closed, so an update never forces a reload while you are editing. The status message distinguishes a waiting update from **Ready offline**.

If an older installation still shows Herd, the included server supports opening `/update-nitrobison` on the **same hostname and port** as your existing tab, for example `http://127.0.0.1:3000/update-nitrobison`. That uncached route loads the current interface without clearing IndexedDB or preferences. Then close all old app tabs/windows and reopen to activate the downloaded offline build. Do not switch between `localhost` and `127.0.0.1` to recover an existing vault: browsers store those origins separately. Do not clear site data to update the app.

Deletion uses retained tombstones, not secure erasure; deleted content can remain in snapshots and backups. Folder/title changes and page moves do not automatically rewrite path-based links in other notes.

## Containers: Docker or Podman

```sh
docker compose up --build -d
docker compose logs herd
# or
podman build -t herd .
podman run --name herd -p 127.0.0.1:3000:3000 herd
```

The image runs as the unprivileged `node` user and serves compiled application files; it does not open SQLite or store notes on the server. Compose binds loopback by default. For access from other machines, use an HTTPS reverse proxy and expose only the proxy. HTTPS is required for service workers and folder access outside localhost.

The `herd` service/container/image names remain stable deployment identifiers, not the current product name. Existing `herd-data` volumes and SQLite files are no longer mounted or used, but are not deleted. Preserve them for recovery; do not run `docker compose down -v` or prune old volumes. See the [retired team reference](reference/team-workspace/README.md#data-preservation-and-recovery).

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `3000` | HTTP port |
| `STATIC_DIR` | `./dist` | Built frontend directory |

Never commit provider credentials, database files or backups. The static server does not receive note snapshots; connected cloud providers can read the stored vault. No end-to-end-encryption layer is added by hosting the app.

## Backend weight

The frontend is static HTML/CSS/JavaScript. The optional serving process uses Node's built-in HTTP and filesystem modules with **zero installed production server dependencies**. There is no active SQLite, authentication, session, Redis, database daemon, ORM, WebSocket server or mail service. The production container does not install frontend build dependencies.

Any suitable static host can serve `dist/`; the included server supplies security headers, bounded public-file access and appropriate cache behavior. Keep the same app hostname and port when upgrading so browser storage stays accessible. Earlier collaboration measurements in [verification](docs/VERIFICATION.md) describe the retired implementation, not the current static server.

## Back up and restore

Export JSON in settings for a complete personal vault snapshot. Markdown folder export and explicitly enabled desktop linked-folder saving create portable `.md` notes, but not note IDs, timestamps, tombstones or a complete version history. JSON restore takes a local recovery copy before replacing the current vault; removed notes become tombstones to prevent old synchronized copies reappearing. Private folder paths, saving opt-ins and mirror journals/recovery stay in the local profile, outside note backups and provider snapshots. Keep independent external JSON backups; do not clear the application profile to fix a failed folder or cloud save.

Old team browser records, identity-scoped preferences and SQLite/WAL/SHM files remain isolated from the personal vault. The active app cannot open them; recovery precautions and original code are in [`reference/team-workspace/README.md`](reference/team-workspace/README.md). Back up the browser profile and a consistent complete database set before experimenting with historical code.


## Development checks

```sh
npm test
npm run check
npm run build
```

Tests focus on note/reference/tag behavior, personal data-loss boundaries, cloud concurrency, retired API rejection and static-host security. Use the real running app to verify visual changes. The test suite uses Node's built-in test runner; archived team tests are not part of `npm test`.

## Scope and compatibility

This is an independent Markdown application, not Obsidian source code. It does not load or run Obsidian plugins; see the [plugin compatibility assessment](docs/PLUGINS.md) for the distinction between Markdown features and plugin runtime support. No plugin marketplace, proprietary sync, embedded browser, general binary attachments or live cursor/CRDT editing. New folder banners are bounded private images; existing bounded inline README images remain supported. The app uses local Markdown conventions rather than emulating every Obsidian extension. Browser folder export requires `showDirectoryPicker` (Chromium-family desktop browsers); ordinary file import and JSON backup work where folder access is unsupported. Install UX varies by browser.

The NitroBison rename does not migrate or rewrite your vault. Existing note IDs, note content, browser storage/preferences and provider storage identifiers remain unchanged. Google Drive still uses the historical `Herd` folder and OneDrive retains `herd-recovery-` filenames; see [cloud storage compatibility](docs/CLOUD.md#storage-compatibility). Existing notes that mention the former name or team features are left untouched.

Application source is MIT licensed; dependency licenses remain their own. The logo was supplied by the project requester: redistribution of that artwork requires the requester's rights to it and is not independently verified here.
