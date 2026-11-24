# Changelog

## NitroBison 1.6.3

- Added **Settings → General → About → Check for updates**: shows the installed version and, on request, asks GitHub for the latest release and links to it when a newer one exists.

## NitroBison 1.6.2

- The app now ships `THIRD-PARTY-NOTICES.txt` with the license text of every bundled open-source package, generated during `npm run build`.
- `LICENSE` credits the original FastBovine contributors.
- Releases are built by GitHub Actions; code signing through SignPath activates once it is configured.

## NitroBison 1.6.1

- Renamed the app from FastBovine to NitroBison, with a new mascot, app icon and installer artwork.
- Added a tag bar above the note title: type a tag and press Enter to add it; hover a tag to reveal its remove button.
- Added **Settings → General → Appearance → Hide AI buttons**.
- Fixed all `npm audit` findings: mermaid 12.3.0 (patched KaTeX), `@electron/universal` 3 and patched minimatch for the build tooling.
- Removed the retired `reference/team-workspace/` archive and the old verification log; the Docker Compose service is now `nitrobison`.

## NitroBison 1.6.0

- Added **Expanded In-Context Reading View** for the floating **Ask AI** widget (`⤢` / `⤡ Compact` header toggle + top-left desktop corner drag-to-resize, persisted size preference, inline **Save as page** on assistant replies, and an auto-growing multi-line `<textarea>` composer with `Enter` to send / `Shift+Enter` for newline) so long AI summaries and multi-line prompts are easy to read without leaving the active note.
- Unified **NitroBison AI Chat History** so both **Full AI chats** and **Page talks · Ask AI** appear together inside the left **Chat history** sidebar with total count, context badges, and direct thread continuation.
- Smoothed the floating **Ask AI talks** history drawer into a top overlay transition without replaying the window entry animation on toggle.
- Anchored the floating **Ask AI** button cleanly to the bottom-right corner in **Knowledge graph** view and increased visual separation between the `+` block gutter, orange active-block focus line, and block text in **Modern write**.

## NitroBison 1.5.0

- Added **Modern write** (`Exp`), a Notion-inspired block editor over standard Markdown with `/` slash commands (headings, checklists, bullet/numbered lists, callouts, GFM tables, numeric-total sheets, live Mermaid diagrams, inline task-list databases, code fences, dividers, and workspace page links), centered on a compact `680px` column with Notion-scale typography.
- Renamed **Write** to **Write (Markdown)** across the note display mode switcher, property/list repair dialogs, starter guides, and documentation, with clean mobile toolbar wrapping.
- Added **Test connection** (with cancellation, round-trip latency, and live reply preview) to **Settings → AI** and the **Connect your AI provider** dialog, plus automatic short-backoff retry on transient `503`/`529` provider overload spikes and updated 2026 provider presets.
- Added **two separate persistent conversation histories** per workspace: a ChatGPT-style **Chats** sidebar for the full **NitroBison AI** page (`#ai`) and a dedicated **Ask AI talks** drawer for quick contextual pill-drop chats.
- Added knowledge-graph **tag & folder filtering** and **Revise Page with AI** in the right-hand **Note details** panel.

## NitroBison 1.4.0

- Redesigned **Kanban Board** columns with Notion-inspired soft rounded tinted column containers, distinct colored status pills + indicator dots (**To-do**, **In progress**, **In review**, **Complete**, and custom swimlanes), compact empty-column heights (`align-items: flex-start`), and full-width `+ New page` cards.
- Added **NitroBison AI Chat** workspace page (`#ai`) featuring the cow-logo avatar, multi-turn Markdown conversations, workspace/page/general context chips, suggested starter prompts, one-click **Save as page**, and a **Connect your AI provider** modal with provider setup links (OpenAI, Claude, Gemini, DeepSeek, Microsoft Foundry, and offline Local AI).
- Added a floating **Contextual Ask AI Support Widget** across workspace views whenever an AI provider is connected, grounded in the active page and workspace with quick actions and expand-to-full-chat handoff.
- Refined full-screen root font scaling and collection container bounds across **Task table**, **Kanban board**, **Timeline**, and **Gallery** so wide monitors stay crisp and balanced instead of appearing over-zoomed.

## NitroBison 1.3.0

