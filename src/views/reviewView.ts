import * as vscode from 'vscode'
import { analyzeWithDeepseek } from '../agents/deepseekAgent'
import { exec } from 'child_process'
import * as path from 'path'
import { DiffService } from '../services/DiffService'

export class ReviewViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView
  private lastGitError?: string
  private diff = new DiffService()
  private fileDecos = new Map<string, vscode.TextEditorDecorationType[]>()
  private fileThreads = new Map<string, vscode.CommentThread[]>()
  private commentController = vscode.comments.createCommentController('deepseek-review', 'Code Review')

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = getHtml(webviewView.webview)
    webviewView.onDidDispose(() => {
      this.commentController.dispose()
    })
    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg?.type === 'loadBranches') {
        const branches = await this.getBranches()
        webviewView.webview.postMessage({ type: 'branches', payload: branches, error: this.lastGitError })
      } else if (msg?.type === 'startReview') {
        const from = String(msg.from || '')
        const to = String(msg.to || '')
        let files = from && to ? await this.getChangedFilesBetweenBranches(from, to) : []
        if (msg.work || files.length === 0) {
          const workFiles = await this.getChangedFiles()
          const set = new Set<string>(files)
          for (const f of workFiles) set.add(f)
          files = Array.from(set)
        }
        webviewView.webview.postMessage({ type: 'files', payload: files, error: this.lastGitError })
        for (const f of files) {
          const uri = vscode.Uri.file(f)
          const buf = await vscode.workspace.fs.readFile(uri)
          const text = Buffer.from(buf).toString('utf8')
          const result = await analyzeWithDeepseek(text)
          webviewView.webview.postMessage({ type: 'fileResult', payload: { file: f, result } })
          await this.applyDecorations(uri, text, result.improved_code || text, result)
        }
      } else if (msg?.type === 'stopReview') {
        webviewView.webview.postMessage({ type: 'stopped' })
      } else if (msg?.type === 'openFile') {
        const uri = vscode.Uri.file(String(msg.file || ''))
        vscode.window.showTextDocument(uri)
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
        await vscode.commands.executeCommand('vscode.diff', baseDoc.uri, right.uri, `Diff: ${path.basename(uri.fsPath)} ↔ improved`)
      }
    })
  }

  // Ping API đã được chuyển lên view Cài đặt

  private async getChangedFiles(): Promise<string[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) { this.lastGitError = 'Không có workspace'; return [] }
    try {
      const gitUri = vscode.Uri.file(path.join(root, '.git'))
      await vscode.workspace.fs.stat(gitUri)
    } catch {
      this.lastGitError = 'Workspace không phải repository Git'
      return []
    }
    const out = await this.safeExec('git status --porcelain', root)
    const files: string[] = []
    const lines = out.split(/\r?\n/).filter(Boolean)
    for (const l of lines) {
      const code = l.slice(0, 2).trim()
      const f = l.slice(3).trim()
      if (!f) continue
      if (['M', 'A', 'R'].includes(code) || l.startsWith(' M') || l.startsWith('A ') || l.startsWith('R ')) files.push(path.join(root, f))
    }
    return files
  }

  private async getBranches(): Promise<{ branches: string[]; current?: string }> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) { this.lastGitError = 'Không có workspace'; return { branches: [] } }
    const list = await this.safeExec('git branch --format="%(refname:short)"', root)
    const current = (await this.safeExec('git rev-parse --abbrev-ref HEAD', root)).trim()
    return { branches: list.split(/\r?\n/).filter(Boolean), current }
  }

  private async getChangedFilesBetweenBranches(from: string, to: string): Promise<string[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) { this.lastGitError = 'Không có workspace'; return [] }
    const out = await this.safeExec(`git diff --name-only ${from}..${to}`, root)
    return out.split(/\r?\n/).filter(Boolean).map(f => path.join(root, f))
  }

  private async safeExec(cmd: string, cwd: string): Promise<string> {
    return await new Promise<string>((resolve) => {
      try {
        exec(cmd, { cwd }, (err, stdout, stderr) => {
          if (err) {
            this.lastGitError = err.message
            vscode.window.showWarningMessage(`Git lỗi: ${err.message}`)
            resolve('')
            return
          }
          if (stderr && !stdout) {
            this.lastGitError = stderr
            resolve('')
            return
          }
          this.lastGitError = undefined
          resolve(stdout || '')
        })
      } catch (e: any) {
        this.lastGitError = String(e?.message || e)
        vscode.window.showWarningMessage(`Không thể chạy git: ${e?.message || e}`)
        resolve('')
      }
    })
  }

  private async applyDecorations(uri: vscode.Uri, original: string, improved: string, payload: any): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(uri)
      const editor = await vscode.window.showTextDocument(doc, { preview: false })
      const hunks = this.diff.computeHunks(original, improved)
      const potential = vscode.window.createTextEditorDecorationType({ isWholeLine: true, borderWidth: '0 0 0 3px', borderColor: '#e51400', backgroundColor: 'rgba(229,20,0,0.08)' })
      const refactor = vscode.window.createTextEditorDecorationType({ isWholeLine: true, borderWidth: '0 0 0 3px', borderColor: '#007acc', backgroundColor: 'rgba(0,122,204,0.08)' })
      const potRanges: vscode.DecorationOptions[] = []
      const refRanges: vscode.DecorationOptions[] = []
      for (const h of hunks) {
        const start = h.startLine < doc.lineCount ? doc.lineAt(Math.max(h.startLine, 0)).range.start : doc.lineAt(doc.lineCount - 1).range.end
        const end = h.endLine >= h.startLine && h.endLine < doc.lineCount ? doc.lineAt(h.endLine).range.end : start
        const hover = new vscode.MarkdownString()
        const badge = ((payload?.summary || '') + (payload?.code_fix || '') + (payload?.reasoning || '')).toLowerCase().includes('lỗi') ? 'Potential Issue' : 'Refactor Suggestion'
        hover.appendMarkdown(`**${badge}**\n\n`)
        const minus = h.oldLines.map(l => `- ${l}`).join('\n')
        const plus = h.newLines.map(l => `+ ${l}`).join('\n')
        hover.appendCodeblock(`${minus}\n${plus}`)
        const opt = { range: new vscode.Range(start, end), hoverMessage: hover }
        if (badge === 'Potential Issue') potRanges.push(opt)
        else refRanges.push(opt)
      }
      editor.setDecorations(potential, potRanges)
      editor.setDecorations(refactor, refRanges)
      const key = uri.fsPath
      const prev = this.fileDecos.get(key) || []
      prev.forEach(d => d.dispose())
      this.fileDecos.set(key, [potential, refactor])

      const prevThreads = this.fileThreads.get(key) || []
      prevThreads.forEach(t => t.dispose())
      const threads: vscode.CommentThread[] = []
      for (const h of hunks) {
        const start = h.startLine < doc.lineCount ? doc.lineAt(Math.max(h.startLine, 0)).range.start : doc.lineAt(doc.lineCount - 1).range.end
        const end = h.endLine >= h.startLine && h.endLine < doc.lineCount ? doc.lineAt(h.endLine).range.end : start
        const badge = ((payload?.summary || '') + (payload?.code_fix || '') + (payload?.reasoning || '')).toLowerCase().includes('lỗi') ? 'Potential Issue' : 'Refactor Suggestion'
        const md = new vscode.MarkdownString()
        md.isTrusted = true
        md.appendMarkdown(`### ${badge}\n\n`)
        if (badge === 'Potential Issue') {
          md.appendMarkdown(`${payload?.summary || ''}\n\n`)
        } else {
          md.appendMarkdown(`${payload?.code_fix || ''}\n\n`)
        }
        const minus = h.oldLines.map(l => `- ${l}`).join('\n')
        const plus = h.newLines.map(l => `+ ${l}`).join('\n')
        md.appendCodeblock(`${minus}\n${plus}`)
        const thread = this.commentController.createCommentThread(uri, new vscode.Range(start, end), [
          {
            body: md,
            mode: vscode.CommentMode.Preview,
            author: { name: 'CodeRabbit' },
            label: badge
          } as vscode.Comment
        ])
        threads.push(thread)
      }
      this.fileThreads.set(key, threads)
    } catch {}
  }
}

