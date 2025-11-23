import * as vscode from 'vscode'
import { analyzeWithDeepseek } from '../agents/deepseekAgent'
import { exec } from 'child_process'
import * as path from 'path'

export class ReviewViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = getHtml(webviewView.webview)
    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg?.type === 'loadBranches') {
        const branches = await this.getBranches()
        webviewView.webview.postMessage({ type: 'branches', payload: branches })
      } else if (msg?.type === 'startReview') {
        const from = String(msg.from || '')
        const to = String(msg.to || '')
        const files = from && to ? await this.getChangedFilesBetweenBranches(from, to) : await this.getChangedFiles()
        webviewView.webview.postMessage({ type: 'files', payload: files })
        for (const f of files) {
          const uri = vscode.Uri.file(f)
          const buf = await vscode.workspace.fs.readFile(uri)
          const text = Buffer.from(buf).toString('utf8')
          const result = await analyzeWithDeepseek(text)
          webviewView.webview.postMessage({ type: 'fileResult', payload: { file: f, result } })
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
      } else if (msg?.type === 'pingApi') {
        const res = await this.pingApi()
        webviewView.webview.postMessage({ type: 'ping', payload: res.ok, error: res.error })
      }
    })
  }

  private async pingApi(): Promise<{ ok: boolean; error?: string }> {
    try {
      const cfg = vscode.workspace.getConfiguration('deepseekAgent')
      const apiUrl = cfg.get<string>('apiUrl') || 'http://localhost:11434/api/generate'
      const model = cfg.get<string>('model') || 'deepseek-v3'

      const controller = new AbortController()
      const to = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ model, prompt: 'ping', stream: false }),
        signal: controller.signal
      })
      clearTimeout(to)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return { ok: false, error: `HTTP ${res.status}: ${text}` }
      }
      return { ok: true }
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Timeout khi gọi Ollama (10s)' : String(e?.message || e)
      return { ok: false, error: msg }
    }
  }

  private async getChangedFiles(): Promise<string[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return []
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
    if (!root) return { branches: [] }
    const list = await this.safeExec('git branch --format="%(refname:short)"', root)
    const current = (await this.safeExec('git rev-parse --abbrev-ref HEAD', root)).trim()
    return { branches: list.split(/\r?\n/).filter(Boolean), current }
  }

  private async getChangedFilesBetweenBranches(from: string, to: string): Promise<string[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return []
    const out = await this.safeExec(`git diff --name-only ${from}..${to}`, root)
    return out.split(/\r?\n/).filter(Boolean).map(f => path.join(root, f))
  }

  private async safeExec(cmd: string, cwd: string): Promise<string> {
    return await new Promise<string>((resolve) => {
      try {
        exec(cmd, { cwd }, (err, stdout, stderr) => {
          if (err) {
            vscode.window.showWarningMessage(`Git lỗi: ${err.message}`)
            resolve('')
            return
          }
          if (stderr && !stdout) {
            resolve('')
            return
          }
          resolve(stdout || '')
        })
      } catch (e: any) {
        vscode.window.showWarningMessage(`Không thể chạy git: ${e?.message || e}`)
        resolve('')
      }
    })
  }
}

