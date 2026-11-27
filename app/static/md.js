// Minimal, dependency-free Markdown renderer for the project's own files.
// Supports: headings, paragraphs, bold/italic/strike, inline code, code fences, links,
// tables, ordered/unordered lists (ordered items keep their number in data-n), blockquotes, hr.
(function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function inline(src) {
    const codes = [];
    let s = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
      const safe = /^(https?:|mailto:|#|[\w./-]+$)/.test(u) ? u : "#";
      const ext = /^https?:/.test(safe);
      return `<a href="${safe}"${ext ? ' target="_blank" rel="noopener"' : ' data-doc="1"'}>${t}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
    return s;
  }

  const isTableSep = (l) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  function render(md) {
    const lines = md.replace(/\r/g, "").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        // ```listen: a script the app reads aloud (listening practice); the text stays hidden until asked
        // (an optional first line "voices: Mia=f, Jack=m" tells the server which voice each speaker gets)
        if (/^```\s*listen\b/i.test(l)) {
          const script = buf.join("\n"), shown = buf.filter((x, k) => !(k === 0 && /^\s*voices\s*:/i.test(x))).join("\n");
          out.push(`<div class="listen" data-script="${esc(script).replace(/"/g, "&quot;")}"><div class="listen-btns"><button type="button" class="btn sm listen-play">Play</button><button type="button" class="btn sm ghost listen-slow">Slow</button></div><div class="listen-audio"></div><details><summary>Show transcript</summary><p>${esc(shown).replace(/\n/g, "<br>")}</p></details></div>`);
        }
        else out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
        continue;
      }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) {
        out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
        i++; continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
      if (/^\s*\|/.test(l) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(l);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(`<div class="tw"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      if (/^\s*>/.test(l)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push(`<blockquote>${render(buf.join("\n"))}</blockquote>`);
        continue;
      }
      if (/^\s*([-*])\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*([-*])\s+/.test(lines[i])) {
          let item = lines[i++].replace(/^\s*[-*]\s+/, "");
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += " " + lines[i++].trim();
          const box = item.match(/^\[( |x)\]\s+(.*)$/i);
          items.push(box ? `<li class="task"><input type="checkbox" disabled ${box[1] !== " " ? "checked" : ""}> ${inline(box[2])}</li>` : `<li>${inline(item)}</li>`);
        }
        out.push(`<ul>${items.join("")}</ul>`);
        continue;
      }
      if (/^\s*\d+\.\s+/.test(l)) {
        const items = [];
        let start = null;
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          const mm = lines[i++].match(/^\s*(\d+)\.\s+(.*)$/);
          if (start === null) start = +mm[1];
          const parts = [mm[2]];
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(\d+\.|[-*])\s+/.test(lines[i])) parts.push(lines[i++].trim());
          items.push(`<li data-n="${mm[1]}">${parts.map(inline).join("<br>")}</li>`);
        }
        out.push(`<ol start="${start}">${items.join("")}</ol>`);
        continue;
      }
      if (!l.trim()) { i++; continue; }
      const buf = [l];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*>|\s*[-*]\s+|\s*\d+\.\s+|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
    }
    return out.join("\n");
  }

  window.MD = { render, inline, esc };
})();