function getHtml(webview: vscode.Webview) {
  const csp = `default-src 'none'; img-src ${webview.cspSource} https:; script-src 'unsafe-inline' ${webview.cspSource}; style-src 'unsafe-inline';`
  const css = `
    :root{--bg:#0f111a;--card:#151820;--border:#2a2f3a;--text:#e6e6e6;--muted:#9aa4b2;--primary:#3b82f6;--danger:#ef4444;--success:#22c55e}
    *{box-sizing:border-box}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',sans-serif;background:var(--bg);color:var(--text);padding:12px}
    h3{margin:0 0 12px}
    .header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
    .btn{background:#1f2430;color:var(--text);border:1px solid var(--border);padding:8px 12px;border-radius:8px;cursor:pointer}
    .btn.primary{background:var(--primary);border-color:var(--primary);color:#fff;font-weight:600}
    .grid{display:grid;grid-template-columns:1fr;gap:12px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px}
    .title{font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:8px}
    .subtitle{color:var(--muted);font-size:12px}
    select,input[type='checkbox']{background:#1f2430;border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px}
    .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px}
    .badge.red{background:#331a1a;color:#ffd5d5;border:1px solid #662e2e}
    .badge.blue{background:#16203a;color:#cfe7ff;border:1px solid #254a7c}
    .file{border-top:1px solid var(--border);padding:10px 0}
    .file-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
    .file-actions{display:flex;gap:8px}
    .pill{padding:2px 10px;border-radius:999px;background:#1f2430;border:1px solid var(--border);color:var(--muted);font-size:12px}
    .collapsible{margin-top:8px}
    .item{border-left:3px solid #254a7c;background:#16203a;padding:10px;border-radius:8px;margin-bottom:8px}
    .item.red{border-left-color:#7a1d1d;background:#2a1717}
    .item-title{font-weight:600;margin-bottom:4px}
    .item-desc{color:var(--text)}
    .empty{color:var(--muted)}
  `
  const html = `
    <!doctype html><html lang="vi"><head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Code Review</title>
    <style>${css}</style>
    </head><body>
      <div class="header">
        <button id="start" class="btn primary">START REVIEW</button>
        <button id="stop" class="btn">Dừng</button>
        <div class="row">
          <label class="pill">From <select id="from"></select></label>
          <label class="pill">To <select id="to"></select></label>
          <label class="pill"><input type="checkbox" id="work"> Include Working Changes</label>
        </div>
      </div>

      <div class="grid">
        <div class="card" id="reviews">
          <div class="title">REVIEWS <span class="subtitle" id="currentBranch"></span></div>
          <div id="reviewsList" class="empty">Chưa có review nào</div>
        </div>

        <div class="card">
          <div class="title">FILES <span id="fileCount" class="pill">0</span></div>
          <div id="files"></div>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi()
        const startBtn = document.getElementById('start')
        const stopBtn = document.getElementById('stop')
        const fromSel = document.getElementById('from')
        const toSel = document.getElementById('to')
        const workCb = document.getElementById('work')
        const filesBox = document.getElementById('files')
        const count = document.getElementById('fileCount')
        const reviewsList = document.getElementById('reviewsList')
        const currentBranch = document.getElementById('currentBranch')

        let session = null // last session summary
        const fileResults = new Map()

        function renderBranches(payload){
          const branches = (payload.branches||[]) ;
          const cur = payload.current || ''
          currentBranch.textContent = cur ? '(current: '+cur+')' : ''
          fromSel.innerHTML = '' ; toSel.innerHTML = ''
          branches.forEach(b=>{
            const o1=document.createElement('option'); o1.value=o1.textContent=b; fromSel.appendChild(o1)
            const o2=document.createElement('option'); o2.value=o2.textContent=b; toSel.appendChild(o2)
          })
          if (cur) {
            toSel.value = cur
          }
        }

        function badgeFor(text){
          const t = (text||'').toLowerCase()
          return t.includes('lỗi')||t.includes('error')||t.includes('bug') ? 'red' : 'blue'
        }

        function renderFiles(list){
          filesBox.innerHTML = ''
          count.textContent = String(list.length)
          if (!list.length){ filesBox.innerHTML = '<div class="empty">Không có tệp thay đổi</div>'; return }
          list.forEach(f=>{
            const item = document.createElement('div'); item.className='file'
            const head = document.createElement('div'); head.className='file-head'
            const name = document.createElement('div'); name.textContent = f; name.style.cursor='pointer'
            name.addEventListener('click',()=>vscode.postMessage({ type:'openFile', file:f }))
            const actions = document.createElement('div'); actions.className='file-actions'
            const apply = document.createElement('button'); apply.className='btn'; apply.textContent='Áp dụng'
            apply.addEventListener('click',()=>{
              const r=fileResults.get(f); if(!r) return; vscode.postMessage({ type:'applyImprovedFile', file:f, code:r.improved_code })
            })
            const diff = document.createElement('button'); diff.className='btn'; diff.textContent='Xem Diff'
            diff.addEventListener('click',()=>{
              const r=fileResults.get(f); if(!r) return; vscode.postMessage({ type:'previewImprovedFile', file:f, code:r.improved_code })
            })
            actions.appendChild(apply); actions.appendChild(diff)
            head.appendChild(name); head.appendChild(actions)
            item.appendChild(head)
            const details = document.createElement('div'); details.className='collapsible'
            const res = fileResults.get(f)
            if (res){
              const block1=document.createElement('div'); block1.className='item '+badgeFor(res.summary)
              const t1=document.createElement('div'); t1.className='item-title'; t1.textContent='Potential Issue'
              const d1=document.createElement('div'); d1.className='item-desc'; d1.textContent=res.summary
              block1.appendChild(t1); block1.appendChild(d1)
              const block2=document.createElement('div'); block2.className='item'
              const t2=document.createElement('div'); t2.className='item-title'; t2.textContent='Refactor Suggestion'
              const d2=document.createElement('div'); d2.className='item-desc'; d2.textContent=res.code_fix
              block2.appendChild(t2); block2.appendChild(d2)
              details.appendChild(block1); details.appendChild(block2)
            } else {
              const skeleton=document.createElement('div'); skeleton.className='empty'; skeleton.textContent='Đang phân tích...'
              details.appendChild(skeleton)
            }
            item.appendChild(details)
            filesBox.appendChild(item)
          })
        }

        function renderSession(){
          if (!session){ reviewsList.textContent = 'Chưa có review nào'; return }
          const wrap = document.createElement('div')
          const title = document.createElement('div'); title.textContent = session.title
          const sub = document.createElement('div'); sub.className='subtitle'; sub.textContent = session.subtitle
          wrap.appendChild(title); wrap.appendChild(sub)
          reviewsList.innerHTML = ''
          reviewsList.appendChild(wrap)
        }

        startBtn.addEventListener('click',()=>{
          vscode.postMessage({ type:'startReview', from: fromSel.value, to: toSel.value, work: workCb.checked })
          session = { title: 'Review đang chạy', subtitle: 'Đang tổng hợp kết quả...' }
          renderSession()
        })
        stopBtn.addEventListener('click',()=>{ vscode.postMessage({ type:'stopReview' }) })

        window.addEventListener('message',e=>{
          const m=e.data
          if (!m||!m.type) return
          if (m.type==='branches'){ renderBranches(m.payload||{branches:[]}); }
          else if (m.type==='files'){ renderFiles(m.payload||[]); }
          else if (m.type==='fileResult'){
            const { file, result } = m.payload || {}
            if (file && result){ fileResults.set(file, result); renderFiles(Array.from(fileResults.keys())) }
          }
          else if (m.type==='stopped'){ session = { title: 'Review Completed', subtitle: 'Đã dừng phiên' }; renderSession() }
        })

        vscode.postMessage({ type:'loadBranches' })
      </script>
    </body></html>
  `
  return html
}
