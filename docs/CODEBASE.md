# Bản đồ mã nguồn Papercell

Tài liệu cho các agent (và người) cần hiểu dự án trước khi sửa code. Mọi đường dẫn tính từ gốc dự án.
Được gộp từ hai báo cáo đọc code (Antigravity: server, AI, khung ứng dụng, build; Codex: hình và editor)
và đã được Claude đối chiếu ngẫu nhiên với code ngày 2026-10-21. **Khi đổi kiến trúc, cập nhật file này.**

Mục lục
- Phần A. Khung ứng dụng, server, AI, tùy biến Plate, build
- Phần B. Thẻ hình, Design, tính sẵn Python, xuất HTML, editor
- Phần C. Rủi ro đã biết chưa xử lý

---

## Phần A. Khung ứng dụng, server, AI, tùy biến Plate, build

### 1. Khung ứng dụng và Lưu trữ tài liệu

- **Điểm vào (`app/src/main.tsx`)**: Nạp CSS của KaTeX (`katex.min.css`), Tailwind (`index.css`), và CSS hình vẽ (`figure/papercell.css`, `figure/figure.css`), sau đó render `<App />`.
- **Khung chính (`app/src/App.tsx`)**:
  - Quản lý trạng thái cấp ứng dụng: `docId` hiện tại (khởi tạo qua `ensureFirstDoc()`), danh sách `docs` (`listDocs()`), ẩn/hiện thanh bên trái (`sidebar`), từ khóa tìm bài (`query`), mục lục (`headings`), tham chiếu `editor`, và trạng thái đóng/mở `AssistantPanel` (lưu ở `localStorage['papercell.assistant']`; tự thu gọn `sidebar` nếu màn hình `< 1280px`).
  - **Sidebar trái**: Ô tìm kiếm bài viết theo tiêu đề, danh sách tài liệu (tạo bài trống `emptyDoc()`, xóa bài `deleteDoc()`), cây mục lục (`Outline` nhảy tới khối qua `editor.api.toDOMNode`), và 2 nút tạo nhanh bài mẫu (`makeSample()`, `makeGallery()`).
  - **`DocView`**: Khởi tạo trình soạn thảo bằng `usePlateEditor({ plugins: PapercellKit, value: initial.content })` (gán `window.__editor = editor` ở bản dev). Tự động lưu sau 400ms (`persist`) khi đổi `meta`, `files` hoặc nội dung bài (`onChange`). Đồng bộ chế độ đọc/soạn (`readOnly`) với `location.hash` (`#read` / `#edit`).
  - **Ba React Context bọc quanh `<Plate>`**:
    1. `MetaContext` (`app/src/editor/DocHeader.tsx`): cung cấp `{ meta, setMeta }` (tiêu đề, tác giả, ngày) cho `DocHeader` và nút xuất file.
    2. `DataContext` (`app/src/figure/runtime.ts`): cung cấp `{ files, data: parseData(files), setFiles }` cho các thẻ hình, bảng dữ liệu (`DataPanel`) và gợi ý code.
    3. `FigureNumbers` (`app/src/figure/FigureElement.tsx`): cung cấp bảng ánh xạ số thứ tự hình (`scan(value).figs`) để đánh số tự động.
  - **Đồng bộ cấu hình AI vào Plate**: `useEffect` trong `DocView` đăng ký `aiStore.subscribe` để bơm `aiConfig` vào `chatOptions.body` của `aiChatPlugin` và `completeOptions.body` của `CopilotPlugin`.
- **Lưu trữ `localStorage` (`app/src/docs/store.ts`)**:
  - Danh mục bài viết lưu tại khóa `papercell.index.v1` (`DocEntry[]` gồm `{ id, title, updated }`), sắp xếp mới nhất lên đầu.
  - Nội dung từng bài lưu riêng tại `papercell.doc.<id>` (định dạng `PapercellDoc` `version: 3`). Khi đọc qua `loadDoc(id)`, dữ liệu được đi qua `upgradeDoc(d)` (`app/src/editor/upgrade.ts`) để tương thích ngược.
  - `ensureFirstDoc()`: Lần đầu mở sẽ tự tạo bộ thử biểu đồ (`papercell.gallery.v1`) và bài mẫu (`makeSample()`).
- **Bộ plugin Plate (`app/src/editor/papercell-kit.tsx`, `app/src/components/editor/editor-kit.tsx`)**:
  - `EditorKit` tập hợp toàn bộ plugin chuẩn: `CopilotKit`, `AIKit`, các khối văn bản/bảng/cột/toán/code (`BasicBlocksKit`, `TableKit`, `ColumnKit`, `MathKit`, `CodeBlockKit`…), kéo thả (`DndKit`), menu `/` (`SlashKit`), xuất nhập (`DocxKit`, `MarkdownKit`) và thanh công cụ (`FixedToolbarKit`, `FloatingToolbarKit`).
  - `PapercellKit = [...EditorKit, FigurePlugin, DocHeaderPlugin]`: bổ sung khối void `FigurePlugin` (`key: 'figure'`, render `FigureElement`) và `DocHeaderPlugin` (`key: 'docHeader'`, render `DocHeader` ở vị trí `beforeEditable`).

### 2. Server Hono, AI SDK, Agent cục bộ và Python cục bộ

- **Các route chính (`app/server/index.ts`)**:
  - Chạy trên Hono (`@hono/node-server`), cổng mặc định `PORT ?? 8787`. Khi `NODE_ENV === 'production'`, phục vụ file tĩnh từ `./dist` và fallback SPA về `./dist/index.html`.
  - `GET /api/health`: trả `{ ok: true }` (dùng cho Docker healthcheck).
  - `POST /api/ai/command` (`app/server/ai/command/route.ts`): phục vụ menu AI trong bài của Plate (`aiChatPlugin`). Tạo `SlateEditor` với `BaseEditorKit`, tự chọn công cụ (`generate`, `edit`, `comment`) hoặc sửa bảng (`table`) qua `streamText` + `createUIMessageStream`.
  - `POST /api/ai/copilot` (`app/server/ai/copilot/route.ts`): gợi ý hoàn thành câu (`GhostText`, tối đa 50 token) cho `CopilotPlugin`.
  - `POST /api/assistant/chat` (`app/server/ai/assistant.ts`): phục vụ chat ở sidebar phải.
  - `GET /api/ai/status` & `POST /api/ai/models`: báo nhà cung cấp nào đã có sẵn biến môi trường trên server (`serverKeys()`) và lấy danh sách model trực tiếp từ API nhà cung cấp (`listModels()`).
  - **Kiểm tra `isLocal(c)`**: Chỉ cho phép địa chỉ `127.0.0.1`, `::1`, `::ffff:127.0.0.1` (hoặc khi bật `PAPERCELL_ALLOW_REMOTE_AGENTS=1`) gọi vào `/api/agents`, `/api/agents/chat`, `/api/python`, `/api/python/grid`.
