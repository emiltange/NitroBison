const updatedAt = 1735689600000;
const note = (id, title, folder, content) => ({ id, title, folder, content, updatedAt });

export const sampleVault = {
  folders: ['Getting started', 'Garden', 'Projects'],
  notes: [
    note('10000000-0000-4000-8000-000000000001', 'Welcome to NitroBison', '', `# A little space for big ideas

Your thoughts don’t arrive in straight lines. Give them a place to wander.

NitroBison is a quiet, offline-first home for your projects and Markdown notes. Write something down, make a connection, and see what grows.

> **Sample vault** — these are example notes, not your personal data. Make yourself at home: edit them, delete them, or start a new note.

## Start wherever you are

- **Capture a thought.** Use **New note** to get it out of your head.
- **Make a connection.** Write \`[[A small idea]]\` to connect two notes.
- **See the bigger picture.** Open the graph to follow the threads.
- **Find your bearings.** Open **Home** for a passport-style overview of your projects and storage. Each top-level folder is a project; pages outside folders appear under **Unfiled pages**.

Try visiting [[Garden/A small idea|A small idea]] or explore [[Getting started/Your Markdown toolkit|your Markdown toolkit]].

## Yours, by default

Your personal vault is saved on this device as you type. You don’t need an account or a connection to keep thinking.

When you’re ready, you can explicitly sync your whole personal vault with Google Drive or OneDrive, export your notes as Markdown, or join an invite-only team workspace. Cloud sync includes all personal projects, not an individual folder. Your personal notes are never automatically shared.

---

*A thought becomes an idea. An idea finds another. A world of possibilities begins.*`),
    note('10000000-0000-4000-8000-000000000002', 'Your Markdown toolkit', 'Getting started', `# Less formatting. More thinking.

Markdown stays readable wherever your notes go.

## The essentials

Use **bold** for the important things, *italics* for a little emphasis, and \`inline code\` for the precise things.

### Lists that make room

- One thought
- Another possibility
  - Something worth exploring

1. Capture
2. Connect
3. Revisit

## A place for details

| Shortcut | What happens |
| --- | --- |
| Ctrl / ⌘ + K | Search your vault |
| Ctrl / ⌘ + N | Create a note |
| Ctrl / ⌘ + S | Save locally |

> You don’t have to organize everything before you begin.

## Connected by design

A wiki link like [[Garden/A small idea|this one]] connects your notes. You can also use [ordinary Markdown links](../Welcome%20to%20NitroBison.md).

See [[Getting started/Thinking in diagrams]] for Mermaid, or [[Projects/A slower morning]] for a project example.

For privacy, images and raw HTML are not loaded in note previews.`),
    note('10000000-0000-4000-8000-000000000003', 'Thinking in diagrams', 'Getting started', `# Sometimes, draw the thought

Mermaid turns a few lines of text into a diagram. It runs locally, including offline after the app is installed.

## From spark to something

\`\`\`mermaid
flowchart LR
    A[A small spark] --> B[Write it down]
    B --> C[Make a connection]
    C --> D[Let it grow]
    D --> A
\`\`\`

## Keep it simple

Use a fenced code block with the language \`mermaid\`. Diagrams run in strict mode: no scripts, embedded HTML, external resources or clickable actions.

Return to [[Welcome to NitroBison]] or plant [[Garden/A small idea|a small idea]].`),
    note('10000000-0000-4000-8000-000000000004', 'A small idea', 'Garden', `# Every good idea starts small

What if a note didn’t need to be finished to be useful?

A place to gather fragments. A sentence that stays with you. A question without an answer yet.

## A few seeds

- What made me curious today?
- What keeps showing up in my thoughts?
- Which two things might belong together?

This idea connects to [[Projects/A slower morning]] and [[Garden/Things worth noticing]].

*Leave a little room for what comes next.*`),
    note('10000000-0000-4000-8000-000000000005', 'Things worth noticing', 'Garden', `# Pay attention to the ordinary

The best notes often begin with a small observation.

## Today’s collection

- The clarity that comes after a walk.
- A good question is often better than a quick answer.
- Space is not the absence of something. It’s room for something.

## A question to carry

What would change if I gave [[Projects/A slower morning|my mornings]] a little more space?

Related: [[Garden/A small idea]] · [[Welcome to NitroBison]]`),
    note('10000000-0000-4000-8000-000000000006', 'A slower morning', 'Projects', `# A slower morning

An experiment in making a little more room.

## The intention

Start the day with attention instead of urgency.

## Try this

- [ ] Leave the phone in another room.
- [ ] Make something warm to drink.
- [ ] Write one thought before reading someone else’s.
- [ ] Step outside for five minutes.

## Notes along the way

Not every morning needs a routine. Sometimes it just needs a pause.

Inspired by [[Garden/Things worth noticing]] and [[Garden/A small idea]].`),
  ],
};
