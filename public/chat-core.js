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

// A name only starts after a non-word character, so a@b.com stays an address.
const WORD_CHAR = /[\p{L}\p{N}_]/u;

// Splits `text` into render tokens and tells the caller which of `names` were mentioned.
// Names may contain spaces, so matching cannot just cut at whitespace: every candidate is
// tried against the text, longest first, and the match must end on a word boundary
// (otherwise "@Budiman" would count as a mention of "Budi").
function parseMentions(text, names) {
  const candidates = (names || []).filter(Boolean).sort((a, b) => b.length - a.length);
  const lower = String(text).toLowerCase();
  const tokens = [];
  const mentioned = [];
  const unknown = [];
  let plain = '';
  let i = 0;

  const flush = () => {
    if (plain) tokens.push({ type: 'text', value: plain });
    plain = '';
  };

  while (i < text.length) {
    if (text[i] !== '@' || (i > 0 && WORD_CHAR.test(text[i - 1]))) {
      plain += text[i++];
      continue;
    }

    let hit = null;
    for (const name of candidates) {
      const end = i + 1 + name.length;
      if (lower.slice(i + 1, end) !== name.toLowerCase()) continue;
      if (end < text.length && WORD_CHAR.test(text[end])) continue;
      hit = { name, end };
      break;
    }

    if (hit) {
      flush();
      tokens.push({ type: 'mention', value: hit.name });
      if (!mentioned.includes(hit.name)) mentioned.push(hit.name);
      i = hit.end;
      continue;
    }

    // "@" plus a word that matches nobody is a typo worth reporting. A bare "@" is
    // just punctuation and is left alone.
    let j = i + 1;
    while (j < text.length && WORD_CHAR.test(text[j])) j++;
    if (j === i + 1) {
      plain += text[i++];
      continue;
    }
    const typo = text.slice(i + 1, j);
    if (!unknown.includes(typo)) unknown.push(typo);
    plain += text.slice(i, j);
    i = j;
  }

  flush();
  return { mentioned, unknown, tokens };
}

// The single place that decides who gets a message. `ids: null` means broadcast.
// The sender is always included so their own private message shows up in their log.
function resolveRecipients(text, senderId, players) {
  const list = Object.values(players || {});
  const { mentioned, unknown } = parseMentions(text, list.map((p) => p.name));

  if (unknown.length) return { scope: 'mention', ids: [], unknown };
  if (!mentioned.length) return { scope: 'all', ids: null, unknown: [] };

  const byName = new Map(list.map((p) => [p.name.toLowerCase(), p.id]));
  const ids = [];
  for (const name of mentioned) {
    const id = byName.get(name.toLowerCase());
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (senderId && !ids.includes(senderId)) ids.push(senderId);
  return { scope: 'mention', ids, unknown: [] };
}

// Autocomplete candidates for the text typed after an "@". Yourself excluded: mentioning
// yourself only narrows who else sees the message.
function matchNames(prefix, names, selfName) {
  const needle = String(prefix || '').toLowerCase();
  const self = String(selfName || '').toLowerCase();
  return (names || []).filter((n) => n.toLowerCase() !== self && n.toLowerCase().startsWith(needle));
}

Object.assign(globalThis, { MAX_LEN, CHAT_LIMIT, HISTORY_MAX, normalizeText, makeBucket, uniqueName, parseMentions, resolveRecipients, matchNames, WORD_CHAR });