- Added **Multiple Local Workspaces** via a Notion-style switcher in the top bar and second left panel (`Personal workspace` plus user-created local vaults stored in separate IndexedDB scopes without disturbing existing personal notes).
- Added **Resizable Second Left Panel** (`185px–440px` drag handle with keyboard arrow/Home support and persisted width) plus responsive Task views menu placement (sub-left panel above 50% screen width; compact top-bar menu on narrow/half-screen windows).
- Added **Kanban Swimlane Grouping** (`+ Add swimlane` by Folder or Tag, collapsible horizontal lanes, drag-and-drop reassignment across both status columns and folder/tag lanes, and `Remove swimlane`).
- Added **Settings → AI Provider Setup Guides & One-Click Presets** for ChatGPT (OpenAI), Claude (Anthropic), Gemini (Google), DeepSeek, GitHub Copilot / Microsoft Foundry, and Local Ollama / LM Studio.
- Refined second left panel proportions, collapsible **Private pages** tree hierarchy, active view highlighting, and clean right-aligned tabular item counts.

## NitroBison 1.2.0

- Replaced custom mascot navigation icons with clean line icons, removed Calendar and standalone List views, and merged Views into one primary rail button with layout and filter options in a sleek Notion-inspired sub-left menu.
- Redesigned Task table and Kanban board around a Ramp HQ-style 4-stage workflow (**To-do**, **In progress**, **In review**, **Complete**) with tinted columns, status pills, per-column **+ New page** creation and smooth FLIP reassignment animations.
- Added Notion-style inline Markdown **List databases** (`nitrobison-list` fenced blocks via `/list` or the note toolbar) with minimal single-line rows, far-right tag/date/status pills, live search/filter/sort and inline **+ New page** creation.
- Integrated Windows native minimize/maximize/restore/close controls into the 66-pixel application top bar, preserving native dragging, snap behavior and existing unsaved-write close protection. Native caption colors follow light/dark themes; web/PWA chrome is unchanged.

## NitroBison 1.1.0

