export async function isModelAvailable(apiBase: string, model: string): Promise<boolean> {
	try {
		const url = apiBase.endsWith('/api/generate') ? apiBase.replace('/api/generate', '/api/tags') : `${apiBase}/api/tags`
		const res = await fetch(url)
		if (!res.ok) return false
		const data = await res.json().catch(() => ({} as any)) as any
		const list: any[] = Array.isArray(data?.models) ? data.models : (Array.isArray(data) ? data : [])
		return list.some((m: any) => String(m?.name || m).toLowerCase() === model.toLowerCase())
	} catch {
		return false
	}
}

