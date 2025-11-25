export class Container {
	private services = new Map<string, any>()
	register(token: string, instance: any): void { this.services.set(token, instance) }
	resolve<T>(token: string): T { const v = this.services.get(token); if (!v) throw new Error(`Service not found: ${token}`); return v as T }
	dispose(): void {
		for (const v of this.services.values()) {
			if (v && typeof v.dispose === 'function') v.dispose()
		}
		this.services.clear()
	}
}

export const TOKENS = {
	Logger: 'logger',
	ConfigService: 'configService',
	GitService: 'gitService',
	OllamaService: 'ollamaService',
	ReviewService: 'reviewService',
	DiffService: 'diffService'
} as const

