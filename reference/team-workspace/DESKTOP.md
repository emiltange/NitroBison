# NitroBison downloadable desktop application plan

Status: refreshed on 2026-11-12; **development tooling installed, not an available NitroBison installer**. Electron 45.3.1 and electron-builder 26.18.0 are project-local development dependencies, pinned in `package.json` and the lockfile. The Electron runtime is downloaded and both CLIs were verified. The current installable NitroBison application remains a PWA: no desktop shell, signing credential, updater or NitroBison native package was added. Windows/macOS packaging still needs the implementation below, including safe cloud integration.

## Decision

Recommend **Electron + electron-builder** for the smallest implementation and toolchain change to this JavaScript/Vite application. Reuse the frontend, validators, Markdown/Mermaid rendering, IndexedDB and cloud merge logic; do not rewrite the editor or bundle the collaboration backend for personal use. Electron ships Chromium, so its download and memory footprint are higher than an OS-webview shell. **Tauri 2 is the smaller-shell alternative**, not the lower-effort choice: it adds Rust and testing across WebView2/WKWebView, including file-picker differences. Neither footprint was measured here.

| Approach | User installation | Rendering/toolchain | Main tradeoff |
| --- | --- | --- | --- |
| Current PWA | Browser Install/Add to Dock | Existing browser and npm | Already works; no independent `.exe`/`.dmg` download |
| Electron + electron-builder | Windows NSIS `.exe`; macOS `.dmg` containing `.app` | Bundled Chromium; JavaScript build tooling | Simplest reuse, larger runtime; keep Electron patched |
| Tauri 2 | Windows NSIS/MSI; macOS `.dmg`/`.app` | OS webview; Rust plus npm | Smaller shell, platform-engine differences; Windows WebView2 must be present or installed |

Do not promise a numeric installer size or minimum RAM until a packaged release is measured. Tauri's default Windows WebView2 bootstrap requires a download when the runtime is absent; choose and test its offline installation mode before calling that installer fully offline-capable.

## What is ready, and what a download still needs

`npm ls electron electron-builder --depth=0` confirms Electron 45.3.1 and electron-builder 26.18.0. `npm exec --no -- electron --version` and `npm exec --no -- electron-builder --version` both succeeded; Electron downloaded its runtime on the first version check. npm reported deprecated transitive packages and lifecycle-script approval warnings for `electron-winstaller@5.4.0` and `esbuild@0.28.2`; the script-approval policy was not changed. No `desktop/`, `src-tauri/` or native release workflow exists. The previously verified web production build is not a native build or an installer-size/memory measurement; no packaging command was run during this dependency installation.

- **Local really means local:** ship the compiled UI and diagram chunks inside the application; keep personal IndexedDB and per-user folder preferences in a stable app profile. End users need neither Node/npm nor Docker, and no collaboration server is needed to write, read or use graphs offline. A selected device-folder label is still metadata only, not a filesystem-backed vault or automatic folder sync.
- **Downloads:** Windows users install an NSIS `.exe`; MacBook users open a `.dmg` and install the `.app`. Build separate Apple Silicon and Intel artifacts if both are supported. These are platform-specific packages, not one executable that runs on both OSes.
- **Development versus release:** an unsigned/ad-hoc package can be used for development before purchasing signing credentials. It is not a smooth public download: Windows/macOS security prompts or manual approvals remain, and macOS update/signature behavior must be tested with the real release identity. Signing/notarization and update/data-retention checks below are public-release gates, not prerequisites for writing the first native-shell code.
- **External prerequisites:** a macOS machine/CI runner with Xcode and Apple release credentials, a Windows signing certificate/service for signed public releases, a chosen publisher/app identity, and a release/download host. Real Google/Microsoft registrations and accounts are needed to certify cloud parity; local offline development does not wait on OAuth consent. Use a project-supported Node version (24 or newer) for the build rather than copying older upstream CI examples unchanged.
- **Footprint decision:** Electron bundles Chromium/Node; Tauri adds Rust, Windows C++ build tools and WebView2/WKWebView compatibility work. Tauri's default installer may download WebView2, while its fully offline runtime bundle adds substantial size. Compare measured artifacts before choosing Tauri solely for a small download. The current recommendation remains one Electron shell, not two maintained desktop implementations.
- **Release tooling:** Electron 45.3.1 and electron-builder 26.18.0 were the npm registry's stable `latest` versions at installation and are pinned as local development dependencies. The electron-builder website root currently documents unreleased v27; use its [v26 stable documentation](https://www.electron.build/v26/). Refresh the platform support/security baseline when implementing the shell and keep Electron patched.


## Existing boundaries to preserve

