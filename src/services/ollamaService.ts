import { ConfigService } from './ConfigService'
import { Logger as CoreLogger } from '../core/Logger'
import { DEFAULTS } from '../core/Constants'
import type { ReviewResult } from '../types/index.d'

type ModelConfig = { temperature: number; contextWindow: number; maxTokens: number; stopSequences: string[] }

const modelConfigs: Record<string, ModelConfig> = {
	'codellama:13b': { temperature: 0.2, contextWindow: 4096, maxTokens: 2048, stopSequences: ['```', '\n\n\n'] },
	'deepseek-coder:6.7b': { temperature: 0.3, contextWindow: 4096, maxTokens: 1500, stopSequences: ['```'] },
	'llama3:8b': { temperature: 0.4, contextWindow: 8192, maxTokens: 2000, stopSequences: [] }
}

export class OllamaService {
	constructor(private readonly config: ConfigService, private readonly logger: CoreLogger) { }

	async review(language: string, framework: string, diff: string): Promise<ReviewResult> {
		const prompt = this.buildPrompt(language, framework, diff)
		const responseText = await this.call(prompt)
		const parsed = this.safeParse(responseText)
		return parsed
	}

	private buildPrompt(language: string, framework: string, diff: string): string {
		const sys = [
			'You are a code review expert. Analyze the code changes and provide focused, actionable feedback.',
			'Focus Areas (in order):',
			'1. Critical bugs and security issues',
			'2. Performance problems',
			'3. Code quality and maintainability',
			'4. Best practices for the language/framework',
			'Instructions:',
			'• Be concise but specific',
			'• Provide code examples for fixes',
			'• Categorize: CRITICAL, HIGH, MEDIUM, LOW',
			'• Output valid JSON only, no explanations outside JSON'
		].join('\n')
		const jsonFmt = '{"issues":[],"summary":{"total":0,"critical":0,"high":0,"medium":0,"low":0}}'
		const head = `## System Prompt (Optimized for Ollama)\n\n${sys}\n\n` +
			'**Output Format (strict JSON):**\n' +
			'```json\n' + jsonFmt + '\n```\n\n' +
			'## Code to Review\n' +
			`**Language:** ${language}\n` +
			`**Framework:** ${framework}\n\n` +
			'**Diff:**\n```\n'
		const body = diff
		const tail = '\n```\n\nRespond with JSON only. No preamble, no explanation text.'
		return head + body + tail
	}

	private async call(prompt: string): Promise<string> {
		const apiUrl = this.config.getApiUrl()
		const model = this.config.getModel()
		const mc = modelConfigs[model] || { temperature: 0.3, contextWindow: 4096, maxTokens: 1500, stopSequences: [] }
		const controller = new AbortController()
		const timeout = setTimeout(() => { controller.abort() }, DEFAULTS.REQUEST_TIMEOUT_MS)
		try {
			const res = await fetch(apiUrl, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model, prompt, stream: false, options: { temperature: mc.temperature, num_ctx: mc.contextWindow, num_predict: mc.maxTokens, stop: mc.stopSequences } }),
				signal: controller.signal
			})
			clearTimeout(timeout)
			if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => 'Unknown')}`)
			const data = await res.json() as { response?: string }
			return data.response || ''
		} catch (e: any) {
			clearTimeout(timeout)
			this.logger.error('Ollama request failed', e)
			throw e
		}
	}

	private safeParse(text: string): ReviewResult {
		const json = this.extractJson(text)
		try {
			const obj = JSON.parse(json || text)
			if (!obj || !Array.isArray(obj.issues) || !obj.summary) throw new Error('Invalid JSON')
			const issues = (obj.issues || []).map((it: any) => ({
				file: String(it.file || ''),
				line: Number(it.line || 0),
				severity: String(it.severity || 'low').toLowerCase(),
				category: String(it.category || ''),
				title: String(it.title || ''),
				description: String(it.description || ''),
				suggestion: String(it.suggestion || '')
			}))
			const summary = {
				total: Number(obj.summary?.total || issues.length),
				critical: Number(obj.summary?.critical || 0),
				high: Number(obj.summary?.high || 0),
				medium: Number(obj.summary?.medium || 0),
				low: Number(obj.summary?.low || 0)
			}
			return { issues, summary }
		} catch {
			return { issues: [], summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 } }
		}
	}

	private extractJson(text: string): string | null {
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
			else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1) }
		}
		return null
	}
}
