// Sa bàn Kịch bản — engine (không phụ thuộc DOM, chạy được cả trong Node để kiểm thử)
(function (root) {
  'use strict';

  // ---------- Tiện ích ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    let u = 0; while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : (v !== v ? 0 : v));
  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
  }
  function robustRange(arr) {
    const s = Array.from(arr).filter(v => isFinite(v)).sort((a, b) => a - b);
    let lo = quantile(s, 0.02), hi = quantile(s, 0.98);
    if (hi - lo < 1e-12) { lo = s[0] ?? 0; hi = (s[s.length - 1] ?? 1); }
    if (hi - lo < 1e-12) hi = lo + 1;
    return [lo, hi];
  }
  function normalize(arr) {
    const [lo, hi] = robustRange(arr), out = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = clamp01((arr[i] - lo) / (hi - lo));
    return out;
  }

  // ---------- Bộ phân tích công thức ----------
  // Hỗ trợ: + - * / ^, so sánh, && ||, a ? b : c, hàm toán học, biến theo tên.
  const FUNCS = {
    min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, log: Math.log, exp: Math.exp,
    pow: Math.pow, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    clamp: (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)),
    step: (x, t = 0) => (x >= t ? 1 : 0),
    sigmoid: (x, k = 10, m = 0.5) => 1 / (1 + Math.exp(-k * (x - m))),
    if: (c, a, b) => (c ? a : b),
  };
  function tokenize(src) {
    const toks = []; let i = 0;
    const isD = c => c >= '0' && c <= '9', isA = c => /[A-Za-z_]/.test(c), isW = c => /[A-Za-z0-9_]/.test(c);
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (isD(c) || (c === '.' && isD(src[i + 1]))) {
        const m = /^(\d*\.?\d+(?:[eE][+-]?\d+)?)/.exec(src.slice(i)) || /^(\d+\.)/.exec(src.slice(i));
        toks.push({ t: 'num', v: parseFloat(m[1]) }); i += m[1].length; continue;
      }
      if (isA(c)) { let j = i; while (j < src.length && isW(src[j])) j++; toks.push({ t: 'id', v: src.slice(i, j) }); i = j; continue; }
      const two = src.slice(i, i + 2);
      if (['>=', '<=', '==', '!=', '&&', '||'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/^(),<>?:'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw new Error('Ký tự không hợp lệ "' + c + '" ở vị trí ' + (i + 1));
    }
    return toks;
  }
  function compile(src, slotOf) {
    const toks = tokenize(src); let p = 0;
    const peek = () => toks[p], isOp = v => toks[p] && toks[p].t === 'op' && toks[p].v === v;
    const expect = v => { if (!isOp(v)) throw new Error('Thiếu "' + v + '"'); p++; };
    function primary() {
      const tk = toks[p];
      if (!tk) throw new Error('Công thức kết thúc đột ngột');
      if (tk.t === 'num') { p++; const v = tk.v; return () => v; }
      if (isOp('(')) { p++; const e = expr(); expect(')'); return e; }
      if (tk.t === 'id') {
        p++;
        if (isOp('(')) {
          p++;
          const f = FUNCS[tk.v]; if (!f) throw new Error('Hàm không tồn tại: ' + tk.v);
          const args = [];
          if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; args.push(expr()); } }
          expect(')');
          if (tk.v === 'if') { const [c, a, b] = args; return v => (c(v) ? a(v) : (b ? b(v) : 0)); }
          return v => f(...args.map(a => a(v)));
        }
        if (tk.v === 'pi') return () => Math.PI;
        const s = slotOf(tk.v);
        if (s < 0) throw new Error('Biến không tồn tại: ' + tk.v);
        return v => v[s];
      }
      throw new Error('Không hiểu "' + tk.v + '"');
    }
    function power() { const b = primary(); if (isOp('^')) { p++; const e = unary(); return v => Math.pow(b(v), e(v)); } return b; }
    function unary() { if (isOp('-')) { p++; const a = unary(); return v => -a(v); } if (isOp('+')) { p++; return unary(); } return power(); }
    function mul() { let a = unary(); while (isOp('*') || isOp('/')) { const o = toks[p++].v, l = a, r = unary(); a = o === '*' ? v => l(v) * r(v) : v => l(v) / r(v); } return a; }
    function add() { let a = mul(); while (isOp('+') || isOp('-')) { const o = toks[p++].v, l = a, r = mul(); a = o === '+' ? v => l(v) + r(v) : v => l(v) - r(v); } return a; }
    function cmp() {
      const a = add(); const tk = peek();
      if (tk && tk.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(tk.v)) {
        p++; const b = add();
        switch (tk.v) {
          case '<': return v => +(a(v) < b(v)); case '>': return v => +(a(v) > b(v));
          case '<=': return v => +(a(v) <= b(v)); case '>=': return v => +(a(v) >= b(v));
          case '==': return v => +(a(v) === b(v)); default: return v => +(a(v) !== b(v));
        }
      }
      return a;
    }
    function and() { let a = cmp(); while (isOp('&&')) { p++; const l = a, r = cmp(); a = v => +(l(v) && r(v)); } return a; }
    function or() { let a = and(); while (isOp('||')) { p++; const l = a, r = and(); a = v => +(l(v) || r(v)); } return a; }
    function expr() { const c = or(); if (isOp('?')) { p++; const a = expr(); expect(':'); const b = expr(); return v => (c(v) ? a(v) : b(v)); } return c; }
    if (!toks.length) throw new Error('Công thức trống');
    const fn = expr();
    if (p < toks.length) throw new Error('Thừa ký hiệu "' + toks[p].v + '"');
    return fn;
  }

  // ---------- Hình học ----------
  function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx - px, y = ay + t * dy - py; return Math.sqrt(x * x + y * y);
  }
  function distLine(px, py, pts) { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, distSeg(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return d; }
  function distPts(px, py, pts) { let d = Infinity; for (const q of pts) d = Math.min(d, Math.hypot(px - q[0], py - q[1])); return d; }

  // Láng giềng: k gần nhất theo tâm ô (dùng chung cho lưới lục giác và GeoJSON nhập vào)
  function buildNeighbors(cells, k) {
    const n = cells.length, lat0 = cells.reduce((s, c) => s + c.cy, 0) / Math.max(1, n);
    const kx = 111.32 * Math.cos(lat0 * Math.PI / 180), ky = 110.57;
    const X = cells.map(c => c.cx * kx), Y = cells.map(c => c.cy * ky);
    // lưới băm để tìm kNN nhanh
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i < n; i++) { minx = Math.min(minx, X[i]); maxx = Math.max(maxx, X[i]); miny = Math.min(miny, Y[i]); maxy = Math.max(maxy, Y[i]); }
    const cs = Math.max(1e-6, Math.sqrt(((maxx - minx) * (maxy - miny) || 1) / Math.max(1, n)) * 2);
    const grid = new Map(), key = (gx, gy) => gx + ',' + gy;
    for (let i = 0; i < n; i++) { const kk = key(Math.floor((X[i] - minx) / cs), Math.floor((Y[i] - miny) / cs)); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(i); }
    const start = new Int32Array(n + 1), idx = [];
    for (let i = 0; i < n; i++) {
      const gx = Math.floor((X[i] - minx) / cs), gy = Math.floor((Y[i] - miny) / cs);
      let cand = [];
      for (let r = 1; r < 6 && cand.length < k + 1; r++) {
        cand = [];
        for (let a = gx - r; a <= gx + r; a++) for (let b = gy - r; b <= gy + r; b++) { const g = grid.get(key(a, b)); if (g) cand.push(...g); }
      }
      const ds = cand.filter(j => j !== i).map(j => [j, (X[j] - X[i]) ** 2 + (Y[j] - Y[i]) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, k);
      start[i] = idx.length; for (const d of ds) idx.push(d[0]);
    }
    start[n] = idx.length;
    return { start, idx: Int32Array.from(idx) };
  }

  // ---------- Dữ liệu mẫu (giả lập, có cấu trúc không gian) ----------
  const BASE_IND = [
    { key: 'kc_trung_tam', label: 'Khoảng cách tới trung tâm', unit: 'km', group: 'loc', dec: 1 },
    { key: 'kc_metro', label: 'Khoảng cách tới ga metro', unit: 'km', group: 'loc', dec: 1 },
    { key: 'kc_quy_hoach', label: 'Khoảng cách tới cao tốc quy hoạch', unit: 'km', group: 'loc', dec: 1 },
    { key: 'mat_do_poi', label: 'Mật độ tiện ích (POI)', unit: 'điểm/km²', group: 'loc', dec: 0 },
    { key: 'anh_sang_dem', label: 'Ánh sáng đêm VIIRS', unit: 'nW/cm²/sr', group: 'loc', dec: 1 },
    { key: 'rui_ro_ngap', label: 'Rủi ro ngập', unit: '0–1', group: 'loc', dec: 2 },
    { key: 'gia_m2', label: 'Giá rao trung vị', unit: 'triệu đ/m²', group: 'fin', dec: 0 },
    { key: 'bien_dong_gia', label: 'Biến động giá rao 6 tháng', unit: '%', group: 'fin', dec: 1 },
    { key: 'tang_tin_dang', label: 'Tăng số tin đăng bán', unit: '%', group: 'beh', dec: 0 },
    { key: 'tu_khoa_dau_co', label: 'Tin có từ khóa đầu cơ', unit: '%', group: 'beh', dec: 1 },
    { key: 'ty_le_dat_trong', label: 'Tỉ lệ đất trống (ảnh vệ tinh)', unit: '%', group: 'beh', dec: 0 },
  ];

  function makeSample() {
    const LAT0 = 10.79, LNG0 = 106.70, KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KY = 110.57;
    const toLL = (x, y) => [LNG0 + x / KX, LAT0 + y / KY];
    const R = 0.6, W = 34, H = 26, hw = Math.sqrt(3) * R, hh = 1.5 * R;
    const river = [], metro = [[0, 0], [2.6, 1.0], [5.2, 2.2], [7.8, 3.0], [10.2, 4.3], [12.6, 5.4], [15, 6.4]];
    for (let x = -18; x <= 18; x += 0.5) river.push([x, -3.2 + 2.3 * Math.sin(x / 3.4) + 0.12 * x]);
    const planned = [[-16, -10], [-12.5, -5.5], [-10, -0.5], [-9, 4.5], [-6.5, 9], [-3, 13]];
    const stations = metro, newStations = metro.filter(s => s[0] >= 6);
    const cells = [];
    let id = 0;
    for (let row = 0; -H / 2 + row * hh <= H / 2; row++) {
      for (let col = 0; -W / 2 + col * hw <= W / 2 + hw; col++) {
        const x = -W / 2 + col * hw + (row % 2 ? hw / 2 : 0), y = -H / 2 + row * hh;
        const e = (x / (W / 2)) ** 2 + (y / (H / 2)) ** 2 + 0.06 * Math.sin(x * 0.9) * Math.cos(y * 0.7);
        if (e > 1) continue;
        const poly = [];
        for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (30 + 60 * k); poly.push(toLL(x + R * Math.cos(a), y + R * Math.sin(a))); }
        const [cx, cy] = toLL(x, y);
        cells.push({ id: 'H' + String(++id).padStart(4, '0'), rings: [poly], cx, cy, _x: x, _y: y });
      }
    }
    const nb = buildNeighbors(cells, 6), n = cells.length, rng = mulberry32(20261017);
    function field(passes) {
      let a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = gauss(rng);
      for (let p = 0; p < passes; p++) {
        const b = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = a[i], c = 1; for (let j = nb.start[i]; j < nb.start[i + 1]; j++) { s += a[nb.idx[j]]; c++; } b[i] = s / c; }
        a = b;
      }
      let m = 0, v = 0; for (const t of a) m += t; m /= n; for (const t of a) v += (t - m) ** 2; v = Math.sqrt(v / n) || 1;
      for (let i = 0; i < n; i++) a[i] = (a[i] - m) / v; return a;
    }
    const N = {}; 'ABCDEFGHI'.split('').forEach(k => (N[k] = field(3)));
    const raw = {}; BASE_IND.forEach(d => (raw[d.key] = new Float64Array(n)));
    for (let i = 0; i < n; i++) {
      const { _x: x, _y: y } = cells[i];
      const dc = Math.hypot(x, y), dm = distPts(x, y, stations), dmn = distPts(x, y, newStations);
      const dq = distLine(x, y, planned), dr = distLine(x, y, river);
      raw.kc_trung_tam[i] = dc; raw.kc_metro[i] = dm; raw.kc_quy_hoach[i] = dq;
      raw.mat_do_poi[i] = Math.max(2, 380 * Math.exp(-dc / 4.5) + 110 * Math.exp(-dm / 1.3) + 25 + 22 * N.A[i]);
      raw.anh_sang_dem[i] = Math.max(0.5, 55 * Math.exp(-dc / 6) + 14 * Math.exp(-dm / 2) + 3 + 3 * N.B[i]);
      raw.rui_ro_ngap[i] = clamp01(0.85 * Math.exp(-dr / 1.4) + (y < -7 ? 0.25 : 0) + 0.08 * N.C[i]);
      raw.gia_m2[i] = Math.max(12, 28 + 230 * Math.exp(-dc / 5.5) + 55 * Math.exp(-dm / 1.8) + 30 * Math.exp(-dq / 2.2) + 9 * N.D[i]);
      raw.bien_dong_gia[i] = 2 + 22 * Math.exp(-dq / 2.4) + 12 * Math.exp(-dmn / 1.8) + 3 * N.E[i];
      raw.tang_tin_dang[i] = 4 + 70 * Math.exp(-dq / 2.0) + 32 * Math.exp(-dmn / 1.6) + 7 * N.F[i];
      raw.tu_khoa_dau_co[i] = Math.max(0, 3 + 32 * Math.exp(-dq / 2.3) + 10 * Math.exp(-dmn / 2) + 2.5 * N.G[i]);
      raw.ty_le_dat_trong[i] = Math.max(0, Math.min(95, 8 + 55 * (1 - Math.exp(-dc / 9)) + 12 * Math.exp(-dq / 2) + 6 * N.H[i]));
    }
    cells.forEach(c => { delete c._x; delete c._y; });
    const line = pts => pts.map(p => toLL(p[0], p[1]));
    const overlays = [
      { kind: 'river', label: 'Sông', coords: line(river) },
      { kind: 'metro', label: 'Tuyến metro (đang vận hành)', coords: line(metro), stations: line(stations) },
      { kind: 'plan', label: 'Cao tốc quy hoạch (đã công bố)', coords: line(planned) },
    ];
    return { name: 'Dữ liệu mẫu giả lập', sample: true, cells, raw, indicators: BASE_IND.map(d => ({ ...d })), overlays, nb };
  }

  function defaultConfig() {
    const w = (pairs) => { const o = {}; for (const [k, v, d] of pairs) o[k] = { w: v, dir: d }; return o; };
    return {
      params: [
        { key: 'rho_F', label: 'Lan tỏa không gian của F (ρF)', value: 0.25, min: 0, max: 0.9, step: 0.05, builtin: true, group: 'spatial' },
        { key: 'rho_B', label: 'Lan tỏa không gian của B (ρB)', value: 0.55, min: 0, max: 0.9, step: 0.05, builtin: true, group: 'spatial' },
        { key: 'nguong_F', label: 'Ngưỡng F cao', value: 0.4, min: 0.05, max: 0.95, step: 0.01, builtin: true, group: 'thr' },
        { key: 'nguong_B', label: 'Ngưỡng B cao', value: 0.4, min: 0.05, max: 0.95, step: 0.01, builtin: true, group: 'thr' },
        { key: 'nguong_rui_ro', label: 'Cảnh báo khi Bong bóng vượt', value: 15, min: 1, max: 60, step: 1, unit: '% diện tích', builtin: true, group: 'thr' },
        { key: 'sigma_w', label: 'Bất định trọng số (σw)', value: 0.3, min: 0, max: 1, step: 0.05, builtin: true, group: 'mc' },
        { key: 'sigma_x', label: 'Nhiễu dữ liệu (σx)', value: 0.08, min: 0, max: 0.3, step: 0.01, builtin: true, group: 'mc' },
        { key: 'n_sim', label: 'Số lần mô phỏng', value: 200, min: 50, max: 1000, step: 50, builtin: true, group: 'mc' },
        { key: 'p_trien_khai', label: 'Xác suất cao tốc được triển khai', value: 0.7, min: 0, max: 1, step: 0.05 },
        { key: 'lambda_km', label: 'Bán kính suy giảm tác động', value: 2.5, min: 0.5, max: 10, step: 0.5, unit: 'km' },
      ],
      derived: [
        { key: 'ky_vong_qh', label: 'Kỳ vọng từ quy hoạch', formula: 'p_trien_khai * exp(-kc_quy_hoach_raw / lambda_km)', normalize: false },
      ],
      idx: {
        F: { mode: 'weights', formula: '', w: w([['kc_trung_tam', 0.25, -1], ['kc_metro', 0.2, -1], ['mat_do_poi', 0.15, 1], ['anh_sang_dem', 0.1, 1], ['rui_ro_ngap', 0.1, -1], ['ky_vong_qh', 0.2, 1]]) },
        B: { mode: 'weights', formula: '', w: w([['tang_tin_dang', 0.3, 1], ['tu_khoa_dau_co', 0.3, 1], ['bien_dong_gia', 0.25, 1], ['ty_le_dat_trong', 0.15, 1]]) },
      },
    };
  }

  // ---------- Mô hình ----------
  const SCEN = [
    { key: 'sus', label: 'Tăng trưởng bền vững', rule: 'F cao · B thấp' },
    { key: 'hot', label: 'Tăng nóng có nền tảng', rule: 'F cao · B cao' },
    { key: 'bub', label: 'Bong bóng đầu cơ', rule: 'F thấp · B cao' },
    { key: 'calm', label: 'Trầm lắng', rule: 'F thấp · B thấp' },
  ];
  const classify = (f, b, tF, tB) => (f >= tF ? (b >= tB ? 1 : 0) : (b >= tB ? 2 : 3));

  function Model(ds, cfg) {
    this.ds = ds; this.cfg = cfg; this.n = ds.cells.length;
    this.baseNorm = {}; for (const d of ds.indicators) this.baseNorm[d.key] = normalize(ds.raw[d.key]);
    this.compileAll();
  }
  Model.prototype.allInd = function () {
    return this.ds.indicators.concat(this.cfg.derived.map(d => ({ key: d.key, label: d.label, unit: d.normalize ? '0–1 (chuẩn hóa)' : '0–1', group: 'der', dec: 2, derived: true })));
  };
  Model.prototype.compileAll = function () {
    const slots = [], slotIx = {};
    const add = k => { if (!(k in slotIx)) { slotIx[k] = slots.length; slots.push(k); } };
    for (const d of this.allInd()) { add(d.key); add(d.key + '_raw'); }
    for (const p of this.cfg.params) add(p.key);
    this.slots = slots; this.slotIx = slotIx;
    const slotOf = k => (k in slotIx ? slotIx[k] : -1);
    this.errors = {};
    this.derivedFns = this.cfg.derived.map(d => { try { return compile(d.formula, slotOf); } catch (e) { this.errors['der:' + d.key] = e.message; return null; } });
    this.idxFns = {};
    for (const k of ['F', 'B']) {
      const c = this.cfg.idx[k]; this.idxFns[k] = null;
      if (c.mode === 'formula') { try { this.idxFns[k] = compile(c.formula, slotOf); } catch (e) { this.errors['idx:' + k] = e.message; } }
    }
  };
  Model.prototype.pv = function (over) { const o = {}; for (const p of this.cfg.params) o[p.key] = p.value; return Object.assign(o, over || {}); };
  Model.prototype.newVals = function (pv) { const v = new Float64Array(this.slots.length); for (const k in pv) if (k in this.slotIx) v[this.slotIx[k]] = pv[k]; return v; };
  Model.prototype.fillCell = function (vals, i, X, R) {
    const s = this.slotIx;
    for (const k in X) { vals[s[k]] = X[k][i]; vals[s[k + '_raw']] = R[k][i]; }
  };
  // Tính các chỉ tiêu phái sinh theo bộ tham số pv
  Model.prototype.derive = function (pv) {
    const R = Object.assign({}, this.ds.raw), X = Object.assign({}, this.baseNorm), n = this.n;
    const vals = this.newVals(pv);
    this.cfg.derived.forEach((d, j) => { R[d.key] = new Float64Array(n); X[d.key] = new Float64Array(n); });
    this.cfg.derived.forEach((d, j) => {
      const fn = this.derivedFns[j], r = R[d.key];
      if (fn) for (let i = 0; i < n; i++) { this.fillCell(vals, i, X, R); const v = fn(vals); r[i] = isFinite(v) ? v : 0; }
      X[d.key] = d.normalize ? normalize(r) : Float64Array.from(r, clamp01);
    });
    return { R, X };
  };
  Model.prototype.index = function (which, X, R, pv, wMul) {
    const c = this.cfg.idx[which], n = this.n, out = new Float64Array(n);
    if (c.mode === 'formula') {
      const fn = this.idxFns[which]; if (!fn) return out;
      const vals = this.newVals(pv);
      for (let i = 0; i < n; i++) { this.fillCell(vals, i, X, R); out[i] = clamp01(fn(vals)); }
      return out;
    }
    const terms = []; let sw = 0;
    for (const k in c.w) {
      const t = c.w[k]; if (!t || t.w <= 0 || !X[k]) continue;
      const w = t.w * (wMul ? wMul(which, k) : 1); terms.push([X[k], w, t.dir]); sw += w;
    }
    if (sw <= 0) return out;
    for (let i = 0; i < n; i++) { let s = 0; for (const [x, w, d] of terms) s += w * (d > 0 ? x[i] : 1 - x[i]); out[i] = s / sw; }
    return out;
  };
  // Lan tỏa không gian: S = (1-ρ)·I + ρ·W·S  (W chuẩn hóa theo hàng, lặp tới điểm bất động)
  Model.prototype.spill = function (I, rho, iters) {
    if (rho <= 0) return I;
    const { start, idx } = this.ds.nb, n = this.n;
    let S = Float64Array.from(I), T = new Float64Array(n);
    for (let it = 0; it < (iters || 30); it++) {
      for (let i = 0; i < n; i++) {
        const a = start[i], b = start[i + 1]; let lag = 0;
        for (let j = a; j < b; j++) lag += S[idx[j]];
        T[i] = (1 - rho) * I[i] + rho * (b > a ? lag / (b - a) : I[i]);
      }
      const t = S; S = T; T = t;
    }
    return S;
  };
  Model.prototype.run = function (over, wMul) {
    const pv = this.pv(over), { R, X } = this.derive(pv);
    const F = this.spill(this.index('F', X, R, pv, wMul), pv.rho_F);
    const B = this.spill(this.index('B', X, R, pv, wMul), pv.rho_B);
    const sc = new Uint8Array(this.n); for (let i = 0; i < this.n; i++) sc[i] = classify(F[i], B[i], pv.nguong_F, pv.nguong_B);
    return { pv, R, X, F, B, sc };
  };
  const shareOf = (sc, k) => { let c = 0; for (const s of sc) if (s === k) c++; return c / sc.length; };

  // Monte Carlo: nhiễu trọng số (log-normal) + nhiễu dữ liệu (Gauss) → xác suất từng kịch bản
  Model.prototype.monteCarlo = function (det) {
    const pv = det.pv, n = this.n, ns = Math.round(pv.n_sim), rng = mulberry32(7);
    const counts = new Uint32Array(n * 4), shares = [[], [], [], []];
    const used = new Set();
    for (const k of ['F', 'B']) {
      const c = this.cfg.idx[k];
      if (c.mode === 'formula') Object.keys(det.X).forEach(x => used.add(x));
      else for (const x in c.w) if (c.w[x].w > 0) used.add(x);
    }
    const bufs = {}; used.forEach(k => (bufs[k] = new Float64Array(n)));
    for (let s = 0; s < ns; s++) {
      const mult = {};
      const wMul = (which, k) => { const kk = which + k; if (!(kk in mult)) mult[kk] = Math.exp(pv.sigma_w * gauss(rng)); return mult[kk]; };
      const X = Object.assign({}, det.X);
      used.forEach(k => { const src = det.X[k], b = bufs[k]; if (!src) return; for (let i = 0; i < n; i++) b[i] = clamp01(src[i] + pv.sigma_x * gauss(rng)); X[k] = b; });
      const F = this.spill(this.index('F', X, det.R, pv, wMul), pv.rho_F, 20);
      const B = this.spill(this.index('B', X, det.R, pv, wMul), pv.rho_B, 20);
      const c4 = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) { const k = classify(F[i], B[i], pv.nguong_F, pv.nguong_B); counts[i * 4 + k]++; c4[k]++; }
      for (let k = 0; k < 4; k++) shares[k].push(c4[k] / n);
    }
    const prob = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) prob[i] = counts[i] / ns;
    const summary = shares.map(arr => { const s = arr.slice().sort((a, b) => a - b); return { mean: s.reduce((a, b) => a + b, 0) / s.length, p5: quantile(s, 0.05), p95: quantile(s, 0.95) }; });
    const risk = shares[2].filter(v => v * 100 > pv.nguong_rui_ro).length / ns;
    return { prob, summary, risk, ns };
  };

  // Độ nhạy: thay từng trọng số / tham số ±50%, đo thay đổi % diện tích kịch bản mục tiêu
  Model.prototype.sensitivity = function (target) {
    const base = shareOf(this.run().sc, target), rows = [];
    for (const which of ['F', 'B']) {
      const c = this.cfg.idx[which]; if (c.mode !== 'weights') continue;
      for (const k in c.w) {
        if (!(c.w[k].w > 0)) continue;
        const f = m => shareOf(this.run(null, (w2, k2) => (w2 === which && k2 === k ? m : 1)).sc, target);
        const ind = this.allInd().find(d => d.key === k);
        rows.push({ label: which + ' · ' + (ind ? ind.label : k), lo: f(0.5) - base, hi: f(1.5) - base });
      }
    }
    for (const p of this.cfg.params) {
      if (['nguong_rui_ro', 'nguong_F', 'nguong_B', 'sigma_w', 'sigma_x', 'n_sim'].includes(p.key)) continue;
      const g = m => { const v = Math.max(p.min, Math.min(p.max, p.value * m)); return shareOf(this.run({ [p.key]: v }).sc, target); };
      rows.push({ label: 'Tham số · ' + p.label, lo: g(0.5) - base, hi: g(1.5) - base });
    }
    rows.sort((a, b) => Math.max(Math.abs(b.lo), Math.abs(b.hi)) - Math.max(Math.abs(a.lo), Math.abs(a.hi)));
    return { base, rows };
  };

  // Moran's I toàn cục và LISA (kiểm định hoán vị có điều kiện)
  Model.prototype.moran = function (x) {
    const { start, idx } = this.ds.nb, n = this.n; let m = 0; for (const v of x) m += v; m /= n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { const z = x[i] - m; let lag = 0; const a = start[i], b = start[i + 1]; for (let j = a; j < b; j++) lag += x[idx[j]] - m; num += z * (b > a ? lag / (b - a) : 0); den += z * z; }
    return den ? num / den : 0;
  };
  Model.prototype.lisa = function (x, perms) {
    const { start, idx } = this.ds.nb, n = this.n, rng = mulberry32(99); let m = 0; for (const v of x) m += v; m /= n;
    const z = Float64Array.from(x, v => v - m), out = new Uint8Array(n); // 0 không ý nghĩa,1 HH,2 LL,3 HL,4 LH
    for (let i = 0; i < n; i++) {
      const a = start[i], b = start[i + 1], k = b - a; if (!k) continue;
      let lag = 0; for (let j = a; j < b; j++) lag += z[idx[j]]; lag /= k;
      const Ii = z[i] * lag; let ext = 0;
      for (let p = 0; p < (perms || 99); p++) {
        let s = 0; for (let t = 0; t < k; t++) { let r = Math.floor(rng() * (n - 1)); if (r >= i) r++; s += z[r]; }
        const Ip = z[i] * s / k; if (Ii >= 0 ? Ip >= Ii : Ip <= Ii) ext++;
      }
      if ((ext + 1) / ((perms || 99) + 1) <= 0.05) out[i] = z[i] > 0 ? (lag > 0 ? 1 : 3) : (lag < 0 ? 2 : 4);
    }
    return out;
  };

  root.SaBan = { makeSample, defaultConfig, Model, SCEN, compile, normalize, robustRange, buildNeighbors, clamp01, quantile, shareOf };
})(typeof window !== 'undefined' ? window : globalThis);
