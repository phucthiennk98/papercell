// Sa bàn Kịch bản — giao diện
(function () {
  'use strict';
  const S = window.SaBan;
  const $ = (s, r) => (r || document).querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) e.append(c);
    return e;
  }
  function sv(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; }
  const fmt = (v, d = 2) => (isFinite(v) ? Number(v).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
  const pct = (v, d = 0) => fmt(v * 100, d) + '%';
  const GROUPS = { loc: 'Vị trí & hạ tầng', fin: 'Thị trường (Finance)', beh: 'Hành vi (Behavior)', imp: 'Dữ liệu nhập', der: 'Chỉ tiêu phái sinh' };
  const IDX_INFO = {
    F: { title: 'Chỉ số F · Nền tảng (Finance)', desc: 'Giá trị cơ bản của vị trí: tiếp cận, tiện ích, hoạt động kinh tế, rủi ro.' },
    B: { title: 'Chỉ số B · Hành vi (Behavior)', desc: 'Tín hiệu đầu cơ và bầy đàn: tin đăng tăng vọt, từ khóa "đón đầu", giá rao nhảy.' },
  };
  const LS = 'saban.cfg.v1';

  let ds, cfg, model, det = null, mc = null, sens = null, mcStale = true;
  let lisaCache = {}, selected = -1, layer = 'dom', target = 2, activeTab = 'F';
  let C = {}; // màu đọc từ token

  // ---------- Màu ----------
  const hex2rgb = h => { h = h.trim().replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  function readTokens() {
    const cs = getComputedStyle(document.documentElement), g = k => cs.getPropertyValue(k).trim();
    C.seq = [0, 1, 2, 3, 4, 5, 6].map(i => hex2rgb(g('--seq-' + i)));
    C.seqHex = [0, 1, 2, 3, 4, 5, 6].map(i => g('--seq-' + i));
    C.sc = [0, 1, 2, 3].map(i => g('--sc-' + i));
    C.lisa = ['ns', 'hh', 'll', 'hl', 'lh'].map(k => g('--lisa-' + k));
    C.ink = g('--ink'); C.ink3 = g('--ink-3'); C.surface = g('--surface'); C.surface2 = g('--surface-2');
  }
  function seq(t) {
    t = Math.max(0, Math.min(1, isFinite(t) ? t : 0)) * 6; const i = Math.min(5, Math.floor(t)), f = t - i, a = C.seq[i], b = C.seq[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }

  // ---------- Cấu hình ----------
  function mergeCfg(c) {
    const d = S.defaultConfig();
    for (const p of d.params) if (p.builtin && !c.params.find(q => q.key === p.key)) c.params.unshift(p);
    return c;
  }
  function loadCfg() { try { const s = localStorage.getItem(LS); if (!s) return null; const c = JSON.parse(s); if (c && c.params && c.idx && c.derived) return mergeCfg(c); } catch (e) { } return null; }
  function saveCfg() { if (!ds || !ds.sample) return; try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }
  const param = k => cfg.params.find(p => p.key === k);

  // ---------- Vòng tính toán ----------
  let tDet = 0, tMc = 0, tSens = 0, runId = 0;
  function schedule(structural) {
    if (structural) { model.compileAll(); renderErrors(); renderLayerSelect(); }
    clearTimeout(tDet); tDet = setTimeout(runDet, 30);
  }
  function runDet() {
    det = model.run(); lisaCache = {}; mcStale = true;
    $('#results').classList.add('stale');
    paintAll(); saveCfg();
    clearTimeout(tMc); clearTimeout(tSens);
    const my = ++runId;
    setStatus('Đang mô phỏng…');
    tMc = setTimeout(() => {
      if (my !== runId) return;
      const t0 = performance.now();
      mc = model.monteCarlo(det); mcStale = false;
      $('#results').classList.remove('stale');
      paintAll();
      setStatus(mc.ns + ' mô phỏng · ' + Math.round(performance.now() - t0) + ' ms');
      tSens = setTimeout(() => { if (my !== runId) return; sens = model.sensitivity(target); renderTornado(); }, 60);
    }, 220);
  }
  const setStatus = t => { $('#status').textContent = t; };
  const probOf = (i, k) => (mc && !mcStale ? mc.prob[i * 4 + k] : (det.sc[i] === k ? 1 : 0));
  function dominant(i) { let b = 0, bv = -1; for (let k = 0; k < 4; k++) { const v = probOf(i, k); if (v > bv) { bv = v; b = k; } } return [b, bv]; }

  function paintAll() { paintMap(); renderLegend(); renderSummary(); renderScatter(); renderDetail(); }

  // ---------- Bàn điều khiển ----------
  function renderControls() { renderIndexPane('F'); renderIndexPane('B'); renderParamPane(); renderDerivedPane(); renderErrors(); }

  function indicatorGroups() {
    const g = {}; for (const d of model.allInd()) (g[d.group] = g[d.group] || []).push(d); return g;
  }
  function varChips(target) {
    const box = el('div', { class: 'chips' });
    const add = name => box.append(el('button', { type: 'button', class: 'chip', text: name, onclick: () => insertAt(target, name) }));
    for (const d of model.allInd()) { add(d.key); add(d.key + '_raw'); }
    for (const p of cfg.params) if (!p.builtin) add(p.key);
    return box;
  }
  function insertAt(ta, text) { const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s; ta.value = ta.value.slice(0, s) + text + ta.value.slice(e); ta.focus(); ta.selectionStart = ta.selectionEnd = s + text.length; }
  function weightsToFormula(which) {
    const w = cfg.idx[which].w, parts = []; let sw = 0;
    for (const k in w) if (w[k].w > 0) sw += w[k].w;
    for (const k in w) if (w[k].w > 0) { const c = +(w[k].w / sw).toFixed(3); parts.push(c + '*' + (w[k].dir > 0 ? k : '(1 - ' + k + ')')); }
    return parts.join(' + ') || '0';
  }

  function renderIndexPane(which) {
    const pane = $('#pane-' + which), c = cfg.idx[which]; pane.textContent = '';
    pane.append(el('div', { class: 'pane-head' }, el('h2', { text: IDX_INFO[which].title }), el('p', { text: IDX_INFO[which].desc })));
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Cách tính' },
      el('button', { type: 'button', 'aria-pressed': String(c.mode === 'weights'), text: 'Trọng số', onclick: () => { c.mode = 'weights'; renderIndexPane(which); schedule(true); } }),
      el('button', { type: 'button', 'aria-pressed': String(c.mode === 'formula'), text: 'Công thức', onclick: () => { if (!c.formula) c.formula = weightsToFormula(which); c.mode = 'formula'; renderIndexPane(which); schedule(true); } }));
    pane.append(seg);
    if (c.mode === 'weights') {
      const groups = indicatorGroups(), rows = [];
      const updShares = () => { let sw = 0; for (const k in c.w) if (c.w[k].w > 0) sw += c.w[k].w; rows.forEach(([k, out, row]) => { const w = (c.w[k] && c.w[k].w) || 0; out.textContent = sw && w ? pct(w / sw) : '–'; row.classList.toggle('off', !w); }); };
      for (const g of Object.keys(GROUPS)) {
        if (!groups[g]) continue;
        pane.append(el('div', { class: 'grp-title', text: GROUPS[g] }));
        for (const d of groups[g]) {
          const t = c.w[d.key] || (c.w[d.key] = { w: 0, dir: 1 });
          const out = el('span', { class: 'share num' });
          const dirBtn = el('button', { type: 'button', class: 'dir ' + (t.dir > 0 ? 'pos' : 'neg'), text: t.dir > 0 ? '+' : '−', title: 'Chiều tác động: + giá trị cao làm tăng chỉ số, − làm giảm', 'aria-label': 'Đổi chiều tác động của ' + d.label });
          dirBtn.onclick = () => { t.dir = -t.dir; dirBtn.textContent = t.dir > 0 ? '+' : '−'; dirBtn.className = 'dir ' + (t.dir > 0 ? 'pos' : 'neg'); schedule(); };
          const rng = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: t.w, id: 'w-' + which + '-' + d.key, 'aria-label': 'Trọng số ' + d.label });
          rng.oninput = () => { t.w = +rng.value; updShares(); schedule(); };
          const row = el('div', { class: 'wrow' }, el('span', { class: 'wl' }, d.label + ' ', el('small', { text: d.unit })), el('div', { class: 'wctl' }, dirBtn, rng, out));
          rows.push([d.key, out, row]); pane.append(row);
        }
      }
      updShares();
      pane.append(el('p', { class: 'hint', text: 'Cột phải là tỉ trọng sau khi chuẩn hóa tổng trọng số về 100%. Trọng số 0 nghĩa là không dùng.' }));
    } else {
      const ta = el('textarea', { id: 'fx-' + which, spellcheck: 'false', rows: 5 }); ta.value = c.formula;
      const msg = el('div', { id: 'fx-msg-' + which });
      const apply = () => { c.formula = ta.value; schedule(true); };
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } });
      pane.append(ta, el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn sm primary', text: 'Áp dụng (Ctrl+Enter)', onclick: apply }),
        el('button', { type: 'button', class: 'btn sm', text: 'Lấy từ trọng số', onclick: () => { ta.value = weightsToFormula(which); apply(); } })), msg,
        el('p', { class: 'hint', text: 'Kết quả được kẹp về 0–1. Bấm vào biến để chèn. Trong mô phỏng, nhiễu dữ liệu σx vẫn được áp dụng cho mọi biến.' }), varChips(ta));
    }
  }

  function paramRow(p, onChange) {
    const out = el('output', { text: fmtParam(p) });
    const r = el('input', { type: 'range', min: p.min, max: p.max, step: p.step || 0.01, value: p.value, id: 'p-' + p.key, 'aria-label': p.label });
    r.oninput = () => { p.value = +r.value; out.textContent = fmtParam(p); (onChange || schedule)(); };
    const row = el('div', { class: 'prow' }, el('label', { for: 'p-' + p.key }, p.label + ' ', p.builtin ? null : el('code', { text: p.key })), out, r);
    return row;
  }
  function fmtParam(p) { const d = (String(p.step || 0.01).split('.')[1] || '').length; return fmt(p.value, d) + (p.unit ? ' ' + p.unit : ''); }

  function renderParamPane() {
    const pane = $('#pane-P'); pane.textContent = '';
    pane.append(el('div', { class: 'pane-head' }, el('h2', { text: 'Tham số mô hình' }), el('p', { text: 'Thay đổi để thử các giả định. Mã tham số tùy chỉnh dùng được trong công thức.' })));
    const sect = (title, keys) => { pane.append(el('div', { class: 'grp-title', text: title })); for (const k of keys) { const p = param(k); if (p) pane.append(paramRow(p)); } };
    sect('Lan tỏa không gian', ['rho_F', 'rho_B']);
    sect('Ngưỡng kịch bản', ['nguong_F', 'nguong_B', 'nguong_rui_ro']);
    pane.append(el('button', { type: 'button', class: 'btn sm', text: 'Đặt ngưỡng F, B theo trung vị hiện tại', onclick: () => {
      const med = a => S.quantile(Array.from(a).sort((x, y) => x - y), 0.5);
      param('nguong_F').value = +med(det.F).toFixed(2); param('nguong_B').value = +med(det.B).toFixed(2); renderParamPane(); schedule();
    } }));
    sect('Bất định (Monte Carlo)', ['sigma_w', 'sigma_x', 'n_sim']);
    pane.append(el('div', { class: 'grp-title', text: 'Tham số tùy chỉnh' }));
    for (const p of cfg.params.filter(q => !q.builtin)) {
      const row = paramRow(p);
      row.append(el('button', { type: 'button', class: 'btn sm ghost rm', text: 'Xóa', onclick: () => { cfg.params = cfg.params.filter(q => q !== p); renderControls(); schedule(true); } }));
      pane.append(row);
    }
    const f = { key: el('input', { type: 'text', id: 'np-key', placeholder: 'vd: he_so_lai_suat' }), label: el('input', { type: 'text', id: 'np-label', placeholder: 'Lãi suất cho vay' }),
      value: el('input', { type: 'number', id: 'np-val', value: 1, step: 'any' }), min: el('input', { type: 'number', id: 'np-min', value: 0, step: 'any' }), max: el('input', { type: 'number', id: 'np-max', value: 2, step: 'any' }) };
    const msg = el('span', { class: 'err' });
    pane.append(el('div', { class: 'box' }, el('h3', { text: 'Thêm tham số' }),
      el('div', { class: 'form-grid' },
        el('label', {}, 'Mã (dùng trong công thức)', f.key), el('label', {}, 'Tên hiển thị', f.label),
        el('label', {}, 'Giá trị', f.value), el('label', {}, 'Nhỏ nhất', f.min), el('label', {}, 'Lớn nhất', f.max)),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn sm primary', text: 'Thêm', onclick: () => {
        const key = f.key.value.trim(), lo = +f.min.value, hi = +f.max.value, v = +f.value.value;
        const err = validKey(key) || (!(hi > lo) ? 'Giá trị lớn nhất phải lớn hơn nhỏ nhất.' : '');
        if (err) { msg.textContent = err; return; }
        cfg.params.push({ key, label: f.label.value.trim() || key, value: Math.min(hi, Math.max(lo, v)), min: lo, max: hi, step: +((hi - lo) / 100).toPrecision(2) });
        renderControls(); schedule(true);
      } }), msg)));
  }
  function validKey(key) {
    if (!/^[a-z_][a-z0-9_]*$/.test(key)) return 'Mã chỉ gồm chữ thường không dấu, số và dấu gạch dưới, không bắt đầu bằng số.';
    if (model.slots.includes(key) || ['pi', 'if', 'min', 'max'].includes(key)) return 'Mã "' + key + '" đã tồn tại.';
    return '';
  }

  function renderDerivedPane() {
    const pane = $('#pane-D'); pane.textContent = '';
    pane.append(el('div', { class: 'pane-head' }, el('h2', { text: 'Chỉ tiêu phái sinh' }), el('p', { text: 'Tạo chỉ tiêu mới từ công thức. Chúng xuất hiện trong danh sách trọng số F, B và trong lớp bản đồ.' })));
    cfg.derived.forEach((d, j) => {
      const ta = el('textarea', { id: 'dv-' + d.key, spellcheck: 'false', rows: 3 }); ta.value = d.formula;
      const lab = el('input', { type: 'text', id: 'dl-' + d.key, value: d.label });
      const norm = el('input', { type: 'checkbox', id: 'dn-' + d.key }); norm.checked = !!d.normalize;
      const apply = () => { d.formula = ta.value; d.label = lab.value.trim() || d.key; d.normalize = norm.checked; renderIndexPane('F'); renderIndexPane('B'); schedule(true); };
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } });
      pane.append(el('div', { class: 'box' },
        el('div', { class: 'row', style: 'justify-content:space-between' }, el('code', { class: 'mono', text: d.key }),
          el('button', { type: 'button', class: 'btn sm ghost', text: 'Xóa', onclick: () => { cfg.derived.splice(j, 1); for (const w of ['F', 'B']) delete cfg.idx[w].w[d.key]; model.compileAll(); renderControls(); schedule(true); } })),
        el('label', { class: 'hint', for: 'dl-' + d.key, text: 'Tên hiển thị' }), lab, ta,
        el('label', { class: 'hint row' }, norm, 'Chuẩn hóa 0–1 theo vùng (bỏ chọn nếu công thức đã cho ra 0–1 có ý nghĩa)'),
        el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn sm primary', text: 'Áp dụng', onclick: apply })),
        el('div', { id: 'dv-msg-' + d.key })));
    });
    const key = el('input', { type: 'text', id: 'nd-key', placeholder: 'vd: chenh_gia' }), lab = el('input', { type: 'text', id: 'nd-label', placeholder: 'Chênh lệch giá so với nền tảng' });
    const ta = el('textarea', { id: 'nd-fx', spellcheck: 'false', rows: 3, placeholder: 'gia_m2 - (1 - kc_trung_tam)' });
    const msg = el('span', { class: 'err' });
    pane.append(el('div', { class: 'box' }, el('h3', { text: 'Thêm chỉ tiêu' }),
      el('div', { class: 'form-grid' }, el('label', {}, 'Mã', key), el('label', {}, 'Tên hiển thị', lab), el('label', { class: 'full' }, 'Công thức', ta)),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn sm primary', text: 'Thêm', onclick: () => {
        const k = key.value.trim(), err = validKey(k); if (err) { msg.textContent = err; return; }
        try { S.compile(ta.value, n => (model.slots.includes(n) ? 0 : -1)); } catch (e) { msg.textContent = e.message; return; }
        cfg.derived.push({ key: k, label: lab.value.trim() || k, formula: ta.value, normalize: true });
        model.compileAll(); renderControls(); schedule(true);
      } }), msg), varChips(ta)));
  }

  function renderErrors() {
    for (const w of ['F', 'B']) {
      const m = $('#fx-msg-' + w); if (!m) continue;
      const e = model.errors['idx:' + w]; m.className = e ? 'err' : 'ok'; m.textContent = e ? 'Lỗi: ' + e : 'Công thức hợp lệ.';
    }
    for (const d of cfg.derived) {
      const m = $('#dv-msg-' + d.key); if (!m) continue;
      const e = model.errors['der:' + d.key]; m.className = e ? 'err' : 'ok'; m.textContent = e ? 'Lỗi: ' + e : '';
    }
  }

  // ---------- Bản đồ ----------
  let svg, gCells, gSel, cellPaths = [], vb, vb0, proj;
  function buildMap() {
    svg = $('#map'); svg.textContent = '';
    const n = ds.cells.length; let lat0 = 0, lng0 = 0; for (const c of ds.cells) { lat0 += c.cy; lng0 += c.cx; } lat0 /= n; lng0 /= n;
    const k = Math.cos(lat0 * Math.PI / 180);
    proj = (lng, lat) => [(lng - lng0) * k * 1000, -(lat - lat0) * 1000];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    gCells = sv('g'); cellPaths = [];
    ds.cells.forEach((c, i) => {
      let d = '';
      for (const ring of c.rings) ring.forEach((pt, j) => { const [x, y] = proj(pt[0], pt[1]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); d += (j ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2); d += j === ring.length - 1 ? 'Z' : ''; });
      const p = sv('path', { d, class: 'cell', 'data-i': i }); gCells.append(p); cellPaths.push(p);
    });
    const gOv = sv('g', { 'pointer-events': 'none' });
    const line = (coords) => coords.map((pt, j) => (j ? 'L' : 'M') + proj(pt[0], pt[1]).map(v => v.toFixed(2)).join(' ')).join('');
    for (const o of ds.overlays || []) {
      const d = line(o.coords);
      if (o.kind === 'river') gOv.append(sv('path', { d, fill: 'none', stroke: 'var(--ov-river)', 'stroke-width': 4, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', opacity: 0.9 }));
      else if (o.kind === 'metro') {
        gOv.append(sv('path', { d, fill: 'none', stroke: 'var(--surface)', 'stroke-width': 6, 'vector-effect': 'non-scaling-stroke' }));
        gOv.append(sv('path', { d, fill: 'none', stroke: 'var(--ov-line)', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke' }));
        for (const s of o.stations || []) { const [x, y] = proj(s[0], s[1]); gOv.append(sv('circle', { cx: x, cy: y, r: 2.2, fill: 'var(--surface)', stroke: 'var(--ov-line)', 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke' })); }
      } else if (o.kind === 'plan') {
        gOv.append(sv('path', { d, fill: 'none', stroke: 'var(--surface)', 'stroke-width': 5, 'vector-effect': 'non-scaling-stroke' }));
        gOv.append(sv('path', { d, fill: 'none', stroke: 'var(--ov-line)', 'stroke-width': 2.2, 'stroke-dasharray': '7 5', 'vector-effect': 'non-scaling-stroke' }));
      } else gOv.append(sv('path', { d, fill: 'none', stroke: 'var(--ov-line)', 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke', opacity: 0.8 }));
    }
    gSel = sv('g', { 'pointer-events': 'none' });
    svg.append(gCells, gOv, gSel);
    const pad = Math.max(x1 - x0, y1 - y0) * 0.04;
    vb0 = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }; vb = { ...vb0 }; setVB();
  }
  const setVB = () => svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
  function svgPt(cx, cy) { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function zoomAt(p, f) { const nw = vb.w * f; if (nw > vb0.w * 1.6 || nw < vb0.w / 25) return; vb.x = p.x - (p.x - vb.x) * f; vb.y = p.y - (p.y - vb.y) * f; vb.w *= f; vb.h *= f; setVB(); }
  function zoomCenter(f) { zoomAt({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, f); }

  function bindMap() {
    let drag = null;
    svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(svgPt(e.clientX, e.clientY), e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false }; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; svg.classList.add('drag'); hideTip(); }
        if (drag.moved) { const s = Math.max(vb.w / svg.clientWidth, vb.h / svg.clientHeight); vb.x = drag.vx - dx * s; vb.y = drag.vy - dy * s; setVB(); }
        return;
      }
      const t = document.elementFromPoint(e.clientX, e.clientY);
      if (t && t.dataset && t.dataset.i != null) showCellTip(+t.dataset.i, e.clientX, e.clientY); else hideTip();
    });
    svg.addEventListener('pointerup', e => {
      const d = drag; drag = null; svg.classList.remove('drag');
      if (d && !d.moved) { const t = document.elementFromPoint(e.clientX, e.clientY); if (t && t.dataset && t.dataset.i != null) select(+t.dataset.i); }
    });
    svg.addEventListener('pointerleave', () => { if (!drag) hideTip(); });
    $('#z-in').onclick = () => zoomCenter(1 / 1.3); $('#z-out').onclick = () => zoomCenter(1.3); $('#z-fit').onclick = () => { vb = { ...vb0 }; setVB(); };
  }
  function select(i) { selected = selected === i ? -1 : i; drawSel(); renderDetail(); renderScatter(); }
  function drawSel() {
    gSel.textContent = ''; if (selected < 0) return;
    const d = cellPaths[selected].getAttribute('d');
    gSel.append(sv('path', { d, fill: 'none', stroke: 'var(--surface)', 'stroke-width': 5, 'vector-effect': 'non-scaling-stroke' }), sv('path', { d, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2.4, 'vector-effect': 'non-scaling-stroke' }));
  }

  function layerDefs() {
    const L = [{ id: 'dom', label: 'Kịch bản chiếm ưu thế', grp: 'Kết quả' }];
    S.SCEN.forEach((s, k) => L.push({ id: 'p' + k, label: 'Xác suất: ' + s.label, grp: 'Kết quả' }));
    L.push({ id: 'F', label: 'Chỉ số F* (sau lan tỏa)', grp: 'Kết quả' }, { id: 'B', label: 'Chỉ số B* (sau lan tỏa)', grp: 'Kết quả' },
      { id: 'lisaF', label: 'Cụm LISA của F*', grp: 'Kết quả' }, { id: 'lisaB', label: 'Cụm LISA của B*', grp: 'Kết quả' });
    for (const d of model.allInd()) L.push({ id: 'raw:' + d.key, label: d.label, grp: 'Chỉ tiêu', ind: d });
    return L;
  }
  function renderLayerSelect() {
    const s = $('#layer'), defs = layerDefs(); s.textContent = '';
    const groups = {};
    for (const d of defs) { if (!groups[d.grp]) { groups[d.grp] = el('optgroup', { label: d.grp }); s.append(groups[d.grp]); } groups[d.grp].append(el('option', { value: d.id, text: d.label })); }
    if (!defs.find(d => d.id === layer)) layer = 'dom';
    s.value = layer;
  }
  function lisa(which) { if (!lisaCache[which]) lisaCache[which] = model.lisa(which === 'F' ? det.F : det.B); return lisaCache[which]; }
  let rawRange = null;
  function paintMap() {
    if (!det) return;
    const n = ds.cells.length;
    let fill;
    if (layer === 'dom') fill = i => { const [k, p] = dominant(i); return [C.sc[k], 0.3 + 0.7 * p]; };
    else if (layer[0] === 'p' && layer.length === 2) { const k = +layer[1]; fill = i => [seq(probOf(i, k)), 1]; }
    else if (layer === 'F' || layer === 'B') { const a = det[layer]; fill = i => [seq(a[i]), 1]; }
    else if (layer.startsWith('lisa')) { const l = lisa(layer[4]); fill = i => [C.lisa[l[i]], 1]; }
    else { const key = layer.slice(4), a = det.R[key]; rawRange = S.robustRange(a); const [lo, hi] = rawRange; fill = i => [seq((a[i] - lo) / (hi - lo)), 1]; }
    for (let i = 0; i < n; i++) { const [c, o] = fill(i); const p = cellPaths[i]; p.setAttribute('fill', c); p.setAttribute('fill-opacity', o.toFixed(2)); }
    drawSel();
  }
  function renderLegend() {
    const L = $('#legend'); L.textContent = '';
    const def = layerDefs().find(d => d.id === layer) || {};
    const ramp = (lo, hi) => [el('div', { class: 'ramp', style: 'background:linear-gradient(90deg,' + C.seqHex.join(',') + ')' }), el('div', { class: 'rlab' }, el('span', { text: lo }), el('span', { text: hi }))];
    if (layer === 'dom') {
      L.append(el('div', { class: 'lt', text: 'Kịch bản chiếm ưu thế' }), el('div', { class: 'items' }, S.SCEN.map((s, k) => el('span', {}, el('span', { class: 'sw', style: 'background:' + C.sc[k] }), s.label))),
        el('div', { class: 'hint', text: mc && !mcStale ? 'Độ đậm = xác suất của kịch bản đó trong ' + mc.ns + ' lần mô phỏng' : 'Đang chờ mô phỏng…' }));
    } else if (layer.startsWith('lisa')) {
      const lab = ['Không ý nghĩa', 'Cao–Cao (cụm nóng)', 'Thấp–Thấp (cụm lạnh)', 'Cao giữa Thấp', 'Thấp giữa Cao'];
      L.append(el('div', { class: 'lt', text: def.label + ' · p ≤ 0,05' }), el('div', { class: 'items' }, lab.map((t, k) => el('span', {}, el('span', { class: 'sw', style: 'background:' + C.lisa[k] }), t))));
    } else if (layer.startsWith('raw:')) {
      const d = def.ind; L.append(el('div', { class: 'lt', text: d.label + (d.unit ? ' (' + d.unit + ')' : '') }), ...ramp('≤ ' + fmt(rawRange[0], d.dec ?? 2), '≥ ' + fmt(rawRange[1], d.dec ?? 2)));
    } else L.append(el('div', { class: 'lt', text: def.label }), ...ramp('0', layer[0] === 'p' ? '100%' : '1'));
    if ((ds.overlays || []).length) {
      const sym = o => { const s = sv('svg', { width: 22, height: 8 }); if (o.kind === 'river') s.append(sv('line', { x1: 1, y1: 4, x2: 21, y2: 4, stroke: 'var(--ov-river)', 'stroke-width': 4, 'stroke-linecap': 'round' })); else { s.append(sv('line', { x1: 1, y1: 4, x2: 21, y2: 4, stroke: 'var(--ov-line)', 'stroke-width': 2.2, 'stroke-dasharray': o.kind === 'plan' ? '5 3' : '' })); if (o.kind === 'metro') s.append(sv('circle', { cx: 11, cy: 4, r: 2.6, fill: 'var(--surface)', stroke: 'var(--ov-line)', 'stroke-width': 1.5 })); } return s; };
      L.append(el('div', { class: 'ov' }, (ds.overlays || []).slice(0, 4).map(o => el('span', {}, sym(o), o.label || 'Tuyến'))));
    }
  }

  // ---------- Tooltip ----------
  const tip = $('#tip');
  function placeTip(x, y) { const w = tip.offsetWidth, h = tip.offsetHeight; let l = x + 14, t = y + 14; if (l + w > innerWidth - 8) l = x - w - 14; if (t + h > innerHeight - 8) t = y - h - 14; tip.style.left = Math.max(8, l) + 'px'; tip.style.top = Math.max(8, t) + 'px'; }
  const hideTip = () => { tip.hidden = true; };
  function cellValue(i) {
    if (layer === 'dom') { const [k, p] = dominant(i); return [pct(p), S.SCEN[k].label]; }
    if (layer[0] === 'p' && layer.length === 2) return [pct(probOf(i, +layer[1])), 'Xác suất ' + S.SCEN[+layer[1]].label];
    if (layer === 'F' || layer === 'B') return [fmt(det[layer][i]), 'Chỉ số ' + layer + '*'];
    if (layer.startsWith('lisa')) return [['Không ý nghĩa', 'Cao–Cao', 'Thấp–Thấp', 'Cao giữa Thấp', 'Thấp giữa Cao'][lisa(layer[4])[i]], 'LISA ' + layer[4] + '*'];
    const d = layerDefs().find(x => x.id === layer).ind; return [fmt(det.R[d.key][i], d.dec ?? 2) + ' ' + (d.unit || ''), d.label];
  }
  function showCellTip(i, x, y) {
    const [v, l] = cellValue(i);
    tip.textContent = '';
    tip.append(el('div', { class: 'tv', text: v }), el('div', { class: 'tl', text: l + ' · ô ' + ds.cells[i].id }),
      el('div', { class: 'tr', style: 'margin-top:6px' }, el('span', { text: 'F*' }), el('b', { text: fmt(det.F[i]) })),
      el('div', { class: 'tr' }, el('span', { text: 'B*' }), el('b', { text: fmt(det.B[i]) })),
      ...S.SCEN.map((s, k) => el('div', { class: 'tr' }, el('span', {}, el('span', { class: 'key', style: 'background:' + C.sc[k] }), s.label), el('b', { text: pct(probOf(i, k)) }))));
    tip.hidden = false; placeTip(x, y);
  }

  // ---------- Kết quả ----------
  function renderSummary() {
    const box = $('#summary'); box.textContent = ''; if (!det) return;
    const sm = mc ? mc.summary : S.SCEN.map((s, k) => { const v = S.shareOf(det.sc, k); return { mean: v, p5: v, p95: v }; });
    let top = 0; sm.forEach((s, k) => { if (s.mean > sm[top].mean) top = k; });
    box.append(el('div', { class: 'headline' }, 'Phổ biến nhất: ', el('strong', { text: S.SCEN[top].label }), ', trung bình ' + pct(sm[top].mean) + ' diện tích.'));
    sm.forEach((s, k) => {
      box.append(el('div', { class: 'srow' },
        el('span', { class: 'sn' }, el('span', { class: 'sw', style: 'background:' + C.sc[k] }), S.SCEN[k].label, el('small', { text: S.SCEN[k].rule })),
        el('span', { class: 'sv' }, pct(s.mean) + ' ', el('small', { text: '(' + fmt(s.p5 * 100, 0) + '–' + fmt(s.p95 * 100, 0) + '%)' })),
        el('div', { class: 'track', title: 'Trung bình ' + pct(s.mean, 1) + ', khoảng 90%: ' + pct(s.p5, 1) + ' – ' + pct(s.p95, 1) },
          el('div', { class: 'fill', style: 'width:' + (s.mean * 100) + '%;background:' + C.sc[k] }),
          el('div', { class: 'whisk', style: 'left:' + (s.p5 * 100) + '%;width:' + Math.max(0.5, (s.p95 - s.p5) * 100) + '%' }))));
    });
    box.append(el('p', { class: 'hint', text: 'Thanh màu = tỉ lệ diện tích trung bình; vạch đen = khoảng 90% qua các lần mô phỏng.' }));
    if (mc) {
      const r = mc.risk, lvl = r >= 0.6 ? ['crit', '!', 'Rủi ro cao'] : r >= 0.3 ? ['warn', '!', 'Cần theo dõi'] : ['good', '✓', 'Rủi ro thấp'];
      box.append(el('div', { class: 'status', style: 'border-color:var(--' + lvl[0] + ')' },
        el('span', { class: 'ic', style: 'background:var(--' + lvl[0] + ')', text: lvl[1] }),
        el('span', {}, el('b', { text: lvl[2] + ': ' }), 'xác suất vùng Bong bóng đầu cơ vượt ' + fmt(param('nguong_rui_ro').value, 0) + '% diện tích là ', el('strong', { text: pct(r) }), '.')));
    }
  }

  function renderScatter() {
    const box = $('#scatter'); box.textContent = ''; if (!det) return;
    const W = 330, H = 250, m = { l: 30, r: 10, t: 10, b: 30 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const X = v => m.l + v * iw, Y = v => m.t + (1 - v) * ih;
    const s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Biểu đồ phân tán chỉ số F và B của các ô' });
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      s.append(sv('line', { x1: X(t), x2: X(t), y1: m.t, y2: m.t + ih, stroke: 'var(--line-2)' }), sv('line', { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t), stroke: 'var(--line-2)' }));
      const tx = sv('text', { x: X(t), y: H - 14, 'text-anchor': 'middle' }); tx.textContent = fmt(t, 2); s.append(tx);
      const ty = sv('text', { x: m.l - 5, y: Y(t) + 3, 'text-anchor': 'end' }); ty.textContent = fmt(t, 1); s.append(ty);
    }
    const ax = sv('text', { x: m.l + iw, y: H - 2, 'text-anchor': 'end' }); ax.textContent = 'F* nền tảng →'; s.append(ax);
    const ay = sv('text', { x: m.l + 4, y: m.t + 10 }); ay.textContent = '↑ B* hành vi'; s.append(ay);
    const tF = param('nguong_F').value, tB = param('nguong_B').value;
    s.append(sv('line', { x1: X(tF), x2: X(tF), y1: m.t, y2: m.t + ih, stroke: 'var(--ink-3)', 'stroke-dasharray': '4 3' }), sv('line', { x1: m.l, x2: m.l + iw, y1: Y(tB), y2: Y(tB), stroke: 'var(--ink-3)', 'stroke-dasharray': '4 3' }));
    const q = (x, y, t, a) => { const e = sv('text', { x, y, 'text-anchor': a, class: 'qlab' }); e.textContent = t; s.append(e); };
    q(m.l + iw - 4, m.t + 12, 'Tăng nóng', 'end'); q(m.l + 4, m.t + 24, 'Bong bóng', 'start'); q(m.l + iw - 4, m.t + ih - 6, 'Bền vững', 'end'); q(m.l + 4, m.t + ih - 6, 'Trầm lắng', 'start');
    const g = sv('g');
    for (let i = 0; i < ds.cells.length; i++) g.append(sv('circle', { cx: X(det.F[i]).toFixed(1), cy: Y(det.B[i]).toFixed(1), r: 2.6, fill: C.sc[dominant(i)[0]], stroke: 'var(--surface)', 'stroke-width': 0.6, 'fill-opacity': 0.85 }));
    s.append(g);
    if (selected >= 0) s.append(sv('circle', { cx: X(det.F[selected]), cy: Y(det.B[selected]), r: 6, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2 }));
    const hl = sv('circle', { r: 5, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5, visibility: 'hidden' }); s.append(hl);
    const hit = sv('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' }); s.append(hit);
    const nearest = e => { const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q2 = p.matrixTransform(s.getScreenCTM().inverse()); let b = -1, bd = 196; for (let i = 0; i < ds.cells.length; i++) { const d = (X(det.F[i]) - q2.x) ** 2 + (Y(det.B[i]) - q2.y) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
    hit.addEventListener('pointermove', e => { const i = nearest(e); if (i < 0) { hl.setAttribute('visibility', 'hidden'); hideTip(); return; } hl.setAttribute('cx', X(det.F[i])); hl.setAttribute('cy', Y(det.B[i])); hl.setAttribute('visibility', 'visible'); showCellTip(i, e.clientX, e.clientY); });
    hit.addEventListener('pointerleave', () => { hl.setAttribute('visibility', 'hidden'); hideTip(); });
    hit.addEventListener('click', e => { const i = nearest(e); if (i >= 0) select(i); });
    box.append(s, el('div', { class: 'lg' }, S.SCEN.map((sc, k) => el('span', {}, el('span', { class: 'sw', style: 'background:' + C.sc[k] }), sc.label))));
    const mF = model.moran(det.F), mB = model.moran(det.B), word = v => (v > 0.5 ? 'phân cụm mạnh' : v > 0.2 ? 'phân cụm vừa' : v > -0.2 ? 'gần ngẫu nhiên' : 'phân tán');
    box.append(el('dl', { class: 'kv' }, el('dt', { text: "Moran's I của F*" }), el('dd', { text: fmt(mF) + ' · ' + word(mF) }), el('dt', { text: "Moran's I của B*" }), el('dd', { text: fmt(mB) + ' · ' + word(mB) })));
  }

  function renderTornado() {
    const box = $('#tornado'); box.textContent = '';
    if (!sens) { box.append(el('p', { class: 'empty', text: 'Đang tính độ nhạy…' })); return; }
    const rows = sens.rows.slice(0, 8), mx = Math.max(0.005, ...rows.map(r => Math.max(Math.abs(r.lo), Math.abs(r.hi))));
    box.append(el('p', { class: 'hint', text: 'Thay đổi tỉ lệ diện tích "' + S.SCEN[target].label + '" (hiện ' + pct(sens.base) + ') khi giảm hoặc tăng từng yếu tố 50%. Đơn vị: điểm phần trăm.' }));
    const wrap = el('div', { class: 'tor' });
    const bar = (v, cls) => { const w = Math.abs(v) / mx * 50; return el('div', { class: 'b', style: 'background:var(' + cls + ');width:' + w + '%;' + (v >= 0 ? 'left:50%' : 'right:50%') }); };
    for (const r of rows) {
      const lbl = (v) => (v >= 0 ? '+' : '−') + fmt(Math.abs(v) * 100, 1);
      wrap.append(el('div', {}, el('div', { class: 'tl' }, el('span', { text: r.label }), el('span', { text: lbl(r.lo) + ' / ' + lbl(r.hi) })),
        el('div', { class: 'tb', title: '−50%: ' + lbl(r.lo) + ' đ.p.  ·  +50%: ' + lbl(r.hi) + ' đ.p.' }, el('div', { class: 'mid' }), bar(r.lo, '--tor-lo'), bar(r.hi, '--tor-hi'))));
    }
    if (!rows.length) wrap.append(el('p', { class: 'empty', text: 'Không có trọng số hoặc tham số nào để phân tích.' }));
    box.append(wrap, el('div', { class: 'lg' }, el('span', {}, el('span', { class: 'sw', style: 'background:var(--tor-lo)' }), 'Giảm 50%'), el('span', {}, el('span', { class: 'sw', style: 'background:var(--tor-hi)' }), 'Tăng 50%')));
  }

  function renderDetail() {
    const box = $('#detail'); box.textContent = ''; if (!det) return;
    if (selected < 0) { box.append(el('p', { class: 'empty', text: 'Bấm vào một ô trên bản đồ hoặc một điểm trên biểu đồ để xem chi tiết.' })); return; }
    const i = selected, c = ds.cells[i];
    box.append(el('div', { class: 'headline' }, el('strong', { text: 'Ô ' + c.id }), el('span', { class: 'hint', text: '  ' + fmt(c.cy, 4) + '° B, ' + fmt(c.cx, 4) + '° Đ' })));
    for (let k = 0; k < 4; k++) {
      const p = probOf(i, k);
      box.append(el('div', { class: 'srow' }, el('span', { class: 'sn' }, el('span', { class: 'sw', style: 'background:' + C.sc[k] }), S.SCEN[k].label), el('span', { class: 'sv', text: pct(p) }),
        el('div', { class: 'track' }, el('div', { class: 'fill', style: 'width:' + p * 100 + '%;background:' + C.sc[k] }))));
    }
    box.append(el('dl', { class: 'kv' }, el('dt', { text: 'F* (nền tảng)' }), el('dd', { text: fmt(det.F[i]) }), el('dt', { text: 'B* (hành vi)' }), el('dd', { text: fmt(det.B[i]) })));
    const tb = el('table', { class: 'ind' });
    for (const d of model.allInd()) {
      const roles = []; for (const w of ['F', 'B']) { const t = cfg.idx[w].w[d.key]; if (cfg.idx[w].mode === 'weights' && t && t.w > 0) roles.push(w + (t.dir > 0 ? '+' : '−')); }
      tb.append(el('tr', {}, el('td', {}, d.label, roles.length ? el('span', { class: 'role', text: roles.join(' ') }) : null),
        el('td', { class: 'v', text: fmt(det.R[d.key][i], d.dec ?? 2) + (d.unit && d.unit !== '0–1' ? ' ' + d.unit : '') }),
        el('td', { class: 'bar', title: 'Giá trị chuẩn hóa ' + fmt(det.X[d.key][i]) }, el('div', { class: 'nb' }, el('i', { style: 'width:' + det.X[d.key][i] * 100 + '%' })))));
    }
    box.append(tb, el('p', { class: 'hint', text: 'Thanh xám = vị trí của ô trong phân bố chỉ tiêu (0–1). Nhãn F+/B− là vai trò trong chỉ số.' }));
  }

  // ---------- Nhập GeoJSON ----------
  function fromGeoJSON(gj, name) {
    if (!gj || gj.type !== 'FeatureCollection' || !Array.isArray(gj.features)) throw new Error('File phải là GeoJSON FeatureCollection.');
    const cells = [], props = [], overlays = [];
    gj.features.forEach((f, j) => {
      const g = f.geometry; if (!g) return;
      if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
        const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
        let sx = 0, sy = 0, cnt = 0; for (const pt of rings[0]) { sx += pt[0]; sy += pt[1]; cnt++; }
        cells.push({ id: String((f.properties && f.properties.id) ?? f.id ?? 'F' + (j + 1)), rings, cx: sx / cnt, cy: sy / cnt }); props.push(f.properties || {});
      } else if (g.type === 'LineString') overlays.push({ kind: 'line', label: (f.properties && (f.properties.name || f.properties.ten)) || 'Tuyến', coords: g.coordinates });
      else if (g.type === 'MultiLineString') g.coordinates.forEach(c => overlays.push({ kind: 'line', label: (f.properties && f.properties.name) || 'Tuyến', coords: c }));
    });
    if (cells.length < 10) throw new Error('Cần ít nhất 10 đối tượng Polygon/MultiPolygon, file có ' + cells.length + '.');
    if (cells.length > 8000) throw new Error('Tối đa 8.000 ô, file có ' + cells.length + '.');
    const keys = new Set(); props.forEach(p => Object.keys(p).forEach(k => keys.add(k)));
    const indicators = [], raw = {};
    for (const k of keys) {
      if (k === 'id') continue;
      const vals = props.map(p => (typeof p[k] === 'number' ? p[k] : (typeof p[k] === 'string' && p[k].trim() !== '' && isFinite(+p[k]) ? +p[k] : NaN)));
      const ok = vals.filter(v => isFinite(v)); if (ok.length < cells.length * 0.8) continue;
      const med = S.quantile(ok.slice().sort((a, b) => a - b), 0.5);
      let key = k.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^([0-9])/, '_$1') || 'v';
      while (raw[key]) key += '_';
      raw[key] = Float64Array.from(vals, v => (isFinite(v) ? v : med));
      indicators.push({ key, label: k, unit: '', group: 'imp', dec: 2 });
    }
    if (!indicators.length) throw new Error('Không tìm thấy thuộc tính số nào dùng được (cần ≥ 80% ô có giá trị).');
    return { name, sample: false, cells, raw, indicators, overlays, nb: S.buildNeighbors(cells, 6) };
  }
  function importedConfig(d) {
    const c = S.defaultConfig();
    c.params = c.params.filter(p => p.builtin); c.derived = [];
    c.idx.F.w = {}; c.idx.B.w = {};
    d.indicators.forEach((ind, j) => { c.idx.F.w[ind.key] = { w: j % 2 === 0 ? 0.5 : 0, dir: 1 }; c.idx.B.w[ind.key] = { w: j % 2 === 1 ? 0.5 : 0, dir: 1 }; });
    return c;
  }

  // ---------- Xuất ----------
  function buildCSV() {
    const inds = model.allInd(), head = ['id', 'lng', 'lat', 'F', 'B', ...S.SCEN.map(s => 'P_' + s.key), 'kich_ban', ...inds.map(d => d.key)];
    const lines = [head.join(',')];
    for (let i = 0; i < ds.cells.length; i++) {
      const c = ds.cells[i], [k] = dominant(i);
      lines.push([JSON.stringify(c.id), c.cx.toFixed(6), c.cy.toFixed(6), det.F[i].toFixed(4), det.B[i].toFixed(4), ...[0, 1, 2, 3].map(q => probOf(i, q).toFixed(3)), S.SCEN[k].key, ...inds.map(d => +det.R[d.key][i].toFixed(4))].join(','));
    }
    return lines.join('\n');
  }
  async function copy(ta, msg) { try { await navigator.clipboard.writeText(ta.value); $('#exp-msg').textContent = msg; } catch (e) { ta.select(); $('#exp-msg').textContent = 'Không truy cập được clipboard. Văn bản đã được chọn, nhấn Ctrl+C để sao chép.'; } }

  // ---------- Khởi động ----------
  function setDataset(d, c) {
    ds = d; cfg = c; model = new S.Model(ds, cfg); selected = -1; lisaCache = {}; mc = null; sens = null;
    buildMap(); renderControls(); renderLayerSelect(); renderTarget();
    $('#ds-pill').textContent = ds.sample ? 'Dữ liệu mẫu giả lập' : 'Dữ liệu nhập';
    $('#ds-meta').textContent = (ds.sample ? '' : ds.name + ' · ') + ds.cells.length.toLocaleString('vi-VN') + ' ô · ' + model.allInd().length + ' chỉ tiêu';
    renderTornado(); schedule();
  }
  function renderTarget() { const s = $('#target'); s.textContent = ''; S.SCEN.forEach((sc, k) => s.append(el('option', { value: k, text: sc.label }))); s.value = target; }

  function init() {
    readTokens();
    const sample = S.makeSample();
    setDataset(sample, loadCfg() || S.defaultConfig());
    bindMap();
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
      activeTab = b.dataset.tab;
      document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      for (const t of ['F', 'B', 'P', 'D']) $('#pane-' + t).hidden = t !== activeTab;
    }));
    $('#layer').onchange = e => { layer = e.target.value; paintMap(); renderLegend(); };
    $('#target').onchange = e => { target = +e.target.value; sens = null; renderTornado(); setTimeout(() => { sens = model.sensitivity(target); renderTornado(); }, 20); };
    $('#btn-reset').onclick = () => { setDataset(ds, ds.sample ? S.defaultConfig() : importedConfig(ds)); };
    $('#btn-sample').onclick = () => setDataset(S.makeSample(), loadCfg() || S.defaultConfig());
    $('#file-in').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const d = fromGeoJSON(JSON.parse(await f.text()), f.name); setDataset(d, importedConfig(d)); setStatus('Đã nhập ' + f.name); }
      catch (err) { setStatus('Lỗi nhập: ' + err.message); }
      e.target.value = '';
    };
    $('label[for="file-in"]').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file-in').click(); } });
    const openModal = id => { $(id).hidden = false; }, closeAll = () => document.querySelectorAll('.modal').forEach(m => (m.hidden = true));
    document.querySelectorAll('.modal').forEach(m => { m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) closeAll(); }); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
    $('#btn-method').onclick = () => openModal('#modal-method');
    $('#btn-export').onclick = () => { $('#out-csv').value = buildCSV(); $('#out-cfg').value = JSON.stringify(cfg, null, 2); $('#exp-msg').textContent = ''; openModal('#modal-export'); };
    $('#cp-csv').onclick = () => copy($('#out-csv'), 'Đã sao chép CSV.');
    $('#cp-cfg').onclick = () => copy($('#out-cfg'), 'Đã sao chép cấu hình.');
    $('#dl-csv').onclick = () => { const a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + $('#out-csv').value], { type: 'text/csv' })), download: 'saban_ket_qua.csv' }); document.body.append(a); a.click(); a.remove(); };
    $('#ap-cfg').onclick = () => {
      try { const c = JSON.parse($('#out-cfg').value); if (!c.params || !c.idx || !c.derived) throw new Error('Thiếu params, idx hoặc derived.'); setDataset(ds, mergeCfg(c)); $('#exp-msg').textContent = 'Đã áp dụng cấu hình.'; }
      catch (e) { $('#exp-msg').textContent = 'Cấu hình không hợp lệ: ' + e.message; }
    };
    const retheme = () => { readTokens(); paintAll(); renderTornado(); };
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
    new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  init();
})();
