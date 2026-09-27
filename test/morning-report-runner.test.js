'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { selectNewestSnapshot } = require('../src/morningReportRunner');

test('selects the newest snapshot by its declared data time, not by the filename', () => {
  const selected = selectNewestSnapshot([
    { file: 'z-old.json', snapshot: { asOf: '2026-09-27T06:00:00.000Z' } },
    { file: 'a-new.json', snapshot: { asOf: '2026-09-27T08:00:00.000Z' } },
  ]);

  assert.equal(selected.file, 'a-new.json');
});

test('rejects a snapshot without a valid timestamp', () => {
  assert.throws(
    () => selectNewestSnapshot([{ file: 'invalid.json', snapshot: { asOf: 'not-a-date' } }]),
    /valid asOf/,
  );
});
