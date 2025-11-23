import { ConfigService } from '../services/ConfigService'
import { Logger } from '../core/Logger'
import { DEFAULTS } from '../core/Constants'

type AgentOutput = {
	type: 'suggestion'
	language: 'vi'
	summary: string
	code_fix: string
	reasoning: string
	improved_code: string
}

function buildPrompt(input: string) {
	const tpl = `You are an expert code reviewer and refactoring specialist. Your task is to analyze the provided source code and provide a comprehensive review with actionable improvements.

CRITICAL REQUIREMENTS:
1. Respond ONLY with valid JSON (no additional text before or after)
2. Include ALL required fields: type, language, summary, code_fix, reasoning, improved_code
3. Ensure the response is well-formed and parseable JSON
4. Write summary, code_fix, and reasoning fields in Vietnamese (tiếng Việt)
5. Keep improved_code in the original language of the source code

SOURCE CODE TO REVIEW:
\`\`\`
${input}
\`\`\`

REVIEW GUIDELINES:
1. Identify critical issues: security vulnerabilities, performance problems, memory leaks, logic errors
2. Check code quality: readability, maintainability, naming conventions, code style
3. Analyze best practices: design patterns, SOLID principles, error handling
4. Suggest concrete improvements: refactoring opportunities, optimization techniques
5. Consider edge cases: null checks, boundary conditions, error scenarios

RESPONSE JSON STRUCTURE (must be valid JSON):
{
  "type": "suggestion",
  "language": "vi",
  "summary": "Concise summary of main issues found (max 150 chars)",
  "code_fix": "Specific issues identified and how to fix them",
  "reasoning": "Detailed explanation of why these changes are important",
  "improved_code": "Complete refactored version of the code with improvements applied"
}

Provide the JSON response EXACTLY as specified above, ensuring all Vietnamese fields contain meaningful content and are properly formatted.`
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
			obj.language === 'vi' &&
			typeof obj.summary === 'string' &&
			typeof obj.code_fix === 'string' &&
			typeof obj.reasoning === 'string' &&
			typeof obj.improved_code === 'string'
		) {
			logger.info('Successfully parsed agent output')
			return obj as AgentOutput
		}
	} catch (e) {
		logger.warn('Failed to parse JSON response, using fallback')
	}

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

4️⃣ Nếu thiếu deepseek-v3, cài đặt:
   \`ollama pull deepseek-v3\`

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
