import { ConfigService } from '../services/ConfigService'
import { Logger } from '../core/Logger'
import { DEFAULTS } from '../core/Constants'

type AgentOutput = {
	type: 'suggestion'
	language: string
	summary: string
	code_fix: string
	reasoning: string
	improved_code: string
}

function buildPrompt(input: string) {
    const tpl = `Bạn là chuyên gia review và refactor mã. Phân tích đoạn mã sau và trả về JSON đúng schema.

YÊU CẦU:
1) Chỉ trả về JSON hợp lệ, không kèm văn bản ngoài JSON.
2) Bắt buộc đủ các trường: type, language, summary, code_fix, reasoning, improved_code.
3) language phải là "vi". Các trường summary, code_fix, reasoning viết tiếng Việt.
4) improved_code giữ nguyên ngôn ngữ của mã gốc và là phiên bản đã cải thiện đầy đủ.
5) Không chèn ký tự thoát không cần thiết. Sử dụng \n cho xuống dòng nếu cần.

MÃ CẦN REVIEW:
\`\`\`
${input}
\`\`\`

SCHEMA:
{
  "type": "suggestion",
  "language": "vi",
  "summary": "Tóm tắt vấn đề chính (≤150 ký tự)",
  "code_fix": "Danh sách đề xuất sửa kèm lý do ngắn gọn",
  "reasoning": "Giải thích chi tiết tại sao cần thay đổi",
  "improved_code": "Mã đã refactor toàn bộ"
}`
    return tpl
}

async function callOllama(prompt: string, configService: ConfigService, logger: Logger): Promise<string> {
	const apiUrl = configService.getApiUrl()
	const model = configService.getModel()

	logger.info(`Calling Ollama API: ${apiUrl} with model: ${model}`)

	// Create abort controller for timeout
	const controller = new AbortController()
	const timeout = setTimeout(() => {
		logger.warn(`Request timeout after ${DEFAULTS.REQUEST_TIMEOUT_MS}ms`)
		controller.abort()
	}, DEFAULTS.REQUEST_TIMEOUT_MS)

	try {
		const res = await fetch(apiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, prompt, stream: false }),
			signal: controller.signal
		})

		clearTimeout(timeout)

		if (!res.ok) {
			const errorText = await res.text().catch(() => 'Unknown error')
			logger.error(`HTTP ${res.status}: ${errorText}`)
			throw new Error(`HTTP ${res.status}: ${errorText}`)
		}

		const data = await res.json() as { response?: string }
		logger.info('Received response from Ollama')
		return data.response ?? ''
	} catch (err: any) {
		clearTimeout(timeout)

		if (err.name === 'AbortError') {
			const msg = `Request timed out after ${DEFAULTS.REQUEST_TIMEOUT_MS / 1000}s`
			logger.error(msg)
			throw new Error(msg)
		}

		logger.error('Ollama request failed', err)
		throw err
	}
}

function safeParse(output: string, original: string, logger: Logger): AgentOutput {
    const extracted = extractJson(output)
    try {
        const obj = extracted ? JSON.parse(extracted) : JSON.parse(output)
        if (
            obj &&
            obj.type === 'suggestion' &&
            typeof obj.summary === 'string' &&
            typeof obj.code_fix === 'string' &&
            typeof obj.reasoning === 'string' &&
            typeof obj.improved_code === 'string'
        ) {
            const clean = (v: any, fb: string) => {
                const s = typeof v === 'string' ? v : fb
                const t = s.replace(/\n/g, '\n').trim()
                return t.length > 600 ? t.slice(0, 600) + '…' : t
            }
            const normalized: AgentOutput = {
                type: 'suggestion',
                language: typeof obj.language === 'string' ? obj.language : 'vi',
                summary: clean(obj.summary, ''),
                code_fix: clean(obj.code_fix, ''),
                reasoning: clean(obj.reasoning, ''),
                improved_code: typeof obj.improved_code === 'string' ? obj.improved_code : original
            }
            logger.info('Successfully parsed agent output')
            return normalized
        }
    } catch (e) {
        logger.warn('Failed to parse JSON response, using fallback')
    }

    const fallback: AgentOutput = {
        type: 'suggestion',
        language: 'vi',
        summary: 'Không thể phân tích JSON từ phản hồi.',
        code_fix: 'Đảm bảo phản hồi là JSON hợp lệ theo schema yêu cầu.',
        reasoning: 'Phản hồi không đúng định dạng. Đã cung cấp hướng dẫn khắc phục.',
        improved_code: original
    }
    return fallback
}

export async function analyzeWithOllama(input: string): Promise<AgentOutput> {
	const logger = Logger.getInstance()
	const configService = new ConfigService()
	const prompt = buildPrompt(input)

	try {
		logger.info('Starting code analysis')
		const responseText = await callOllama(prompt, configService, logger)
        const result = safeParse(responseText, input, logger)
		logger.info('Analysis completed successfully')
		return result
	} catch (e: any) {
		const msg = typeof e?.message === 'string' ? e.message : 'Không xác định'
		logger.error('Analysis failed', e)

		// Improved error message with troubleshooting steps
		return {
			type: 'suggestion',
			language: 'vi',
            summary: `❌ Không thể kết nối Ollama: ${msg}`,
			code_fix: `
📋 Các bước khắc phục:

1️⃣ Kiểm tra Ollama đang chạy:
   \`ollama ps\`

2️⃣ Nếu chưa chạy, khởi động service:
   \`ollama serve\`

3️⃣ Kiểm tra model đã cài đặt:
   \`ollama list\`

4️⃣ Kiểm tra model mong muốn đã cài đặt:
   \`ollama pull llama3.2:latest\` (hoặc model khác)

5️⃣ Kiểm tra API URL trong Settings:
   Mặc định: http://localhost:11434/api/generate

6️⃣ Kiểm tra firewall/antivirus không chặn port 11434
`,
			reasoning: `Chi tiết lỗi: ${msg}\n\nThời gian timeout: ${DEFAULTS.REQUEST_TIMEOUT_MS / 1000}s`,
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
