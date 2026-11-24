import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLASH_COMMANDS, filterSlashCommands, parseMarkdownBlocks, serializeMarkdownBlocks,
  parsePipeTable, serializePipeTable, computeSheetTotals,
} from '../src/modern-write.js';

// These fixtures catch lossy block boundaries, fence handling and table escaping.
for (const [query, id] of [
  ['/graph', 'graph'], ['/diagram', 'graph'], ['/mermaid', 'graph'],
  ['/table', 'table'], ['/header', 'h1'], ['/h1', 'h1'],
  ['/subheader', 'h2'], ['/sub-header', 'h2'], ['/h2', 'h2'], ['/h3', 'h3'],
  ['/sheet', 'sheet'], ['/grid', 'sheet'], ['/list', 'list'], ['/tasks', 'list'],
  ['/database', 'list'], ['/todo', 'todo'], ['/check', 'todo'], ['/code', 'code'],
  ['/link', 'link'], ['/page', 'link'], ['/quote', 'callout'], ['/hr', 'divider'],
  ['/ul', 'bullet'], ['/ol', 'numbered'], ['/text', 'text'],
]) {
  test(`slash command ${query} finds ${id}`, () => {
    assert.ok(filterSlashCommands(query).some(command => command.id === id));
  });
}

test('slash filtering uses case-insensitive labels, descriptions and empty queries', () => {
  assert.ok(filterSlashCommands('SMALL HEADER').some(command => command.id === 'h3'));
  assert.ok(filterSlashCommands('spreadsheet').some(command => command.id === 'sheet'));
  assert.deepEqual(filterSlashCommands('  /  '), SLASH_COMMANDS);
  assert.deepEqual(filterSlashCommands('no-such-command'), []);
});

const completeMarkdown = [
  '# Heading one', '', '## Heading two', '', '### Heading three', '',
  'A paragraph with **bold**, [[Page|label]] and [a link](https://example.com).',
  'A soft continuation.', '', '- [ ] Pending', '- [X] Finished', '- A bullet',
  '* Alternate bullet', '3) Third numbered item', '',
  '> **Note:** a callout', '> with a continuation', '',
  '| Name | Value |', '| :--- | ---: |', '| A \\| B | 12 |', '',
  '```mermaid', 'flowchart TD', '  A["# heading | value"] --> B', '```', '',
  '```nitrobison-list', '{"title":"Tasks","folder":"","tag":"","status":"","sort":"updated"}', '```', '',
  '````js', 'const value = "# title | pipe";', '```', '````', '', '---', '',
  '[[Workspace note]]', '',
].join('\n');

test('all supported block kinds round-trip with their original Markdown formatting', () => {
  const blocks = parseMarkdownBlocks(completeMarkdown);
  assert.deepEqual(blocks.map(block => block.type), [
    'h1', 'h2', 'h3', 'text', 'todo', 'todo', 'bullet', 'bullet', 'numbered',
    'callout', 'table', 'graph', 'list', 'code', 'divider', 'link',
  ]);
  assert.equal(serializeMarkdownBlocks(blocks), completeMarkdown);
});

for (const [name, markdown] of [
  ['empty body', ''], ['only whitespace', ' \r\n\t\r\n'],
  ['CRLF and blank separators', '\r\n# Title  \r\n\r\n\r\nText\r\n'],
  ['unknown Markdown', '<details>\n<summary>Summary</summary>\n\nText\n</details>\n\nTitle\n=====\n\n    indented code\n    # not a heading\n\n[^a]: a footnote\n'],
  ['tilde fences', '~~~python\n# not a heading\n| not | a table |\n~~~\n'],
  ['unclosed fence', '```js\n# source\n| source |\n'],
  ['closing fence with trailing whitespace', '```mermaid\nflowchart TD\nA-->B\n```   \n'],
  ['nested list continuation', '- Parent\n  - Child\n    continuation\n\nAfter'],
  ['table without outside pipes', 'A | B\n--- | ---\nx | y\n'],
]) {
  test(`${name} round-trips without normalization`, () => {
    assert.equal(serializeMarkdownBlocks(parseMarkdownBlocks(markdown)), markdown);
  });
}

test('fenced examples never create headings, tables, list blocks or dividers', () => {
  const blocks = parseMarkdownBlocks('```text\n# Title\n| A | B |\n| --- | --- |\n---\n```\n');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'code');
  assert.equal(blocks[0].text, '# Title\n| A | B |\n| --- | --- |\n---');
});

test('editing a block preserves unrelated bytes, CRLF and alternate list markers', () => {
  const blocks = parseMarkdownBlocks('# Old\r\n\r\n* untouched  \r\n\r\n```js\r\n# | source\r\n```\r\n');
  blocks[0].text = 'New';
  assert.equal(serializeMarkdownBlocks(blocks), '# New\r\n\r\n* untouched  \r\n\r\n```js\r\n# | source\r\n```\r\n');
});

