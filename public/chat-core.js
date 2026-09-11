// Shared pure chat logic: used by the browser (script tag) and by server.js/test.js (require).

const MAX_LEN = 280;         // chars per message, after trim
const CHAT_LIMIT = [5, 3000]; // [messages, window ms] per socket
const HISTORY_MAX = 50;      // global messages kept for late joiners

// Reactions and votes are cheap clicks, so they get a bucket of their own: misclicking a
// chip three times must not eat the budget you need to answer someone.
const TAP_LIMIT = [20, 3000];

// A fixed palette rather than any emoji the client feels like sending. Six is enough to
// answer a message without turning the log into a sticker wall, and a closed set means
// nothing exotic (or invisible, or 400 code points long) ever reaches another browser.
const REACTIONS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F440}', '\u{1F64F}'];

const POLL_MS = 10 * 60 * 1000; // how long a poll stays open
const POLL_MAX_OPTIONS = 5;
const POLL_Q_MAX = 120;
const POLL_OPT_MAX = 40;

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

// --- slash commands ---------------------------------------------------------

// `/vote Makan di mana? | Padang | Sate` -> { name: 'vote', args: 'Makan di mana? | ...' }.
// Returns null for anything that is not a command, including a bare "/" and "/ hello",
// so ordinary punctuation is never swallowed as one.
function parseCommand(text) {
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(String(text || '').trim());
  return match ? { name: match[1].toLowerCase(), args: (match[2] || '').trim() } : null;
}

const VOTE_USAGE = 'Cara pakai: /vote Pertanyaan? | Pilihan A | Pilihan B '
  + '· tanpa pilihan jadi Ya/Tidak.';

// The question and the options are separated by "|" because a poll question routinely
// contains commas and spaces, and "|" is the one character nobody types by accident.
// Everything is length-capped here rather than at render time: a 280-char option would
// otherwise arrive at every other browser before anyone could refuse it.
function parseVote(args) {
  const parts = String(args || '').split('|').map((s) => s.trim()).filter(Boolean);
  const question = (parts.shift() || '').slice(0, POLL_Q_MAX);
  if (!question) return { error: 'Pertanyaannya mana? ' + VOTE_USAGE };

  // The commonest poll in an office is a yes/no, so asking for one costs no extra typing.
  const options = (parts.length ? parts : ['Ya', 'Tidak']).map((o) => o.slice(0, POLL_OPT_MAX));
  if (options.length < 2) return { error: 'Minimal 2 pilihan. ' + VOTE_USAGE };
  if (options.length > POLL_MAX_OPTIONS) return { error: 'Maksimal ' + POLL_MAX_OPTIONS + ' pilihan.' };
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return { error: 'Pilihannya ada yang kembar.' };
  }
  return { question, options };
}

function makePoll(question, options, now) {
  return {
    question,
    options: options.map((text) => ({ text, votes: [] })),
    endsAt: now + POLL_MS,
  };
}

// Voters and reactors are stored as { id, name } rather than bare ids: the person who
// clicked may well have gone home by the time you read the tally, and "?" in a tooltip
// is worse than a name that is a few minutes stale.
function stamp(user) {
  return { id: user.id, name: user.name };
}

// One vote per person. Clicking another option moves it; clicking your own cancels it,
// which is the only way to take a vote back.
function castVote(poll, user, index, now) {
  if (!poll || !user || now >= poll.endsAt) return false;
  if (!Number.isInteger(index) || index < 0 || index >= poll.options.length) return false;

  // The old vote is withdrawn wherever it sat, then the clicked option takes it -- unless
  // that is where it already was, which is how clicking twice cancels.
  let changed = false;
  let had = false;
  for (const option of poll.options) {
    const at = option.votes.findIndex((v) => v.id === user.id);
    if (at < 0) continue;
    had = option === poll.options[index];
    option.votes.splice(at, 1);
    changed = true;
  }
  if (!had) {
    poll.options[index].votes.push(stamp(user));
    changed = true;
  }
  return changed;
}

// Counts, total and the current leader in one pass. `top` is -1 while nobody has voted
// and while two options are tied, so nothing is ever announced as the winner by accident.
function pollTotals(poll) {
  const counts = poll.options.map((o) => o.votes.length);
  const total = counts.reduce((a, b) => a + b, 0);
  const best = Math.max(0, ...counts);
  const leaders = counts.filter((c) => c === best).length;
  return { counts, total, top: best > 0 && leaders === 1 ? counts.indexOf(best) : -1 };
}

// --- reactions --------------------------------------------------------------

// Toggling in place, keyed by emoji, so the wire never carries anything but the palette
// entries. An emoji outside the palette is dropped rather than corrected: the only way
// to send one is to bypass the UI.
function toggleReaction(msg, emoji, user) {
  if (!msg || !user || !REACTIONS.includes(emoji)) return false;
  const all = msg.reactions || (msg.reactions = {});
  const list = all[emoji] || [];
  const at = list.findIndex((v) => v.id === user.id);
  if (at >= 0) list.splice(at, 1);
  else list.push(stamp(user));
  if (list.length) all[emoji] = list;
  else delete all[emoji]; // an empty chip is noise; drop the key entirely
  return true;
}

Object.assign(globalThis, { MAX_LEN, CHAT_LIMIT, HISTORY_MAX, TAP_LIMIT, REACTIONS, POLL_MS, POLL_MAX_OPTIONS, POLL_Q_MAX, POLL_OPT_MAX, VOTE_USAGE, normalizeText, makeBucket, uniqueName, parseMentions, resolveRecipients, matchNames, parseCommand, parseVote, makePoll, castVote, pollTotals, toggleReaction, WORD_CHAR });

