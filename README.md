# Review Hộ — VS Code Extension

Review Hộ là extension VS Code giúp bạn review và refactor mã nguồn ngay trong editor, tích hợp Ollama và hỗ trợ bất kỳ model (ví dụ: `llama3.2:latest`, `deepseek-v3`, …). Giao diện lấy cảm hứng từ CodeRabbit với danh sách tệp, badge trạng thái, khối gợi ý, diff và khả năng áp dụng sửa trực tiếp.

## Tính năng chính

- Tích hợp Ollama với cấu hình linh hoạt theo workspace.
- Hai view chuyên dụng:
  - `Cài đặt Ollama` (`reviewho.settings`): nhập API URL, chọn model, Ping kết nối, Kiểm tra model.
  - `Code Review` (`reviewho.review`): chọn nhánh From/To, bật “Include Working Changes”, Start/Stop Review, hiển thị danh sách file, áp dụng cải thiện hoặc xem diff.
- Kết quả review tiếng Việt, gồm: Potential Issue, Refactor Suggestion, Reasoning và mã cải thiện đầy đủ.
- Trang trí trong editor:
  - Dải màu đỏ/xanh theo mức độ, hover hiển thị diff từng hunk.
  - Comment threads ngay trên code với khối “Refactor Suggestion”/“Potential Issue”.
- Hỗ trợ cả thay đổi giữa nhánh (`git diff --name-only from..to`) và thay đổi trong Working Tree (`git status --porcelain`).

## Yêu cầu hệ thống

- VS Code ≥ `1.90.0`.
- Node.js ≥ `16` để build TypeScript.
- Ollama đã cài đặt và đang chạy (`ollama serve`).

## Cài đặt & build

- Clone dự án, cài dependencies dev:
  - `npm install` (nếu gặp lỗi policy trên Windows, hãy chạy VS Code Terminal dưới chế độ nâng cao hoặc dùng lệnh build ở dưới)
- Build TypeScript:
  - `npm run compile`
  - Hoặc: `node ./node_modules/typescript/lib/tsc.js -p .` (cách này tránh vấn đề PowerShell ExecutionPolicy)
- Mở folder trong VS Code, bấm F5 để chạy extension (VS Code Extension Host).

## Cấu hình

- Cấu hình lưu theo workspace, namespace `reviewHo`:
  - `reviewHo.apiUrl` (mặc định: `http://localhost:11434/api/generate`)
  - `reviewHo.model` (mặc định: `llama3.2:latest`)
- Bạn có thể chỉnh ở Settings UI hoặc trong view `Cài đặt Ollama`.

## Lệnh

- `aiAgent.openPanel`: mở panel webview tổng quan.
- `aiAgent.analyzeFile`: phân tích tệp hiện tại trong editor.

## Views & Container

- Container: `review-ho` (Activity Bar → Review Hộ)
- Views:
  - `reviewho.settings` — Cài đặt Ollama
  - `reviewho.review` — Code Review

## Sử dụng nhanh

1. Mở Activity Bar → “Review Hộ”.
2. Vào `Cài đặt Ollama`:
   - Nhập `API URL` và `Model` mong muốn.
   - Bấm “Kiểm tra kết nối” và “Kiểm tra model”.
3. Vào `Code Review`:
   - Chọn `From`/`To` branch, bật “Include Working Changes” nếu muốn gộp thay đổi chưa commit.
   - Bấm `START REVIEW`.
   - Trong danh sách file, bấm “Áp dụng” để viết `improved_code` vào file, hoặc “Xem Diff” để mở so sánh.
4. Trong editor, di chuột vào dải màu để xem diff; mở popover bình luận “Refactor Suggestion”/“Potential Issue”.

## Khắc phục sự cố

- Không thể kết nối Ollama:
  - Kiểm tra service: `ollama ps` / `ollama serve`.
  - Kiểm tra API URL: `http://localhost:11434/api/generate`.
  - Kiểm tra firewall/antivirus có chặn port 11434.
  - Kiểm tra model: `ollama list`, nếu thiếu hãy `ollama pull <model>`.
- JSON thô hiển thị trong UI:
  - Prompt đã ép trả về JSON hợp lệ. Nếu model vẫn trả về lẫn văn bản, parser sẽ chuẩn hoá và cắt nội dung dài; cập nhật model và thử lại.
- “Files to review (0)”:
  - Đảm bảo repository là Git (có `.git`).
  - Chọn đúng `From`/`To`, hoặc bật “Include Working Changes” để lấy thay đổi chưa commit.
- Windows chặn `npm`:
  - Dùng `node ./node_modules/typescript/lib/tsc.js -p .` để build.

## Cấu trúc mã nguồn

- `src/extension.ts` — Entry point, đăng ký lệnh và view provider.
- `src/core/Constants.ts` — Hằng số: `CONFIG_SECTION`, `COMMANDS`, `DEFAULTS`, `VIEWS`.
- `src/services/ConfigService.ts` — Truy cập cấu hình `reviewHo.*`.
- `src/services/DiffService.ts` — Tính hunk diff để trang trí/áp dụng.
- `src/panels/ReviewPanel.ts` — Webview panel tổng quan, nhận/gửi message.
- `src/views/settingsView.ts` — View `Cài đặt Ollama`.
- `src/views/reviewView.ts` — View `Code Review` + đồ hoạ, message và hành động.
- `src/agents/ollamaAgent.ts` — Prompt & phân tích, parse JSON bền vững.
- `webview/` — HTML/CSS/JS cho panel webview (phiên bản nhẹ).

## Ghi chú bảo mật

- Không lưu khoá/secret trong code. Nếu cần tích hợp API key, hãy dùng `ExtensionContext.secrets`.
- Không log thông tin nhạy cảm.

## Đóng góp

- Issues/PRs luôn được hoan nghênh.
- Vui lòng tuân thủ code style TypeScript strict và kiểm tra type trước khi tạo PR.

---

Nếu bạn muốn bổ sung tài liệu theo định dạng cụ thể (ảnh, GIF usage, checklist kiểm thử), hãy cho mình biết để cập nhật thêm.