- `src/workspace.js`: personal notes live in IndexedDB `herd-workspaces`; personal startup needs no `/api` server. Team calls use relative `/api/` URLs and same-origin session cookies.
- `src/directory.js`, `src/folder-preferences.js` and `src/workspace.js`: folder locations and new banners are private identity-keyed IndexedDB records, outside note snapshots. Preserve that isolation and read-only-user access in desktop; do not turn choosing a folder into import/sync or grant a native handle to hosted team content.
- `src/cloud.js`: web Google uses GIS; Microsoft uses a SPA popup and S256 PKCE. The current connector rejects non-HTTP(S) origins. These browser authorization paths cannot simply be run inside a native webview.
- `src/install.js` and `scripts/build-sw.js`: PWA caches use host-relative URLs. A desktop bundle is already local; skip its service worker and use one native update mechanism. Keep the web/PWA path unchanged.
- `server/app.js`: CSP is served by the HTTP host, not embedded in `index.html`. The native protocol needs equivalent headers. Origin/Fetch-Metadata checks and `SameSite=Strict` cookies correctly reject cross-origin browser mutation requests.
- Keep `Herd`, the Google private marker, `vault.json`, OneDrive app identity and recovery filenames unchanged. The NitroBison display name must not create another cloud vault.

## Implementation order and acceptance gates

These are implementation stages, not claims that partial packaging provides full feature parity. Cloud, hosted collaboration and release verification below are part of the complete plan.

### 1. Local application and durable storage

Add a small `desktop/main.js`, `desktop/preload.cjs` and electron-builder configuration in `package.json`. Generate `.ico`/`.icns` assets from the supplied mascot without replacing it. Pin supported Electron/build-tool versions when implementation begins rather than freezing today's version in this research document.

- Register a stable custom origin, for example `app://bundle`, before Electron's `ready` event with `standard`, `secure` and `supportFetchAPI`. Use `protocol.handle` to serve **only packaged frontend assets**, with decoded-path containment, expected host/method checks, correct MIME types and CSP. Do not use `file://`, a random-port server as the storage origin, an arbitrary file reader or an API proxy.
- Fix `appId`, product/user-data identity, origin and IndexedDB name before the first release. Retain them across upgrades. Enforce a single-instance lock; a second launch focuses the first window rather than opening concurrent writers.
- Set `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` and `webSecurity: true`. Deny unsolicited navigation, popups and permissions. Validate IPC senders and bounded arguments; expose narrow operations, never raw Electron, filesystem, shell or arbitrary-fetch access. Keep Markdown sanitization and existing image limits.
- Adapt installation help and service-worker registration in `src/install.js`. Personal startup reads the local bundle even on a clean machine with no network. Do not start Node/SQLite or fetch a remote shell for it.
- Keep JSON backup/restore. Browser notes **do not automatically appear** in a native app: origins and profiles differ. Export JSON from the existing browser origin, restore it in desktop and verify before removing the old copy. New private banners and device-folder labels are deliberately excluded from JSON/cloud snapshots, so reselect them in desktop; existing banners embedded in README Markdown still migrate with notes. Bookmarks, theme and public client configuration may need re-entry. Never read or copy browser profiles.
- Verify `showDirectoryPicker` in the packaged app, not just Chrome. Adapt `src/directory.js` for a narrowly scoped native directory picker if necessary, returning the folder name without enumeration or persisted native access for this metadata-only action. Separately preserve Markdown directory export in `src/cloud.js` using its existing path validation and no-overwrite rules. If a browser API is unavailable on either supported OS, implement the corresponding bounded native operation; JSON-only backup is not Markdown-export parity.
- Defer closing/restarting while a save is pending; surface a failed save rather than forcing exit. Preserve user data on upgrade/reinstall and document uninstall behavior. No automatic vault deletion.

**Gate:** clean install offline → create/edit notes, folders, links and Mermaid → close/reopen → exact content retained. Restore a real browser backup with IDs/folders/tombstones and embedded README banners preserved; reselect private banner/location preferences and verify they remain excluded from later exports. Exercise safe Markdown export, reduced motion and blocked navigation/IPC/path traversal. No personal `/api` request or desktop service-worker registration.

### 2. Native cloud authorization without vault divergence

Add `desktop/auth.js` for authorization-code PKCE in the main process. Keep provider storage/load/save/merge logic in `src/cloud.js`; add a native authorization branch that reuses its scope, bearer-token and expiry validation. Do not replace the working web authorization paths.

