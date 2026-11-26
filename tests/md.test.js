// Tests for app/static/md.js (renders agent output and project files). Run: node tests/md.test.js
const path = require("path");
const assert = require("assert");
global.window = {};
require(path.join(__dirname, "..", "app", "static", "md.js"));
const { render } = window.MD;

// XSS: raw HTML is escaped, dangerous link schemes are neutralised
const x = render('<img src=x onerror=alert(1)> [click](javascript:alert(1)) [ok](https://example.com) <script>bad()</script>');
assert(!/<img|<script/i.test(x), x);
assert(!/href="javascript:/i.test(x), x);
assert(/href="https:\/\/example.com" target="_blank" rel="noopener"/.test(x), x);
assert(render("[d](data:text/html,hi)").includes('href="#"'));

// tables, including single-dash / aligned separators
const t = render("| a | b |\n|:-:|-|\n| 1 | **2** |\n");
assert(/<table>/.test(t) && /<td>1<\/td>/.test(t) && /<strong>2<\/strong>/.test(t) && !/:-:/.test(t), t);

// ordered lists keep their numbers (exercise inputs depend on data-n)
const ol = render("9. I ___ from Portugal.\n10. It ___ cold.\n");
assert(/<ol start="9"><li data-n="9">I ___ from Portugal\.<\/li><li data-n="10">/.test(ol), ol);
// blanks with underscores are not turned into italics
assert(!/<em>/.test(ol), ol);

// headings, code, strike, blockquote, task lists
assert(/<h2>Title<\/h2>/.test(render("## Title")));
assert(/<code>&lt;b&gt;<\/code>/.test(render("`<b>`")));
assert(/<del>wrong<\/del>/.test(render("~~wrong~~")));
assert(/<blockquote><p>q<\/p><\/blockquote>/.test(render("> q")));
assert(/type="checkbox" disabled checked/.test(render("- [x] done")));
assert(/<pre><code>a &lt; b<\/code><\/pre>/.test(render("```\na < b\n```")));
// ```listen blocks become a Play button with a hidden, escaped transcript
const ls = render("```listen\nA: Hi <b>Tom</b>.\nB: Hello!\n```");
assert(/class="listen"/.test(ls) && /listen-play/.test(ls) && /<details>/.test(ls) && /Hi &lt;b&gt;Tom&lt;\/b&gt;\.<br>B: Hello!/.test(ls), ls);
console.log("md ok");
