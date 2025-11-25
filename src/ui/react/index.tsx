import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ReviewSidebar, type FileGroup, type Issue, type Summary } from './ReviewSidebar'

declare global { interface Window { __vscode: any; __sidebar: any } }

function App() {
	const [files, setFiles] = useState<FileGroup[]>([])
	const [pending, setPending] = useState<string[]>([])
	const [toast, setToast] = useState<string | null>(null)
	const [cursor, setCursor] = useState<{ fi: number; ii: number } | null>(null)
	const vscode = window.__vscode

	useEffect(() => {
		window.__sidebar = {
			onMessage(m: any) {
				if (m.type === 'branches') {
					if (window.__sidebarBranches) window.__sidebarBranches(m)
				} else if (m.type === 'files') {
					const list: string[] = m.payload || []
					setFiles(list.map(p => ({ path: p, issues: [], summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 } })))
					setPending(list)
				} else if (m.type === 'fileResult') {
					const { file, result } = m.payload || {}
					if (!file || !result) return
					setFiles(prev => prev.map(f => f.path === file ? ({ path: f.path, issues: (result.issues || []) as Issue[], summary: (result.summary || {}) as Summary }) : f))
					setPending(prev => prev.filter(p => p !== file))
				} else if (m.type === 'snippet') {
					// could show snippet in separate panel; handled by host for now
				}
			}
		}
	}, [])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const flat: Array<{ fi: number; ii: number; file: string; issue: Issue }> = []
			files.forEach((f, fi) => f.issues.forEach((iss, ii) => flat.push({ fi, ii, file: f.path, issue: iss })))
			if (!flat.length) return
			if (e.key === 'j') { const idx = cursor ? Math.min(flat.length - 1, flat.findIndex(x => x.fi === cursor.fi && x.ii === cursor.ii) + 1) : 0; const cur = flat[idx]; setCursor({ fi: cur.fi, ii: cur.ii }); vscode.postMessage({ type: 'open-file', file: cur.file, line: cur.issue.line, suggestion: { title: cur.issue.title, description: cur.issue.description, improved: cur.issue.suggestion } }) }
			else if (e.key === 'k') { const idx = cursor ? Math.max(0, flat.findIndex(x => x.fi === cursor.fi && x.ii === cursor.ii) - 1) : 0; const cur = flat[idx]; setCursor({ fi: cur.fi, ii: cur.ii }); vscode.postMessage({ type: 'open-file', file: cur.file, line: cur.issue.line, suggestion: { title: cur.issue.title, description: cur.issue.description, improved: cur.issue.suggestion } }) }
			else if (e.key === 'a' && cursor) { const cur = files[cursor.fi]?.issues[cursor.ii]; const file = files[cursor.fi]?.path; if (cur?.suggestion) { vscode.postMessage({ type: 'apply-suggestion', file, line: cur.line, improved: cur.suggestion }); setToast('Đã áp dụng đề xuất') } }
			else if (e.key === 'd' && cursor) { const cur = files[cursor.fi]?.issues[cursor.ii]; const file = files[cursor.fi]?.path; if (cur?.suggestion) { vscode.postMessage({ type: 'preview-suggestion', file, line: cur.line, improved: cur.suggestion }); setToast('Mở diff đề xuất') } }
		}
		window.addEventListener('keydown', onKey)
		const timer = setInterval(() => { if (toast) setToast(null) }, 2000)
		return () => { window.removeEventListener('keydown', onKey); clearInterval(timer) }
	}, [files, cursor, toast])

	return <>
		<ReviewSidebar files={files}
			onOpen={(file, line, issue) => {
				vscode.postMessage({ type: 'open-file', file, line, suggestion: { title: issue.title, description: issue.description, improved: issue.suggestion } })
			}}
			onStartWork={() => { vscode.postMessage({ type: 'startReview', work: true }) }}
			onStartBranches={(from, to) => { vscode.postMessage({ type: 'startReview', from, to }) }}
			onApply={(file, line, improved) => { vscode.postMessage({ type: 'apply-suggestion', file, line, improved }) }}
			onPreview={(file, line, improved) => { vscode.postMessage({ type: 'preview-suggestion', file, line, improved }) }}
		/>
		{pending.length>0 ? <div style={{ position: 'fixed', top: 12, right: 12, display: 'flex', gap: 8, alignItems: 'center', background: 'var(--vscode-editorWidget-background)', border: '1px solid var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)', padding: '6px 10px', borderRadius: 6 }}><span className="spinner"></span><span>Analyzing changes... {files.length - pending.length}/{files.length}</span></div> : null}
		{toast ? <div style={{ position: 'fixed', bottom: 12, left: 12, background: 'var(--vscode-editorWidget-background)', border: '1px solid var(--vscode-panel-border)', color: 'var(--vscode-editor-foreground)', padding: '8px 12px', borderRadius: 6 }}>{toast}</div> : null}
	</>
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
