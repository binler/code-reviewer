export class CacheService {
	private map = new Map<string, any>()
	get<T>(key: string): T | undefined { return this.map.get(key) as T | undefined }
	set<T>(key: string, value: T): void { this.map.set(key, value) }
	has(key: string): boolean { return this.map.has(key) }
	delete(key: string): void { this.map.delete(key) }
	clear(): void { this.map.clear() }
}

