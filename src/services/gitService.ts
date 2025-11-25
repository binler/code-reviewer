import * as vscode from 'vscode'
import * as path from 'path'
import { exec } from 'child_process'

export class GitService {
	lastError: string | undefined

	async getChangedFiles(): Promise<string[]> {
		const folders = vscode.workspace.workspaceFolders || []
		if (!folders.length) { this.lastError = 'Không có workspace'; return [] }

		const files = new Set<string>()
		for (const wf of folders) {
			const cwd = wf.uri.fsPath
			if (!(await this.isGitRepo(cwd))) continue

			const modified = await this.execSafe('git ls-files -m', cwd)
			const staged = await this.execSafe('git diff --name-only --cached', cwd)
			const untracked = await this.execSafe('git ls-files -o --exclude-standard', cwd)

			this.addLines(files, cwd, modified)
			this.addLines(files, cwd, staged)
			this.addLines(files, cwd, untracked)
		}

		if (!files.size) this.lastError = 'Không tìm thấy tệp thay đổi'
		else this.lastError = undefined
		return Array.from(files)
	}

	async getBranches(): Promise<{ branches: string[]; current?: string }> {
		const wf = vscode.workspace.workspaceFolders?.[0]
		if (!wf) { this.lastError = 'Không có workspace'; return { branches: [] } }
		const cwd = wf.uri.fsPath
		if (!(await this.isGitRepo(cwd))) { this.lastError = 'Workspace không phải repository Git'; return { branches: [] } }
		const list = await this.execSafe('git branch --format="%(refname:short)"', cwd)
		const current = (await this.execSafe('git rev-parse --abbrev-ref HEAD', cwd)).trim()
		return { branches: list.split(/\r?\n/).filter(Boolean), current }
	}

	async getChangedFilesBetweenBranches(from: string, to: string): Promise<string[]> {
		const wf = vscode.workspace.workspaceFolders?.[0]
		if (!wf) { this.lastError = 'Không có workspace'; return [] }
		const cwd = wf.uri.fsPath
		if (!(await this.isGitRepo(cwd))) { this.lastError = 'Workspace không phải repository Git'; return [] }
		const out = await this.execSafe(`git diff --name-only ${from}..${to}`, cwd)
		return out.split(/\r?\n/).filter(Boolean).map(f => path.join(cwd, f))
	}

	private addLines(acc: Set<string>, cwd: string, output: string): void {
		const lines = output.split(/\r?\n/).filter(Boolean)
		for (const f of lines) acc.add(path.join(cwd, f))
	}

	private async isGitRepo(cwd: string): Promise<boolean> {
		const out = await this.execSafe('git rev-parse --is-inside-work-tree', cwd)
		return out.trim() === 'true'
	}

	private async execSafe(cmd: string, cwd: string): Promise<string> {
		return await new Promise<string>((resolve) => {
			try {
				exec(cmd, { cwd }, (err, stdout, stderr) => {
					if (err) { this.lastError = err.message; resolve(''); return }
					if (stderr && !stdout) { this.lastError = stderr; resolve(''); return }
					resolve(stdout || '')
				})
			} catch (e: any) {
				this.lastError = String(e?.message || e)
				resolve('')
			}
		})
	}
}

