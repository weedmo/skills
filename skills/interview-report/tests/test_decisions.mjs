import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Execute the real decision renderer with a minimal DOM, without a browser or CDN.
const view = readFileSync(new URL('../assets/view.html', import.meta.url), 'utf8');
const start = view.indexOf('  function renderNode(d) {');
const end = view.indexOf('  function exportPayload()', start);
assert.ok(start >= 0 && end > start, 'decision renderer exists');

function render(source) {
  const edits = [];
  const element = (tag, cls, text) => ({
    tag, text, children: [], style: {}, events: {},
    classList: { add() {}, toggle() {} },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(event, handler) { this.events[event] = handler; },
  });
  const context = {
    el: element, document: { createElement: element }, CHANGE_LABEL: { new: 'new' },
    isEdited: () => false, isFlagged: () => false, editOf: () => ({}),
    setEdit: (id, value) => edits.push({ id, value }), updateToolbar() {},
    decision: { id: 'D1', source, question: 'Retry?', decision: 'Three attempts', rationale: 'Bound work', change: 'new' },
  };
  const node = runInNewContext(view.slice(start, end) + '\nrenderNode(decision)', context);
  const flatten = n => [n, ...n.children.flatMap(flatten)];
  return { nodes: flatten(node), edits };
}

for (const source of ['matt-design', 'design-map']) {
  test(`${source} confirmed decisions have no editable controls`, () => {
    const { nodes, edits } = render(source);
    assert.equal(nodes.filter(n => ['textarea', 'input'].includes(n.tag)).length, 0);
    assert.ok(nodes.some(n => n.text === 'Three attempts'));
    assert.equal(edits.length, 0);
  });
}

test('execution decisions remain editable and emit the stable decision id', () => {
  const { nodes, edits } = render(undefined);
  const textarea = nodes.find(n => n.tag === 'textarea');
  const checkbox = nodes.find(n => n.tag === 'input' && n.type === 'checkbox');
  assert.ok(textarea && checkbox);
  textarea.value = 'Five attempts';
  textarea.events.input();
  assert.equal(edits[0].id, 'D1');
  assert.equal(edits[0].value.decision, 'Five attempts');
  checkbox.checked = true;
  checkbox.events.change();
  assert.equal(edits[1].value.flagged, true);
});
