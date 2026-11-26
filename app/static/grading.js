/* Answer checking for grammar exercises (shared by the app and tests/grading.test.js). */
(function (root) {
  function norm(s) {
    s = String(s).toLowerCase().replace(/[’‘`´]/g, "'").replace(/\*+/g, "");
    const rules = [[/\bi'm\b/g, "i am"], [/\b(you|we|they)'re\b/g, "$1 are"], [/\b(he|she|it|that|what|there|who|where|here)'s\b/g, "$1 is"],
      [/\bcan't\b|\bcannot\b/g, "can not"], [/\bwon't\b/g, "will not"], [/n't\b/g, " not"], [/'ll\b/g, " will"], [/'ve\b/g, " have"], [/'d\b/g, " would"], [/'m\b/g, " am"]];
    rules.forEach(([r, v]) => { s = s.replace(r, v); });
    return s.replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function variants(exp) {
    const e = String(exp).split(/\s+←/)[0];
    const keepOpt = e.replace(/\(([^)]*)\)/g, (_, c) => (/[^\x00-\x7f]|aceit|sujeito|objeto|tempo|accept|subject|object|question|note|meaning/i.test(c) ? "" : c));
    const dropOpt = e.replace(/\([^)]*\)/g, "");
    const out = new Set();
    [keepOpt, dropOpt].forEach((b) => { out.add(b); b.split(/\s+\/\s+/).forEach((v) => out.add(v)); });
    return [...out].map(norm).filter(Boolean);
  }

  // The item text is used so that a learner who writes the whole sentence (instead of only the
  // missing word) is graded fairly. BLANK stands for "___" in the normalised item text.
  const BLANK = "zzblankzz";
  function frames(prompt) {
    let f = String(prompt || "").replace(/\*+/g, "");
    if (f.includes("→")) f = f.slice(f.lastIndexOf("→") + 1);  // "I speak Dutch. → ___": the learner writes the right side
    f = f.replace(/\([^)]*\)/g, " ").replace(/_{2,}/g, ` ${BLANK} `);  // drop hints like "(cook)" or "(negative)"
    const out = [f];
    const own = f.split(/(?<=[.?!])\s+/).find((x) => x.includes(BLANK));  // only the sentence with the gap
    if (own && own.trim() !== f.trim()) out.push(own);
    return out;
  }
  // Is `a` the item text with one span replaced by a correct variant? (Covers "My flatmate cooks every
  // evening." for "My flatmate ___ (cook) every evening." and "My friend lives near the campus." for a
  // find-the-mistake item whose key is "lives".)
  function spanMatch(A, P, vars) {
    const blanks = P.filter((w) => w === BLANK).length;
    if (blanks > 1 || A.join(" ") === P.join(" ")) return false;
    let pre = 0, suf = 0;
    while (pre < A.length && pre < P.length && A[pre] === P[pre]) pre++;
    while (suf < A.length && suf < P.length && A[A.length - 1 - suf] === P[P.length - 1 - suf]) suf++;
    for (let i = 0; i <= pre; i++) {
      for (let j = 0; j <= suf && i + j < A.length && i + j <= P.length; j++) {
        if (blanks && !P.slice(i, P.length - j).includes(BLANK)) continue;  // the change must fill the gap
        if (vars.has(A.slice(i, A.length - j).join(" "))) return true;
      }
    }
    return false;
  }
  // "Yes, I'm." / "Yes, you're": a positive contraction can't end a short answer (norm() would hide it).
  const BAD_SHORT = /\b(?:i'm|you're|we're|they're|he's|she's|it's|that's|there's)\s*(?:[.!?,;]|$)/i;
  function isRight(ans, exp, prompt) {
    const a = norm(ans);
    if (!a || !exp) return false;
    if (BAD_SHORT.test(String(ans).replace(/[’‘`´]/g, "'").replace(/\*+/g, "").trim())) return false;
    const vs = variants(exp), vars = new Set(vs);
    if (vars.has(a)) return true;
    // multiple choice: the key "b) went" accepts "b", "b)", "(b)" or "went"
    const mc = String(exp).replace(/\*+/g, "").trim().match(/^\(?([a-e])\)\s*(.+)$/i);
    if (mc) {
      if (a === mc[1].toLowerCase()) return true;
      variants(mc[2]).forEach((v) => vars.add(v));  // also used below for a full-sentence answer
      if (vars.has(a)) return true;
    }
    const ell = String(exp).replace(/\*+/g, "").trim().match(/^(…|\.\.\.)\s*(.*)$/);
    if (ell) { const tail = norm(ell[2].split(/\s+\/\s+/)[0]); if (tail && a.endsWith(tail)) return true; }
    if (!prompt) return false;
    const A = a.split(" ");
    return frames(prompt).some((f) => {
      const P = norm(f).split(" ").filter(Boolean);
      // gap filled with the answer equals a full-sentence key ("Who ___?" + "lives with you")
      if (P.filter((w) => w === BLANK).length === 1 && vars.has(norm(f.replace(BLANK, ` ${ans} `)))) return true;
      return spanMatch(A, P, vars);
    });
  }
  const clean = (s) => String(s).replace(/\*\*/g, "").replace(/\s+←.*$/, "");
  const api = { norm, variants, isRight, clean };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Grading = api;
})(typeof window !== "undefined" ? window : globalThis);
