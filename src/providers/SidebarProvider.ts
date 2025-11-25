import * as vscode from 'vscode'
import * as path from 'path'
import { GitService } from '../services/gitService'
import { OllamaService } from '../services/ollamaService'
import { ConfigService } from '../services/ConfigService'
import { Logger } from '../core/Logger'
import { NavigationService } from '../services/NavigationService'

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private readonly git = new GitService()
  private readonly ollama = new OllamaService(new ConfigService(), Logger.getInstance())
  private readonly nav = NavigationService.getInstance()
  constructor(private readonly extensionUri: vscode.Uri) {}

	resolveWebviewView(webviewView: vscode.WebviewView) {
		this.view = webviewView
		webviewView.webview.options = { enableScripts: true }
		webviewView.webview.html = this.getHtml(webviewView.webview)
		webviewView.onDidDispose(() => { this.nav.dispose() })

    webviewView.webview.onDidReceiveMessage(async msg => {
			if (msg?.type === 'loadBranches') {
				const branches = await this.git.getBranches()
				webviewView.webview.postMessage({ type: 'branches', payload: branches, error: this.git.lastError })
			} else if (msg?.type === 'startReview') {
				const from = String(msg.from || '')
				const to = String(msg.to || '')
				let files = from && to ? await this.git.getChangedFilesBetweenBranches(from, to) : []
				if (msg.work || files.length === 0) {
					const workFiles = await this.git.getChangedFiles()
					const set = new Set<string>(files)
					for (const f of workFiles) set.add(f)
					files = Array.from(set)
				}
				webviewView.webview.postMessage({ type: 'files', payload: files, error: this.git.lastError })
				for (const f of files) {
					const uri = vscode.Uri.file(f)
					const doc = await vscode.workspace.openTextDocument(uri)
					const text = doc.getText()
          const review = await this.ollama.review(doc.languageId, 'unknown', text)
          const issues: any[] = Array.isArray((review as any)?.issues) ? (review as any).issues : []
          const summary = { total: issues.length, critical: 0, high: 0, medium: 0, low: 0 }
          for (const it of issues){ const s = String(it?.severity||'').toLowerCase(); if (s==='critical') summary.critical++; else if (s==='high') summary.high++; else if (s==='medium') summary.medium++; else summary.low++; }
          webviewView.webview.postMessage({ type: 'fileResult', payload: { file: f, result: { ...review, summary } } })
				}
      } else if (msg?.type === 'open-file') {
        const file = String(msg.file || '')
        const line = Number(msg.line || 0)
        const suggestion = msg.suggestion || {}
        await this.nav.openAndAnnotate(vscode.Uri.file(file), line, suggestion)
      } else if (msg?.type === 'apply-suggestion') {
        const file = String(msg.file || '')
        const line = Number(msg.line || 0)
        const improved = String(msg.improved || '')
        await this.nav.applySuggestion(vscode.Uri.file(file), line, improved)
      } else if (msg?.type === 'preview-suggestion') {
        const file = String(msg.file || '')
        const line = Number(msg.line || 0)
        const improved = String(msg.improved || '')
        await this.nav.previewSuggestion(vscode.Uri.file(file), line, improved)
      }
    })
  }

  private getHtml(webview: vscode.Webview) {
    const csp = `default-src 'none'; img-src ${webview.cspSource} https:; script-src 'unsafe-inline' ${webview.cspSource}; style-src 'unsafe-inline'`;
    const css = `:root{--bg:var(--vscode-sideBar-background);--text:var(--vscode-sideBar-foreground);--muted:var(--vscode-descriptionForeground);--card:var(--vscode-editorWidget-background);--border:var(--vscode-panel-border);--primary:var(--vscode-button-background);--danger:#ef4444;--blue:#3b82f6;--orange:#f59e0b;--green:#22c55e}*{box-sizing:border-box}body{font-family:var(--vscode-editor-font-family);color:var(--text);background:var(--bg);padding:10px}.section{background:var(--card);border:1px solid var(--border);border-radius:8px;margin-bottom:12px}.section-head{display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid var(--border)}.section-title{font-weight:600}.section-body{padding:10px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.pill{padding:2px 10px;border-radius:999px;background:transparent;border:1px solid var(--border);color:var(--text);font-size:12px}.select{background:transparent;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px}.btn{background:var(--primary);color:var(--vscode-button-foreground);border:1px solid var(--primary);padding:8px 12px;border-radius:6px;cursor:pointer}.files{display:flex;flex-direction:column;gap:10px}.file{border:1px solid var(--border);border-radius:8px;overflow:hidden}.file summary{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;cursor:pointer;list-style:none}.file summary::-webkit-details-marker{display:none}.file summary:hover{background:rgba(255,255,255,0.03)}.file-issues{padding:8px 10px;border-left:3px solid var(--border)}.file-issues.collapsed{display:none}.issue{padding:8px 10px;border-radius:8px;margin-bottom:10px;border:1px solid var(--border);cursor:pointer;display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,0.02)}.issue.red{border-left:3px solid var(--danger)}.issue.blue{border-left:3px solid var(--blue)}.issue.orange{border-left:3px solid var(--orange)}.issue.green{border-left:3px solid var(--green)}.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600}.badge.red{background:rgba(239,68,68,.15);color:#ffd5d5;border:1px solid rgba(239,68,68,.4)}.badge.blue{background:rgba(59,130,246,.15);color:#cfe7ff;border:1px solid rgba(59,130,246,.4)}.count{display:inline-flex;align-items:center;gap:4px;padding:0 6px;border-radius:999px;border:1px solid var(--border);font-size:12px;color:var(--muted);margin-left:6px}.count.red{color:#ffd5d5;border-color:rgba(239,68,68,.4)}.count.orange{color:#ffe9c2;border-color:rgba(245,158,11,.4)}.count.blue{color:#cfe7ff;border-color:rgba(59,130,246,.4)}.count.green{color:#d6ffe0;border-color:rgba(34,197,94,.4)}.muted{color:var(--muted)}#root{min-height:160px}.status{display:flex;gap:8px;align-items:center;margin-top:8px}.spinner{width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`
    const scriptUri = vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.js')
    const scriptSrc = webview.asWebviewUri(scriptUri).toString()
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Review Sidebar</title><style>${css}</style></head><body>
      <div id="root"></div>
      <script>
        const vscode = acquireVsCodeApi()
        const script = document.createElement('script'); script.src='${scriptSrc}'; document.body.appendChild(script)
        window.addEventListener('message',(e)=>{ const m=e.data; if(!m||!m.type) return; if(window.__sidebar){ window.__sidebar.onMessage(m) } })
        window.__vscode = vscode
        vscode.postMessage({ type:'loadBranches' })
      </script>
    </body></html>`
    return html
  }
}

