# Papercell

Trình soạn bài báo khoa học kiểu Lark Docs. Hình trong bài vẽ bằng JS, có thanh trượt tham số, kèm code Python gốc để đối chiếu và kiểm chứng. Có trợ lý AI dùng API key hoặc dùng agent đã cài trên máy.

Thiết kế chi tiết: [docs/DESIGN.md](docs/DESIGN.md).

## Cách chạy

### 1. Docker: dễ nhất, dùng AI bằng API key

```bash
docker compose up -d --build
```

Mở http://localhost:8765. Đổi cổng: copy `.env.example` thành `.env` rồi sửa `PORT`.

Muốn server có sẵn key để không phải nhập trong app, thêm biến môi trường vào `docker-compose.yml`, ví dụ `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GATEWAY_API_KEY`.

### 2. Chạy thẳng trên máy: dùng được agent đã cài (Claude Code, Codex, Antigravity)

Windows: bấm đúp **`chay-tren-may.bat`**. macOS/Linux: chạy `./chay-tren-may.sh`. Script tự cài thư viện (lần đầu), build, rồi mở http://localhost:8780. Trong **Trợ lý AI → Agent trên máy**, app tự dò các agent có trên máy và dùng tài khoản đã đăng nhập sẵn của agent đó. Agent chạy ở chế độ chỉ đọc trong một thư mục tạm chứa nội dung bài.

Chế độ này không chạy trong Docker, vì container không thấy các chương trình cài trên máy. Vì lý do an toàn, server chỉ cho gọi agent từ chính máy đó (127.0.0.1).

## Phát triển

```bash
cd app
npm install
npm run dev:server   # server API ở cổng 8787 (tự build lại khi sửa)
npm run dev          # giao diện ở cổng 5173
```

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `app/src/components/` | Bộ giao diện editor của Plate (kéo về qua shadcn, đã tùy biến) |
| `app/src/figure/` | Thẻ hình JS: vẽ, popup, quyền xem code, kiểm chứng Python ↔ JS, dữ liệu |
| `app/src/ai/` | Sidebar Trợ lý AI và cài đặt nhà cung cấp |
| `app/src/docs/` | Lưu nhiều bài trong trình duyệt |
| `app/server/` | Server Hono: route AI, agent trên máy, phát giao diện |

## Giấy phép

MIT