- New desktop folders/projects without a selected local parent now create real directories under the per-user NitroBison app-data `Markdown` directory and enable existing safe outbound Markdown saving. Explicit parents still override the default; existing vaults, paths and files are not migrated or deleted.
- Windows setup now uses the supplied outcome picture on the completion sidebar and a native cancellation dialog, without changing the application logo or silent installer behavior.
- Fresh-only Getting started now contains four editable linked Markdown guides; existing and intentionally empty vaults are preserved. Confirmed folder deletion recursively tombstones notes and clears private references without deleting abandoned device files.
- Added save feedback beside Write/Read/Split, seven-second dismissible success notices, explicit popup close buttons, an inset hamburger focus ring, and removed the visible creation-target label.
- Graph now owns its left submenu, selectable entity list and complete linked-folder references. Home previews only three references per storage card; graph controls share equal heights. OneDrive no longer displays EA; Google Workspace's label remains.
- AI settings support explicit session/device lifetime, including opt-in keys. Desktop uses atomic OS-encrypted private storage; web warns that browser storage is not a secure secret vault. Applied feedback is prominent, dismissible and briefly animated for pointer actions without reduced motion.
- Added a round contextual Ask AI action with disclosed active-note context, reviewed full-body replacement and atomic latest-content checks protecting concurrent edits and deletions. Existing /AI insertion uses the same guarded apply path.
- Fixed multi-path storage-card formatting: references and scope span the card width instead of squeezing the title into the two-column header grid.
- New desktop folder/project creation treats the selected location as its parent, creates the named child hierarchy using the existing safe filesystem checks, and links Markdown saving to that child. Existing references and files are not automatically moved.
- Added a Gemini / Google AI Studio settings example with the full OpenAI-compatible endpoint, account-available model guidance and an exposed-key warning; no Gemini-specific SDK or automatic generation was added.
- Added explicitly enabled desktop linked-folder Markdown saving to real local directories, including provider-client sync folders without OAuth registration. Kept IndexedDB authoritative, old references disabled until opt-in, paths/state private, external files protected, surfaced partial-write/conflict failures and bounded profile-local preimage/journal recovery; disabling or switching leaves old files intact.
- Separated verified account authorization, cloud-folder metadata and local-folder save status; only business Google Drive accounts display EA. Google adds basic identity scopes alongside drive.file; OneDrive verification can create an empty app folder but no notes upload before Sync.
- Removed the redundant Accounts → Connections subtab while retaining the Google Drive and OneDrive setup pages. Expanded personal setup guides with the no-registration desktop route, Google External/Testing users and consent, Microsoft consumers and exact SPA/native callbacks; live provider accounts and business compatibility remain unverified.
- Added a folder-plus creation control; opening folders no longer filters the rest out of the sidebar. Added private hide/unhide flags and a persistent Show hidden folders setting without removing notes from backups or sync.
- Made the desktop note/folder browser collapsible from the existing topbar toggle, reclaiming its column while retaining primary navigation. Search shortcuts reopen it; phone drawers and independent note-details controls remain intact.
- Restored warm light neutrals while preserving the slate dark palette; replaced Home/Notes/Graph/Download/Settings icons with transparent supplied artwork and moved save status into a compact sidebar footer.
- Fresh profiles now receive Getting started without changing existing data; removed desktop's navigation Install action and added native local-path selection to folder creation/management plus Show folder path in folder menus.
- Reorganized settings into an overview, category navigation and sub-settings; explicit /AI prompts use a configurable OpenAI-compatible endpoint with cancellation and reviewed, concurrency-safe insertion. Session-only remains the default; remembering keys requires opt-in.
- Added a sandboxed Electron application entry, local asset protocol, stable personal profile, supplied-logo native icons and Windows x64 NSIS packaging in `release/`, with separate macOS build commands and unchanged web/PWA deployment.
- Added native system-browser PKCE authorization for the existing Google/OneDrive connectors, cancellable loopback callbacks, provider-specific desktop setup guides and default-cancel confirmation before creating a desktop-visible Google vault.
- Added native no-overwrite Markdown folder export and private full local folder paths with an Open folder action; choosing a path alone does not move or import notes. Desktop can now save Markdown only after explicit enabling; browser selection remains name-only and paths stay outside backups/cloud snapshots.
- Fixed Electron ESM startup waiting on module-level readiness; verified the rebuilt Windows app through actual native folder selection/export, private-path backup exclusion and offline note/diagram/graph persistence across process restart.
- Added document-link bubbles with explicit open/location choices for references, backlinks and rendered internal links, including repeated occurrences and source highlighting.
- Changed both themes' action accent to `#D96B43`, keeping contrasting foregrounds and a separate soft-yellow Manage folder action.
- Pinned the Note details header and 44-pixel close control during panel scrolling; added desktop close/reopen without changing the existing responsive breakpoint.
- Added native page drag/drop onto folders and Unfiled pages, preserving IDs/content and rejecting duplicate-name destinations; retained the Folder selector as the keyboard/touch alternative.
- Retired team UI, session switching and collaboration endpoints. Preserved original implementation, tests, deployment configuration and desktop assessment in `reference/team-workspace/`; left cached team records, databases and volumes untouched.
- Moved Manage folder from expanded folder contents into the folder action menu.
- Added a # navigation action and clickable tag pills for vault-wide usage, document counts, line numbers and highlighted source excerpts, with code/link exclusions.
- Bundled Google Drive and OneDrive logo assets for Home and setup guides, and replaced the mascot's white rectangle with transparent artwork in navigation, Home, startup and installation assets.

