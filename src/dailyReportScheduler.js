'use strict';

function localTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function millisecondsUntilNextRun(now, { hour = 8, minute = 0, timeZone = 'Europe/Warsaw' } = {}) {
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(current.getTime())) throw new Error('Czas harmonogramu jest nieprawidłowy.');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('Godzina harmonogramu jest nieprawidłowa.');
  const firstMinute = new Date(current.getTime());
  firstMinute.setSeconds(0, 0);
  for (let offset = 1; offset <= 26 * 60; offset += 1) {
    const candidate = new Date(firstMinute.getTime() + offset * 60 * 1000);
    const parts = localTimeParts(candidate, timeZone);
    if (parts.hour === hour && parts.minute === minute) return candidate.getTime() - current.getTime();
  }
  throw new Error('Nie udało się wyznaczyć następnego raportu.');
}

function scheduleDaily(run, options = {}) {
  let timer;
  const scheduleNext = () => {
    timer = setTimeout(async () => {
      await runSafely(run);
      scheduleNext();
    }, millisecondsUntilNextRun(new Date(), options));
  };
  scheduleNext();
  return () => clearTimeout(timer);
}

async function runSafely(run, onError = console.error) {
  try {
    await run();
    return true;
  } catch (error) {
    onError('Daily signal report failed:', error.message);
    return false;
  }
}

module.exports = { millisecondsUntilNextRun, runSafely, scheduleDaily };
