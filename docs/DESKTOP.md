# NitroBison desktop application

Electron runs the existing offline-first interface from a local bundle; no web server, Docker, separately installed Node runtime or account is required by the end user. The web/PWA application remains available. Electron 45.3.1 and electron-builder 26.18.0 are pinned development dependencies.

Fresh profiles receive one Getting started folder with four editable/deletable Markdown guides. Existing vaults, including intentionally empty ones, are not reseeded. The desktop rail omits Install. Settings opens an overview with General, Accounts, Data & files and AI sub-settings; Accounts has provider pages directly.

Use **Toggle note browser** beside the title to collapse/reopen the second left sidebar; primary navigation stays visible and Ctrl/⌘ + K reopens search. No notes, paths or folder choices change. The collapsed state is window-local, not a saved vault setting.

On Windows, the native **Minimize**, **Maximize / Restore** and **Close** controls share the application's 66-pixel top bar instead of a separate OS title row. Empty header space remains draggable; buttons/inputs stay interactive. Native controls preserve Windows snap behavior and the existing unsaved-note/device-write close protection, with caption colors matched to light/dark themes. macOS retains its standard native frame; the web/PWA receives no fake desktop controls.

The primary left rail uses clean line icons and a single **Views** entry that opens **Task table**, **Kanban board**, **Timeline** and **Gallery** inside the sleek sub-left menu. Inline Notion-style **List databases** (`nitrobison-list` blocks or `/list`) live directly inside Markdown notes. Status and inclusive dates stay in Markdown and travel through existing exports and sync without changing note IDs or bodies.

## Personal Drive setup without OAuth registration

1. Install/sign in to **Google Drive for desktop** or the **OneDrive sync app** with your intended personal account, then create an empty dedicated directory inside its locally accessible sync folder.
2. In NitroBison, choose that real directory for a vault folder and explicitly enable **Markdown saving** in its device-folder controls. Existing saved paths remain reference-only until you enable them; nothing is imported automatically. You need no Google Cloud project, Entra registration, client ID or secret.
3. Wait for NitroBison's local linked-folder save status, use **Open folder** to inspect the `.md` files, then check the provider client's upload status separately. NitroBison writes locally; the provider's client uploads. Local folder verification is not cloud authentication or proof of a completed upload.