test('edited headings, checklist state and code serialize to usable Markdown', () => {
  assert.equal(serializeMarkdownBlocks([{ type: 'h2', text: 'Subheading' }]), '## Subheading');
  assert.equal(serializeMarkdownBlocks([{ type: 'todo', text: 'Done', checked: true }]), '- [x] Done');
  assert.equal(serializeMarkdownBlocks([{ type: 'callout', text: '**Note:** Hi\nAgain' }]), '> **Note:** Hi\n> Again');
  assert.equal(serializeMarkdownBlocks([{ type: 'graph', text: 'flowchart TD\nA-->B' }]), '```mermaid\nflowchart TD\nA-->B\n```');
  assert.equal(serializeMarkdownBlocks([{ type: 'code', language: 'js', text: '```\n# | code' }]), '````js\n```\n# | code\n````');
});

test('empty checklist items retain their editable task kind', () => {
  const blocks = parseMarkdownBlocks('- [ ]\n- [x]\n');
  assert.deepEqual(blocks.map(block => [block.type, block.text, block.checked]), [['todo', '', false], ['todo', '', true]]);
  assert.equal(serializeMarkdownBlocks(blocks), '- [ ]\n- [x]\n');
});

test('removing and inserting blocks preserves clear Markdown block boundaries', () => {
  const blocks = parseMarkdownBlocks('# Heading\n\nParagraph\n');
  blocks.push({ type: 'bullet', text: 'New item' });
  assert.equal(serializeMarkdownBlocks(blocks), '# Heading\n\nParagraph\n\n- New item');
  blocks.splice(1, 1);
  assert.equal(serializeMarkdownBlocks(blocks), '# Heading\n\n- New item');
});

test('pipe table parsing omits alignment syntax and decodes escaped pipes', () => {
  assert.deepEqual(parsePipeTable('| Name | Notes |\n| :--- | ---: |\n| A | left \\| right |'), [
    ['Name', 'Notes'], ['A', 'left | right'],
  ]);
  assert.deepEqual(parsePipeTable('Name | Count\n--- | ---\nA | 2'), [['Name', 'Count'], ['A', '2']]);
});

test('pipe table serialization escapes cell text and pads ragged rows', () => {
  assert.equal(serializePipeTable([['Name', 'Notes'], ['A | B'], ['C', 'value', 'extra']]),
    '| Name | Notes |  |\n| --- | --- | --- |\n| A \\| B |  |  |\n| C | value | extra |');
  const rows = [['Path', 'Notes'], ['C:\\work', 'left | right'], ['\\|', '`x | y`']];
  assert.deepEqual(parsePipeTable(serializePipeTable(rows)), rows);
});

test('table row and column additions and deletions survive serialization', () => {
  const rows = parsePipeTable('| Item | Value |\n| --- | --- |\n| First | 2 |');
  rows.push(['Second', '5']);
  rows.forEach((row, index) => row.push(index ? 'yes' : 'Ready'));
  assert.equal(serializePipeTable(rows), '| Item | Value | Ready |\n| --- | --- | --- |\n| First | 2 | yes |\n| Second | 5 | yes |');
  rows.splice(1, 1);
  rows.forEach(row => row.splice(0, 1));
  assert.equal(serializePipeTable(rows), '| Value | Ready |\n| --- | --- |\n| 5 | yes |');
});

test('numeric totals exclude headers, empty cells, formulas and partial numbers', () => {
  assert.deepEqual(computeSheetTotals([
    ['Item', 'Value', 'Other', 'Zero'],
    ['One', '12.5', 'not numeric', '0'],
    ['Two', '-2.5', '=SUM(A1)', ''],
    ['Three', '1e2', '3 items', '0'],
  ]), [null, 110, null, 0]);
  assert.deepEqual(computeSheetTotals([['A', 'B']]), [null, null]);
  assert.deepEqual(computeSheetTotals([]), []);
});

test('sheet-shaped tables remain clean GFM and retain editable rows', () => {
  const markdown = '| Item | Value | Formula / Notes |\n| --- | --- | --- |\n| A | 1 | |\n| B | 2 | |\n| C | 3 | |';
  const [block] = parseMarkdownBlocks(markdown);
  assert.equal(block.type, 'sheet');
  block.rows[1][1] = '4';
  assert.equal(serializeMarkdownBlocks([block]), '| Item | Value | Formula / Notes |\n| --- | --- | --- |\n| A | 4 |  |\n| B | 2 |  |\n| C | 3 |  |');
});
