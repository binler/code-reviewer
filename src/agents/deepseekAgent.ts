import type * as ai from '@vscode/ai'
import * as vscode from 'vscode'

type AgentOutput = {
  type: 'suggestion'
  language: 'vi'
  summary: string
  code_fix: string
  reasoning: string
  improved_code: string
}

function buildPrompt(input: string) {
  const tpl = `Bạn là trợ lý đánh giá và cải thiện mã. Trả lời CHỈ bằng JSON với các trường: type, language, summary, code_fix, reasoning, improved_code. Luôn dùng tiếng Việt cho summary, code_fix, reasoning. Không thêm văn bản ngoài JSON.
Mã nguồn:
\n\n${input}\n\n`.
    concat('Yêu cầu: Phân tích vấn đề, đề xuất chỉnh sửa, giải thích ngắn gọn, và cung cấp phiên bản mã đã cải thiện.')
  return tpl
}

async function callOllama(prompt: string): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('deepseekAgent')
  const apiUrl = cfg.get<string>('apiUrl') || 'http://localhost:11434/api/generate'
  const model = cfg.get<string>('model') || 'deepseek-v3'
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { response?: string }
  return data.response ?? ''
}

function safeParse(output: string, original: string): AgentOutput {
  const extracted = extractJson(output)
  try {
    const obj = extracted ? JSON.parse(extracted) : JSON.parse(output)
    if (
      obj &&
      obj.type === 'suggestion' &&
      obj.language === 'vi' &&
      typeof obj.summary === 'string' &&
      typeof obj.code_fix === 'string' &&
      typeof obj.reasoning === 'string' &&
      typeof obj.improved_code === 'string'
    ) return obj as AgentOutput
  } catch {}
  const fallback: AgentOutput = {
    type: 'suggestion',
    language: 'vi',
    summary: output || 'Không thể phân tích JSON từ phản hồi.',
    code_fix: 'Xem đề xuất ở phần tóm tắt. Hãy đảm bảo định dạng JSON chuẩn.',
    reasoning: 'Mô hình trả về định dạng khác yêu cầu. Đã cung cấp tóm tắt dựa trên phản hồi thô.',
    improved_code: original
  }
  return fallback
}

export async function analyzeWithDeepseek(input: string): Promise<AgentOutput> {
  const prompt = buildPrompt(input)
  try {
    const responseText = await callOllama(prompt)
    const result = safeParse(responseText, input)
    return result
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Không xác định'
    return {
      type: 'suggestion',
      language: 'vi',
      summary: `Không thể kết nối Ollama: ${msg}`,
      code_fix: 'Hãy đảm bảo Ollama chạy tại http://localhost:11434 và đã pull model deepseek-v3 (ollama pull deepseek-v3).',
      reasoning: 'Kết nối HTTP thất bại hoặc dịch vụ không phản hồi.',
      improved_code: input
    }
  }
}

function extractJson(text: string): string | null {
  const fenceIdx = text.indexOf('```json')
  if (fenceIdx !== -1) {
    const rest = text.slice(fenceIdx + 7)
    const endFence = rest.indexOf('```')
    if (endFence !== -1) return rest.slice(0, endFence).trim()
  }
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export async function registerDeepseekAgent(_context: unknown): Promise<void> {
}