See the [step-by-step personal setup](CLOUD.md#easiest-personal-setup-desktop-and-a-provider-sync-folder) and the [saving/conflict limits below](#local-folder-paths-and-markdown-saving). Direct API cloud sync is a separate optional JSON-snapshot workflow, not required for this route.

## Build and run

Build from source with Node.js 24 or newer:

```sh
npm ci
npm run build
npm run desktop
```

Create the Windows x64 NSIS installer:

```sh
npm run desktop:build
```

Output: `release/NitroBison-1.3.0-windows-x64-setup.exe`. The unpacked application is `release/win-unpacked/NitroBison.exe`. `npm run desktop:pack` creates an unpacked application for the build host. Packaging output is separate from Vite's `dist/`; the startup entry is `desktop/main.js`, not a missing `index.js`.

The current 1.3.0 installer is `release/1.3.0/NitroBison-1.3.0-windows-x64-setup.exe`, with `release/1.3.0/win-unpacked/NitroBison.exe`. This build includes multiple local workspaces, the resizable note/views sidebar with refined tree proportions, Kanban swimlanes, AI provider setup presets, Markdown/Mermaid and integrated Windows title controls. Packaging used an isolated temporary build and a new output directory, without replacing older unpacked apps or app-data profiles. Close your app normally before installing the update; do not clear app data. Output is unsigned.

The 1.3.0 project ZIP (`release/1.3.0/NitroBison-1.3.0-project.zip`) includes the full source code, the complete prebuilt web `dist/` bundle and the compiled Windows installer + unpacked executable (`release/NitroBison-1.3.0-windows-x64-setup.exe`). It excludes `node_modules`, older release builds, private databases and local test profiles. Extract it before running the installer; see `README.md` for web and container commands.

On a **macOS build machine**, build the requested architecture:

```sh
npm run desktop:mac -- --arm64
# or, for Intel:
npm run desktop:mac -- --x64
```

macOS builds require a macOS machine/runner; these commands are not proof that a Mac package was built or exercised. Public Mac distribution also needs Developer ID signing, notarization and stapling. No signing credentials, automatic updater, release hosting or CI publishing workflow is included. Windows development builds are unsigned; security warnings are expected. Do not treat them as signed public releases.

## Notes, backups and upgrades

- The fixed application origin is `app://bundle/`; personal notes remain in IndexedDB `herd-workspaces` under a stable **NitroBison** application profile. Windows defaults to `%APPDATA%\NitroBison`; macOS uses `~/Library/Application Support/NitroBison`. Do not delete this profile to update the interface.
- Browser and desktop profiles are separate. Export **JSON backup** from the original browser hostname/port, then **Restore JSON backup** in desktop. Restore makes a recovery copy before replacing local notes. Verify the restored notes before removing any original copy. Never copy or read browser profiles through the desktop app.
- Private device-folder paths/saving opt-ins, banners, hidden folders, bookmarks, theme, client configuration and AI settings are not part of note backups. Mirror ownership/journal/recovery files remain profile-local. Embedded README banners travel with notes. AI keys are session-only by default; explicit remembering uses OS-encrypted private storage.
- The desktop interface and all Mermaid chunks are bundled. It does not install a service worker or start the static HTTP server. Cloud sign-in and explicit sync still require internet access; access tokens remain in memory and disappear when the session closes.
- Close normally after saves finish. Pending or failed local-note/linked-folder saves protect ordinary window close; resolve the displayed failure before closing. A folder failure does not turn a retained IndexedDB note into a successful external save. Forced termination, full disks, cleared app data and disk failure can still lose data: keep external JSON backups.
- Updates are manual: install a newer package without removing the application profile. NSIS is configured to retain app data on uninstall. Actual installer upgrade, uninstall and rollback/data-retention scenarios still require verification before public release; configuration alone does not certify them.

## Local folder paths and Markdown saving

When creating a desktop folder or project without choosing a parent, NitroBison creates the named vault path inside its per-user `Markdown` directory and enables Markdown saving there. Windows uses `%APPDATA%\NitroBison\Markdown\<vault folder path>`; macOS uses `~/Library/Application Support/NitroBison/Markdown/<vault folder path>`. App data is writable without administrator access and independent of the installation directory. **Choose parent folder** overrides this default: choosing `notes` and entering `path` creates and links `notes/path`, with saving enabled there instead. Nested vault paths create corresponding subdirectories. Existing unrelated parent files are left untouched. If creation or later local persistence fails, preserve any newly created directory while resolving the error; the app does not delete it automatically.

For an existing vault folder, **Choose local folder** in Manage folder or **Folder on this device → Choose device folder** selects the final destination directly. **Show folder path** offers Choose, Clear and Open controls; the frontpage also offers Open folder. The absolute path stays private. Existing saved references are not moved or rewritten into new child directories by an upgrade. Each vault folder, including nested folders and Unfiled pages, has its own independent reference and explicit Markdown-saving choice.

If the OS cannot identify the sync provider, you may choose a descriptive service label manually. It does not authenticate the service, verify an account type or certify uploads. Only business Google Drive labels append **EA**; OneDrive never does.

### Enable, disable and upgrade existing references

- Creating a new desktop folder/project enables **Markdown saving** to its disclosed default or selected parent location. For an existing reference, explicitly enable saving after reviewing the writing disclosure. A path saved by an older version remains **reference-only**; an upgrade does not start writing to it or move it into the new default storage. Revisit and enable each intended destination. A folder containing existing unrelated files is not imported or adopted as the vault.
- When enabled, NitroBison mirrors that folder's current note bodies as UTF-8 `.md` files and preserves relative hierarchy/empty vault folders. A nested enabled binding takes precedence over an ancestor's destination. An **Unfiled pages** binding exports only root-level notes, never named folders or the whole vault. Notes remain authoritative in IndexedDB and continue to have their existing IDs and local recovery behavior.
- Disabling saving, clearing a path or selecting a different directory leaves the old files alone. There is no cleanup/deletion pass on abandoned destinations. Re-enabling a destination checks ownership and content again; it is not permission to overwrite arbitrary files.
- This is **outbound-only**, not a filesystem-backed or two-way vault. Editing, adding or deleting external files does not import changes into NitroBison. Use **Import Markdown folder** deliberately to bring external Markdown in; imports do not preserve the JSON backup's identity/history. Do not edit mirror files in another app while linked saving is active.

### Truthful status and provider uploads

Paths and opt-ins remain in device-local preferences, outside JSON note backups and provider snapshots. They remain editable while a connected Google vault is read-only. UNC/network/device-prefix paths and relative paths are rejected; select a real existing directory on a local drive. Locally synchronized Drive/OneDrive folders can be selected when available through the filesystem. The browser version keeps folder-name-only references and cannot enable this native writer.

A directory must be verified as existing/canonical before it is reported as a valid destination. Recognized Windows OneDrive roots can supply provider and Personal/Business metadata; unsupported roots remain ordinary local folders. A name containing a provider name proves nothing. Only business Google labels show **EA**; OneDrive labels are unchanged. Choosing a folder obtains no token or API authorization.

NitroBison's success means it wrote the local Markdown files, **not** that the provider accepted or uploaded them. The installed Google/OneDrive client handles authentication, availability, upload scheduling and its own conflicts/errors. Check that client separately. API authorization and API cloud-folder metadata are independent states; OneDrive API verification can create an empty app folder but does not upload notes until Sync.

### No-overwrite, failures and recovery

- A first bind refuses a different existing file. Subsequent replacements, renames and deletions require a tracked note file whose content still matches NitroBison's last write. External edits, conflicting targets and unsafe directory links fail instead of being knowingly overwritten. Unrelated files are left untouched. Choosing an empty dedicated directory is the simplest start.
- A failed folder save is reported as **local notes retained, folder not updated**, not cloud success. Some files may already have been written before a later file/permission/disk failure: there is no all-files transaction. Keep the local note and a JSON backup; copy any external conflicting version elsewhere before deciding which to import or retain. After preserving both versions, remove/move the conflicting external target or choose a fresh empty destination, then explicitly retry. Clearing/rebinding does not authorize a blind overwrite.
- Mirror bookkeeping lives under the stable application profile at `linked-folders/<SHA-256 canonical-directory>/`: `state.json` tracks owned note IDs/paths/hashes and `journal.json` tracks interrupted operations. `recovery/<SHA-256 note-id>.md` retains at most the latest replaced/deleted preimage per note per physical root; `.partial.md` retains the latest interrupted exclusive copy. These are bounded private local recovery files, not every keystroke, a complete version history or a substitute for JSON backups. Do not delete/reset the profile or mirror state to force a conflicting write.
- After interruption, journal recovery is attempted on the next save to the **same explicitly enabled root**. Temporary staged/held files may remain beside Markdown while an interrupted operation is unresolved; preserve them and the application profile before manual repair. Recovery can still report a conflict if another process changed the files. There is no automatic external import or guaranteed rollback of an entire multi-file save.
- Publication uses hard links where supported; provider filesystems without them use exclusive file creation and copying instead. That fallback never intentionally overwrites an existing target, but another app can briefly observe a partially copied file. Interrupted owned copies are checked against recorded identity and staged content before recovery. Neither path eliminates races with another process replacing files/ancestor directories. Avoid simultaneous writers. Forced termination, damaged/cleared profiles, missing disks and provider-side changes can exceed these recovery limits. Keep independent JSON backups and the original profile until recovery is verified.

## Markdown export

**Settings → Data & files → Import & export → Export Markdown folder** uses the native directory chooser and preserves note hierarchy, empty folders and UTF-8 content; deleted notes are not exported. Cancelling leaves the vault unchanged and does not report a successful export.

Export validates portable filenames and collisions, preflights existing targets, skips byte-identical files and exclusively creates missing files. It refuses to overwrite different files or traverse directory links below the export root. Choose an empty destination for the simplest transfer. Existing unrelated files are left alone.

This is not a cross-file transaction: an I/O failure after some successful creations can leave a partial new export. Node's path APIs cannot eliminate races with another process concurrently replacing ancestor directories. Do not let another process modify the destination during export. Export is not automatic two-way synchronization.

## Cloud registration

The settings guides distinguish native registrations from web registrations. Native sign-in opens the **system browser**, uses authorization-code/S256 PKCE and a one-use, bounded loopback listener, and supports cancellation from settings or window close. No embedded OAuth browser or client secret is exposed. Provider storage, merge rules and historical `Herd`/`vault.json` identifiers are unchanged.

- **Google:** use a **Desktop app** OAuth client and `drive.file` plus `openid profile email` for authorized profile verification. Workspace classification uses provider `hd` metadata, not an email suffix; missing identity metadata remains unknown. Prefer the same Google Cloud project as the web client, but do not assume that makes web-authorized files/private properties visible. A native first creation requires a separate warning with **Cancel** as the default. Back up the web vault first; explicitly creating a new desktop-visible cloud vault does not merge an invisible web copy. Web↔desktop vault continuity and secretless exchange need live-account verification before advertising Google parity.
- **OneDrive:** add **Mobile and desktop applications** with system-browser redirect `http://localhost` to the **same Entra application** used by web, retaining browser callbacks under **SPA**. Use `consumers` for personal accounts. Keep the existing client ID for app-folder identity. Work/school AppFolder support and actual web↔desktop continuity remain unverified; OneDrive does not display an EA label.
- Connecting verifies provider account/folder metadata without uploading notes. Google's missing Herd folder stays uncreated until explicit sync; Microsoft's first `approot` verification may create an **empty Apps/{Entra application name} folder**. Use **Sync personal vault** explicitly to transfer note snapshots. Provider tokens are memory-only; reconnect after reopening. Saved client IDs, local paths and verification alone never mean that notes were uploaded.

See [cloud setup and provider limits](CLOUD.md#native-desktop-authorization). Dropbox and retired team collaboration are not included.

## AI writing

Configure **Settings → AI → Endpoint & key**. `/AI your request` sends only the submitted prompt; the round **Ask AI** action in Note details sends your request plus the active note's Markdown/title, disclosed before generation. Review before inserting or applying a full revision. Both paths compare the latest stored content atomically, refusing changed/deleted notes. Generation is explicit, cancellable and time-bounded; combined contextual prompts cannot exceed 65536 characters.

AI settings default to session memory. Explicit **Remember endpoint, model and API key on this device** uses Electron's async OS encryption and an atomically replaced private `ai-settings.enc` file. Unavailable encryption (including Linux basic_text fallback) is rejected, not silently stored as plaintext. Session-only clears saved settings; Clear key updates saved configuration too. Settings are never in note backups/cloud snapshots. OS encryption protects the stored file, not an unlocked session or compromised OS account. Web remembering uses browser storage with an explicit insecure-storage warning. The trusted main-frame bridge accepts only bounded AI operations, not a generic HTTP proxy. HTTPS is required except loopback HTTP; native requests do not require CORS.

## Native security boundary

The app serves only bundled assets through `app://bundle/`, with MIME types, CSP, realpath containment and no API proxy. It uses sandboxed, isolated renderers without Node integration; denies permissions, webviews and external in-app navigation; and exposes only narrow IPC operations to its trusted main frame. HTTP(S) links open in the system browser. Native auth has fixed provider endpoints, random state, one-use callbacks, response-size limits, a five-minute deadline and listener cleanup. Markdown sanitization remains active.

The runtime owns Chromium security updates; keep Electron patched. A smaller OS-webview shell such as Tauri would add another toolchain and platform-specific testing. No second desktop implementation or unsupported memory/size promise is included.

## Verification and release limits

See the [verification record](VERIFICATION.md) for exercised checks and packaged runtime observations. Automated provider simulations do not prove live consent or cloud-vault identity. Public distribution still needs signing, real install/upgrade/uninstall checks, live-account continuity, macOS hardware checks and any advertised ARM64 checks. No automatic update feed is provided.

## Sources

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [protocol](https://www.electronjs.org/docs/latest/api/protocol), [code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).
- [electron-builder v26](https://www.electron.build/v26/), [multi-platform builds](https://www.electron.build/v26/features/multi-platform-build/).
- [Google native authorization](https://developers.google.com/identity/protocols/oauth2/native-app), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- [Microsoft desktop configuration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration), [redirect restrictions](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).