- **Cấu hình AI & Stream (`app/server/ai/provider.ts`, `app/server/ai/assistant.ts`)**:
  - `readConfig(body)` đọc `body.aiConfig` (hoặc kiểu cũ `apiKey` + `model` của Plate). `keyFor(cfg)` ưu tiên `cfg.apiKey` do người dùng nhập, nếu trống thì lấy biến môi trường trên server (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GATEWAY_API_KEY`, `COMPATIBLE_API_KEY`).
  - `resolveModel(cfg)` tạo `LanguageModel` của Vercel AI SDK (`createAnthropic`, `createOpenAI`, `createGoogleGenerativeAI`, `createGateway`, `createOpenAICompatible`). Ném `ConfigError` (HTTP 401) nếu thiếu key.
  - `assistantChat` cắt ngữ cảnh `doc` tối đa `200_000` ký tự, gọi `streamText` và phát luồng `text/plain`. Các thông báo tiến độ và lỗi giữa chừng được nhúng trực tiếp vào luồng qua hai dấu hiệu: `PROGRESS_MARK = '\u0000P:'` (kết thúc bằng `\n`) và `ERROR_MARK = '\u0000ERR:'`. Hàm `describe(e)` dịch các mã lỗi 401/403, 404, `ECONNREFUSED` sang thông báo tiếng Anh dễ hiểu.
- **Agent trên máy (`app/server/agents/local.ts`)**:
  - Hỗ trợ 3 CLI agent trong mảng `AGENTS`:
    1. `claude` (Claude Code): `claude -p --output-format text --permission-mode plan` (nhận prompt qua `stdin`).
    2. `codex` (Codex): `codex exec --json -s read-only --skip-git-repo-check --ephemeral -` (nhận prompt qua `stdin`, lọc JSONL chỉ lấy `agent_message` cuối cùng làm câu trả lời, các bước trước đẩy vào `progress`).
    3. `agy` (Antigravity): `agy -p=<prompt> --output-format stream-json --mode plan` (`promptInArgs: true`, đọc `step_update` từ luồng JSON).
  - `resolveBin(name)` tìm file chạy trong `PATH` và các thư mục cài đặt quen thuộc `knownDirs(name)` (ưu tiên `.exe` trước `.cmd`/`.bat` trên Windows). `detectAgents(force)` chạy `<bin> --version` và lưu cache 60 giây.
  - `agentChat`: Tạo thư mục tạm `papercell-agent-*` trong `tmpdir()`, ghi nội dung bài (tối đa `500_000` ký tự) vào `document.md`, chạy agent ở chế độ chỉ đọc/plan với `cwd` là thư mục tạm (timeout 5 phút), phát luồng kèm `PROGRESS_MARK` / `ERROR_MARK`, và xóa thư mục tạm trong khối `finally`.
  - `stopTree(child)`: Trên Windows, agent chạy qua `.cmd` tạo tiến trình con nên `child.kill()` chỉ tắt vỏ ngoài; phải gọi `taskkill /pid <pid> /T /F` để dừng toàn bộ cây tiến trình khi hủy hoặc hết giờ.
- **Python trên máy (`app/server/python/grid.ts`)**:
  - `pythonBin()` tìm `python`, `py`, hoặc `python3` (bỏ qua nếu `bin.shell === true`). `detectPython()` kiểm tra thực thi được `import sys, pandas` và lưu cache 60 giây.
  - `runGrid(job, signal)`: Tạo thư mục tạm `papercell-grid-*`, ghi các bảng dữ liệu ra `data_<i>.csv|json` và script `runner.py` (hằng `RUNNER`), truyền `{ code, files, combos }` qua `stdin`.
  - Script `RUNNER` đọc sẵn dữ liệu bằng `pandas`, biên dịch code một lần (`compile(job["code"], "<python>", "exec")`), rồi lặp qua từng tổ hợp tham số `combos`: tạo bản sao độc lập của `data` (`v.copy()` / `copy.deepcopy`), thực thi `exec(code, g)`, thu giá trị biến `ket_qua` (chuyển DataFrame/Series/numpy/NaN sang JSON hợp lệ qua `jsonable()`), đóng các hình matplotlib và in từng dòng JSONL (`application/x-ndjson`) về trình duyệt.

### 3. Trợ lý AI phía trình duyệt và Ô nhờ AI trong CodeEditor

- **Cấu hình & Store (`app/src/ai/config.ts`, `app/src/ai/store.ts`)**:
  - Định nghĩa 5 `ProviderId`: `'anthropic' | 'openai' | 'google' | 'gateway' | 'compatible'` trong hằng `PROVIDERS`.
  - `aiStore` (kèm hook `useAI` qua `useSyncExternalStore`) lưu cấu hình vào `localStorage` (`papercell.ai.config`, `papercell.ai.mode`, `papercell.ai.agent`, `papercell.ai.remember`). Riêng API key (`papercell.ai.key`) chỉ lưu ở `sessionStorage` theo mặc định và chỉ sang `localStorage` khi người dùng bật `remember`.
- **Hàm gọi AI dùng chung (`app/src/ai/ask.ts`)**:
  - `parseStream(raw)` tách phần chữ trả lời (`content`), dòng trạng thái (`PROGRESS_MARK`) và lỗi (`ERROR_MARK`) từ luồng dữ liệu thô.
  - `askAI({ messages, doc, signal, onUpdate })` kiểm tra `aiStore.get()`: nếu `mode === 'agent'` thì gửi tới `/api/agents/chat`, ngược lại gửi tới `/api/assistant/chat`, tự giải mã stream và trả về toàn bộ văn bản khi hoàn tất.
- **Sidebar Trợ lý AI (`app/src/ai/AssistantPanel.tsx`)**:
  - Cho phép chuyển đổi giữa 2 chế độ `API key` và `Local agent`, quét lại agent (`/api/agents?refresh=1`), tải danh sách model (`/api/ai/models`).
  - Hàm `docAsMarkdown(editor)` tuần tự hóa toàn bộ bài đang mở sang Markdown (riêng khối `figure` được chuyển thành `[Figure: <caption>]` kèm khối code `js`) để gửi làm ngữ cảnh.
  - Hiển thị câu trả lời bằng `ReactMarkdown` + `remarkGfm` + `remarkMath` + `rehypeKatex` (hàm `normalizeMath` đổi `\[ \]` và `\( \)` sang `$$` và `$`). Nút **Insert** (`insert(md)`) giải mã Markdown thành node của Plate và chèn ngay dưới khối hiện tại.
- **Trình soạn code & CodeAssist (`app/src/figure/CodeEditor.tsx`, `app/src/ai/skills/*.md`)**:
  - `CodeEditor`: bọc CodeMirror 6 hỗ trợ `js` và `python`, giữ nguyên vị trí con trỏ khi nhận code mới từ bên ngoài (chỉ dispatch phần diff). Nguồn gợi ý tự động (`jsSource`, `pySource`) đọc `useCodeHints(params)` để gợi ý hàm của `Plot`, `d3`, `pc`, `pd`, `np`, tên bảng trong `data`, tên cột và tên tham số.
  - `CodeAssist`: Ô nhập lệnh nhờ AI viết/sửa code hình. Tự động đính kèm skill tương ứng (`src/ai/skills/figure-js.md` hoặc `figure-python.md` được nạp qua `?raw`), danh sách bảng/cột, tham số hiện tại, code hiện tại và code của ngôn ngữ kia để đối chiếu (`contextBlock`).
  - **Cú pháp `@mention`**: Gõ `@` trong `CodeAssist` sẽ mở menu chọn `@<dataset>` hoặc `@<dataset>.<column>` (`updateMenu`, `parseMentions`). Hàm `profile()` dùng `describeColumns` và `d3` để tóm tắt kiểu dữ liệu, khoảng giá trị (`min`, `max`, `mean` cho số; khoảng ngày cho `date`; 12 giá trị phổ biến nhất cho chữ) và gửi kèm vào prompt.
  - Khi `askAI` trả về, `extractCode` tách khối code đầu tiên trong cặp ` ``` ` và gọi `onApply(got.code)` để cập nhật vào `CodeEditor` như một bước hoàn tác được (`Ctrl+Z`).

### 4. Các chỉnh sửa trên Component của Plate

- **`app/src/components/ui/dropdown-menu.tsx`**: Ở `DropdownMenuContent`, đã bỏ lớp ép độ rộng bằng nút bấm (`w-(--radix-dropdown-menu-trigger-width)`), chỉ giữ `min-w-32` để các menu thả xuống (như menu Figure, Export, Turn into) tự mở rộng vừa khít nội dung.
- **`app/src/components/ui/block-draggable.tsx` & `app/src/editor/side-drop.ts`**:
  - **Vạch chèn kiểu Lark (`InsertGap`)**: Nằm ở mép trên mỗi khối (ngoài bảng); khi rê chuột vào khoảng trống giữa hai khối sẽ hiện đường kẻ ngang kèm nút `+` để chèn nhanh một đoạn văn trống (rất cần giữa hai hình, bảng hoặc nhóm cột liền nhau).
  - **Nút `+` cạnh tay cầm kéo (`openInsertMenu`)**: Bấm nút `+` ở lề trái khối sẽ nhảy vào dòng trống hiện tại (hoặc tạo dòng mới ngay bên dưới) rồi tự gõ `/` để bật menu chèn khối.
  - **Thả cạnh bên tạo cột (`side-drop.ts`)**: Trong `onDragOver` của khối trong cùng, `sideOf(clientX, rect)` kiểm tra con trỏ có nằm ở vùng biên trái/phải (`20%` chiều rộng khối, tối đa `90px`) không. Nếu hợp lệ (`canDropSide`, tối đa `MAX_COLUMNS = 4`), hiện vạch dọc màu thương hiệu và khi thả chuột thì `dropToSide(editor, ids, side.id, side.side)` gom hai khối vào `column_group` (hoặc thêm cột mới vào nhóm sẵn có) rồi gọi `equalize()` chia đều độ rộng `%`.
- **`app/src/components/ui/column-node.tsx`**: Thêm thanh kéo dọc `.col-resize-handle` ở ranh giới giữa hai cột (`!readOnly && !isLast`). Hàm `startResize` cập nhật trực tiếp `style.width` của hai cột liền kề khi kéo chuột (giữ mỗi cột `>= 10%`) và khi nhả chuột mới gọi `editor.tf.setNodes` bên trong `editor.tf.withoutNormalizing` để chỉ tạo đúng một bước hoàn tác (undo).
- **Menu Figure, Menu `/` và Xuất HTML**:
  - `app/src/components/ui/figure-toolbar-button.tsx`: Nút `FigureToolbarButton` (đặt trên `FixedToolbarButtons` tại `app/src/components/ui/fixed-toolbar-buttons.tsx`) hiển thị lưới 4 cột các loại biểu đồ từ dữ liệu (`CHART_TYPES` → `insertChart`) và danh sách mẫu code có sẵn (`FIGURE_TEMPLATES` → `insertFigure`, tách riêng nhóm có điều khiển người đọc `controls-*`).
  - `app/src/components/ui/slash-node.tsx`: Bổ sung 2 nhóm `Charts from data` (`chartGroup`) và `Figure templates (code)` (`figureGroup`) ngay dưới mục AI trong `SlashInputElement`, kèm hàm `VN()` chuẩn hóa tiếng Việt không dấu để tìm nhanh bằng cả tiếng Việt lẫn tiếng Anh.
  - `app/src/components/ui/export-toolbar-button.tsx`: Thay thế hành vi xuất HTML tĩnh mặc định của Plate bằng `exportDocHtml({ meta, files, content: editor.children })` (lấy `meta` từ `MetaContext` và `files` từ `DataContext`) để tạo file HTML tự chạy đầy đủ biểu đồ và thanh trượt.

### 5. Build, Đóng gói Viewer và Chạy ứng dụng

- **Các script trong `app/package.json`**:
  - `npm run dev`: chạy Vite dev server ở cổng `5173` (`app/vite.config.ts`), cấu hình proxy chuyển mọi request `/api` sang `http://localhost:8787`.
  - `npm run dev:server`: chạy `node scripts/server.mjs --watch` để biên dịch và tự khởi động lại server API ở cổng `8787` khi sửa code.
  - `npm run build`: chạy tuần tự `tsc -b && vite build && npm run build:viewer && node scripts/server.mjs`.
  - `npm run build:viewer`: chạy `vite build -c vite.viewer.config.ts && node scripts/inline-viewer.mjs`.
  - `npm start`: chạy `node server-dist/index.mjs`.
- **Đóng gói server bằng esbuild (`app/scripts/server.mjs`)**: Bundle `server/index.ts` thành một file ESM `server-dist/index.mjs` (`platform: 'node'`, `target: 'node22'`). Đặt `loader: { '.css': 'empty' }` để bỏ qua các file CSS do `BaseEditorKit` của Plate kéo theo, và chèn banner `createRequire(import.meta.url)` cho các gói CommonJS.
- **Đóng gói trang đọc một file (`app/vite.viewer.config.ts`, `app/scripts/inline-viewer.mjs`)**:
  - `vite.viewer.config.ts` build `viewer.html` vào `dist-viewer/` thành một chunk duy nhất (`inlineDynamicImports: true`), đồng thời alias `python/kernel` sang `src/viewer/kernel-stub.ts` và worker của MapLibre sang `src/viewer/maplibre-worker.ts`.
  - `inline-viewer.mjs` đọc JS và CSS từ `dist-viewer/`, lọc bỏ các font `woff`/`truetype` trùng lặp của KaTeX (chỉ giữ `woff2`), nén `gzipSync` mức 9 rồi mã hóa base64 nhúng vào `<script id="pc-css">` và `<script id="pc-js">`. Khi mở file, đoạn script khởi động dùng `DecompressionStream('gzip')` của trình duyệt để giải nén và nạp trang đọc (giảm kích thước file khoảng 3 lần), cuối cùng ghi ra `dist/viewer.html` (giữ nguyên placeholder `>__PC_DOC__<` để `exportDocHtml` điền JSON bài viết vào).
- **Docker (`Dockerfile`, `docker-compose.yml`) và Chạy trên máy (`chay-tren-may.bat`, `chay-tren-may.sh`)**:
  - **Docker**: Multi-stage build trên `node:22-alpine`, chạy `npm run build`, copy `dist/` và `server-dist/` sang image chạy thật với `NODE_ENV=production PORT=8787`. `docker-compose.yml` ánh xạ cổng `${PORT:-8765}:8787` (mở tại `http://localhost:8765`).
  - **Chạy trên máy**: `chay-tren-may.bat` (Windows) và `chay-tren-may.sh` (macOS/Linux) kiểm tra Node.js, tự cài `npm install` nếu chưa có `node_modules`, chạy `npm run build`, rồi đặt `PORT=8780 NODE_ENV=production` và chạy `node server-dist/index.mjs` (mở tại `http://localhost:8780`).

### 6. Cách mở rộng (Các file cần sửa)

1. **Thêm một route server mới**:
   - Tạo/cập nhật hàm xử lý trong `app/server/<module>/...`.
   - Đăng ký route trong `app/server/index.ts` (dưới tiền tố `/api/...` để Vite proxy trong `app/vite.config.ts` tự chuyển tiếp khi dev; bọc `if (!isLocal(c))` nếu tính năng truy cập tài nguyên máy chủ).
2. **Thêm một nhà cung cấp AI mới**:
   - `app/src/ai/config.ts`: Thêm ID vào kiểu `ProviderId` và thêm mục cấu hình (`label`, `defaultModel`, `defaultBaseURL`, `envVar`, `suggestions`…) vào `PROVIDERS`.
   - `app/server/ai/provider.ts`: Thêm nhánh `case` trong `resolveModel(cfg)` để tạo `LanguageModel` và cập nhật cách gọi endpoint/header lấy danh sách model trong `listModels(cfg)` nếu khác chuẩn Bearer token.
3. **Thêm một agent trên máy mới**:
   - `app/server/agents/local.ts`: Thêm một phần tử `AgentDef` vào mảng `AGENTS` (khai báo `id`, `label`, `bin`, `args` bắt buộc ở chế độ chỉ đọc/sandbox, `promptInArgs`, và `makeParser` để bóc tách `delta`/`progress`/`error`). Nếu agent thường cài vào thư mục riêng ngoài `PATH`, thêm đường dẫn vào `knownDirs(name)`.

### 7. Bẫy đã biết (Gotchas)

- **Docker không thấy agent và Python trên máy**: Container chạy tách biệt (`existsSync('/.dockerenv')`), không thể gọi `claude`, `codex`, `agy` hay Python cài trên máy chủ. Muốn dùng agent cục bộ hoặc tính sẵn kịch bản bằng Python trên máy, bắt buộc chạy qua `chay-tren-may.bat` / `.sh` (cổng `8780`) hoặc môi trường dev.
- **Giới hạn `isLocal` (`127.0.0.1`)**: Các route `/api/agents*` và `/api/python*` từ chối mọi truy cập từ máy khác qua mạng LAN để bảo mật, trừ khi biến môi trường `PAPERCELL_ALLOW_REMOTE_AGENTS=1` được bật trên server.
- **Agent chạy qua `.cmd`/`.bat` trên Windows**:
  - Nếu một agent đặt `promptInArgs: true` nhưng chỉ tìm thấy bản `.cmd`/`.bat` (`bin.shell === true`), `agentChat` sẽ chặn lại và báo lỗi 500 vì không truyền câu hỏi của người dùng qua `cmd.exe` (tránh lỗi ký tự đặc biệt và shell injection). Trên Windows, `resolveBin` đã ưu tiên tìm `.exe` trước để tránh bẫy này.
  - Khi hủy request hoặc timeout trên Windows, bắt buộc phải dùng `stopTree(child)` (`taskkill /pid <pid> /T /F`), không dùng `child.kill()` đơn thuần vì sẽ để sót tiến trình con chạy ngầm.
- **Menu AI trong bài của Plate không đi qua Local Agent**: Các lệnh AI trực tiếp trong trình soạn thảo (`Space`, `Ctrl+J`, ghost text Copilot) gọi `/api/ai/command` và `/api/ai/copilot` bằng Vercel AI SDK (`resolveModel`), nên luôn cần API key (trên trình duyệt hoặc biến môi trường server) ngay cả khi sidebar `AssistantPanel` đang chọn chế độ `Local agent`.
- **Thứ tự build `dist/viewer.html`**: `scripts/inline-viewer.mjs` ghi kết quả thẳng vào `dist/viewer.html` và kiểm tra `existsSync('dist')`, nên luôn phải chạy `vite build` trước `npm run build:viewer`.

### 8. Agent trên máy — phiên chạy lâu dài (chat nhiều lượt, chọn model)

Bên cạnh chế độ hỏi một lần (`/api/agents/chat`, `agentChat` trong `local.ts`), có thêm phiên giữ một tiến trình CLI suốt cuộc trò chuyện (như tab chat của Orca): agent nhớ ngữ cảnh giữa các lượt, chọn được model và effort.

- **Hợp đồng chung `app/server/agents/drivers/types.ts`**: interface `AgentDriver` (`start`/`send`/`interrupt`/`close`/`alive`), các sự kiện `AgentEvent` (`text`/`step`/`tool`/`done`/`error`), kiểu `DriverOptions` (`model`, `effort`, `cwd`), `AgentModel`. **Đừng sửa file này nếu chưa xem hết nơi dùng.**
- **Driver mỗi CLI** (`drivers/claude.ts`, `drivers/codex.ts`, `drivers/agy.ts`, đăng ký ở `drivers/index.ts`): mỗi driver giữ một tiến trình theo giao thức riêng. Codex dùng `codex app-server` (JSON-RPC, một thread/phiên); Claude và agy dùng `--input-format stream-json --output-format stream-json`. `interrupt()`: Claude và Codex ngắt tại chỗ, giữ ngữ cảnh; **agy phải giết tiến trình rồi tự khởi động lại ở lượt sau nên mất ngữ cảnh** (giới hạn của agy stream-json).
- **Model `app/server/agents/models.ts`** (`listAgentModels`): hỏi danh sách model từ chính CLI (agy `agy models`; codex `model/list`; claude control_request `initialize`), cache 5 phút, không bao giờ throw (lỗi → `{ models: [], warning }`). Tham khảo `D:/Workspace/agent-proxy/catalog.py`.
- **Quản lý phiên `app/server/agents/session.ts`**: `createSession`/`runTurn`/`interrupt`/`closeSession`/`listSessions`. Mỗi phiên có thư mục tạm riêng; ghi `document.md` trước mỗi lượt; chèn chỉ dẫn (`INSTRUCTIONS`) vào lượt đầu; một lượt mỗi lúc (bận → 409); tiến trình chết → tự tạo lại driver + phát step "Restarted…"; tối đa 4 phiên, bỏ không 20 phút tự đóng; đóng hết driver khi server thoát.
- **Route `app/server/index.ts`** (đều kiểm tra `isLocal`): `GET /api/agents/models`, `GET/POST /api/agents/sessions`, `POST /api/agents/sessions/:id/turn` (stream NDJSON `AgentEvent`), `POST …/:id/interrupt`, `DELETE …/:id`. `/api/agents/chat` nhận thêm `model`/`effort`.
- **Giao diện `app/src/ai/`**: `agent-session.ts` (client gọi các route trên), `store.ts` (lưu model/effort theo từng agent), `AssistantPanel.tsx` (chọn model/effort, chat theo phiên, hiện bước, Stop, New chat), `ask.ts` (ô nhờ AI dưới trình soạn code gửi kèm model/effort). **Thêm loại tham số/agent/model phải sửa đồng bộ các file này.**

---

## Phần B. Thẻ hình, Design, tính sẵn Python, xuất HTML, editor

### 1. Mô hình dữ liệu và nơi lưu

- `app/src/editor/types.ts` định nghĩa `PapercellDoc = { version: 3, meta, data, content }`; `content` là cây node Plate (`any[]`), có thể chứa cột lồng nhau.
- `DocMeta` chứa `title`, `authors`, `date`, tùy chọn `figurePadding`; `MetaContext` trong `app/src/editor/DocHeader.tsx` đưa metadata vào editor và thẻ hình.
- `FigureNode` là node void: `type: 'figure'`, `id`, `caption`, `js`, `python`, `params`, `display`, `codeAccess`, `children: [{ text: '' }]`.
- Các trường tùy chọn cùng nằm trên node hình: `verify`, `spec`, `specDetached`, `padding`, `label`, `codeBackup`, `scenarios`, `autoOpen`.
- `display`: `output` / `both` / `code` / `hidden`; `codeAccess`: `none` / `js` / `python` / `both`. Hai trường điều khiển hai việc khác nhau: bố cục và code người đọc thấy.
- `VerifyResult = { ok, message, at }` là kết quả kiểm chứng đã lưu; không có fingerprint hoặc cơ chế tự vô hiệu hóa khi sửa JS/Python/params.
- `FigureParam` chứa `name`, `label`, `min`, `max`, `step`, `value`, tùy chọn `kind`, `unit`, `options`; `ParamValue` chỉ là `number | string | boolean`.
- `ParamKind` gồm `range`, `select`, `radio`, `toggle`; `paramKind(p)` mặc định về `range` khi tài liệu cũ không có `kind`; `isChoice` nhận `select` và `radio`.
- Slider dùng min/max/step; dropdown/radio dùng `options` giữ kiểu giá trị; toggle dùng boolean. Min/max/step vẫn là trường bắt buộc cả với lựa chọn và công tắc.
- `DataFile = { name, kind: 'csv' | 'json', content, labels? }`: lưu nội dung dạng chữ trong `PapercellDoc.data`, không lưu đối tượng đã parse.
- `labels` là map tên cột gốc → tên hiển thị, thuộc file dữ liệu và dùng chung cho mọi hình; đổi labels không đổi khóa cột trong dữ liệu.
- `app/src/figure/runtime.ts`: `dataKey` bỏ phần mở rộng, thay ký tự không hợp lệ bằng `_`, thêm `_` trước chữ số đầu; `labelsOf` chuyển labels sang map theo khóa dataset đó.
- `parseData` tạo `Dataset = Record<string, unknown>`: CSV qua `d3.csvParse(..., d3.autoType)`, JSON qua `JSON.parse`, lỗi parse thành `null`.
- `DataContext` chứa `{ files, data, setFiles }`; đây là dữ liệu chạy trong phiên React, khác với mảng `DataFile[]` được tuần tự hóa trong tài liệu.
- `ChartSpec` trong `app/src/figure/builder.ts` được lưu ở `FigureNode.spec`: `data`, `type`, channel `x/y/color/size/facet/lat/lon`, `agg`, `bins`, `sort`, `xLabel/yLabel`, `scheme`, `basemap`.
- `ChartType` hiện có 12 loại: bar, barh, line, area, scatter, histogram, box, heatmap, table, map-points, map-heat, map-regions.
- `ScenarioCache` trong `app/src/figure/scenarios.ts` được lưu ở `FigureNode.scenarios`: `grid`, `payload`, `count`, `bytes`, `fingerprint`, `engine`, `at`, `seconds`, `failed`.
- Mỗi `GridAxis = { name, values: ParamValue[] }`; `payload` là mảng kết quả Python theo thứ tự tổ hợp, JSON → gzip → base64; `bytes` là số byte sau nén.
- `app/src/docs/store.ts`: localStorage có danh mục `papercell.index.v1`, mỗi bài ở `papercell.doc.<id>`, cờ thêm gallery một lần ở `papercell.gallery.v1`.
- `loadDoc` chỉ nhận version 3 với content là mảng rồi gọi `upgradeDoc`; `saveDoc` ghi toàn bộ doc và cập nhật tiêu đề/thời điểm trong danh mục.
- `emptyDoc` tạo một paragraph trống; `ensureFirstDoc` thêm gallery một lần và bài mẫu khi cần. Lỗi ghi localStorage bị bắt và không được báo lên người dùng tại đây.

### 2. Nhập dữ liệu và nhãn cột

- `app/src/data/import.ts`: `importFile` nhận CSV/TSV/TXT/XLSX/JSON/GeoJSON, giới hạn 20 MB/file; XLS cũ bị từ chối.
- CSV/TSV/TXT được dò dấu phân cách, chuẩn hóa CSV; số dấu phẩy thập phân được đổi khi delimiter là `;` hoặc tab; header trống/trùng được đặt lại.
- XLSX dùng import động `read-excel-file/browser`, mỗi sheet có dữ liệu thành một `DataFile` CSV; JSON/GeoJSON giữ nguyên chuỗi sau kiểm tra JSON hợp lệ.
- `describeColumns` xem tối đa 2.000 dòng, nhận number/date/text và lat/lon theo tên + miền giá trị; `asRows` lấy mảng dữ liệu hoặc properties của GeoJSON FeatureCollection.
- `app/src/figure/DataPanel.tsx` quản lý thêm/xóa file, preview 8 dòng và sửa labels trên blur; nhập file cùng tên thay bản cũ, không tự giữ labels cũ.
- `DesignTab.tsx` cũng cho nhập file và sửa labels của cột đang dùng; bảng không group cho sửa toàn bộ cột. `pc.label(dataset, column)` dùng label đã trim hoặc trả tên cột gốc.

### 3. Vòng đời một thẻ hình

- `app/src/figure/templates.ts` chứa `FIGURE_TEMPLATES`, kiểu `FigureTemplate`, `figureFromTemplate`, `insertFigure`, `insertChart` và helper `insertNode`.
- Template có `id/label/hint/icon/keywords/js`, tùy chọn Python/params/caption; mẫu thường có sample data ngay trong JS và không có `spec`.
- Template `data` tạo spec mặc định và `autoOpen: true`; `insertChart(editor, type)` tạo spec cho loại đã chọn, sinh JS và `specParams`, cũng mở Design tự động.
- `insertNode` thay paragraph trống hiện tại; nếu không thì chèn node với `select: true`. Mỗi hình mới có `newId()` và một text child rỗng.
- `app/src/editor/papercell-kit.tsx`: `FigurePlugin` đăng ký key `figure`, `isElement: true`, `isVoid: true`, component `FigureElement`; `PapercellKit` ghép với `EditorKit` và `DocHeaderPlugin`.
- `app/src/figure/FigureElement.tsx`: `FigureElement` tìm path node rồi `editor.tf.setNodes` để cập nhật; xóa dùng removeNodes và toast Undo gọi `editor.undo()`.
- `FigureCard` dùng chung cho editor và viewer: render biểu đồ, controls, caption, inline code và nút mở `FigureDialog`; `FigureNumbers` cung cấp chuỗi nhãn theo id.
- Card giữ params đang kéo trong state; editor chỉ ghi về node lúc commit, người đọc thay đổi state trong phiên. Ref `latestParams` tránh commit giá trị cũ sau dropdown/toggle.
- `autoOpen` mở tab Design một lần rồi được xóa khỏi node; nút sửa mở Design khi có spec còn gắn, các hình khác mở JS; click hình/mở rộng vào tab Figure.
- `app/src/figure/FigureView.tsx` đo chiều rộng bằng ResizeObserver, làm tròn bước 10 px, tối thiểu 200; chưa có width thì chưa chạy code.
- View gọi `runFigure` lại khi JS, tên/giá trị params, data, width, scenario payload hoặc labels đổi; bỏ kết quả bất đồng bộ đã lỗi thời.
- Kết quả DOM được append, chuỗi HTML được gán `innerHTML`, lỗi nằm trong `.fig-error`; React không trực tiếp vẽ nội dung Plot/MapLibre.
- Trước thay output và khi unmount, View gọi `__pcCleanup` trên các phần tử con; `releaseNode` còn dọn cả node gốc của kết quả đến muộn.
- `app/src/figure/runtime.ts::runFigure` tạo `AsyncFunction`, truyền sẵn `Plot`, `d3`, `data`, `width`, `expose`, `params`, `pc`, `ket_qua`, rồi từng tham số theo tên.
- `params` là object name → value; từng name đồng thời là biến trực tiếp. `expose(v)` ghi giá trị cuối để kiểm chứng và trả lại chính v.
- `pc.map(options)` gọi `makeMap({ width, ...options })`, nên code hình có thể ghi đè width; `pc.esc` thoát HTML; `pc.label` tra tên hiển thị của cột.
- `ket_qua` là phần tử cache gần nhất theo params, hoặc `undefined` khi chưa có cache; runFigure không tự chạy Python.
- `RunOutput` gồm `{ node, html, exposed, error }`; chỉ chấp nhận Node hoặc HTML string làm giá trị return, lỗi compile/chạy được bắt thành message.
- `ParamSliders` dù tên cũ vẫn render cả bốn kind; range bắt vào grid bằng `snap`, select/radio trả option gốc, toggle trả boolean và commit ngay sau thay đổi.

### 4. Popup và trình soạn code

- `app/src/figure/FigureDialog.tsx`: `DialogTab` gồm design, figure, js, python, params, verify, scenarios, settings; popup portal vào `document.body`.
- Tab **Design** dùng `DesignTab`; tab **Figure** dùng `FigureView` lớn và `ParamSliders`; trạng thái params dùng chung với card.
- Tab **JS code** / **Original Python** dùng `CodeTab`, preview và `CodeAssist`; preview Python vẫn vẽ từ JS, không tự chạy Python khi gõ.
- `CodeTab` giữ draft, cập nhật node sau debounce 400 ms; JS còn gắn Design đi qua `syncFromCode`, Python được lưu trực tiếp.
- Tab **Parameters** dùng `ParamsTab`: sửa draft rồi Save parameters; kiểm tra identifier và trùng tên, range max > min/step > 0, choice ít nhất hai options.
- `parseOptions` chuyển chuỗi true/false thành boolean và chuỗi số thành number; toggle lưu boolean. Phải giữ quy tắc này để chuỗi "false" không bị coi là truthy.
- Tab **Verify** dùng `VerifyTab`/`verifyFigure`, lưu `VerifyResult`; tab **Precompute** dùng `ScenarioTab`; tab **Settings** chỉnh padding/display/label/codeAccess.
- Read-only chỉ có Figure và các tab code do `visibleCode` cho phép; Python trống không thành tab. `visibleCode` còn quyết định code inline của card khi đọc.
- Popup khóa cuộn bằng `modal-open`, giữ callback đóng trong ref, focus một lần khi mở và trả focus khi đóng; tránh effect chạy lại làm giật focus người đang gõ.
- `app/src/figure/CodeEditor.tsx`: CodeMirror 6 cho JS/Python; `useCodeHints` lấy datasets/cột/params/labels từ context; Ctrl+Space gợi ý Plot, d3, data và biến tham số.
- Thay value bên ngoài được dispatch phần khác biệt nhỏ nhất để giữ caret/scroll và undo; phím trong code editor không truyền lên Plate.
- `CodeAssist` tạo context gồm code hiện tại, code ngôn ngữ kia, params, nhãn, profile dữ liệu được @mention; dùng `askAI` và các skill figure-js/figure-python được import raw.
- AI trả một fenced code block hoàn chỉnh rồi `onApply` đi qua cùng luồng `change`; đây không phải một pipeline render/thi hành riêng.

### 5. Design, codegen và tương thích tài liệu

- `app/src/figure/builder.ts`: `CHART_TYPES` là metadata icon/label/channels/required và cờ agg/bins/sort/map; `typeInfo`, `missingChannels` và UI dựa vào danh sách này.
- `defaultSpec` mặc định bar/count, 20 bins, không sort, blues, light; `specParams` hiện chỉ tạo slider `so_cot` cho histogram.
- `codegen` sinh JS dễ đọc: Plot cho chart, HTML table cho table, `pc.map` cho map; thiếu dataset/channel bắt buộc thì trả thông báo HTML thay vì vẽ.
- Nhãn trục/legend/table được tra lúc chạy qua `pc.label`; line/area sort theo X trước nối điểm; layout tính margin/rotate/facet theo dữ liệu.
- `chartLine` ghi đúng một dòng `const chart = {...}`; `SPEC_KEYS` là whitelist các trường cấu hình được tuần tự hóa/đọc lại, không phải toàn bộ object tùy ý.
- Dòng cấu hình là metadata để tái sinh code; phần JS phía dưới đã được codegen theo spec, không phải renderer tổng quát chỉ đọc biến chart lúc chạy.
- `parseChartLine` tìm dòng đầu theo regex đầu dòng, thử JSON rồi object literal bằng `new Function`; chỉ chấp nhận type có trong `CHART_TYPES`, bổ sung default còn thiếu.
- `syncFromCode(spec, js)` so toàn bộ phần ngoài dòng chart với `codegen(spec)`; khác phần thân/comment/whitespace ngoài dòng đó → `'detached'`.
- Chỉ sửa dòng chart hợp lệ → cập nhật spec và tái sinh thân code, giữ nguyên chính dòng người dùng gõ; dòng đang nhập chưa hợp lệ → `'pending'`.
- `CodeTab` đặt `specDetached: true` khi detached; pending chỉ lưu JS; sync thành công thay spec/JS/params và giữ value cũ của tham số cùng tên.
- `app/src/figure/DesignTab.tsx`: `mergeParams` cũng giữ value cũ cùng tên; tab chọn dataset đầu phù hợp, ưu tiên GeoJSON cho map-regions, tự đoán lat/lon khi cần.
- Có `specDetached`, hoặc không có spec nhưng JS khác rỗng, thì Design chỉ preview và không ghi đè JS khi mở/tab đổi lựa chọn.
- `apply(next, true)` ở nút Use this design mới cho thay code tay; lưu `codeBackup = { js, params, spec, specDetached }`, không backup Python hoặc toàn bộ FigureNode.
- `restore` khôi phục các trường trong backup rồi xóa backup; với hình detached có spec, đổi lựa chọn vẫn có thể cập nhật spec nhưng không thay JS/params thực thi.
- `app/src/editor/upgrade.ts::upgradeDoc` duyệt đệ quy hình trong cây, tái sinh JS khi có spec và chưa detached; mở bài cũ tự nhận bản sửa của builder.
- Upgrade gallery dựa tiêu đề `GALLERY_TITLE` / tên Việt cũ, thêm `paramsDemo`/`controlsSection` nếu chưa có; không phải migration schema tổng quát cho mọi version.
- Với gallery Việt bị Design ghi đè trước đây: lấy bản gốc từ `app/src/legacy/gallery-vi.ts` theo caption, khôi phục hình code tay khi phù hợp và giữ id cũ.
- `app/src/gallery.ts::makeGallery` tạo dữ liệu tổng hợp và cả hình spec/code/template; `app/src/demo-params.ts` chứa `PARAMS_DEMO_ID`, `CONTROLS_ID_PREFIX`, demo controls dùng cho bài mới và upgrade.

### 6. Precompute và kiểm chứng Python

- `app/src/figure/scenarios.ts::axisValues`: range liệt kê từ min đến max theo step, choice dùng mọi option, toggle dùng `[false, true]`; không có params vẫn có một tổ hợp.
- `comboCount`, `comboAt`, `indexOf` thống nhất thứ tự tham số cuối thay đổi nhanh nhất; lookup số lấy điểm gần nhất, loại khác so bằng String và fallback về phần tử đầu.
- `snap` dùng cùng phép chọn điểm gần nhất; `encodeResults`/`decodeResults` nén/giải nén qua `app/src/lib/pack.ts`, kết quả giải nén được memoize theo payload rút gọn.
- `fingerprint` là SHA-256 lấy 16 ký tự hex của Python + tên/nội dung file + grid; không bao gồm JS hoặc labels vì chúng không là đầu vào tính Python.
- `app/src/figure/ScenarioTab.tsx` mặc định engine local, GET `/api/python` để dò; thử lại một lần khi request lỗi, fallback Pyodide nếu không dùng được local.
- Grid có thể dùng step lớn hơn slider để giảm số lần tính; cảnh báo trên 2.000 tổ hợp, chặn trên 50.000; yêu cầu Python khác rỗng và gán `ket_qua`.
- Local POST `/api/python/grid` với `{ code, files: [{ key, kind, content }], combos }`, nhận JSONL streaming `{ i, ok, value?, error? }` hoặc `{ fatal }`.
- `readJsonLines` giữ phần dòng dở giữa các chunk, xử lý dòng cuối; AbortController dừng request local. Báo cáo này xác nhận contract phía client, không đọc implementation server ngoài phạm vi.
- Pyodide gọi `kernel.runGrid` và nhận từng item qua callback; Stop dùng `kernel.cancel()` để terminate worker, các tác vụ pending bị reject.
- Chỉ ghi cache mới sau khi đủ item và không phải tất cả đều lỗi; item lỗi giữ `null`, có số failed; khi dừng/lỗi vẫn giữ cache cũ.
- Stale được báo bằng so fingerprint với `cache.grid`; việc đổi cấu hình grid dự kiến trong UI hoặc định nghĩa params không tự xóa cache hiện có.
- `app/src/python/kernel.ts`: singleton `kernel` tạo module Worker lười bằng `new URL('./worker.ts', import.meta.url)`; seq/pending/gridHandlers ghép response với request và phát status cho subscriber.
- `app/src/python/worker.ts` tải Pyodide từ jsDelivr theo `PYODIDE_VERSION`, nạp pandas và GLUE; `loadPackagesFromImports` xử lý import bổ sung; chain serialize các request.
- GLUE `__pc_load` đọc CSV thành DataFrame, JSON thành object; `__pc_run_one` đưa `data` và params vào globals, capture stdout, chạy code và bắt lỗi có dòng `<python>`.
- Dữ liệu được copy theo từng tổ hợp, kết quả `ket_qua` qua `__pc_jsonable` đổi Series/DataFrame/numpy/container/NaN; matplotlib dùng backend agg và đóng figures sau mỗi lần chạy.
- `app/src/figure/verify.ts::verifyFigure` chạy JS ở width 600 không truyền scenario cache, lấy `expose`, gọi `kernel.verify` với cùng params/files; Verify hiện dùng Pyodide, không gọi server local.
- So sánh flatten object theo khóa đã sort; hỗ trợ Map/Date phía JS, số gần nhau theo sai số `1e-9 + 1e-6 * max(abs(a), abs(b))`; chỉ kiểm chứng bộ params hiện tại.

### 7. Xuất HTML và viewer

- `app/src/publish/export-html.ts::exportDocHtml` fetch `/viewer.html`, kiểm tra placeholder `>__PC_DOC__<` và từ chối template dev còn tham chiếu `/src/viewer/`.
- `forPublish` duyệt cây, bỏ hình hidden, bỏ trường verify/spec/specDetached/autoOpen, xóa Python nếu codeAccess không cho xem; giữ JS để chạy hình và giữ dữ liệu/scenarios.
- Export đóng `{ version: 3, meta, data: files, content }` bằng `packText`, thay placeholder và title đã escape, tải Blob HTML với tên từ `docSlug`.
- `app/vite.viewer.config.ts`: build riêng vào dist-viewer, inline dynamic imports, một CSS bundle, tắt module preload, inline assets với ngưỡng rất lớn.
- Alias viewer thay import python/kernel bằng `app/src/viewer/kernel-stub.ts`; stub reject verify/runGrid và không tải Pyodide. Alias MapLibre worker sang `viewer/maplibre-worker.ts`.
- `app/scripts/inline-viewer.mjs` đọc dist-viewer/viewer.html và JS/CSS assets, bỏ font KaTeX woff/ttf dư, gzip/base64 từng bundle, nhúng vào dist/viewer.html.
- Bootstrap dùng `DecompressionStream('gzip')`, thêm style và import JS từ Blob URL; script kiểm tra không sót tham chiếu assets trong HTML và placeholder tài liệu còn tồn tại.
- `app/src/viewer/main.tsx::readDoc` đọc script `papercell-doc`, giải nén/parse; `Viewer` tạo static editor với `BaseEditorKit` + `FigureStaticPlugin`, không gọi `upgradeDoc`.
- Viewer dựng DataContext/MetaContext/FigureNumbers bằng dữ liệu nhúng, `parseData` và `scan`; setter no-op; tiêu đề/tác giả/ngày và TOC h1–h3 được render bên ngoài static content.
- `app/src/figure/FigureStatic.tsx` dùng `FigureCard` readOnly nên controls/popup vẫn hoạt động; lọc data-slate attributes để không chép chuỗi code thành thuộc tính DOM.
- `app/src/viewer/maplibre-worker.ts` import raw worker MapLibre, bỏ export cuối file, tạo Blob classic worker và thay `window.Worker` cho yêu cầu module worker của viewer.
- Lý do trong code: Chrome chặn module worker từ blob khi mở file://, MapLibre còn bọc import blob do origin null; classic worker nhúng không có import tránh luồng này.
- Shim giả định viewer chỉ MapLibre dùng module worker; thêm worker module khác phải xem lại shim. `app/src/figure/map.ts` bản editor vẫn dùng import `?worker&url` bình thường.
- Một HTML chứa runtime/data/cache không đồng nghĩa mọi hình offline: MapLibre vẫn tải style/tiles OpenFreeMap; code hình tự fetch dữ liệu ngoài cũng cần kết nối.
- `app/scripts/server.mjs` chỉ là script bundle server bằng esbuild, bỏ CSS và restart khi --watch; không thuộc pipeline nhúng viewer, không được chạy trong task này.

### 8. Đánh số, cột và padding

- `app/src/editor/scan.ts::scan` duyệt theo thứ tự cây, kể cả column_group/column, đếm Figure và Table riêng; chỉ hình có caption khác trắng, không hidden, label khác none mới có số.
- `captionKind`: ưu tiên `fig.label`; nếu không, spec.type table → Table; hình không spec có JS khớp literal `<table class="fig-table` → Table; còn lại Figure.
- `NEXT_CAPTION` quay Figure → Table → none → Figure; Settings có lựa chọn Automatic bằng xóa label. Heading chỉ vào outline khi là h1–h3 và có id.
- `app/src/editor/side-drop.ts`: `sideOf` nhận vùng mép trái/phải 20% chiều rộng, tối đa 90 px; `sideTarget`/`useSideTarget` là external store cho chỉ báo hover.
- `canDropSide` cho target root, group, hoặc block trực tiếp trong column; tối đa bốn columns; `dropToSide` chặn tự thả và thả vào hậu duệ của block đang kéo.
- `dropToSide` chạy withoutNormalizing, xóa các path kéo từ cuối về đầu rồi tìm target lại theo id; tạo group mới hoặc thêm column vào group hiện có, `equalize` chia đều width phần trăm.
- `FigureCard` tính padding bằng `fig.padding ?? meta.figurePadding ?? DEFAULT_FIG_PADDING` (12 px), chỉ đặt vào vùng hình inline; popup có padding CSS riêng.
- Apply to all figures đổi `meta.figurePadding`, xóa mọi override `padding` ở node figure bằng setNodes match toàn cây; 0 là giá trị hợp lệ, không dùng phép `||` thay `??`.
- `app/src/figure/figure.css` quy định card/output/dialog/controls/table/map và resize handle; `papercell.css` chứa style chung, `viewer/viewer.css` lo layout trang đọc/TOC.
- Trong `app/src/lib/`, `pack.ts` là helper trực tiếp của scenarios/export; `utils.ts` chỉ re-export `cn`.
- `block-discussion-index.ts` lập chỉ mục thảo luận/gợi ý theo block, `suggestion.ts` chứa biến thể style suggestion; `markdown-joiner-transform.ts` ghép chunk Markdown cho luồng AI/deserialize.
- `uploadthing.ts` định nghĩa router upload với chặn ngoài development nếu chưa cấu hình xác thực; đây không phải đường nhập DataFile của `DataPanel`/`importFile`.

### 9. Điểm mở rộng: file cần sửa

- **Loại chart Design mới:** bắt buộc `app/src/figure/builder.ts`: thêm ChartType, CHART_TYPES, nhánh codegen, nhãn/default/SPEC_KEYS khi có field mới, specParams nếu cần controls.
- `app/src/figure/DesignTab.tsx` tự render CHART_TYPES/channels/cờ hiện có; chỉ sửa nếu loại mới cần control, điều kiện dataset hoặc channel mới ngoài schema hiện tại.
- Nếu mở rộng khả năng map, sửa `app/src/figure/map.ts`; nếu thay cách tự nhận Table, sửa `app/src/editor/scan.ts`; thêm ví dụ spec trong `app/src/gallery.ts` để dễ thử.
- **Template mới:** thêm entry `app/src/figure/templates.ts`, hoặc `app/src/figure/control-templates.ts` nếu thuộc nhóm reader controls đã được spread vào FIGURE_TEMPLATES; id phải duy nhất.
- Template dùng JS return DOM/HTML, params có default đúng kiểu, Python tùy chọn và sample data tự chứa; thêm ví dụ vào `gallery.ts` hoặc `demo-params.ts` nếu cần. Consumer menu ngoài phạm vi đọc cần được Claude kiểm tra khi tích hợp.
- **Kind tham số mới:** sửa `app/src/editor/types.ts`, `app/src/figure/FigureView.tsx`, `app/src/figure/FigureDialog.tsx`, `app/src/figure/scenarios.ts`, `app/src/figure/CodeEditor.tsx`.
- Cần đồng bộ type/default tương thích cũ, UI nhập và validate/serialize params, control người đọc/commit, axisValues/lookup/snap, mô tả autocomplete/AI; thêm style ở `figure.css`, ví dụ ở `control-templates.ts`/`demo-params.ts`.
- Nếu giá trị vẫn number/string/boolean thì runtime và worker đã truyền chung; kiểu phức tạp hơn phải sửa cả ParamValue, contract kernel/worker và các phép lookup/String/JSON liên quan.

### 10. Bẫy và rủi ro cần giữ khi sửa

- Chuỗi code lồng JS/Python/HTML và regex có nhiều lớp escape (`builder.ts`, templates, worker GLUE, inline-viewer); dùng công cụ sửa file, không chèn qua shell heredoc theo AGENTS.md.
- MapLibre giữ WebGL context: phải giữ `__pcCleanup`/`map.remove()`, ResizeObserver cleanup và dọn kết quả đến muộn; nhiều bản đồ không được giải phóng có thể thành ô đen.
- `makeMap` lấy bounds bằng tọa độ thô thay `d3.geoBounds` để tránh lỗi chiều vòng polygon GeoJSON; không đổi thuật toán theo tên hàm trông tương đương.
- Không tái sinh code tay chỉ vì mở Design; không xóa specDetached/codeBackup tùy tiện; thay codegen tác động mọi hình còn gắn Design khi `upgradeDoc` chạy.
- Nhận Table từ JS là regex literal, không phải phân tích HTML: đổi class/thứ tự cú pháp có thể đổi đánh số khi không còn spec, nhất là sau export bỏ spec.
- `codeAccess` là quyền hiện UI: JS vẫn nằm trong HTML để thi hành; `forPublish` hiện cũng giữ `codeBackup` qua spread rest. Nếu sửa loại bỏ dữ liệu nội bộ, cần xét cả backup lồng bên trong.
- `runFigure`/`parseChartLine` dùng Function và output HTML dùng innerHTML, không có sandbox trong các hàm này; tên params còn có thể đụng tên biến runtime/keyword dù qua regex identifier.
- Cache `parseData` khóa theo tên/length/64 ký tự đầu; `decodeResults` theo length/48 ký tự đầu-cuối. Có nguy cơ dùng lại dữ liệu nếu sửa phần giữa mà các phần khóa giữ nguyên.
- CodeTab hủy timer khi unmount, không flush draft; chuyển tab/đóng rất nhanh sau khi gõ có nguy cơ mất thay đổi trong 400 ms cuối. Đây là suy luận từ code, chưa thử UI.
- Verify không chạy với scenario cache, không kiểm tra toàn grid và không tự làm mới badge khi code đổi; hình chỉ vẽ bằng ket_qua precompute cần chú ý contract này.

---

## Phần C. Rủi ro đã biết chưa xử lý

Các điểm dưới đây phát hiện khi đọc code, chưa sửa. Muốn xử lý thì giao thành việc riêng.

- **Xuất HTML còn kèm `codeBackup`:** `forPublish` (`app/src/publish/export-html.ts`) bỏ `verify/spec/specDetached/autoOpen` nhưng giữ `codeBackup`, nên code viết tay cũ (đã bị thay bằng thiết kế) vẫn nằm trong file xuất.
- **Có thể mất 400 ms gõ cuối:** `CodeTab` hủy timer khi đóng popup mà không lưu bản nháp (chưa thử trên giao diện).
- **Khóa cache yếu:** `parseData` khóa theo tên + độ dài + 64 ký tự đầu, `decodeResults` theo độ dài + 48 ký tự đầu/cuối; sửa phần giữa dữ liệu mà giữ nguyên các phần này có thể dùng lại kết quả cũ.
- **Kiểm chứng không tự hết hạn:** `VerifyResult` không có dấu vân tay, nên sửa JS/Python/tham số sau khi kiểm chứng vẫn hiện "Verified".
- **Nhận dạng Table bằng chuỗi:** hình không có spec chỉ được tính là Table nếu JS chứa đúng `<table class="fig-table`.
