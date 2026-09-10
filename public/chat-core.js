// Shared pure chat logic: used by the browser (script tag) and by server.js/test.js (require).

const MAX_LEN = 280;         // chars per message, after trim
const CHAT_LIMIT = [5, 3000]; // [messages, window ms] per socket
const HISTORY_MAX = 50;      // global messages kept for late joiners

// Returns '' for anything that must not be sent, so callers only test one thing.
function normalizeText(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, MAX_LEN);
}

// Token bucket over a sliding window of timestamps. `now` is passed in rather than read
// from Date.now() so tests can move time without sleeping.
function makeBucket(limit, windowMs) {
  const hits = [];
  return {
    take(now) {
      while (hits.length && now - hits[0] >= windowMs) hits.shift();
      if (hits.length >= limit) return false;
      hits.push(now);
      return true;
    },
  };
}

// Two people called "Budi" would make every @Budi ambiguous, so the second one becomes
// "Budi (2)". Compared case-insensitively because mention matching is too.
function uniqueName(base, taken) {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = base + ' (' + n + ')';
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

Object.assign(globalThis, { MAX_LEN, CHAT_LIMIT, HISTORY_MAX, normalizeText, makeBucket, uniqueName });
