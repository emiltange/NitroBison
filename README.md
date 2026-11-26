# NitroBison

Offline-first Markdown workspace for connected notes, projects and graphs. Notes stay on your device unless you choose to sync them to Google Drive or OneDrive.

## Download

**[⬇ Download NitroBison for Windows (x64)](https://github.com/emiltange/NitroBison/releases/latest/download/NitroBison-1.6.5-windows-x64-setup.exe)**. Older versions are on the [releases page](https://github.com/emiltange/NitroBison/releases). Run it and pick an install folder. You don't need to install Node.js or run a server.

The installer isn't code-signed yet (signing through SignPath is being set up), so Windows SmartScreen may warn you. Choose **More info → Run anyway**.

**[⬇ Download NitroBison for Android (APK)](https://github.com/emiltange/NitroBison/releases/latest/download/NitroBison-1.6.5-android.apk)**. Open the APK on your phone and allow installs from that source. Later versions install over it and keep your notes.

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
| Android debug APK → `android/app/build/outputs/apk/debug/` | `npm run android:build` |
| Tests and syntax check | `npm test` and `npm run check` |

## Android

The Android app wraps the same web build with [Capacitor](https://capacitorjs.com). You need JDK 21 and the Android SDK (platform 36, build-tools 36.0.0) with `ANDROID_HOME` and `JAVA_HOME` set, then run `npm run android:build` for a debug APK. Release APKs are built and signed by GitHub Actions from the `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` secrets; Android only installs updates signed with the same key, so never replace that keystore.

Notes live in the app's WebView storage, so keep JSON backups. Backups and note exports open the Android share sheet. Linked folders, Markdown folder export, the AI bridge and cloud sign-in (browser popups) are desktop or browser features and are unavailable in the Android app. AI providers that allow browser requests still work.

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
