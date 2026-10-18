# Papercell

Trình soạn bài báo khoa học kiểu Lark Docs. Mỗi hình trong bài là một ô Python chạy ngay trong trình duyệt (Pyodide). Bài viết xuất bản thành trang web tương tác và PDF.

Thiết kế chi tiết: [docs/DESIGN.md](docs/DESIGN.md).

## Chạy bằng Docker

```bash
docker compose up -d --build
```

Mở http://localhost:8765. Muốn đổi cổng: copy `.env.example` thành `.env` rồi sửa `PORT`.

## Phát triển

```bash
cd app
npm install
npm run dev
```

## Trạng thái

Giai đoạn 1 (đã xong):
- Trình soạn: tiêu đề, định dạng chữ, căn lề, thụt lề, chia 2–3 cột
- Ô Python với 4 chế độ hiển thị: code + kết quả, chỉ kết quả, chỉ code, ẩn khi xuất bản
- Đánh số hình tự động; xem trước kiểu bài báo; lưu và mở file `.papercell.json`

Giai đoạn 2 (đã xong một phần):
- Chọn chế độ hiển thị ô bằng nhóm icon có tooltip
- Khối tham số (thanh trượt): kéo là các ô phụ thuộc tự chạy lại
- Công thức toán (KaTeX), tự đánh số
- Menu `/` và nút `+` để chèn khối; tay cầm kéo thả khối; kéo mép để đổi độ rộng cột

Còn lại: trích dẫn, khối bản đồ, trình xuất bản, AI/MCP, PDF. Xem mục 8 trong tài liệu thiết kế.

## Giấy phép

MIT
