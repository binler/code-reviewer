import * as vscode from 'vscode'
import { analyzeWithDeepseek } from './agents/deepseekAgent'
import { SettingsViewProvider } from './views/settingsView'

function getWebviewUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathSegments: string[]) {
  const uri = vscode.Uri.joinPath(extensionUri, ...pathSegments)
  return webview.asWebviewUri(uri)
}

type Hunk = { id: number; startLine: number; endLine: number; oldLines: string[]; newLines: string[] }

const lastDocForPanel = new WeakMap<vscode.WebviewPanel, vscode.Uri>()

function computeLineHunks(original: string, improved: string): Hunk[] {
  const a = original.split(/\r?\n/)
  const b = improved.split(/\r?\n/)
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  let i = 0, j = 0
  const hunks: Hunk[] = []
  let start: number | null = null
  let del: string[] = []
  let ins: string[] = []
  const flush = () => {
    if (start !== null) {
      const endLine = start + Math.max(del.length, 0) - 1
      hunks.push({ id: hunks.length, startLine: start, endLine, oldLines: del.slice(), newLines: ins.slice() })
      start = null
      del = []
      ins = []
    }
  }
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      flush()
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      if (start === null) start = i
      del.push(a[i])
      i++
    } else {
      if (start === null) start = i
      ins.push(b[j])
      j++
    }
  }
  while (i < m) {
    if (start === null) start = i
    del.push(a[i])
    i++
  }
  while (j < n) {
    if (start === null) start = i
    ins.push(b[j])
    j++
  }
  flush()
  return hunks
}

async function openPanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'deepseekAgentPanel',
    'DeepSeek Agent',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')]
    }
  )
  const htmlUri = vscode.Uri.joinPath(context.extensionUri, 'webview', 'index.html')
  const html = await vscode.workspace.fs.readFile(htmlUri)
  const htmlStr = Buffer.from(html).toString('utf8')
  panel.webview.html = htmlStr.replace(
    /__MAIN_JS__/g,
    getWebviewUri(panel.webview, context.extensionUri, ['webview', 'main.js']).toString()
  )

  panel.webview.onDidReceiveMessage(async msg => {
    if (msg && msg.type === 'analyzeCurrentFile') {
      await analyzeCurrentFile(panel)
    } else if (msg && msg.type === 'getSettings') {
      const cfg = vscode.workspace.getConfiguration('deepseekAgent')
      panel.webview.postMessage({ type: 'settings', payload: { apiUrl: cfg.get('apiUrl'), model: cfg.get('model') } })
    } else if (msg && msg.type === 'updateSettings') {
      const apiUrl = String(msg.apiUrl || '')
      const model = String(msg.model || '')
      const cfg = vscode.workspace.getConfiguration('deepseekAgent')
      if (apiUrl) await cfg.update('apiUrl', apiUrl, vscode.ConfigurationTarget.Workspace)
      if (model) await cfg.update('model', model, vscode.ConfigurationTarget.Workspace)
      panel.webview.postMessage({ type: 'settingsSaved' })
    } else if (msg && msg.type === 'applyImprovedCode') {
      const targetUri = lastDocForPanel.get(panel) || vscode.window.activeTextEditor?.document.uri
      if (!targetUri) {
        vscode.window.showWarningMessage('Không có ngữ cảnh tệp đã phân tích để áp dụng')
        return
      }
      const code = String(msg.code ?? '')
      const doc = await vscode.workspace.openTextDocument(targetUri)
      const editor = await vscode.window.showTextDocument(doc)
      const full = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length))
      await editor.edit(ed => ed.replace(full, code))
      vscode.window.showInformationMessage('Đã áp dụng mã cải thiện vào tệp hiện tại')
    } else if (msg && msg.type === 'previewImprovedCode') {
      const targetUri = lastDocForPanel.get(panel) || vscode.window.activeTextEditor?.document.uri
      if (!targetUri) {
        vscode.window.showWarningMessage('Không có ngữ cảnh tệp đã phân tích để xem diff')
        return
      }
      const baseDoc = await vscode.workspace.openTextDocument(targetUri)
      const original = baseDoc.getText()
      const improved = String(msg.code ?? '')
      const right = await vscode.workspace.openTextDocument({ content: improved, language: baseDoc.languageId })
      await vscode.commands.executeCommand('vscode.diff', baseDoc.uri, right.uri, 'So sánh: gốc ↔ cải thiện')
    } else if (msg && msg.type === 'applySelectedHunks') {
      const targetUri = lastDocForPanel.get(panel) || vscode.window.activeTextEditor?.document.uri
      if (!targetUri) {
        vscode.window.showWarningMessage('Không có ngữ cảnh tệp đã phân tích để áp dụng hunks')
        return
      }
      const selections: Hunk[] = Array.isArray(msg.hunks) ? msg.hunks : []
      const doc = await vscode.workspace.openTextDocument(targetUri)
      const editor = await vscode.window.showTextDocument(doc)
      const sorted = selections.slice().sort((a: Hunk, b: Hunk) => b.startLine - a.startLine)
      await editor.edit(ed => {
        for (const h of sorted) {
          const startPos = h.startLine < doc.lineCount ? doc.lineAt(Math.max(h.startLine, 0)).range.start : doc.lineAt(doc.lineCount - 1).range.end
          const endPos = h.endLine >= h.startLine && h.endLine < doc.lineCount ? doc.lineAt(h.endLine).range.end : startPos
          const replacement = h.newLines.join('\n')
          ed.replace(new vscode.Range(startPos, endPos), replacement)
        }
      })
      vscode.window.showInformationMessage('Đã áp dụng hunks đã chọn')
    }
  })
  return panel
}

async function analyzeCurrentFile(panel?: vscode.WebviewPanel) {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showWarningMessage('Không có tệp đang mở để phân tích')
    return
  }
  const text = editor.document.getText()
  vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'DeepSeek Agent đang phân tích...' }, async () => {
    const result = await analyzeWithDeepseek(text)
    if (panel) {
      lastDocForPanel.set(panel, editor.document.uri)
      const hunks = computeLineHunks(text, result.improved_code || text)
      panel.webview.postMessage({ type: 'result', payload: result, hunks })
    }
  })
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.openPanel', async () => {
      const panel = await openPanel(context)
      const editor = vscode.window.activeTextEditor
      if (editor) panel.webview.postMessage({ type: 'ready' })
    }),
    vscode.commands.registerCommand('aiAgent.analyzeFile', async (uri?: vscode.Uri) => {
      if (uri) {
        const doc = await vscode.workspace.openTextDocument(uri)
        const text = doc.getText()
        const panel = await openPanel(context)
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'DeepSeek Agent đang phân tích...' }, async () => {
          const result = await analyzeWithDeepseek(text)
          lastDocForPanel.set(panel, uri)
          const hunks = computeLineHunks(text, result.improved_code || text)
          panel.webview.postMessage({ type: 'result', payload: result, hunks })
        })
      } else {
        const panel = await openPanel(context)
        await analyzeCurrentFile(panel)
      }
    })
  )
  const settingsProvider = new SettingsViewProvider()
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('deepseek.settings', settingsProvider))
}

export function deactivate() {}
