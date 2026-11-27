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

// Item text of each exercise (what the app passes as the prompt), from the "Practice" section of each unit.
let fail = 0;
const PROMPTS = {};
for (const u of Object.keys(KEYS)) {
  const q = {};
  let inEx = false;
  for (const line of fs.readFileSync(path.join(dir, "..", `${u}.md`), "utf8").split(/\r?\n/)) {
    if (/^## /.test(line)) inEx = /practi|exerc/i.test(line);
    const m = inEx && line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (m && !(m[1] in q)) q[m[1]] = m[2].trim();
  }
  PROMPTS[u] = q;
}

// Full sentences instead of only the missing word: [unit, item, answer, expected result].
const full = [
  ["P1-02", "9", "My flatmate cooks every evening.", true], ["P1-02", "9", "my flatmate cooks every evening", true],
  ["P1-02", "9", "My flatmate cook every evening.", false], ["P1-02", "9", "My flatmate cooks every morning.", false],
  ["P1-02", "14", "We go to the gym on Fridays.", true], ["P1-02", "14", "We goes to the gym on Fridays.", false],
  ["P1-02", "11", "Juan studies AI Engineering.", true], ["P1-02", "16", "This algorithm tries all possible combinations.", true],
  ["P1-02", "17", "My friend lives near the campus.", true], ["P1-02", "17", "My friend live near the campus.", false],
  ["P1-02", "20", "The library has a lot of computers.", true], ["P1-02", "19", "He watches Netflix every night.", true],
  ["P1-01", "1", "I am from Portugal.", true], ["P1-01", "1", "I'm from Portugal", true], ["P1-01", "1", "I is from Portugal.", false],
  ["P1-01", "4", "You aren't late.", true], ["P1-01", "4", "You are not late. The class starts at 9.", true], ["P1-01", "4", "You are late.", false],
  ["P1-01", "13", "Her course is Digital Design.", true], ["P1-01", "13", "This is Marta. Her course is Digital Design.", true],
  ["P1-01", "13", "His course is Digital Design.", false],
  ["P1-03", "15", "Are you a student here?", true], ["P1-03", "15", "Do you a student here?", false],
  ["P1-03", "20", "He doesn't like coffee.", true], ["P1-03", "20", "He don't like coffee.", false],
  ["P1-05", "1", "Where do you live?", true], ["P1-05", "1", "Where do you live? — Near the station.", true],
  ["P1-05", "1", "What do you live?", false], ["P1-05", "8", "lives with you", true], ["P1-05", "8", "Who lives with you?", true],
  ["P1-05", "8", "does live with you", false], ["P1-05", "15", "Where are you from?", true],
  ["P1-01", "9", "Are you a student? Yes, I'm.", false], ["P1-01", "12", "Am I in the right room? Yes, you're", false],
  ["P1-01", "11", "Are your flatmates Belgian? No, they aren't", true], ["P1-01", "21", "They're my classmates.", true],
  ["P1-01", "4", "You are't late. The class start at 9.", false],
];
for (const [u, n, a, want] of full) {
  const got = G.isRight(a, KEYS[u][n], PROMPTS[u][n]);
  if (got !== want) { fail++; console.error(`FULL ${u}#${n} ${JSON.stringify(a)} -> ${got}, prompt: ${PROMPTS[u][n]}, key: ${KEYS[u][n]}`); }
}
// With the prompt, every old case must still give the same result.

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
for (const [u, n, a, want] of cases) {
  for (const prompt of [undefined, PROMPTS[u][n]]) {
    const got = G.isRight(a, KEYS[u][n], prompt);
    if (got !== want) { fail++; console.error(`MISMATCH ${u}#${n} ${JSON.stringify(a)} -> ${got}, key: ${KEYS[u][n]}, prompt: ${prompt}`); }
  }
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
// The practice-builder gold example: natural answers (letters, words, full sentences) must pass.
{
  const ref = path.join(__dirname, "..", ".agents", "skills", "practice-builder", "references");
  const items = {}, key = {};
  let inEx = false;
  for (const line of fs.readFileSync(path.join(ref, "example-set.md"), "utf8").split(/\r?\n/)) {
    if (/^## /.test(line)) inEx = /practi/i.test(line);
    const m = inEx && line.match(/^(\d+)\.\s+(.+)$/);
    if (m) items[m[1]] = m[2];
  }
  for (const line of fs.readFileSync(path.join(ref, "example-key.md"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^(\d+)\.\s+(.+)$/);
    if (m) key[m[1]] = m[2];
  }
  const ex = [["1", "hang out", true], ["1", "My friends and I usually hang out at the student bar on Thursdays.", true], ["1", "hang", false],
    ["6", "looking forward to", true], ["7", "up", true], ["7", "on", false], ["16", "made", true], ["16", "make", false],
    ["18", "did", true], ["18", "Yesterday I did my homework with Pedro.", true], ["18", "Yesterday I made my homework with Pedro.", false],
    ["20", "I'm looking forward to seeing you on Saturday.", true], ["22", "b", true], ["22", "Saturday at 8", true], ["22", "a", false],
    ["23", "because his flatmate has an exam", true], ["26", "2nd floor", true], ["27", "b", true], ["27", "call Lucas", true],
    ["29", "b", true], ["29", "a yellow dress and tennis shoes", true], ["30", "c", false]];
  for (const [n, a, want] of ex) {
    if (G.isRight(a, key[n], items[n]) !== want) { fail++; console.error(`EXAMPLE #${n} ${JSON.stringify(a)} -> ${!want}, key: ${key[n]}`); }
  }
}
assert.strictEqual(G.isRight("x", undefined), false);
// multiple choice keys
for (const [a, want] of [["b", true], ["B)", true], ["(b)", true], ["went", true], ["b) went", true], ["a", false], ["go", false], ["", false]]) {
  assert.strictEqual(G.isRight(a, "b) went", "Yesterday I ___ home. a) go b) went c) goes"), want, `MC ${a}`);
}
assert.strictEqual(G.isRight("I went home yesterday.", "b) went", "Yesterday I ___ home. a) go b) went c) goes"), false);
assert.strictEqual(G.isRight("Yesterday I went home.", "b) went", "Yesterday I ___ home."), true);
assert.strictEqual(G.clean("**It**'s ok ← note"), "It's ok");
// multiple choice items become tick boxes: stem + options (one line, own lines, "(a)" style); plain items stay text inputs
const c1 = G.choices("\"Are you new?\" \"Yes, ___.\" a) I'm b) I am c) I'm am d) I be");
assert.deepStrictEqual(c1 && [c1.stem, c1.opts.map((o) => o.letter + "=" + o.html)], ["\"Are you new?\" \"Yes, ___.\"", ["a=I'm", "b=I am", "c=I'm am", "d=I be"]]);
const c2 = G.choices("When is it?<br>(a) <em>Friday</em><br>(b) Saturday<br>(c) Sunday<br>(d) Monday");
assert.deepStrictEqual(c2 && [c2.stem, c2.opts.map((o) => o.html)], ["When is it?", ["<em>Friday</em>", "Saturday", "Sunday", "Monday"]]);
assert.strictEqual(G.choices("I ___ (cook) every evening in the area)."), null);
assert.strictEqual(G.choices("Pick one: a) only one option"), null);
// the app stores the chosen option text: it is graded against "b) text" keys and plain keys
assert.strictEqual(G.isRight("I am", "b) I am", c1.stem), true);
assert.strictEqual(G.isRight("I'm", "b) I am", c1.stem), false);
assert.strictEqual(G.isRight("make", "make", "I ___ friends. a) do b) make c) take d) have"), true);
if (fail) { console.error(`${fail} grading problems`); process.exit(1); }
console.log(`grading ok: ${cases.length + full.length} cases, ${items} keyed items`);