- Renamed the application, installation metadata, sample welcome note, downloads and server-facing product copy to NitroBison while retaining the original mascot and typography.
- Added a compact mascot/storage overview and full-width newsroom-style cards for the six most recently updated projects and their latest documents.
- Added persistent per-user favorite folders, including nested paths, in a five-name scrollable strip independent of the recent-project limit.
- Kept personal cloud sync vault-wide and preserved existing notes, browser storage, OAuth protocol, provider locations, session/database identifiers and deployment volumes without a data migration.
- Documented project navigation, configured-versus-connected drive states, historical storage paths and the limits of Obsidian plugin compatibility. Exercised checks are recorded separately in the verification record.
- Fixed stale offline HTML hiding the rebrand: online navigations request the current shell, failed/offline requests retain the cached shell, and waiting offline updates are reported explicitly without forced reloads or note-storage changes.
- Made new-note placement follow the explicitly selected folder, with root placement otherwise, and added accessible right-click folder creation actions.
- Added manual Markdown document linking, collapsed tag/reference counts, draggable animated note graphs, folder-level graphs and cross-folder drilldown with pan/zoom and reduced-motion support.
- Updated dark mode to warm slate, terracotta primary actions, muted earthy badges and softer text/borders while preserving light-theme tokens and typography.
- Kept spring/repulsion layout active during node dragging with the dragged node pinned, and added adjacent graph inspectors with directional references and explicit navigation actions.
- Made folder-name clicks open a Markdown README frontpage, reserved disclosure for its arrow, and added portable uploaded banners beside bounded overview previews.
- Hid Write/Split and mutation controls for read-only views, added left-side permission notices, and made Google capability-aware cloud refreshes pull-only while preserving local merges and recovery copies.
- Added subtle bounded idle graph drift, accessible pause/resume controls, reduced-motion handling and hidden-tab/disposal cleanup while preserving coupled dragging.
- Made project cards use their own README introduction and uploaded banner before falling back to the latest document, with two-line overview previews and unchanged recent-activity ordering.
- Added a dedicated Unfiled pages section for root-level pages without moving notes or introducing a synthetic folder.
- Added a top-left Back to overview control, enlarged idle graph drift, and retained pause/reduced-motion safeguards.
- Added beginner Google/OneDrive registration walkthroughs with exact origin/callback values; Google hides and excludes the Microsoft tenant field.
- Documented personal/business provider boundaries, conflicting Microsoft AppFolder guidance, loopback registration caveats and a scoped Dropbox proposal; no provider permission was broadened.
- Added a Windows/macOS desktop feasibility and implementation plan covering Electron/Tauri tradeoffs, native OAuth, vault continuity, hosted collaboration, signing and safe updates; no native installer is claimed.
- Restyled phone navigation as a footer-free floating pill over page content, with an 80%-opaque background, fully opaque icons, unchanged 44-pixel touch targets and safe-area-aware scroll clearance; desktop navigation is unchanged.
- Replaced idle graph scheduling with continuous ambient motion through hover, pan, zoom, focus and open details. A dragged node stays pinned while neighbours move; explicit Pause, reduced motion and hidden-tab cleanup remain, and inspector controls do not drift.
- Added context-aware All folders back actions to scoped browsers, folder frontpages and notes/graph headers; returning clears the scope/search and opens the complete folder drawer on phones while retaining the unscoped Home action.
- Added per-folder device-directory labels with native read-only browser selection and directory-input fallback; browser labels remain reference-only. Desktop's later explicit Markdown-saving opt-in is separate and never automatically enabled for those legacy references.
- Moved new banner choices into per-user/device IndexedDB preferences, applied them to folder/Home/README views, kept them editable for viewers, and excluded them from notes, backups and synchronization while preserving existing embedded Markdown banners.
- Kept private metadata through local folder renames, cleared it on safe deletion, and protected identity transitions and failed writes; folder-frontpage controls retain 44-pixel minimum touch targets.
- Applied the selected Slate & Ochre palette to both themes and installation chrome, retaining the existing typography, logo and storage identities.
- Improved phone navigation with frosted blur, static monochrome grain, a visible rim, readable sand icons and a solid ochre active button; retained 80% background alpha, opaque controls, 44-pixel targets and an opaque reduced-transparency/unsupported-filter fallback.
- Fixed Home selection styling targeting the hidden brand link instead of the visible navigation button.
- Refreshed the Windows/macOS executable assessment against current dependencies and upstream guidance, including unsigned development versus signed releases, private folder-preference migration, Apple release prerequisites and Tauri's offline WebView2 tradeoff; no native installer was built.
- Installed and pinned Electron 45.3.1 and electron-builder 26.18.0 as local development dependencies, downloaded the Electron runtime and verified both CLI versions. No desktop shell or native installer was created; npm's transitive deprecation and lifecycle-script approval warnings are recorded in the desktop plan.

## 1.0.0 — 2026-11-11

- Introduced Herd: an MIT-licensed offline-first Markdown workspace using the supplied logo and warm-neutral light and slate dark themes.
- Added folders, search, source/read/split modes, wiki and relative Markdown links, outlines, backlinks and note graphs.
- Bundled sanitized Markdown and strict Mermaid rendering with a complete offline PWA cache.
- Added safe Markdown transfer, JSON backup/restore and optional Google Drive/OneDrive personal snapshot synchronization.
- Added single-workspace SQLite collaboration, protected owner setup, invitations, viewer/editor roles, member revocation and conflict-preserving synchronization.
- Added Docker/Podman deployment artifacts, cloud-registration instructions and an explicit verification/limitation record.
