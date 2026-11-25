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
  function isRight(ans, exp) {
    const a = norm(ans);
    if (!a || !exp) return false;
    if (variants(exp).includes(a)) return true;
    const ell = String(exp).replace(/\*+/g, "").trim().match(/^(…|\.\.\.)\s*(.*)$/);
    if (ell) { const tail = norm(ell[2].split(/\s+\/\s+/)[0]); if (tail && a.endsWith(tail)) return true; }
    return false;
  }
  const clean = (s) => String(s).replace(/\*\*/g, "").replace(/\s+←.*$/, "");
  const api = { norm, variants, isRight, clean };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Grading = api;
})(typeof window !== "undefined" ? window : globalThis);
