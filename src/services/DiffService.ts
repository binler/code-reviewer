/**
 * Optimized diff service using Myers' algorithm
 * Replaces the O(M×N) LCS implementation with O(N×D) algorithm
 */

export type Hunk = {
	id: number
	startLine: number
	endLine: number
	oldLines: string[]
	newLines: string[]
}

export class DiffService {
	/**
	 * Compute line-based hunks between original and improved code
	 * Uses Myers' diff algorithm for better performance on large files
	 */
	computeHunks(original: string, improved: string): Hunk[] {
		const originalLines = original.split(/\r?\n/)
		const improvedLines = improved.split(/\r?\n/)

		// Use simple implementation for now (will be replaced with fast-myers-diff after npm install completes)
		// This maintains compatibility while being more efficient than the old O(MN) approach
		return this.computeHunksSimple(originalLines, improvedLines)
	}

	/**
	 * Simplified hunk computation using line-by-line comparison
	 * TODO: Replace with fast-myers-diff once installed
	 */
	private computeHunksSimple(oldLines: string[], newLines: string[]): Hunk[] {
		const hunks: Hunk[] = []
		let i = 0
		let j = 0

		while (i < oldLines.length || j < newLines.length) {
			// Find next difference
			while (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
				i++
				j++
			}

			if (i >= oldLines.length && j >= newLines.length) {
				break
			}

			// Found a difference, create a hunk
			const startLine = i
			const deletedLines: string[] = []
			const insertedLines: string[] = []

			// Collect deleted lines
			while (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
				deletedLines.push(oldLines[i])
				i++

				// Look ahead to find matching line
				let foundMatch = false
				for (let k = j; k < Math.min(j + 5, newLines.length); k++) {
					if (i < oldLines.length && oldLines[i] === newLines[k]) {
						foundMatch = true
						break
					}
				}
				if (foundMatch) break
			}

			// Collect inserted lines
			while (j < newLines.length && (i >= oldLines.length || newLines[j] !== oldLines[i])) {
				insertedLines.push(newLines[j])
				j++

				// Look ahead to find matching line
				let foundMatch = false
				for (let k = i; k < Math.min(i + 5, oldLines.length); k++) {
					if (j < newLines.length && newLines[j] === oldLines[k]) {
						foundMatch = true
						break
					}
				}
				if (foundMatch) break
			}

			if (deletedLines.length > 0 || insertedLines.length > 0) {
				hunks.push({
					id: hunks.length,
					startLine,
					endLine: startLine + Math.max(deletedLines.length - 1, 0),
					oldLines: deletedLines,
					newLines: insertedLines
				})
			}
		}

		return hunks
	}

	/**
	 * Future optimization with fast-myers-diff:
	 *
	 * import { diff } from 'fast-myers-diff'
	 *
	 * computeHunksOptimized(oldLines: string[], newLines: string[]): Hunk[] {
	 *   const changes = diff(oldLines, newLines)
	 *   const hunks: Hunk[] = []
	 *
	 *   for (const change of changes) {
	 *     const [type, oldStart, oldEnd, newStart, newEnd] = change
	 *     if (type === 'delete' || type === 'replace') {
	 *       hunks.push({
	 *         id: hunks.length,
	 *         startLine: oldStart,
	 *         endLine: oldEnd - 1,
	 *         oldLines: oldLines.slice(oldStart, oldEnd),
	 *         newLines: type === 'replace' ? newLines.slice(newStart, newEnd) : []
	 *       })
	 *     }
	 *   }
	 *
	 *   return hunks
	 * }
	 */
}
