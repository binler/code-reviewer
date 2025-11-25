import * as vscode from 'vscode'
import * as path from 'path'
import { GitService } from '../services/gitService'
import { DiffDecorationProvider } from './diffDecorationProvider'
import { analyzeWithOllama } from '../agents/ollamaAgent'
import { OllamaService } from '../services/ollamaService'
import { ConfigService } from '../services/ConfigService'
import { Logger } from '../core/Logger'

export class ReviewViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private readonly git = new GitService()
  private readonly decor = new DiffDecorationProvider()
  private readonly ollama = new OllamaService(new ConfigService(), Logger.getInstance())

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this.getHtml(webviewView.webview)
    webviewView.onDidDispose(() => { this.decor.dispose() })
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
          const buf = await vscode.workspace.fs.readFile(uri)
          const text = Buffer.from(buf).toString('utf8')
          const suggestion = await analyzeWithOllama(text)
          const review = await this.ollama.review((await vscode.workspace.openTextDocument(uri)).languageId, 'unknown', text)
          webviewView.webview.postMessage({ type: 'fileResult', payload: { file: f, result: { ...review, improved_code: suggestion.improved_code, summaryText: suggestion.summary } } })
          this.decor.apply(uri, text, suggestion.improved_code || text, suggestion.summary)
        }
      } else if (msg?.type === 'stopReview') {
        webviewView.webview.postMessage({ type: 'stopped' })
      } else if (msg?.type === 'openFile') {
        const uri = vscode.Uri.file(String(msg.file || ''))
        vscode.window.showTextDocument(uri)
      } else if (msg?.type === 'focusLine') {
        const uri = vscode.Uri.file(String(msg.file || ''))
        const line = Number(msg.line || 0)
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        const pos = doc.lineAt(Math.min(Math.max(line, 0), doc.lineCount - 1)).range.start
        editor.selection = new vscode.Selection(pos, pos)
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter)
      } else if (msg?.type === 'applyImprovedFile') {
        const uri = vscode.Uri.file(String(msg.file || ''))
        const doc = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(doc)
        const improved = String(msg.code || '')
        const full = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length))
        await editor.edit(ed => ed.replace(full, improved))
        vscode.window.showInformationMessage('Đã áp dụng mã cải thiện')
      } else if (msg?.type === 'previewImprovedFile') {
        const uri = vscode.Uri.file(String(msg.file || ''))
        const baseDoc = await vscode.workspace.openTextDocument(uri)
        const improved = String(msg.code || '')
        const right = await vscode.workspace.openTextDocument({ content: improved, language: baseDoc.languageId })
        await vscode.commands.executeCommand('vscode.diff', baseDoc.uri, right.uri, `Diff: ${path.basename(uri.fsPath)} ↔ cải thiện`)
      } else if (msg?.type === 'getSnippet') {
        const uri = vscode.Uri.file(String(msg.file || ''))
        const line = Number(msg.line || 0)
        const doc = await vscode.workspace.openTextDocument(uri)
        const start = doc.lineAt(Math.max(0, line - 3)).range.start
        const end = doc.lineAt(Math.min(doc.lineCount - 1, line + 3)).range.end
        const snippet = doc.getText(new vscode.Range(start, end))
        webviewView.webview.postMessage({ type: 'snippet', payload: { file: uri.fsPath, line, snippet } })
      }
    })
  }

  private getHtml(webview: vscode.Webview) {
    const csp = `default-src 'none'; img-src ${webview.cspSource} https:; script-src 'unsafe-inline' ${webview.cspSource}; style-src 'unsafe-inline';`
    const css = `:root{--bg:var(--vscode-editor-background);--text:var(--vscode-editor-foreground);--muted:var(--vscode-descriptionForeground);--card:var(--vscode-editorWidget-background);--border:var(--vscode-panel-border);--primary:var(--vscode-button-background);--danger:#ef4444;--blue:#3b82f6}*{box-sizing:border-box}body{font-family:var(--vscode-editor-font-family);color:var(--text);background:var(--bg);padding:12px}.section{background:var(--card);border:1px solid var(--border);border-radius:6px;margin-bottom:12px}.section-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border)}.section-title{font-weight:600}.section-body{padding:12px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pill{padding:2px 10px;border-radius:999px;background:transparent;border:1px solid var(--border);color:var(--text);font-size:12px}.select{background:transparent;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px}.btn{background:var(--primary);color:var(--vscode-button-foreground);border:1px solid var(--primary);padding:8px 12px;border-radius:6px;cursor:pointer}.btn-row{display:flex;gap:8px;align-items:center}.dropdown{position:relative;display:inline-block}.dropdown-menu{position:absolute;top:100%;left:0;background:var(--card);border:1px solid var(--border);border-radius:6px;min-width:220px;display:none;z-index:10}.dropdown-menu.show{display:block}.menu-item{padding:8px 10px;cursor:pointer}.menu-item:hover{background:rgba(255,255,255,0.05)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.files{display:flex;flex-direction:column;gap:6px}.file-wrap{border-bottom:1px solid var(--border);padding:6px 0}.file-head{display:flex;justify-content:space-between;align-items:center;cursor:pointer}.file-issues{margin-top:6px;border-left:2px solid var(--border);padding-left:8px}.file-issues.collapsed{display:none}.issue{padding:6px 8px;border-radius:6px;margin-bottom:6px;border:1px solid var(--border);cursor:pointer}.issue.red{border-color:var(--danger)}.issue.blue{border-color:var(--blue)}.muted{color:var(--muted)}.detail-title{font-weight:600;margin-bottom:8px}.detail-actions{display:flex;gap:8px;margin-top:8px}.code{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;overflow:auto}`
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Code Review</title><style>${css}</style></head><body>
      <div class="section">
        <div class="section-head"><div class="section-title">NEW REVIEW</div></div>
        <div class="section-body">
          <div class="row">
            <span class="pill" id="curBranch">main</span>
            <span>→</span>
            <select id="toBranch" class="select"></select>
          </div>
          <div class="btn-row" style="margin-top:10px">
            <div class="dropdown">
              <button id="reviewBtn" class="btn">Review uncommitted changes</button>
              <div id="menu" class="dropdown-menu">
                <div class="menu-item" data-action="work">Review uncommitted changes</div>
                <div class="menu-item" data-action="branches">Review changes between branches</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid">
        <div class="section">
          <div class="section-head"><div class="section-title">FILES TO REVIEW (<span id="fileCount">0</span>)</div></div>
          <div class="section-body"><div id="files" class="files"><div class="muted">Chưa có thay đổi</div></div></div>
        </div>
        <div class="section">
          <div class="section-head"><div class="section-title">DETAIL</div></div>
          <div class="section-body">
            <div id="detailTitle" class="detail-title">Chọn một issue để xem chi tiết</div>
            <div id="detailDesc" class="muted"></div>
            <pre id="detailCode" class="code"></pre>
            <div class="detail-actions">
              <button id="applyBtn" class="btn">Áp dụng cải thiện</button>
              <button id="diffBtn" class="btn">Xem Diff</button>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><div class="section-title">REVIEWS</div></div>
        <div class="section-body"><div id="reviewsList" class="muted">Chưa có review nào</div></div>
      </div>

      <script>
        const vscode = acquireVsCodeApi()
        const curBranch = document.getElementById('curBranch')
        const toBranch = document.getElementById('toBranch')
        const filesBox = document.getElementById('files')
        const fileCount = document.getElementById('fileCount')
        const reviewBtn = document.getElementById('reviewBtn')
        const menu = document.getElementById('menu')
        const reviewsList = document.getElementById('reviewsList')
        const detailTitle = document.getElementById('detailTitle')
        const detailDesc = document.getElementById('detailDesc')
        const detailCode = document.getElementById('detailCode')
        const applyBtn = document.getElementById('applyBtn')
        const diffBtn = document.getElementById('diffBtn')
        const fileResults = new Map()
        const fileViews = new Map()

        reviewBtn.addEventListener('click',()=>{ menu.classList.toggle('show') })
        menu.addEventListener('click',(e)=>{
          const t = e.target
          if (!(t && t.dataset && t.dataset.action)) return
          menu.classList.remove('show')
          if (t.dataset.action==='work') { vscode.postMessage({ type:'startReview', work:true }) }
          else if (t.dataset.action==='branches') { const to = toBranch.value || ''; vscode.postMessage({ type:'startReview', from: curBranch.textContent || '', to }) }
        })

        function renderBranches(payload){
          const branches = (payload.branches||[])
          const cur = payload.current || ''
          curBranch.textContent = cur || 'unknown'
          toBranch.innerHTML = ''
          branches.forEach(b=>{ const o=document.createElement('option'); o.value=o.textContent=b; toBranch.appendChild(o) })
          if (cur) { toBranch.value = cur }
        }

        function renderFiles(list){
          filesBox.innerHTML = ''
          fileCount.textContent = String(list.length)
          if (!list.length){ filesBox.innerHTML = '<div class="muted">Chưa có thay đổi</div>'; return }
          list.forEach(f=>{
            const wrap=document.createElement('div'); wrap.className='file-wrap'
            const head=document.createElement('div'); head.className='file-head'
            const name=document.createElement('div'); name.textContent=f; name.style.cursor='pointer'
            const cnt=document.createElement('div'); cnt.className='pill'
            const arrow=document.createElement('span'); arrow.className='pill'; arrow.textContent='▸'
            head.appendChild(name); head.appendChild(cnt); head.appendChild(arrow)
            const issuesBox=document.createElement('div'); issuesBox.className='file-issues collapsed'
            wrap.appendChild(head); wrap.appendChild(issuesBox)
            filesBox.appendChild(wrap)
            head.addEventListener('click',()=>{
              issuesBox.classList.toggle('collapsed')
              arrow.textContent = issuesBox.classList.contains('collapsed') ? '▸' : '▾'
            })
            name.addEventListener('dblclick',()=>vscode.postMessage({ type:'openFile', file:f }))
            fileViews.set(f, { wrap, head, cnt, issuesBox })
            updateIssuesForFile(f)
          })
        }

        function updateIssuesForFile(f){
          const view = fileViews.get(f)
          if (!view) return
          const res=fileResults.get(f)
          const issues=(res&&res.issues)||[]
          view.cnt.textContent = String(issues.length)
          view.issuesBox.innerHTML=''
          issues.forEach(it=>{
            const item=document.createElement('div'); item.className='issue '+(String(it.severity||'').toLowerCase()==='critical'?'red':'blue')
            item.textContent = it.title || it.description || 'Issue'
            item.addEventListener('click',()=>{
              detailTitle.textContent = it.title || 'Issue'
              detailDesc.textContent = it.description || ''
              detailCode.textContent = ''
              vscode.postMessage({ type:'focusLine', file:f, line: Number(it.line||0) })
              vscode.postMessage({ type:'getSnippet', file:f, line: Number(it.line||0) })
              selectedFile = f
              selectedImproved = (res && res.improved_code) || ''
            })
            view.issuesBox.appendChild(item)
          })
        }

        let selectedFile = ''
        let selectedImproved = ''

        window.addEventListener('message',e=>{
          const m=e.data
          if (!m||!m.type) return
          if (m.type==='branches'){ renderBranches(m.payload||{branches:[]}) }
          else if (m.type==='files'){ renderFiles(m.payload||[]) }
          else if (m.type==='fileResult'){
            const { file, result } = m.payload || {}
            if (file && result){ fileResults.set(file, result); updateIssuesForFile(file) }
          }
          else if (m.type==='snippet'){
            const p=m.payload||{}
            if (p.snippet){ detailCode.textContent = p.snippet }
          }
        })

        applyBtn.addEventListener('click',()=>{ if (selectedFile && selectedImproved) vscode.postMessage({ type:'applyImprovedFile', file:selectedFile, code:selectedImproved }) })
        diffBtn.addEventListener('click',()=>{ if (selectedFile && selectedImproved) vscode.postMessage({ type:'previewImprovedFile', file:selectedFile, code:selectedImproved }) })

        vscode.postMessage({ type:'loadBranches' })
      </script>
    </body></html>`
    return html
  }
}
