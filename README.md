DeepSeek AI Agent cho VS Code

Tính năng
- Phân tích mã nguồn bằng mô hình deepseek-v3 qua Ollama
- Đầu ra tiếng Việt theo định dạng JSON yêu cầu
- Webview hiển thị tóm tắt, đề xuất sửa, lý do và mã cải thiện

Yêu cầu
- VS Code 1.90+
- Ollama chạy tại http://localhost:11434 và đã pull model deepseek-v3

Cài đặt
1. Mở thư mục extension này trong VS Code
2. Chạy lệnh: npm install
3. Biên dịch: npm run build
4. F5 để chạy Extension Development Host

Sử dụng
- Command: "DeepSeek Agent: Mở bảng phân tích" để mở webview
- Command: "DeepSeek Agent: Phân tích tệp hiện tại" để tạo JSON kết quả
- Chuột phải trên file trong Explorer hoặc trong Editor chọn "DeepSeek Agent: Phân tích tệp hiện tại"

Đầu ra JSON
{
  "type": "suggestion",
  "language": "vi",
  "summary": "...",
  "code_fix": "...",
  "reasoning": "...",
  "improved_code": "..."
}

Cấu trúc thư mục
- package.json
- tsconfig.json
- src/extension.ts
- src/agents/deepseekAgent.ts
- src/typings/vscode-ai.d.ts
- webview/index.html
- webview/main.js
