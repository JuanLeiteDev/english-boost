// Tests for app/static/grading.js against the real answer keys. Run: node tests/grading.test.js
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const G = require(path.join(__dirname, "..", "app", "static", "grading.js"));

const dir = path.join(__dirname, "..", "materials", "grammar", "answers");
const KEYS = {};
for (const f of fs.readdirSync(dir).filter((x) => /^P[12]-\d\d\.md$/.test(x))) {
  const k = {};
  for (const line of fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (m && !(m[1] in k)) k[m[1]] = m[2].trim();
  }
  KEYS[f.replace(".md", "")] = k;
}

const cases = [
  ["P1-01", "4", "aren't", true], ["P1-01", "4", "are not", true], ["P1-01", "4", "ARE NOT!", true],
  ["P1-01", "9", "Are you a student? Yes, I am.", true], ["P1-01", "9", "Are you a student? — Yes, I am", true],
  ["P1-01", "18", "I'm 22", true], ["P1-01", "18", "I am 22 years old", true], ["P1-01", "18", "I have 22 years", false],
  ["P1-01", "22", "My sister is 19 and her name is Ana.", true], ["P1-01", "22", "My sister is 19 and his name is Ana.", false],
  ["P1-01", "8", "'m not", true], ["P1-01", "8", "am not", true], ["P1-01", "8", "", false],
  ["P1-02", "1", "watches", true], ["P1-02", "1", "watchs", false], ["P1-02", "1", "Watches ", true],
  ["P1-03", "4", "My flatmate doesn't clean the kitchen.", true], ["P1-03", "4", "My flatmate does not clean the kitchen", true],
  ["P1-04", "5", "My flatmates don't usually clean the kitchen.", true],
  ["P1-05", "2", "When", true], ["P1-05", "2", "What time", true], ["P1-05", "8", "Who lives with you?", true],
  ["P1-05", "8", "Who does live with you?", false],
];
let fail = 0;
for (const [u, n, a, want] of cases) {
  const got = G.isRight(a, KEYS[u][n]);
  if (got !== want) { fail++; console.error(`MISMATCH ${u}#${n} ${JSON.stringify(a)} -> ${got}, key: ${KEYS[u][n]}`); }
}
// Self-consistency: the first variant of every key must grade as correct.
let items = 0;
for (const [u, k] of Object.entries(KEYS)) {
  for (const [n, exp] of Object.entries(k)) {
    if (/^pessoal/i.test(exp)) continue;
    items++;
    const v = exp.replace(/\*\*/g, "").split(/\s+\/\s+/)[0].replace(/\s+←.*$/, "").replace(/\([^)]*\)/g, "");
    if (!G.isRight(v, exp)) { fail++; console.error(`SELF ${u}#${n}: ${exp}`); }
  }
}
assert.strictEqual(G.isRight("x", undefined), false);
assert.strictEqual(G.clean("**It**'s ok ← note"), "It's ok");
if (fail) { console.error(`${fail} grading problems`); process.exit(1); }
console.log(`grading ok: ${cases.length} cases, ${items} keyed items`);
