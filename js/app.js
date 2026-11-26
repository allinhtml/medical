
(function(){
  if (!BOOK) return;
  var $ = function(id){ return document.getElementById(id); };
  var article = $('article');
  var toc = $('toc');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var chaptersByNum = {};
  BOOK.chapters.forEach(function(c){ chaptersByNum[c.num] = c; });
  var partsByKey = {};
  BOOK.parts.forEach(function(p){ partsByKey[p.key] = p; });
  /* Reading order: parts in order, chapters in each part's own order */
  var readingOrder = [];
  BOOK.parts.forEach(function(p){ p.chapters.forEach(function(n){ readingOrder.push(n); }); });
  var REF_VIEWS = [
    { id:'numbers',  badge:'Ref',  title:'Example numbers — an example patient', page:90 },
    { id:'glossary', badge:'Ref',  title:'Glossary — all 110 terms', page:90 },
    { id:'icu',      badge:'ICU',  title:'ICU words — quick glossary', page:88 },
    { id:'learn3d',  badge:'3D',   title:'Learn in 3D — free 3D sites', page:95 },
    { id:'appendix', badge:'Appx', title:'Appendix — Questions along the way', page:96 }
  ];

  /* ---------- text formatting (book markdown: **bold**, *italic*, URLs) ---------- */
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmt(s){
    var t = esc(s);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/(https?:\/\/[^\s<]+)/g, function(u){
      var trail = '';
      while (/[.,;:!?)]$/.test(u)) { trail = u.slice(-1) + trail; u = u.slice(0, -1); }
      return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>' + trail;
    });
    return t;
  }
  function stripFmt(s){
    return String(s == null ? '' : s).replace(/\*\*/g,'').replace(/\*/g,'');
  }
  function highlight(html, q){
    if (!q) return html;
    var needle = q.trim().toLowerCase();
    if (needle.length < 2) return html;
    var parts = html.split(/(<[^>]+>)/g);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].charAt(0) === '<') continue;
      var low = parts[i].toLowerCase(), out = '', idx = 0, at;
      while ((at = low.indexOf(needle, idx)) !== -1) {
        out += parts[i].slice(idx, at) + '<mark>' + parts[i].slice(at, at + needle.length) + '</mark>';
        idx = at + needle.length;
      }
      parts[i] = out + parts[i].slice(idx);
    }
    return parts.join('');
  }
  function snippet(text, q){
    var plain = stripFmt(text);
    var at = plain.toLowerCase().indexOf(q.toLowerCase());
    if (at === -1) return plain.slice(0, 130) + (plain.length > 130 ? '…' : '');
    var start = Math.max(0, at - 55), end = Math.min(plain.length, at + q.length + 75);
    return (start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
  }

  /* ---------- state + routing ---------- */
  var state = { view:'home', chapter:null, part:null, highlight:'' };
  function setHash(h){
    try { history.replaceState(null, '', h); } catch (e) {}
  }
  function scrollToReader(){
    var r = $('read');
    if (r && r.scrollIntoView) r.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block:'start' });
  }
  /* Landing = chapter index only; the reader appears when a chapter is opened. */
  function showReader(){
    var ix = $('chapters'), rs = $('read'), ex = $('explore3d');
    if (ix) ix.hidden = true;
    if (ex) ex.hidden = true;
    if (rs) rs.hidden = false;
  }
  function show3D(target){
    var ix = $('chapters'), rs = $('read'), ex = $('explore3d');
    if (!ex) return;
    if (ix) ix.hidden = true;
    if (rs) rs.hidden = true;
    ex.hidden = false;
    state.view = 'explore3d'; state.chapter = null; state.part = null; state.highlight = '';
    setHash('#explore3d');
    window.scrollTo({ top:0, behavior: reduceMotion ? 'auto' : 'smooth' });
    if (target) {
      setTimeout(function(){
        var card = document.getElementById('d3-' + target);
        if (card) {
          card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block:'start' });
          card.classList.add('flash');
          setTimeout(function(){ card.classList.remove('flash'); }, 2600);
        }
      }, 80);
    }
  }
  window.__show3D = show3D;
  function showIndex(scroll){
    var ix = $('chapters'), rs = $('read'), ex = $('explore3d');
    if (rs) rs.hidden = true;
    if (ex) ex.hidden = true;
    if (ix) ix.hidden = false;
    state.view = 'home'; state.chapter = null; state.part = null; state.highlight = '';
    if (scroll) {
      setHash('#chapters');
      window.scrollTo({ top:0, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  /* ---------- TOC ---------- */
  function buildToc(){
    var html = '<input class="toc-filter" id="tocFilter" type="search" placeholder="Filter contents…" aria-label="Filter contents">';
    BOOK.parts.forEach(function(p, pi){
      html += '<div class="toc-part" data-toc-part="' + p.key + '">';
      html += '<button class="toc-part-head" type="button" data-toc-part-head="' + p.key + '">'
            + '<span>Part ' + (pi + 1) + ' — ' + esc(p.title.replace(/^Part \d+ — /, '')) + '</span>'
            + '<span class="toc-caret" aria-hidden="true">▾</span></button>';
      html += '<div class="toc-chapters">';
      p.chapters.forEach(function(n){
        var c = chaptersByNum[n];
        html += '<button class="toc-ch" type="button" data-toc-ch="' + n + '"><span class="n">' + n + '</span><span>' + esc(c.title) + '</span></button>';
      });
      if (p.key === 'part7') {
        html += '<button class="toc-ch" type="button" data-toc-view="icu"><span class="n">ICU</span><span>ICU words — quick glossary</span></button>';
      }
      if (p.key === 'part8') {
        html += '<button class="toc-ch" type="button" data-toc-view="numbers"><span class="n">Ref</span><span>Example numbers</span></button>';
        html += '<button class="toc-ch" type="button" data-toc-view="glossary"><span class="n">Ref</span><span>Glossary — 110 terms</span></button>';
        html += '<button class="toc-ch" type="button" data-toc-view="learn3d"><span class="n">3D</span><span>Learn in 3D</span></button>';
        html += '<button class="toc-ch" type="button" data-toc-view="appendix"><span class="n">Appx</span><span>Appendix — Questions along the way</span></button>';
      }
      html += '</div></div>';
    });
    html += '<p class="toc-empty" id="tocEmpty">No chapter matches that filter.</p>';
    toc.innerHTML = html;

    toc.addEventListener('click', function(e){
      var head = e.target.closest('[data-toc-part-head]');
      if (head) {
        var wrap = head.closest('.toc-part');
        if (wrap) wrap.classList.toggle('collapsed');
        return;
      }
      var chBtn = e.target.closest('[data-toc-ch]');
      if (chBtn) { openChapter(parseInt(chBtn.getAttribute('data-toc-ch'), 10), { scroll:true }); return; }
      var vBtn = e.target.closest('[data-toc-view]');
      if (vBtn) { openView(vBtn.getAttribute('data-toc-view'), { scroll:true }); }
    });
    var filter = $('tocFilter');
    filter.addEventListener('input', function(){
      var q = filter.value.trim().toLowerCase();
      var anyVisible = false;
      toc.querySelectorAll('.toc-part').forEach(function(wrap){
        var any = false;
        wrap.querySelectorAll('.toc-ch').forEach(function(b){
          var show = !q || b.textContent.toLowerCase().indexOf(q) !== -1;
          b.style.display = show ? '' : 'none';
          if (show) any = true;
        });
        wrap.style.display = any ? '' : 'none';
        if (any) { anyVisible = true; wrap.classList.remove('collapsed'); }
      });
      var empty = $('tocEmpty');
      if (empty) empty.classList.toggle('show', !anyVisible);
    });
    var toggle = $('tocToggle');
    if (toggle) {
      toggle.addEventListener('click', function(){
        var grid = $('readerGrid');
        if (!grid) return;
        var hidden = grid.classList.toggle('no-toc');
        toggle.setAttribute('aria-expanded', String(!hidden));
      });
    }
  }
  function syncToc(){
    toc.querySelectorAll('.toc-ch').forEach(function(b){
      var on = false;
      if (state.view === 'chapter' && b.getAttribute('data-toc-ch')) on = parseInt(b.getAttribute('data-toc-ch'), 10) === state.chapter;
      if (state.view !== 'chapter' && b.getAttribute('data-toc-view')) on = b.getAttribute('data-toc-view') === state.view;
      b.classList.toggle('active', on);
      if (on) {
        var wrap = b.closest('.toc-part');
        if (wrap) wrap.classList.remove('collapsed');
      }
    });
  }
  function closeTocMobile(){
    if (window.innerWidth <= 900) {
      var grid = $('readerGrid');
      if (grid) grid.classList.add('no-toc');
      var t = $('tocToggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    }
  }

  /* ---------- shared render helpers ---------- */
  function tableHtml(spec){
    var h = '<div class="table-wrap"><table class="data"><thead><tr>';
    spec.headers.forEach(function(x){ h += '<th>' + fmt(x) + '</th>'; });
    h += '</tr></thead><tbody>';
    spec.rows.forEach(function(r){
      h += '<tr>';
      r.forEach(function(x){ h += '<td>' + fmt(x) + '</td>'; });
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function figureHtml(im, alt){
    return '<figure class="ch-fig"><img src="' + im.src + '" width="' + im.w + '" height="' + im.h
      + '" alt="' + esc(alt) + '" loading="lazy"><figcaption>' + fmt(im.caption) + '</figcaption></figure>';
  }
  function inBookBtn(page, label){
    return '';
  }

  /* ---------- views ---------- */
  function renderHome(){
    var h = '<h2 class="ch-title">Welcome — where do you want to start?</h2>';
    h += '<p class="body">This is the full book as a website: <strong>44 chapters</strong>, written in plain language from the daily Medical 101 lessons. Read a chapter here, or search the whole book from the box above.</p>';
    h += '<h3 class="sec">Reference pages</h3><div class="ref-cards">';
    h += '<button class="ref-card" type="button" data-open-view="numbers" style="text-align:left;font:inherit;cursor:pointer"><strong>Example numbers</strong><span>An example patient\'s labs — total 212 · LDL 130 · HDL 50 · TG 150 — with what each one means.</span></button>';
    h += '<button class="ref-card" type="button" data-open-view="glossary" style="text-align:left;font:inherit;cursor:pointer"><strong>Glossary — 110 terms</strong><span>Every medical word in the book, in plain language. Searchable.</span></button>';
    h += '<button class="ref-card" type="button" data-open-view="icu" style="text-align:left;font:inherit;cursor:pointer"><strong>ICU words</strong><span>Monitors, ventilator, lines &amp; tubes, ECMO — the quick glossary for hospital days.</span></button>';
    h += '<button class="ref-card" type="button" data-open-view="learn3d" style="text-align:left;font:inherit;cursor:pointer"><strong>Learn in 3D</strong><span>Free sites for seeing the heart, arteries and anatomy in three dimensions.</span></button>';
    h += '</div>';
    h += '<div class="ch-foot"><button class="ch-nav-btn next" type="button" data-open-chapter="1"><span class="dir">Start reading →</span><span class="t">Chapter 1 — How the body is built</span></button></div>';
    return h;
  }

  function renderPart(key){
    var p = partsByKey[key];
    if (!p) return renderHome();
    var pi = BOOK.parts.indexOf(p);
    var h = '';
    h += '<h2 class="ch-title">' + esc(p.title.replace(/^Part \d+ — /, '')) + '</h2>';
    (p.intro || []).forEach(function(t){ h += '<p class="body">' + fmt(t) + '</p>'; });
    if (p.chapters.length) {
      h += '<ul class="part-ch-list">';
      p.chapters.forEach(function(n){
        var c = chaptersByNum[n];
        h += '<li><button type="button" data-open-chapter="' + n + '"><span class="ch-badge">Ch ' + n + '</span><span class="ch-title-cell">' + esc(c.title) + '</span><span class="ch-arrow" aria-hidden="true">→</span></button></li>';
      });
      h += '</ul>';
    }
    if (key === 'part7') {
      h += '<h3 class="sec">Ready now</h3><p class="body">The ICU chapters themselves arrive with Lessons 56–61 of the daily series. The quick glossary is already in the book:</p>';
      h += '<div class="ref-cards"><button class="ref-card" type="button" data-open-view="icu" style="text-align:left;font:inherit;cursor:pointer"><strong>ICU words — quick glossary</strong><span>Monitors, ventilator, lines &amp; tubes, ECMO and more, in plain words.</span></button></div>';
    }
    if (key === 'part8') {
      h += '<h3 class="sec">The reference pages</h3><div class="ref-cards">';
      h += '<button class="ref-card" type="button" data-open-view="numbers" style="text-align:left;font:inherit;cursor:pointer"><strong>Example numbers</strong><span>An example patient\'s labs, with what each one means.</span></button>';
      h += '<button class="ref-card" type="button" data-open-view="glossary" style="text-align:left;font:inherit;cursor:pointer"><strong>Glossary — 110 terms</strong><span>All the book\u2019s words in one place.</span></button>';
      h += '<button class="ref-card" type="button" data-open-view="learn3d" style="text-align:left;font:inherit;cursor:pointer"><strong>Learn in 3D</strong><span>Free 3D anatomy sites.</span></button>';
      h += '<button class="ref-card" type="button" data-open-view="appendix" style="text-align:left;font:inherit;cursor:pointer"><strong>Appendix</strong><span>Questions along the way, answered.</span></button>';
      h += '</div>';
    }
    if (p.roadmap && p.roadmap.length) {
      h += '<div class="roadmap-box"><h3>Still to come in this part</h3><ul>';
      p.roadmap.forEach(function(r){
        h += '<li><strong>Lesson ' + r[0] + '</strong> — ' + fmt(r[1]) + '</li>';
      });
      h += '</ul><p class="body" style="margin:8px 0 0;font-size:13.5px;color:var(--muted)">These arrive as daily 2 PM lessons and join the book — and this site — as the series reaches them.</p></div>';
    }
    h += '<div class="ch-foot">' + inBookBtn(p.page, 'Part ' + (pi + 1) + ' in the printed book — page ' + p.page) + '</div>';
    return h;
  }

  function renderChapter(num){
    var c = chaptersByNum[num];
    if (!c) return renderHome();
    var p = partsByKey[c.part];
    var pi = BOOK.parts.indexOf(p);
    var idx = readingOrder.indexOf(num);
    var prev = idx > 0 ? chaptersByNum[readingOrder[idx - 1]] : null;
    var next = idx >= 0 && idx < readingOrder.length - 1 ? chaptersByNum[readingOrder[idx + 1]] : null;
    var h = '<h2 class="ch-title" id="sec-top" data-rail="Overview">Chapter ' + num + ' — ' + esc(c.title) + '</h2>';
    h += '<p class="ch-meta">';
    if (c.orig) h += '<span class="tag">Lesson ' + c.orig + '</span>';
    if (c.date) h += '<span>' + esc(c.date) + '</span>';
    h += '<span>≈ ' + Math.max(1, Math.round(chapterText(c).split(/\s+/).length / 180)) + ' min read</span>';
    h += '</p>';
    if (c.oneline) {
      h += '<div class="oneline" id="sec-oneline" data-rail="In one line"><span class="ol-label">In one line</span><p>' + fmt(c.oneline) + '</p></div>';
    }
    var D3MAP = {
      39:{ t:'artery',   x:'This chapter is the artery wall itself — spin it in 3D, grow the plaque stage by stage, and flip to the cross-section to see the intima, media and adventitia.' },
      40:{ t:'artery',   x:'See what plaque actually is, in 3D: LDL stuck under the lining, foam cells, and the soft lipid core hiding inside the wall.' },
      41:{ t:'artery',   x:'Drag the stage slider in the 3D artery explorer from a fatty streak to a vulnerable plaque and watch the channel narrow.' },
      42:{ t:'rupture',  x:'Watch this chapter happen: the cap thins, tears, a clot forms and the flow chokes off — step by step, in 3D.' },
      43:{ t:'artery',   x:'In the 3D artery explorer, run the stage slider backwards — that shrinking, stabilising plaque is what this chapter describes.' },
      11:{ t:'liver',    x:'Meet this organ in 3D: where cholesterol is made, the HMG-CoA reductase step, and how VLDL particles get packed and shipped out.' },
      20:{ t:'pathway',  x:'Follow the carriers in 3D: VLDL leaves the liver, shrinks to IDL then LDL, while HDL makes the return trip.' },
      21:{ t:'pathway',  x:'An example patient\'s numbers, on the move: the 3D pathway journey is built with LDL 130, HDL 50 and triglycerides 150.' },
      25:{ t:'liver',    x:'See exactly where the statin acts: the 3D liver model slows its cholesterol factory when you tap “Take the statin”.' }
    };
    if (D3MAP[num]) {
      h += '<div class="see3d"><p><strong>See it in 3D.</strong> ' + D3MAP[num].x + '</p><a href="#explore3d" data-goto-3d="' + D3MAP[num].t + '">Open the 3D model →</a></div>';
    }
    if (c.images.length) h += figureHtml(c.images[0], c.title + ' — diagram 1');
    if (c.basics.length) {
      h += '<h3 class="sec" id="sec-basics" data-rail="The basics">The basics</h3><ul class="basics">';
      c.basics.forEach(function(b){ h += '<li>' + fmt(b) + '</li>'; });
      h += '</ul>';
    }
    if (c.glance) { h += '<h3 class="sec" id="sec-glance" data-rail="At a glance">At a glance</h3>' + tableHtml(c.glance); }
    if (c.explainer) {
      h += '<h3 class="sec" id="sec-explainer" data-rail="' + esc(c.explainer.title) + '">' + esc(c.explainer.title) + '</h3><ul class="basics">';
      (c.explainer.bullets || []).forEach(function(b){ h += '<li>' + fmt(b) + '</li>'; });
      h += '</ul>';
      if (c.explainer.table) h += tableHtml(c.explainer.table);
    }
    if (c.why) { h += '<h3 class="sec" id="sec-why" data-rail="Why it matters">Why it matters</h3><p class="body">' + fmt(c.why) + '</p>'; }
    if (c.extra) { h += '<p class="body">' + fmt(c.extra) + '</p>'; }
    if (c.remember && c.remember.length) {
      h += '<div class="remember" id="sec-remember" data-rail="Remember"><h3>Remember</h3><ul>';
      c.remember.forEach(function(r){ h += '<li>' + fmt(r) + '</li>'; });
      h += '</ul></div>';
    }
    if (c.images.length > 1) {
      h += '<h3 class="sec" id="sec-diagrams" data-rail="Diagrams">Diagrams</h3>';
      for (var i = 1; i < c.images.length; i++) h += figureHtml(c.images[i], c.title + ' — diagram ' + (i + 1));
    }
    if (c.reading && c.reading.length) {
      h += '<h3 class="sec" id="sec-reading" data-rail="Read &amp; watch">Read &amp; watch</h3><ul class="reading-list">';
      c.reading.forEach(function(line){
        var m = String(line).match(/(https?:\/\/[^\s]+)/);
        if (m) {
          var label = stripFmt(String(line).slice(0, m.index)).replace(/[\s—–-]+$/, '');
          h += '<li><a href="' + m[1] + '" target="_blank" rel="noopener">' + esc(label || m[1]) + '</a></li>';
        } else {
          h += '<li>' + fmt(line) + '</li>';
        }
      });
      h += '</ul>';
    }
    h += '<div class="ch-foot">';
    if (prev) h += '<button class="ch-nav-btn" type="button" data-open-chapter="' + prev.num + '"><span class="dir">← Previous chapter</span><span class="t">Ch ' + prev.num + ' — ' + esc(prev.title) + '</span></button>';
    else h += '<button class="ch-nav-btn disabled" type="button"><span class="dir">← Previous chapter</span><span class="t">Start of the book</span></button>';
    if (next) h += '<button class="ch-nav-btn next" type="button" data-open-chapter="' + next.num + '"><span class="dir">Next chapter →</span><span class="t">Ch ' + next.num + ' — ' + esc(next.title) + '</span></button>';
    else h += '<button class="ch-nav-btn next disabled" type="button"><span class="dir">Next chapter →</span><span class="t">End of the book — for now</span></button>';
    h += '</div>';
    h += '<div style="margin-top:14px">' + inBookBtn(c.page) + '</div>';
    if (state.highlight) h = highlight(h, state.highlight);
    return h;
  }

  function renderNumbers(){
    var n = BOOK.numbers;
    var h = '<h2 class="ch-title" id="sec-top" data-rail="Example numbers">Example numbers</h2>';
    (n.intro || []).forEach(function(t){ h += '<p class="body">' + fmt(t) + '</p>'; });
    h += tableHtml(n.table);
    if (n.notes && n.notes.length) {
      h += '<h3 class="sec" id="sec-notes" data-rail="Notes">Notes</h3><ul class="basics">';
      n.notes.forEach(function(t){ h += '<li>' + fmt(t) + '</li>'; });
      h += '</ul>';
    }
    h += '<div style="margin-top:14px">' + inBookBtn(90, 'Your numbers in the printed book — page 90') + '</div>';
    if (state.highlight) h = highlight(h, state.highlight);
    return h;
  }

  function renderGlossary(){
    var h = '<h2 class="ch-title">Glossary — all 110 terms</h2>';
    h += '<p class="body">Every medical word in the book, in plain language. Type to filter — or use the book search above, which looks here too.</p>';
    h += '<div class="gloss-tools"><input id="glossFilter" type="search" placeholder="Filter terms — e.g. plaque, statin, systolic…" aria-label="Filter glossary terms"><span class="gloss-count" id="glossCount">' + BOOK.glossary.length + ' terms</span></div>';
    h += '<dl class="gloss-grid" id="glossGrid">';
    BOOK.glossary.forEach(function(g){
      h += '<div class="gloss-item" data-term="' + esc((g[0] + ' ' + g[1]).toLowerCase()) + '"><dt>' + fmt(g[0]) + '</dt><dd>' + fmt(g[1]) + '</dd></div>';
    });
    h += '</dl>';
    h += '<div style="margin-top:14px">' + inBookBtn(90, 'Glossary in the printed book — page 90') + '</div>';
    return h;
  }
  function wireGlossary(){
    var input = $('glossFilter');
    if (!input) return;
    input.addEventListener('input', function(){
      var q = input.value.trim().toLowerCase();
      var visible = 0;
      document.querySelectorAll('.gloss-item').forEach(function(it){
        var show = !q || it.getAttribute('data-term').indexOf(q) !== -1;
        it.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      var cnt = $('glossCount');
      if (cnt) cnt.textContent = visible + (visible === 1 ? ' term' : ' terms');
    });
    if (state.highlight) input.value = state.highlight;
    if (state.highlight) input.dispatchEvent(new Event('input'));
  }

  function renderIcu(){
    var h = '<h2 class="ch-title" id="sec-top" data-rail="Overview">ICU words — quick glossary</h2>';
    h += '<p class="body">The words you hear around an intensive care bed, in plain language — written for family days in hospital.</p>';
    BOOK.icu.forEach(function(t, ti){
      h += '<h3 class="sec" id="sec-icu-' + ti + '" data-rail="' + esc(t.title) + '">' + esc(t.title) + '</h3>';
      h += '<div class="table-wrap"><table class="data"><tbody>';
      t.rows.forEach(function(r){ h += '<tr><td style="white-space:nowrap">' + fmt(r[0]) + '</td><td>' + fmt(r[1]) + '</td></tr>'; });
      h += '</tbody></table></div>';
    });
    h += '<div style="margin-top:14px">' + inBookBtn(88, 'ICU glossary in the printed book — page 88') + '</div>';
    if (state.highlight) h = highlight(h, state.highlight);
    return h;
  }

  function renderLearn3d(){
    var h = '<h2 class="ch-title">Learn in 3D</h2>';
    h += '<p class="body">Free sites for seeing anatomy in three dimensions — spin the heart, follow a red blood cell, open a plaque in cross-section. Each chapter\u2019s “Explore in 3D” pick came from this list.</p>';
    h += '<div class="ref-cards">';
    BOOK.learn3d.forEach(function(x){
      h += '<a class="ref-card" href="' + esc(x[1]) + '" target="_blank" rel="noopener"><strong>' + esc(x[0]) + ' ↗</strong><span>' + fmt(x[2]) + '</span></a>';
    });
    h += '</div>';
    h += '<div style="margin-top:14px">' + inBookBtn(95, 'Learn in 3D in the printed book — page 95') + '</div>';
    return h;
  }

  function renderAppendix(){
    var h = '<h2 class="ch-title">Appendix — Questions along the way</h2>';
    h += '<p class="body">Questions that came up while learning, with the answers that earned a place in the book.</p>';
    BOOK.appendix.forEach(function(a){
      h += '<div class="appx-sec"><h3>' + esc(a.title) + '</h3>';
      if (a.date) h += '<p class="appx-date">' + esc(a.date) + '</p>';
      h += '<ul class="basics">';
      (a.bullets || []).forEach(function(b){ h += '<li>' + fmt(b) + '</li>'; });
      h += '</ul></div>';
    });
    h += '<div style="margin-top:14px">' + inBookBtn(96, 'Appendix in the printed book — page 96') + '</div>';
    if (state.highlight) h = highlight(h, state.highlight);
    return h;
  }

  /* ---------- open / navigate ---------- */
  function render(){
    var html;
    if (state.view === 'chapter') html = renderChapter(state.chapter);
    else if (state.view === 'part') html = renderPart(state.part);
    else if (state.view === 'numbers') html = renderNumbers();
    else if (state.view === 'glossary') html = renderGlossary();
    else if (state.view === 'icu') html = renderIcu();
    else if (state.view === 'learn3d') html = renderLearn3d();
    else if (state.view === 'appendix') html = renderAppendix();
    else html = renderHome();
    article.innerHTML = html;
    if (state.view === 'glossary') wireGlossary();
    syncToc();
    renderCrumbs();
    buildRail();
    updateReadProgress();
  }
  function openChapter(num, opts){
    opts = opts || {};
    if (!chaptersByNum[num]) return;
    showReader();
    state.view = 'chapter'; state.chapter = num; state.part = null;
    state.highlight = opts.highlight || '';
    setHash('#chapter-' + num);
    render(); closeTocMobile();
    if (opts.scroll) scrollToReader();
    scrollArticleTop();
  }
  function openPart(key, opts){
    opts = opts || {};
    showReader();
    state.view = 'part'; state.part = key; state.chapter = null; state.highlight = '';
    setHash('#part-' + key);
    render(); closeTocMobile();
    if (opts.scroll) scrollToReader();
    scrollArticleTop();
  }
  function openView(id, opts){
    opts = opts || {};
    showReader();
    state.view = id; state.chapter = null; state.part = null;
    state.highlight = opts.highlight || '';
    setHash('#' + id);
    render(); closeTocMobile();
    if (opts.scroll) scrollToReader();
    scrollArticleTop();
  }
  function openHome(opts){
    showIndex(!!(opts && opts.scroll));
  }
  function scrollArticleTop(){
    var y = article.getBoundingClientRect().top + window.scrollY - 84;
    if (Math.abs(window.scrollY - y) > 4) window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* Delegated clicks for in-article + static page controls */
  document.addEventListener('click', function(e){
    var chEl = e.target.closest('[data-open-chapter]');
    if (chEl) { e.preventDefault(); openChapter(parseInt(chEl.getAttribute('data-open-chapter'), 10), { scroll:true }); return; }
    var pEl = e.target.closest('[data-open-part]');
    if (pEl) { e.preventDefault(); openPart(pEl.getAttribute('data-open-part'), { scroll:true }); return; }
    var vEl = e.target.closest('[data-open-view]');
    if (vEl) { e.preventDefault(); openView(vEl.getAttribute('data-open-view'), { scroll:true }); return; }
    var d3Open = e.target.closest('[data-open-3d]');
    if (d3Open) { e.preventDefault(); show3D(); return; }
    var d3Go = e.target.closest('[data-goto-3d]');
    if (d3Go) { e.preventDefault(); show3D(d3Go.getAttribute('data-goto-3d')); return; }
  });

  /* Reading progress for the article */
  function updateReadProgress(){
    var fill = $('readProgressFill');
    if (!fill || !article) return;
    var rect = article.getBoundingClientRect();
    var total = article.offsetHeight - window.innerHeight + 120;
    var done = Math.min(1, Math.max(0, -rect.top + 84) / Math.max(1, total));
    fill.style.width = (done * 100) + '%';
  }
  window.addEventListener('scroll', updateReadProgress, { passive:true });

  /* ---------- breadcrumbs ---------- */
  var REF_TITLES = { numbers:'Example numbers', glossary:'Glossary — all 110 terms', icu:'ICU words — quick glossary', learn3d:'Learn in 3D', appendix:'Appendix — Questions along the way' };
  var REF_PART = { numbers:'part8', glossary:'part8', icu:'part7', learn3d:'part8', appendix:'part8' };
  function partLabel(p){ return 'Part ' + (BOOK.parts.indexOf(p) + 1) + ' — ' + p.title.replace(/^Part \d+ — /, ''); }
  function renderCrumbs(){
    var nav = $('crumbs');
    if (!nav) return;
    var sep = '<span class="crumb-sep" aria-hidden="true">›</span>';
    var home = '<a class="crumb-link" href="#chapters">All chapters</a>';
    var h, title = 'Medical 101';
    if (state.view === 'chapter' && chaptersByNum[state.chapter]) {
      var c = chaptersByNum[state.chapter], p = partsByKey[c.part];
      h = home + sep
        + '<button class="crumb-link" type="button" data-open-part="' + p.key + '">' + esc(partLabel(p)) + '</button>' + sep
        + '<span class="crumb-current" aria-current="page">Chapter ' + c.num + ' — ' + esc(c.title) + '</span>';
      title = 'Chapter ' + c.num + ' · ' + c.title + ' — Medical 101';
    } else if (state.view === 'part' && partsByKey[state.part]) {
      var pp = partsByKey[state.part];
      h = home + sep + '<span class="crumb-current" aria-current="page">' + esc(partLabel(pp)) + '</span>';
      title = partLabel(pp) + ' — Medical 101';
    } else if (REF_TITLES[state.view]) {
      var rp = partsByKey[REF_PART[state.view]];
      h = home + sep
        + '<button class="crumb-link" type="button" data-open-part="' + rp.key + '">' + esc(partLabel(rp)) + '</button>' + sep
        + '<span class="crumb-current" aria-current="page">' + esc(REF_TITLES[state.view]) + '</span>';
      title = REF_TITLES[state.view] + ' — Medical 101';
    } else {
      h = home + sep + '<span class="crumb-current" aria-current="page">Start here</span>';
    }
    nav.innerHTML = h;
    document.title = title;
  }

  /* ---------- right rail: on-this-page index ---------- */
  var railAnchors = [];
  var railCurrent = null;
  function buildRail(){
    var rail = $('rail');
    if (!rail) return;
    railAnchors = [];
    railCurrent = null;
    var title = 'On this page', h = '';
    var anchorMode = (state.view === 'chapter' || state.view === 'icu' || state.view === 'numbers');
    if (anchorMode) {
      article.querySelectorAll('[data-rail]').forEach(function(s){
        if (s.id) railAnchors.push({ id:s.id, label:s.getAttribute('data-rail') });
      });
      if (railAnchors.length) {
        h = railAnchors.map(function(a){
          return '<button class="rail-link" type="button" data-rail-go="' + a.id + '">' + esc(a.label) + '</button>';
        }).join('');
        if (state.view === 'chapter') h += '<p class="rail-note">Tip: press the ← and → keys to move between chapters.</p>';
      }
    }
    if (!h) {
      if (state.view === 'part' && partsByKey[state.part]) {
        title = 'In this part';
        h = partsByKey[state.part].chapters.map(function(n){
          var c = chaptersByNum[n];
          return '<button class="rail-link" type="button" data-open-chapter="' + n + '"><span class="rn">' + n + '</span><span>' + esc(c.title) + '</span></button>';
        }).join('');
        if (!h && state.part === 'part7') {
          h = '<button class="rail-link" type="button" data-open-view="icu"><span class="rn">ICU</span><span>ICU words — quick glossary</span></button>';
        }
        if (!h && state.part === 'part8') {
          h = REF_VIEWS.filter(function(r){ return r.id !== 'icu'; }).map(function(r){
            return '<button class="rail-link" type="button" data-open-view="' + r.id + '"><span class="rn">' + esc(r.badge) + '</span><span>' + esc(r.title) + '</span></button>';
          }).join('');
        }
      } else if (state.view === 'home') {
        title = 'The 8 parts';
        h = BOOK.parts.map(function(p, pi){
          return '<button class="rail-link" type="button" data-open-part="' + p.key + '"><span class="rn">' + (pi + 1) + '</span><span>' + esc(p.title.replace(/^Part \d+ — /, '')) + '</span></button>';
        }).join('');
      } else {
        title = 'Reference pages';
        h = REF_VIEWS.map(function(r){
          return '<button class="rail-link' + (state.view === r.id ? ' active' : '') + '" type="button" data-open-view="' + r.id + '"><span class="rn">' + esc(r.badge) + '</span><span>' + esc(r.title) + '</span></button>';
        }).join('');
      }
    }
    rail.innerHTML = '<div class="rail-card"><p class="rail-head">' + esc(title) + '</p><nav class="rail-list" aria-label="' + esc(title) + '">' + h + '</nav></div>';
    updateRailSpy();
  }
  function updateRailSpy(){
    if (!railAnchors.length) return;
    var rail = $('rail');
    var grid = $('readerGrid');
    if (!rail || (grid && grid.classList.contains('no-rail'))) return;
    var current = railAnchors[0].id;
    for (var i = 0; i < railAnchors.length; i++) {
      var el = document.getElementById(railAnchors[i].id);
      if (el && el.getBoundingClientRect().top <= 150) current = railAnchors[i].id;
    }
    if (current === railCurrent) return;
    railCurrent = current;
    rail.querySelectorAll('[data-rail-go]').forEach(function(b){
      var on = b.getAttribute('data-rail-go') === current;
      b.classList.toggle('active', on);
      if (on && b.scrollIntoView) { try { b.scrollIntoView({ block:'nearest' }); } catch (e) {} }
    });
  }
  window.addEventListener('scroll', updateRailSpy, { passive:true });
  var railEl = $('rail');
  if (railEl) {
    railEl.addEventListener('click', function(e){
      var b = e.target.closest('[data-rail-go]');
      if (!b) return;
      var t = document.getElementById(b.getAttribute('data-rail-go'));
      if (t) t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block:'start' });
    });
  }
  var railToggle = $('railToggle');
  if (railToggle) {
    railToggle.addEventListener('click', function(){
      var grid = $('readerGrid');
      if (!grid) return;
      var hidden = grid.classList.toggle('no-rail');
      railToggle.setAttribute('aria-expanded', String(!hidden));
    });
  }

  /* ---------- keyboard chapter navigation ---------- */
  document.addEventListener('keydown', function(e){
    if (state.view !== 'chapter' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    var idx = readingOrder.indexOf(state.chapter);
    if (e.key === 'ArrowRight' && idx >= 0 && idx < readingOrder.length - 1) openChapter(readingOrder[idx + 1], { scroll:true });
    else if (e.key === 'ArrowLeft' && idx > 0) openChapter(readingOrder[idx - 1], { scroll:true });
  });

  /* ---------- back to top ---------- */
  var toTop = $('toTop');
  if (toTop) {
    window.addEventListener('scroll', function(){
      var rs = $('read');
      toTop.hidden = !rs || rs.hidden || window.scrollY < 700;
    }, { passive:true });
    toTop.addEventListener('click', function(){ window.scrollTo({ top:0, behavior: reduceMotion ? 'auto' : 'smooth' }); });
  }

  /* On phones both sidebars start hidden; the Contents / On this page buttons open them. */
  if (window.innerWidth <= 900) {
    var grid0 = $('readerGrid');
    if (grid0) { grid0.classList.add('no-toc'); grid0.classList.add('no-rail'); }
    var tt0 = $('tocToggle'); if (tt0) tt0.setAttribute('aria-expanded', 'false');
    var rt0 = $('railToggle'); if (rt0) rt0.setAttribute('aria-expanded', 'false');
  }

  /* ---------- full-text search ---------- */
  var searchInput = $('bookSearch');
  var searchResults = $('searchResults');
  function chapterText(c){
    var bits = [c.title, c.oneline || '', c.why || '', c.extra || ''];
    bits = bits.concat(c.basics, c.remember, c.reading);
    if (c.explainer) { bits.push(c.explainer.title); bits = bits.concat(c.explainer.bullets || []); }
    return stripFmt(bits.join(' '));
  }
  var searchIndex = BOOK.chapters.map(function(c){ return { num:c.num, title:c.title, text:chapterText(c) }; });
  function runSearch(q){
    q = q.trim().toLowerCase();
    if (q.length < 2) { searchResults.hidden = true; searchResults.innerHTML = ''; return; }
    var hits = [];
    searchIndex.forEach(function(entry){
      var inTitle = entry.title.toLowerCase().indexOf(q) !== -1;
      var at = entry.text.toLowerCase().indexOf(q);
      if (inTitle || at !== -1) hits.push({ kind:'chapter', num:entry.num, title:entry.title, snip: snippet(at !== -1 ? entry.text : entry.title, q), rank: inTitle ? 0 : 1 });
    });
    BOOK.glossary.forEach(function(g){
      if ((g[0] + ' ' + g[1]).toLowerCase().indexOf(q) !== -1) {
        hits.push({ kind:'glossary', title:g[0], snip: snippet(g[1], q), rank:2 });
      }
    });
    var ynText = stripFmt((BOOK.numbers.intro || []).join(' ') + ' ' + (BOOK.numbers.notes || []).join(' '));
    if (ynText.toLowerCase().indexOf(q) !== -1 || q === 'numbers' || q === 'labs') {
      hits.push({ kind:'numbers', title:'Example numbers', snip: snippet(ynText, q), rank:2 });
    }
    hits.sort(function(a, b){ return a.rank - b.rank; });
    hits = hits.slice(0, 12);
    if (!hits.length) {
      searchResults.innerHTML = '<p class="sr-none">Nothing in the book matches “' + esc(q) + '”. Try a shorter word.</p>';
      searchResults.hidden = false;
      return;
    }
    searchResults.innerHTML = hits.map(function(hit, i){
      var kind = hit.kind === 'chapter' ? 'Chapter ' + hit.num : (hit.kind === 'glossary' ? 'Glossary' : 'Reference');
      return '<button type="button" data-hit="' + i + '"><span class="sr-kind">' + kind + '</span>'
        + '<span class="sr-title">' + esc(hit.title) + '</span>'
        + '<span class="sr-snip">' + esc(hit.snip) + '</span></button>';
    }).join('');
    searchResults.hidden = false;
    searchResults.querySelectorAll('[data-hit]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var hit = hits[parseInt(btn.getAttribute('data-hit'), 10)];
        searchResults.hidden = true;
        if (hit.kind === 'chapter') openChapter(hit.num, { scroll:true, highlight:q });
        else if (hit.kind === 'glossary') openView('glossary', { scroll:true, highlight:q });
        else openView('numbers', { scroll:true, highlight:q });
      });
    });
  }
  if (searchInput) {
    var searchTimer = null;
    searchInput.addEventListener('input', function(){
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function(){ runSearch(searchInput.value); }, 140);
    });
    searchInput.addEventListener('focus', function(){ if (searchInput.value.trim().length >= 2) runSearch(searchInput.value); });
    document.addEventListener('click', function(e){
      if (!searchResults.hidden && !e.target.closest('.search-box')) searchResults.hidden = true;
    });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') searchResults.hidden = true; });
  }

  /* ---------- chapter index section ---------- */
  function buildIndex(){
    var body = $('indexBody');
    if (!body) return;
    var html = '';
    BOOK.parts.forEach(function(p, pi){
      if (!p.chapters.length && p.key !== 'part7' && p.key !== 'part8') return;
      html += '<div class="index-group" data-group><div class="index-group-head"><h3><span class="pnum">Part ' + (pi + 1) + '</span>' + esc(p.title.replace(/^Part \d+ — /, '')) + '</h3></div><ul class="ch-list">';
      p.chapters.forEach(function(n){
        var c = chaptersByNum[n];
        html += '<li class="ch-row" data-search="' + esc(('chapter ' + n + ' ' + c.title + ' ' + (c.oneline || '')).toLowerCase()) + '">'
          + '<button class="ch-link" type="button" data-open-chapter="' + n + '"><span class="ch-badge">Ch ' + n + '</span>'
          + '<span class="ch-title-cell">' + esc(c.title) + '</span><span class="ch-arrow" aria-hidden="true">→</span></button></li>';
      });
      if (p.key === 'part7') {
        html += '<li class="ch-row" data-search="icu words quick glossary intensive care monitors ventilator lines tubes ecmo"><button class="ch-link" type="button" data-open-view="icu"><span class="ch-badge ref">ICU</span><span class="ch-title-cell">ICU words — quick glossary (monitors, ventilator, lines &amp; tubes, ECMO)</span><span class="ch-arrow" aria-hidden="true">→</span></button></li>';
      }
      if (p.key === 'part8') {
        REF_VIEWS.forEach(function(r){
          if (r.id === 'icu') return;
          html += '<li class="ch-row" data-search="' + esc(r.title.toLowerCase()) + '"><button class="ch-link" type="button" data-open-view="' + r.id + '"><span class="ch-badge ref">' + r.badge + '</span><span class="ch-title-cell">' + esc(r.title) + '</span><span class="ch-arrow" aria-hidden="true">→</span></button></li>';
        });
      }
      html += '</ul></div>';
    });
    body.innerHTML = html;

    var input = $('chapterSearch');
    var count = $('indexCount');
    var empty = $('indexEmpty');
    if (input) {
      var rows = body.querySelectorAll('.ch-row');
      var groups = body.querySelectorAll('[data-group]');
      input.addEventListener('input', function(){
        var q = input.value.trim().toLowerCase();
        var visible = 0;
        rows.forEach(function(r){
          var hay = (r.getAttribute('data-search') || '') + ' ' + r.textContent.toLowerCase();
          var show = !q || hay.indexOf(q) !== -1;
          r.style.display = show ? '' : 'none';
          if (show) visible++;
        });
        groups.forEach(function(g){
          var any = false;
          g.querySelectorAll('.ch-row').forEach(function(r){ if (r.style.display !== 'none') any = true; });
          g.style.display = any ? '' : 'none';
        });
        if (count) count.textContent = q ? (visible + (visible === 1 ? ' match' : ' matches')) : '44 chapters · 5 reference pages';
        if (empty) empty.classList.toggle('show', visible === 0);
      });
    }
  }

  /* ---------- init + hash routing ---------- */
  buildToc();
  buildIndex();
  function routeFromHash(scroll){
    var h = (window.location.hash || '').toLowerCase();
    var m = h.match(/#chapter-(\d+)/);
    if (m && chaptersByNum[parseInt(m[1], 10)]) { openChapter(parseInt(m[1], 10), { scroll:scroll }); return true; }
    m = h.match(/#part-(part\d)/);
    if (m && partsByKey[m[1]]) { openPart(m[1], { scroll:scroll }); return true; }
    if (h === '#glossary' || h === '#numbers' || h === '#icu' || h === '#learn3d' || h === '#appendix') {
      openView(h.slice(1), { scroll:scroll }); return true;
    }
    if (h === '#explore3d') { show3D(); return true; }
    return false;
  }
  if (!routeFromHash(false)) showIndex(false);
  var backBtn = $('backToIndex');
  if (backBtn) backBtn.addEventListener('click', function(){ showIndex(true); });
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href="#chapters"]');
    if (a) { e.preventDefault(); showIndex(true); }
  });
  window.addEventListener('hashchange', function(){
    var h = (window.location.hash || '').toLowerCase();
    if (h === '#chapters' || h === '#read' || h === '#top' || h === '') { showIndex(false); return; }
    routeFromHash(true);
  });
  var back3d = $('backFrom3d');
  if (back3d) back3d.addEventListener('click', function(){ showIndex(true); });
  window.__reader = { openChapter: openChapter, openView: openView, openPart: openPart };
})();
