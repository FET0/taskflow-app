const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTask } = require('../src/app');

test('accepts a valid task', () => {
  assert.deepEqual(validateTask({ title: 'Learn GitOps', description: 'Build TaskFlow', status: 'pending' }), []);
});

test('rejects an empty title', () => {
  assert.equal(validateTask({ title: '' }).length, 1);
});

test('rejects an invalid status', () => {
  assert.match(validateTask({ title: 'Task', status: 'blocked' })[0], /status/);
});
