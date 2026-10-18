# Papercell: tài liệu thiết kế

Papercell là trình soạn bài báo khoa học kiểu Lark Docs. Mỗi hình trong bài là một ô Python chạy ngay trong trình duyệt. Bài viết xuất bản thành trang web tương tác và xuất được PDF.

## 1. Mục tiêu

| Mục tiêu | Ý nghĩa cụ thể |
|---|---|
| Ai cũng dùng được | Soạn bằng chuột như Lark/Notion, không cần biết markdown hay cài Python |
| Bài báo sống | Hình sinh ra từ code, đổi dữ liệu hoặc tham số thì hình đổi theo |
| Hai giao diện tách biệt | **Soạn** (cho tác giả) và **Xuất bản** (cho người đọc) |
| AI hỗ trợ | Agent viết đoạn văn, viết code vẽ hình, chạy thử, đề xuất thay đổi; điều khiển qua MCP |
| Mở | Giấy phép MIT, tự host bằng Docker |

**Không làm ở bản demo:** nhiều người cùng soạn, tài khoản người dùng, chạy Python trên server.

## 2. Kiến trúc

```
┌──────────────────────────── Trình duyệt ────────────────────────────┐
│  Trình soạn (React + Plate)          Trình xuất bản (React, chỉ đọc)  │
│        │  tài liệu JSON                     ▲                        │
│        ▼                                    │                        │
│  Kernel Python (Pyodide trong Web Worker) ──┘ kết quả: SVG/HTML/text │
└───────────────▲──────────────────────────────────────────────────────┘
                │ WebSocket (giai đoạn AI)
┌───────────────┴──────────────┐
│ Server Node nhỏ: phát ứng    │◄── Claude Desktop / Claude Code (MCP)
│ dụng + MCP server + cầu nối  │
└──────────────────────────────┘
```

- **Bản demo đầu tiên là trang tĩnh:** Vite build ra file HTML/JS, nginx phát trong Docker.
- **Server Node chỉ thêm ở giai đoạn AI/MCP,** vì MCP cần một tiến trình để agent bên ngoài kết nối vào.

## 3. Công nghệ

| Phần | Chọn | Giấy phép |
|---|---|---|
| Khung giao diện | React 19 + Vite + TypeScript | MIT |
| Trình soạn | Plate (`platejs`, `@platejs/*`), dựa trên Slate | MIT |
| Chia cột | `@platejs/layout` | MIT |
| Python | Pyodide (geopandas, shapely, rasterio, h3, scipy, sklearn, statsmodels, matplotlib, duckdb…) | MPL-2.0 |
| Bản đồ | MapLibre GL | BSD-3 |
| Công thức | KaTeX (qua `@platejs/math`) | MIT |
| AI | `@platejs/ai` cho giao diện, `@modelcontextprotocol/sdk` cho MCP | MIT |
| PDF | Typst (bản WebAssembly) hoặc in từ trình duyệt; chọn ở giai đoạn 5 | Apache-2.0 |

## 4. Định dạng tài liệu

Tài liệu là một file JSON (`*.papercell.json`) để dễ lưu git và dễ cho AI đọc/sửa.

```jsonc
{
  "version": 1,
  "meta": { "title": "...", "authors": [{ "name": "...", "affiliation": "..." }], "date": "2026-10-18" },
  "page": { "size": "A4", "margins": [25, 25, 25, 25], "width": "standard" },
  "params": { "ban_kinh": { "type": "slider", "min": 200, "max": 2000, "step": 50, "value": 800, "unit": "m" } },
  "references": [{ "id": "uber2018", "doi": "..." }],
  "content": [ /* cây khối của Plate */ ]
}
```

### Các loại khối

| Khối | Thuộc tính chính |
|---|---|
| Văn bản: `h1–h3`, `p`, `blockquote`, danh sách | `align`, `indent` |
| `column_group` → `column` | `width` (tỉ lệ %) |
| **`python`** | `code`, `display`, `caption`, `label` (để tham chiếu "Hình 1"), `outputs` (kết quả lưu sẵn) |
| **`param`** | Tên biến trong `params`; hiện thành thanh trượt / ô chọn / ô số |
| `equation` | TeX, có đánh số |
| `table`, `image`, `callout` | như Lark |
| `citation` (inline) | `refId` |

### Chế độ hiển thị của ô Python (`display`)

