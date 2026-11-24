# NitroBison

Offline-first Markdown workspace for connected notes, projects and graphs. Notes stay on your device unless you choose to sync them to Google Drive or OneDrive.

## Download

Get the Windows installer, `NitroBison-<version>-windows-x64-setup.exe`, from the [latest release](https://github.com/emiltange/NitroBison/releases/latest). Run it and pick an install folder. You don't need to install Node.js or run a server.

The installer isn't code-signed, so Windows SmartScreen may warn you. Choose **More info → Run anyway**.

## Run from source

You need [Node.js](https://nodejs.org) 24 or newer.

```sh
npm ci
npm run build
npm start          # http://localhost:3000
```

| Task | Command |
| --- | --- |
| Dev server with hot reload | `npm run dev` |
| Desktop app (Electron) | `npm run desktop` |
| Windows installer → `release/` | `npm run desktop:build` |
| macOS dmg (needs a Mac) | `npm run desktop:mac` |
| Tests and syntax check | `npm test` and `npm run check` |

## Docker / Podman

```sh
docker compose up --build -d     # http://127.0.0.1:3000
```

`HOST`, `PORT` (default `3000`) and `STATIC_DIR` (default `./dist`) configure the server. Put it behind an HTTPS reverse proxy for access from other machines.

## Good to know

- **Backups:** browser storage can be cleared. Export a JSON backup regularly from **Settings → Data & files**.
- **Cloud sync** and **AI** are optional and configured in **Settings**. You can hide the AI buttons under **Settings → General → Appearance**.
- **Same address:** keep using the same host and port (`localhost` and `127.0.0.1` count as different sites), or the browser won't find your existing notes.

More detail: [desktop](docs/DESKTOP.md) · [cloud setup](docs/CLOUD.md) · [plugins](docs/PLUGINS.md) · [changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
