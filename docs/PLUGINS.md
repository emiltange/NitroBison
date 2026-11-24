# Obsidian plugin compatibility

## Conclusion

**NitroBison does not load or run Obsidian plugins unchanged.** It can implement the same *kinds of features*, and selected open-source plugins could be ported after inspecting their API use and license. No compatibility layer, plugin installer, script loader or extension marketplace is implemented or implied by this assessment.

Obsidian's official `obsidian-api` package supplies **TypeScript definitions**, not the Obsidian application runtime. Community plugin entry points import `obsidian`, extend `Plugin`, and access host objects such as `App`, `Vault`, `Workspace` and `MetadataCache`. Supplying a manifest or installing those type definitions does not provide those implementations. [Official API and plugin structure](https://github.com/obsidianmd/obsidian-api).

NitroBison currently uses a textarea editor, a Marked/DOMPurify reading pipeline, IndexedDB snapshots, a browser/PWA runtime and optional static HTTP hosting. Electron is installed as development tooling, not integrated as an application or plugin host. No Obsidian host API, CodeMirror extension host or community-plugin loader is implemented.

## Compatibility by category

| Plugin or extension category | What works now | What reuse would require |
| --- | --- | --- |
| Plain Markdown, wiki links, Mermaid content | Supported conventions render without installing plugins. | Check any plugin-specific syntax; content portability is not plugin compatibility. |
| Core features such as graph, backlinks and bookmarks | NitroBison supplies its own implementations. Project bookmarks are local per-user preferences. | Obsidian's bundled core-plugin code is not being loaded. |
| Custom Markdown/code-block renderers | Mermaid is built in; unknown fenced languages remain code. | Port each renderer to NitroBison's sanitized reading pipeline; preserve offline assets and prohibit active/untrusted content. |
| Commands, ribbons, panels and settings | Only NitroBison's built-in UI is available. | Reimplement the used `Plugin`, command, workspace/view, settings and lifecycle contracts; inspect Obsidian DOM assumptions. |
| Editor and autocomplete extensions | The current textarea is not a CodeMirror host. | Add a compatible editor and editor API, then test each extension. Obsidian exposes CodeMirror 6 registration; matching the dependency name alone is insufficient. |
| Queries, templates, task engines and custom databases | Resulting ordinary Markdown can be imported. Their query/script engines do not run. | Port the logic and implement its metadata, events, storage and rendering dependencies; assess each plugin separately. |
| Obsidian themes and CSS snippets | Existing NitroBison themes remain in use. No snippet/theme importer is provided. | Adapt selectors, DOM structure and design tokens; Obsidian CSS files are not drop-in NitroBison themes. |
| Node.js/Electron/filesystem/OS integrations | Not available inside the web app or installed PWA. | A separate trusted native host and explicit permission boundary, or a browser-safe rewrite. A Node backend must not execute uploaded plugin JavaScript. |
| Obsidian Sync, accounts and proprietary services | Not integrated. NitroBison has its own personal cloud synchronization; team workspaces are retired. | Separate service support and authorization; a plugin manifest cannot grant it. |

Obsidian documents that Node.js and Electron APIs are desktop-only and that plugins using them must declare `isDesktopOnly`. A plugin that works on Obsidian mobile still depends on Obsidian's host APIs; it is **not automatically browser-compatible**. [Mobile development](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development), [submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission%20requirements%20for%20plugins), [manifest](https://docs.obsidian.md/Reference/Manifest).

The API's `registerMarkdownCodeBlockProcessor`, `registerView`, `registerEditorExtension`, `loadData` and `saveData` illustrate how much behavior is supplied by the host rather than the plugin bundle. See the [official Plugin API](https://docs.obsidian.md/Reference/TypeScript+API/Plugin).

## Recommended direction

Keep the current web/PWA/container architecture. For a concrete plugin the user needs, inspect its imports and API calls, verify its license, and port only its required feature or browser-safe rendering logic. This preserves the small backend and avoids claiming ecosystem-wide compatibility.

If installing third-party extensions becomes a separate requirement, first define a versioned, permissioned NitroBison extension API and an isolated execution boundary with explicit project access. This is a design prerequisite, **not an existing feature or a compatibility promise**. Do not copy Obsidian's desktop trust model into an invited, multi-user web service.

Arbitrary same-origin JavaScript could read cached notes, observe future requests and act through the signed-in user's session. Running that code on the shared server would create a different and more severe trust boundary. Any future extension design must retain project access checks, viewer restrictions, offline behavior, sanitized rendering and token handling rather than relaxing CSP or enabling raw JavaScript execution.

## Scope of this assessment

Official API/manifest/platform documentation and NitroBison's current implementation were inspected. No named community plugin was installed, executed or certified. Compatibility must be established per plugin and version; the MIT license on API type declarations does not confer rights to the Obsidian runtime or every third-party plugin.
