# AGENTS.md — Cách các agent làm việc trong dự án Papercell

## Vai trò

| Agent | Vai trò | Được làm | Không được làm |
|---|---|---|---|
| **Claude (Claude Code)** | **Điều phối** | Nói chuyện với người dùng, hiểu yêu cầu, chia việc, viết brief cho từng việc, giao cho Codex / Antigravity, đọc lại diff, kiểm tra trên trình duyệt, build, commit, báo cáo cho người dùng | Tự viết phần lớn code. Claude chỉ sửa trực tiếp khi việc quá nhỏ (vài dòng) hoặc khi phải ghép/sửa lỗi sau khi worker làm xong |
| **Codex** | **Thực thi** | Nhận một brief từ Claude, sửa đúng các file được giao, chạy kiểm tra, trả báo cáo | Commit, push, đổi nhánh, sửa file ngoài phạm vi brief, tự mở rộng yêu cầu |
| **Antigravity (agy)** | **Thực thi** | Như Codex | Như Codex |

Chỉ **Claude** nhận yêu cầu từ người dùng và quyết định việc gì làm, ai làm. Worker (Codex, Antigravity) chỉ nhận việc từ Claude.

## Dự án

**Trước khi làm bất kỳ việc gì, đọc [`docs/CODEBASE.md`](docs/CODEBASE.md)** (bản đồ mã nguồn: kiến trúc, luồng dữ liệu, cách mở rộng, bẫy đã biết). Việc nào đổi kiến trúc thì cập nhật luôn file đó trong cùng việc.


**Papercell**: trình soạn bài báo khoa học kiểu Lark Docs. Hình vẽ bằng JS (Observable Plot / D3, bản đồ MapLibre), có code Python gốc để kiểm chứng và tính sẵn, xuất ra một file HTML mở được ở mọi nơi.

- `app/`: toàn bộ ứng dụng (React 19 + Vite 8 + TypeScript, editor Plate v53, Tailwind v4 + shadcn).
  - `src/figure/`: thẻ hình: runtime, tab Design (`builder.ts`, `DesignTab.tsx`), popup (`FigureDialog.tsx`), trình soạn code (`CodeEditor.tsx`), bản đồ (`map.ts`), tính sẵn (`scenarios.ts`, `ScenarioTab.tsx`), mẫu hình (`templates.ts`, `control-templates.ts`).
  - `src/components/`: component của Plate (kéo về bằng shadcn, đã chỉnh).
  - `src/editor/`: kiểu dữ liệu tài liệu (`types.ts`), nâng cấp tài liệu cũ (`upgrade.ts`), kéo thả tạo cột (`side-drop.ts`).
  - `src/ai/`: Trợ lý AI, skill hướng dẫn viết code hình (`skills/*.md`).
  - `src/viewer/`: trang đọc dùng khi xuất HTML.
  - `server/`: server Hono (AI, agent trên máy, Python trên máy).
- `chay-tren-may.bat` / `.sh`: build và chạy trên máy (cổng 8780). `docker-compose.yml`: bản Docker (cổng 8765).

## Quy ước bắt buộc

- **Giao diện chỉ dùng tiếng Anh** (nút, menu, thông báo, lỗi). Nội dung bài viết thì ngôn ngữ nào cũng được.
- Comment trong code: tiếng Việt hoặc tiếng Anh, viết ngắn, theo giọng của file đang sửa.
- Code mới phải giống code xung quanh: cách đặt tên, độ dài dòng, mật độ comment.
- Chuỗi có ký tự thoát (`\n`, regex) thì sửa bằng công cụ sửa file, không chèn qua heredoc của shell (đã nhiều lần làm hỏng code).
- Không cài thêm thư viện nếu brief không cho phép.
- Không chạy server ở cổng **8780** hoặc **8765** (người dùng tự bật/tắt). Cần thử thì dùng cổng khác hoặc build tĩnh.

## Kiểm tra trước khi báo xong (worker)

Chạy trong thư mục `app/`:

```bash
npx tsc -b
npx vite build
npm run build:viewer
```

Cả ba phải qua, không có lỗi. Brief có yêu cầu kiểm tra riêng thì làm thêm phần đó.

## Quy trình

1. **Claude** nhận yêu cầu, xem code liên quan, chia thành các việc độc lập. Mỗi việc chỉ đụng một nhóm file, hai worker không bao giờ sửa cùng một file cùng lúc.
2. **Claude** viết brief (mẫu bên dưới) và giao **qua Orca**, để người dùng theo dõi mỗi worker trong một tab:
   - Tạo Run: `orca orchestration run-create --objective "<mục tiêu>" --json`
   - Giao việc: `orca orchestration worker-start --run <run_id> --spec "<brief>" --task-title "<tên ngắn>" --worktree "path:D:/Workspace/projects/project_01" --agent codex|antigravity --json`
   - Chờ kết quả: `orca orchestration check --run <run_id> --wait --types "worker_done,escalation,question" --json`; xử lý xong thì `--ack <delivery_id>` và `worker-release --dispatch <dispatch_id>`.
   - Worker ghi báo cáo vào `.agent-reports/<tên>.md` (bị git bỏ qua) và gửi `worker_done` kèm `--report-path`.
   - Dự phòng khi Orca không chạy: `codex exec -s workspace-write -C "D:/Workspace/projects/project_01" "<brief>"` hoặc `agy -p "<brief>" --mode accept-edits`.
3. **Worker** làm đúng brief, chạy kiểm tra, trả báo cáo (mẫu bên dưới). **Không commit.**
4. **Claude** đọc `git diff`, chạy lại kiểm tra, thử trên trình duyệt nếu là thay đổi giao diện, sửa nốt chỗ ghép nối. Thiếu thì giao lại cho worker kèm nhận xét cụ thể.
5. **Claude** commit (thông điệp tiếng Việt, mô tả cái gì đổi và vì sao) và báo cáo cho người dùng.

### Mẫu brief (Claude → worker)

```
VIỆC: <một câu, kết quả mong muốn>
BỐI CẢNH: <vì sao cần, người dùng đã nói gì>
FILE ĐƯỢC SỬA: <danh sách file; ngoài danh sách này thì không đụng>
CHI TIẾT:
- <yêu cầu 1>
- <yêu cầu 2>
XONG KHI: <điều kiện kiểm tra được, ví dụ "tsc + vite build qua; mẫu X hiện dropdown Y">
KHÔNG LÀM: <những gì ngoài phạm vi>
```

### Mẫu báo cáo (worker → Claude)

```
ĐÃ LÀM: <tóm tắt từng thay đổi, theo file>
KIỂM TRA: <lệnh đã chạy và kết quả, nguyên văn nếu có lỗi>
CHƯA LÀM / VƯỚNG: <phần chưa xong, lý do, câu hỏi cho Claude>
```

## Ghi chú cho worker

- Brief không rõ thì ghi câu hỏi vào phần "CHƯA LÀM / VƯỚNG" rồi dừng, không đoán.
- Phát hiện lỗi ngoài phạm vi thì ghi vào báo cáo, không tự sửa.
- Không xóa file, không đổi tên file, không chạy lệnh git làm thay đổi lịch sử (commit, reset, checkout, rebase, push).
