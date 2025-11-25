export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Issue = {
	file: string
	line: number
	severity: Severity
	category: string
	title: string
	description: string
	suggestion: string
}
export type ReviewSummary = { total: number; critical: number; high: number; medium: number; low: number }
export type ReviewResult = { issues: Issue[]; summary: ReviewSummary }

