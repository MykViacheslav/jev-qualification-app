'use strict';

function selectNewestSnapshot(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('No JSON snapshots found in the input folder.');
  }

  const checked = candidates.map((candidate) => {
    const timestamp = new Date(candidate?.snapshot?.asOf).getTime();
    if (Number.isNaN(timestamp)) throw new Error(`Snapshot ${candidate?.file || 'unknown'} must have a valid asOf timestamp.`);
    return { ...candidate, timestamp };
  });

  return checked.sort((left, right) => right.timestamp - left.timestamp)[0];
}

module.exports = { selectNewestSnapshot };
