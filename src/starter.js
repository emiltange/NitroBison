const notes = [
  {
    title: 'README',
    content: `# Welcome to NitroBison

NitroBison is your offline-first Markdown workspace for connected notes and projects. Write in plain text, read formatted pages, and explore the links between your ideas. Your personal notes work without an account and stay on this device unless you explicitly export or synchronize them.

## Start here

1. Open the [Feature tour](Feature%20tour.md) to try the workspace.
2. Copy something from [Markdown examples](Markdown%20examples.md) into a note of your own.
3. Read the [AI assistant guide](AI%20assistant.md) before connecting a model.

These four notes are ordinary Markdown: edit, rename, move or delete them whenever you like. You can also delete the entire Getting started folder. Deleted notes are retained as tombstones for synchronization, not securely erased; deleting a logical folder does not delete files on your computer.

## Keep a backup

Local browser storage can be cleared or evicted. Use Settings → Data & files to export a complete JSON backup. Markdown export makes portable documents, while JSON also preserves note identities, timestamps and deletion markers.
`,
  },
  {
    title: 'Feature tour',
    content: `# Feature tour

## Write, read and find

Create a note, choose its folder, and switch between Write (Markdown), Modern write, Read and Split. Changes save locally as you work. Use search to find text across notes; Ctrl/⌘ + K opens the note browser and focuses search. The outline follows your Markdown headings.

## Organize projects

Folders can contain notes and nested folders. A folder's README supplies its overview, like the [welcome page](README.md) in this folder. Star folders for quick access or hide them from browsing on this device. Show hidden folders in Settings to bring them back: hiding does not remove them from backups or cloud sync.

Drag a note onto a folder to move it, or use the note's Folder selector. Folder actions let you rename or delete a folder and its nested contents. Renaming and moving do not automatically rewrite path-based document links.

## Connect ideas

Use Link documentation to insert an ordinary Markdown link, or write a wiki link such as [[Markdown examples]]. Linked documentation and backlinks show real note relationships. Click a reference to open its document or locate it in the source. Add #getting-started to a note and use the tag view to find its occurrences.

Open Graph for Notes or Folders. Its left submenu contains graph controls, selectable nodes and linked device folders. Select a node to inspect its connections; open a note or folder from the inspector. Drag nodes, pan the background, zoom, or pause motion. The graph changes no note content.

## Take your notes with you

Import Markdown files, export Markdown, or export and restore complete JSON backups from Settings → Data & files. On desktop, link a real device folder and explicitly enable Markdown saving to write portable files there. This is outbound-only: external files are not automatically imported, and conflicting external edits stop a write rather than being overwritten.

Google Drive and OneDrive connections synchronize the whole personal vault only when you explicitly sync. A linked local folder is not proof of a cloud upload; an installed provider sync client handles those uploads separately.

## Optional AI

The [AI assistant guide](AI%20assistant.md) explains the round Ask AI action and the /AI writing command. Reading notes never calls AI. Writing, reading, graph navigation and Mermaid diagrams work without a network after the app reports Ready offline; cloud and AI requests need connectivity.
`,
  },
  {
    title: 'Markdown examples',
    content: `# Markdown examples

Switch this note between Write (Markdown), Read and Split to compare the source with its rendering. Try these examples in a new note, or edit this one.

## Formatting and lists

Use **bold**, *emphasis*, ~~strikethrough~~ and \`inline code\`.

- Capture an idea.
- Connect it to a related note.
  - Nested lists help group details.

1. Write a first draft.
2. Review it in Read.
3. Keep a backup.

> A short quotation or reminder can stand apart from the rest of your note.

## Task list

- [x] Open the getting-started notes
- [ ] Create a note of my own
- [ ] Export a JSON backup

## Table

| View | Useful for |
| --- | --- |
| Write (Markdown) | Editing Markdown source |
| Read | Reading formatted content |
| Split | Seeing both at once |

## Code

\`\`\`javascript
const idea = 'Keep notes in plain Markdown';
console.log(idea);
\`\`\`

## Diagram

\`\`\`mermaid
flowchart LR
  Idea --> Note
  Note --> Link
  Link --> Graph
\`\`\`

Mermaid rendering is bundled with the app; this diagram needs no remote image or service.

## Inline list database

Type \`/list\` on its own line or choose **Insert list database** in the toolbar to embed a live Notion-style page list inside any Markdown note:

\`\`\`nitrobison-list
{"title":"Getting started pages","folder":"Getting started","tag":"","status":"","sort":"updated"}
\`\`\`

## Document links and tags

A relative Markdown link opens the [Feature tour](Feature%20tour.md). A wiki link opens [[AI assistant]]. Use [Welcome](README.md) to return to the folder overview. These links also form graph edges and backlinks.

#markdown #getting-started
`,
  },
  {
    title: 'AI assistant',
    content: `# AI assistant

AI is optional. Your notes, links and graph work without it. Never put API keys in a note, shared screenshot or backup.

## Configure a model

Open Settings → AI → Endpoint & key. Supply the full OpenAI-compatible chat-completions URL, a model available to your account, and an API key if required. Use HTTPS, or loopback HTTP for a local model. Web endpoints must allow browser CORS. Provider charges and generated-content accuracy are your responsibility.

Choose whether settings last for this session or are remembered on this device. Session settings disappear on reload or reopening. Remembering on desktop saves the key with OS encryption in the app's private profile. Remembering in a web browser uses browser storage, which is not secure secret storage. Do not remember a key on a shared or untrusted device. Disabling remembering removes saved AI settings; clearing a key removes it from the saved configuration when remembering is enabled.

## Revise the active note

Open a note and use the round Ask AI action in the right-hand Note details panel. Describe the change you want. This action explicitly sends the active note's Markdown together with your request to your configured AI provider—not the rest of your vault. Do not submit sensitive content unless you trust that provider.

Review the complete generated revision before applying it. Apply replaces only the note body, keeping its identity, title and folder. Cancel or close the dialog to leave the note unchanged. If the body changes locally or in another window, or the note is deleted before applying, the revision will not overwrite it. Review the latest note and generate again instead.

## Generate at a command line

In Write (Markdown) or Split, put the following on its own line:

\`\`\`markdown
/AI Suggest three headings for a project retrospective
\`\`\`

Place the caret on the command and press Ctrl/⌘ + Enter, or choose Generate with AI. Confirm the prompt, review the generated Markdown, and choose Insert into note to replace only that command line. This command sends the submitted prompt, not the whole document. Commands inside code blocks are examples and never execute; simply opening or reading a note does not contact AI.

Return to the [Feature tour](Feature%20tour.md), try [Markdown examples](Markdown%20examples.md), or open the [welcome page](README.md).
`,
  },
];

export function createStarterSnapshot() {
  const updatedAt = Date.now();
  return {
    folders: ['Getting started'],
    notes: notes.map(note => ({ ...note, id: crypto.randomUUID(), folder: 'Getting started', updatedAt })),
  };
}
