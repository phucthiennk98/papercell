import type { PapercellDoc } from './editor/types'

const p = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'p', ...extra, children: [{ text }] })
const h = (level: 1 | 2 | 3, text: string) => ({ type: 'h' + level, children: [{ text }] })
const py = (id: string, code: string, display: string, caption = '') => ({ type: 'python', id, code, display, caption, children: [{ text: '' }] })
const param = (name: string, label: string, min: number, max: number, step: number, value: number, unit = '') =>
  ({ type: 'param', id: 'p_' + name, name, label, min, max, step, value, unit, children: [{ text: '' }] })
const eq = (id: string, texExpression: string) => ({ type: 'equation', id, texExpression, children: [{ text: '' }] })
const cols = (widths: string[], ...columns: any[][]) => ({
  type: 'column_group',
  children: columns.map((children, i) => ({ type: 'column', width: widths[i], children })),
})

const DATA = `import numpy as np
import pandas as pd

rng = np.random.default_rng(7)
n = 5000
# 14 ga trên một tuyến giả lập, tọa độ tính bằng km
x_ga = np.linspace(0, 18, 14)
ga = np.c_[x_ga, 3 * np.sin(x_ga / 4.5) + 0.2 * x_ga]
chon = rng.integers(0, len(ga), n)
kc = rng.exponential(0.6, n)
goc = rng.uniform(0, 2 * np.pi, n)
gio = np.r_[rng.normal(7.5, 1.0, n // 2), rng.normal(17.8, 1.2, n - n // 2)]
trips = pd.DataFrame({
    "x": ga[chon, 0] + kc * np.cos(goc),
    "y": ga[chon, 1] + kc * np.sin(goc),
    "gio": np.clip(gio, 5, 23).round().astype(int),
    "khoang_cach_km": kc.round(2),
})
print(f"{len(trips):,} chuyến đi, {len(ga)} ga")`

const MAP = `import matplotlib.pyplot as plt

gan = trips[trips.khoang_cach_km <= ban_kinh_km]
fig, ax = plt.subplots(figsize=(5, 3.4))
hb = ax.hexbin(gan.x, gan.y, gridsize=int(so_o_luoi), cmap="Blues", mincnt=1, linewidths=0.2)
so = f"{len(gan):,}".replace(",", ".")
bk = f"{ban_kinh_km:.1f}".replace(".", ",")
ax.set_title(f"{so} chuyến trong bán kính {bk} km quanh ga", fontsize=9)
ax.plot(ga[:, 0], ga[:, 1], "o-", color="#1f2937", ms=3, lw=1, label="Tuyến metro")
ax.set_xlabel("Đông (km)")
ax.set_ylabel("Bắc (km)")
ax.set_aspect("equal")
ax.legend(loc="upper left", frameon=False, fontsize=8)
fig.colorbar(hb, ax=ax, label="Số chuyến", shrink=0.75)`

const HOURS = `dem = trips.groupby("gio").size()
fig, ax = plt.subplots(figsize=(5, 3))
ax.bar(dem.index, dem.values, color="#2a78d6", width=0.8)
ax.set_xlabel("Giờ trong ngày")
ax.set_ylabel("Số chuyến")
ax.spines[["top", "right"]].set_visible(False)`

const TABLE = `vung = pd.cut(trips.khoang_cach_km, [0, 0.5, 1, 2, 10],
              labels=["dưới 0,5 km", "0,5–1 km", "1–2 km", "trên 2 km"])
bang = trips.groupby(vung, observed=True).size().rename("so_chuyen").to_frame()
bang["ty_le_%"] = (100 * bang.so_chuyen / bang.so_chuyen.sum()).round(1)
bang`

export const SAMPLE: PapercellDoc = {
  version: 1,
  meta: { title: 'Hành vi đi lại quanh một tuyến metro', authors: 'Tác giả mẫu · Papercell', date: '2026-10-18' },
  content: [
    h(2, 'Tóm tắt'),
    p('Đây là bài mẫu của Papercell. Mỗi hình bên dưới là một ô Python chạy ngay trong trình duyệt. Dữ liệu là 5.000 chuyến đi giả lập quanh 14 ga của một tuyến metro, không phải số liệu thật.', { align: 'justify' }),
    h(2, '1. Dữ liệu'),
    p('Ô đầu tiên sinh dữ liệu và được đặt chế độ "Ẩn khi xuất bản": người đọc không thấy nó, nhưng các hình phía sau vẫn dùng kết quả của nó.', { align: 'justify' }),
    py('data', DATA, 'hidden'),
    p('Mỗi chuyến đi là một quyết định có tọa độ. Khoảng cách d từ điểm xuất phát tới ga theo phân phối mũ với trung bình μ = 0,6 km:', { align: 'justify' }),
    eq('eq1', String.raw`f(d) = \frac{1}{\mu}\, e^{-d/\mu}, \qquad d \ge 0`),
    cols(['42%', '58%'],
      [
        p('Hình 1 cho thấy mật độ chuyến đi tập trung dọc tuyến và thưa dần khi ra xa ga. Kéo hai thanh trượt bên dưới để đổi bán kính lọc và độ mịn của lưới; hình tự vẽ lại.', { align: 'justify' }),
        param('ban_kinh_km', 'Bán kính quanh ga', 0.2, 3, 0.1, 1.5, 'km'),
        param('so_o_luoi', 'Độ mịn lưới', 10, 40, 2, 24, 'ô'),
      ],
      [py('map', MAP, 'output', 'Mật độ chuyến đi theo ô lục giác quanh tuyến metro.')],
    ),
    h(2, '2. Kết quả'),
    cols(['50%', '50%'],
      [py('hours', HOURS, 'output', 'Số chuyến theo giờ: hai đỉnh sáng và chiều.')],
      [py('table', TABLE, 'both', 'Phân bố chuyến theo khoảng cách tới ga.')],
    ),
    p('Hơn một nửa số chuyến xuất phát trong bán kính 1 km quanh ga. Thử đổi tham số trong các ô rồi nhấn Shift+Enter để xem hình thay đổi.', { align: 'justify' }),
  ],
}