| Giá trị | Soạn | Xuất bản |
|---|---|---|
| `both` | Code + kết quả | Code + kết quả |
| `output` | Code thu gọn, bấm để mở | Chỉ kết quả, có nút **‹/› Code** |
| `code` | Chỉ code | Chỉ code |
| `hidden` | Hiện mờ, ghi "ẩn khi xuất bản" | Không hiện (vẫn chạy) |

`outputs` được **lưu sẵn trong file**. Trang xuất bản hiện hình ngay lập tức, không phải đợi Pyodide tải (khoảng 10 MB). Python chỉ khởi động khi người đọc kéo thanh trượt hoặc bấm chạy.

## 5. Kernel Python

- Một Web Worker giữ **một không gian biến chung** cho cả bài, giống Jupyter.
- Trước khi chạy ô, tự cài gói theo các lệnh `import` có trong ô (`loadPackagesFromImports`).
- Thu kết quả theo thứ tự ưu tiên:
  1. Hình matplotlib → SVG
  2. Giá trị cuối có `_repr_html_` (DataFrame…) → HTML
  3. GeoDataFrame → GeoJSON → khối bản đồ (giai đoạn 2)
  4. Còn lại → text
- `stdout` và `stderr` được hiển thị kèm. Lỗi hiện traceback rút gọn.
- **Tham số:** trước mỗi lần chạy, giá trị các tham số được gán vào biến Python cùng tên. Đổi thanh trượt thì chạy lại các ô **có nhắc tới tên biến đó** và các ô phía sau chúng, theo thứ tự trong bài.

## 6. Hai giao diện

| | Soạn | Xuất bản |
|---|---|---|
| URL | `/#edit` | `/#read` (sau này: file HTML tĩnh xuất riêng) |
| Thanh công cụ, tay cầm kéo khối, menu `/` | có | không |
| Khung AI | có | không |
| Ô `hidden` | hiện mờ | không hiện |
| Mục lục, nút "Hiện tất cả code", Trích dẫn, Tải PDF | – | có |
| Kiểu chữ | sans, gọn để thao tác | serif, dễ đọc lâu |

## 7. AI agent và MCP (giai đoạn 4)

Khung AI trong trình soạn và MCP server dùng **chung một bộ công cụ**:

| Công cụ | Việc |
|---|---|
| `get_document` / `get_outline` | Đọc bài (toàn bộ hoặc dàn ý) |
| `insert_blocks`, `update_block`, `delete_block`, `move_block` | Sửa nội dung |
| `set_columns`, `set_alignment` | Sửa bố cục |
| `add_python_cell`, `run_cell` | Viết code và chạy; trả về text và **ảnh hình** để agent tự kiểm tra |
| `add_param`, `set_cell_display`, `add_reference` | Tham số, hiển thị, tài liệu tham khảo |

- Mọi thay đổi của agent đi vào **hàng đợi đề xuất**. Tác giả chấp nhận hoặc bỏ từng thay đổi.
- MCP server chạy trong server Node, nối với tab trình soạn qua WebSocket. Code Python vẫn chạy trong trình duyệt.

## 8. Lộ trình demo

| Giai đoạn | Nội dung | Xong khi |
|---|---|---|
| **1** | Trình soạn: văn bản, căn lề, chia cột, ô Python + 4 chế độ hiển thị, lưu/mở file. Docker. | Soạn được bài 2 cột có hình matplotlib chạy thật |
| 2 | Khối tham số (thanh trượt) + chạy lại phụ thuộc; khối bản đồ; công thức; trích dẫn; đánh số hình | Kéo thanh trượt là hình đổi |
| 3 | Trình xuất bản: giao diện đọc, mục lục, nút code, xuất file HTML tĩnh | Gửi link là người khác đọc được |
| 4 | Khung AI + MCP server | Claude viết được một hình mới từ một câu lệnh |
| 5 | Xuất PDF (khổ trang, lề, ảnh chụp hình tương tác) | Ra PDF dùng được để nộp |

## 9. Rủi ro đã biết

- **Pyodide tải lần đầu chậm** (khoảng 10 MB và thêm gói). Cách giảm: lưu sẵn kết quả, chỉ tải khi cần, cache của trình duyệt.
- **Pyodide thiếu PySAL, osmnx, plotly.** Cần thử `micropip` hoặc cung cấp hàm thay thế.
- **Dữ liệu lớn** (trên khoảng 100 MB) không hợp chạy trong trình duyệt. Sau này thêm tùy chọn kernel trên server.
- **Gõ tiếng Việt bằng bộ gõ (Unikey/Telex):** trình soạn dựa trên Slate cần được kiểm thử kỹ.