- Open authorization in the **system browser**, not Electron's renderer. Bind a one-use listener to loopback only, use S256 PKCE, random state, exact callback-path validation, a finite timeout and cancellation on window close. Permit only one pending flow and accept only the expected response. Return no remote resources in the callback page; do not log codes or tokens. Close the listener on success, error or cancellation.
- The random OAuth callback port is **not the app's storage origin**. It must not move IndexedDB between launches. Test host/port matching and localhost IPv4/IPv6 behavior on both OSes.
- Expose only validated provider/client/tenant auth inputs through the local preload. Keep access tokens in memory, discard refresh/ID tokens, reconnect on reopening, and preserve explicit Sync rather than automatic uploads. Public clients must not ship a secret or credential file.
- **Google:** create a Desktop-type OAuth client with `drive.file` and loopback redirect; GIS/Web clients are not the native flow. Google's native guide marks `client_secret` optional; verify the secretless exchange against the actual registration. Google's policy prohibits authorization in developer-controlled embedded user agents.
- **Google continuity is a release blocker:** a separate Desktop client may not see a Web-client-authorized folder/file under `drive.file` or its private property. This is an **unverified risk**, not a proven platform limitation. Test a web-created `Herd/vault.json` from desktop and the reverse, with edits on both clients. If visibility fails, design an explicit user-authorized existing-file selection/migration preserving every copy; do not silently create a second canonical vault or expand to full Drive permission. Do not advertise web/desktop Google sync until continuity is proven.
- **Microsoft:** add a Mobile and desktop/public-client platform to the **existing Entra application**, with the documented system-browser loopback redirect. Do not redeem a native code as SPA or embed a secret. Review the registration's public-client settings for the selected flow; do not enable unrelated grant types. A new Entra app means a different app folder. Preserve the existing registration and prove access to the existing canonical snapshot. Work/school `AppFolder` support remains unverified because [Microsoft's documents conflict](CLOUD.md#why-onedrive-business-support-is-not-promised).
- Dropbox remains the separate [unimplemented App folder proposal](CLOUD.md#dropbox-implementation-proposal). If added, use the same public app key across web/desktop and the same native PKCE boundary. It is not a prerequisite for packaging today's two providers.

**Gate:** real Google personal/Workspace and Microsoft personal/business account matrix. Check actual consent/granted scopes, callback cancellation/state mismatch, reconnect, web↔desktop vault identity, concurrent edits, conditional failures, Google read-only pulls, OneDrive recovery and no credential persistence. Mark blocked business scenarios honestly rather than inferring support from login.

### 3. Preserve hosted collaboration without weakening the server

Keep personal desktop storage local. For the existing Share/collaboration action, offer the configured hosted workspace in a **separate sandboxed window at that server's own HTTPS origin**. Do not send the local personal vault or provider connection to it. Do not bundle a second backend merely to use an existing team server.

- The hosted window uses its own origin-bound web storage and session cookies; existing relative `/api` calls remain same-origin. Persist isolation per configured server, not a shared cookie jar across hosts. Keep local personal mode and hosted team mode visibly distinct.
- No local native preload, cloud-token bridge, filesystem permission or generic IPC in remote content. Lock top-level navigation to the explicitly selected origin, reject credentials/unsafe schemes in configured URLs, deny new-window and permission requests by default, and open approved external links only in the system browser. Invite URLs must point to the hosted origin, never `app://bundle`.
- Team mode continues to use the current web authentication, invitations, viewer/editor access and sync. Provider auth remains personal-only in the local window; do not allow remote pages to invoke its native bridge or promise embedded Google sign-in in hosted content. The hosted-window UI must direct personal/cloud use back to the local window or the system browser without exposing native capabilities to the host.
- Preserve the team's existing offline-cache semantics after its initial visit; first-time server login/sync still requires connectivity. Opening a team server is not required for local personal startup.
- Do **not** disable web security, add wildcard CORS, relax `protectOrigin`, switch to `SameSite=None` or redesign auth as bearer tokens for packaging convenience. Opening the existing team URL in the system browser is a safe interim development path, not in-app collaboration parity.

**Gate:** invitation/login, viewer cannot write, editor can sync, member revocation, offline cached edits/reconnect, host switching and logout isolation; verify no personal notes or provider tokens cross into the hosted window. No backend-security relaxation.

### 4. Signed distribution, update safety and release

Add a dedicated desktop release workflow using Windows and macOS CI runners. Build with production assets, not a development URL. Do not ship backend data, `.env`, signing material, test fixtures or source-preview servers.

| Artifact | Build/release requirement | Required runtime check |
| --- | --- | --- |
| Windows x64 NSIS `.exe` | Windows runner, Authenticode signing and timestamping | Clean install, start-menu launch, offline first boot, update and uninstall/data retention |
| Windows ARM64 NSIS `.exe` | Explicit ARM64 target and signing; toolchain support checked at implementation | Actual ARM64 machine, not just successful cross-compilation |
| macOS Intel `.dmg`/`.app` | macOS runner, Developer ID signing, hardened runtime, notarization and stapling | Intel Mac install/launch and offline Gatekeeper verification |
| macOS Apple Silicon `.dmg`/`.app` | macOS runner and the same signing/notarization requirements | Apple Silicon Mac install/launch and update |

Use separate x64/ARM64 macOS artifacts initially, rather than adding universal-binary complexity. Do not advertise an architecture merely because the packager accepts it.

- Apple Developer Program enrollment, certificates and notarization credentials are public-release prerequisites; store credentials only in the release secret store. Apple currently lists **US$99 per membership year**, with regional pricing and qualifying fee waivers ([enrollment source](https://developer.apple.com/programs/enroll/)). A macOS host/runner with Xcode is required for the macOS signing path. Windows needs an appropriate signing certificate/service and protected signing credentials; prices depend on the provider. Confirm publisher eligibility and reputation rules before purchase: a signature is not a guarantee of zero SmartScreen warnings. No account/certificate purchase was performed here.
- Use electron-builder's compatible updater (`electron-updater`) with an HTTPS release feed, published hashes and platform signature verification. Fail the release on missing/invalid code signing **and** separately verify notarization; `forceCodeSigning` alone is not proof of notarization or signed update metadata. Do not ship a custom updater or claim checksums authenticate a compromised feed.
- Offer updates without forcing a restart. Wait for successful local persistence before quitting/installing. An interrupted or rejected update must leave the last usable application and vault intact. Keep the stable profile/origin; prove N→N+1 data retention with an actual installed package.
- Record installer/download size, installed disk usage, cold startup and idle memory on each supported OS. Compare measured Electron with a Tauri spike only if footprint fails a real requirement; do not maintain two native shells.
- Follow supported Electron releases and security fixes. The native bundle now owns Chromium patching rather than relying on the user's browser updates.

**Gate:** signed artifacts and updater feed verified; invalid signature/hash rejected; interrupted update, pending-save restart, reinstall and retained data tested on the declared OS/architecture matrix. Publish download instructions and measured limits only after these gates pass.

## Files reached by the implementation

- New `desktop/main.js`, `desktop/preload.cjs`, `desktop/auth.js`, platform icons and desktop release workflow.
- `package.json`/lockfile: Electron and electron-builder development dependencies are installed. Still needed: stable application identity, packaging file allowlist, desktop scripts and signed release configuration. No new server dependency.
- `src/cloud.js`: native auth dispatch only; retain provider storage/concurrency checks. `src/install.js`: local-bundle installation/update behavior; unchanged web PWA behavior.
- `src/app.js`: native installation help, provider registration guidance and hosted-window launch/back-to-local behavior. `src/directory.js`: native name-only picker fallback where needed. `src/workspace.js`/`src/folder-preferences.js`/core: reuse existing persistence, identity isolation and validation rather than inventing another vault format. No native caller should accidentally enter local-origin team API mode.
- `server/app.js`: no CORS/session/origin relaxation. Any hosted-window UI integration must remain safe for ordinary web users.
- Tests: behavior-focused protocol containment/IPC rejection, auth cancellation/state/timeout and vault migration/data-retention boundaries. Actual packaged UI checks for platform behavior; do not substitute mocks or source-text tests for signed installer/runtime proof.
- `README.md`, `docs/CLOUD.md`, this plan, `docs/VERIFICATION.md` and `CHANGELOG.md`: exact installation paths, registrations, continuity/migration steps, supported versions and exercised—not assumed—checks.

## Sources and unverified prerequisites

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security), [protocol and storage origin](https://www.electronjs.org/docs/latest/api/protocol), [code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), [release support](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).
- [electron-builder stable packaging](https://www.electron.build/v26/), [multi-platform build limits](https://www.electron.build/v26/features/multi-platform-build/), [Windows/macOS CI and signing](https://www.electron.build/v26/features/github-actions/), [automatic updates and signatures](https://www.electron.build/v26/docs/features/auto-update).
- [Tauri Windows distribution/WebView2](https://v2.tauri.app/distribute/windows-installer/), [prerequisites](https://v2.tauri.app/start/prerequisites/), [macOS signing](https://v2.tauri.app/distribute/sign/macos/).
- [Google native-app authorization](https://developers.google.com/identity/protocols/oauth2/native-app), [OAuth browser policy](https://developers.google.com/identity/protocols/oauth2/policies), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- [Microsoft desktop configuration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration), [redirect restrictions](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url), [authorization-code platforms](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
- [Apple enrollment, annual fee and fee waivers](https://developer.apple.com/programs/enroll/). Unsigned development artifacts are not equivalent to [signed/notarized public Electron distribution](https://www.electronjs.org/docs/latest/tutorial/code-signing).

No native build, signed installer, OS-native picker, update, footprint measurement or live provider account was exercised in this research. Real registrations/account consent, release signing credentials, macOS runners/hardware and ARM64 hardware are required to certify the corresponding gates. Existing automated cloud boundary tests are not live-account or native-app certification.
