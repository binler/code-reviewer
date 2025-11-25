import type { ReviewResult } from '../types/index.d'
import { OllamaService } from './ollamaService'

export class ReviewService {
	constructor(private readonly ollama: OllamaService) { }
	async reviewDiff(language: string, framework: string, diff: string): Promise<ReviewResult> {
		return await this.ollama.review(language, framework, diff)
	}
}