function getHtml(webview: vscode.Webview) {
  const csp = `default-src 'none'; img-src ${webview.cspSource} https:; script-src 'unsafe-inline' ${webview.cspSource}; style-src 'unsafe-inline';`
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>DeepSeek Review</title><style>body{font-family:system-ui;padding:10px}button{padding:6px 10px;margin-right:8px}h4{margin:12px 0} .file{border:1px solid #333;border-radius:6px;padding:8px;margin-bottom:8px} .hint{border-left:4px solid #f90;padding:8px;margin:6px 0} .badge{display:inline-block;background:#444;color:#fff;padding:2px 6px;border-radius:4px;margin-right:6px} .row{display:flex;align-items:center;gap:8px} .actions{display:flex;gap:8px;margin-top:6px} select{padding:6px}</style></head><body><div class="row"><label>From <select id="from"></select></label><label>To <select id="to"></select></label><button id="start">Start Review</button><button id="stop">Stop Review</button><button id="ping">Kiểm tra kết nối</button></div><div id="status"></div><h4 id="filesTitle">Files to review</h4><div id="files"></div><script>const vscode=acquireVsCodeApi();const start=document.getElementById('start');const stop=document.getElementById('stop');const ping=document.getElementById('ping');const status=document.getElementById('status');const filesDiv=document.getElementById('files');const fromSel=document.getElementById('from');const toSel=document.getElementById('to');const filesTitle=document.getElementById('filesTitle');window.addEventListener('DOMContentLoaded',()=>{vscode.postMessage({type:'loadBranches'})});start.addEventListener('click',()=>{status.textContent='Đang phân tích thay đổi git...';filesDiv.innerHTML='';vscode.postMessage({type:'startReview',from:fromSel.value,to:toSel.value})});stop.addEventListener('click',()=>{status.textContent='Đã dừng';vscode.postMessage({type:'stopReview'})});ping.addEventListener('click',()=>{status.textContent='Đang kiểm tra kết nối...';vscode.postMessage({type:'pingApi'})});window.addEventListener('message',e=>{const m=e.data;if(m.type==='branches'){renderBranches(m.payload)}else if(m.type==='files'){status.textContent='Đã tải danh sách tệp';filesTitle.textContent='Files to review ('+(m.payload.length||0)+')';renderFiles(m.payload)}else if(m.type==='fileResult'){appendResult(m.payload)}else if(m.type==='stopped'){status.textContent='Đã dừng'}else if(m.type==='ping'){status.textContent=m.payload?'Kết nối Ollama OK':'Kết nối Ollama lỗi'}});function renderBranches(p){const {branches=[],current=''}=p;fromSel.innerHTML='';toSel.innerHTML='';branches.forEach(b=>{const o1=document.createElement('option');o1.value=b;o1.textContent=b;fromSel.appendChild(o1);const o2=document.createElement('option');o2.value=b;o2.textContent=b;toSel.appendChild(o2)});fromSel.value=current||branches[0]||'';toSel.value=branches.find(x=>x!==fromSel.value)||branches[0]||''}function renderFiles(files){filesDiv.innerHTML='';files.forEach(f=>{const el=document.createElement('div');el.className='file';el.innerHTML='<div class="row"><div style="flex:1">'+f+'</div><button data-open>Open</button></div><div class="hints"></div>';el.querySelector('[data-open]').addEventListener('click',()=>{vscode.postMessage({type:'openFile',file:f})});filesDiv.appendChild(el)})}function appendResult(payload){const nodes=Array.from(filesDiv.querySelectorAll('.file'));const node=nodes.find(n=>n.innerHTML.includes(payload.file));const hints=node?node.querySelector('.hints'):null;if(!hints)return;const s=payload.result.summary||'';const fix=payload.result.code_fix||'';const reason=payload.result.reasoning||'';const badge=((s+fix+reason).toLowerCase().includes('lỗi')||s.toLowerCase().includes('bug'))?'Potential Issue':'Refactor Suggestion';const div=document.createElement('div');div.className='hint';div.innerHTML='<span class="badge">'+badge+'</span><div>'+s+'</div><div>'+fix+'</div><div>'+reason+'</div><div class="actions"><button data-apply>Áp dụng sửa</button><button data-diff>Xem Diff</button></div>';const code=payload.result.improved_code||'';div.querySelector('[data-apply]').addEventListener('click',()=>{vscode.postMessage({type:'applyImprovedFile',file:payload.file,code})});div.querySelector('[data-diff]').addEventListener('click',()=>{vscode.postMessage({type:'previewImprovedFile',file:payload.file,code})});hints.appendChild(div)}</script></body></html>`
}
