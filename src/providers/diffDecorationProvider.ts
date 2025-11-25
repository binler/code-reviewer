import * as vscode from 'vscode'
import { DiffService, Hunk } from '../services/DiffService'

export class DiffDecorationProvider {
  private readonly diff = new DiffService()
  private readonly potential = vscode.window.createTextEditorDecorationType({ isWholeLine: true, borderWidth: '0 0 0 3px', borderColor: '#e51400', backgroundColor: 'rgba(229,20,0,0.08)' })
  private readonly refactor = vscode.window.createTextEditorDecorationType({ isWholeLine: true, borderWidth: '0 0 0 3px', borderColor: '#007acc', backgroundColor: 'rgba(0,122,204,0.08)' })

  apply(uri: vscode.Uri, original: string, improved: string, summaryText: string): void {
    void this.applyAsync(uri, original, improved, summaryText)
  }

  private async applyAsync(uri: vscode.Uri, original: string, improved: string, summaryText: string) {
    const doc = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(doc, { preview: false })
    const hunks = this.diff.computeHunks(original, improved)
    const potRanges: vscode.DecorationOptions[] = []
    const refRanges: vscode.DecorationOptions[] = []
    for (const h of hunks) {
      const start = h.startLine < doc.lineCount ? doc.lineAt(Math.max(h.startLine, 0)).range.start : doc.lineAt(doc.lineCount - 1).range.end
      const end = h.endLine >= h.startLine && h.endLine < doc.lineCount ? doc.lineAt(h.endLine).range.end : start
      const isIssue = (summaryText || '').toLowerCase().includes('lỗi') || (summaryText || '').toLowerCase().includes('error') || (summaryText || '').toLowerCase().includes('bug')
      const opts: vscode.DecorationOptions = { range: new vscode.Range(start, end) }
      if (isIssue) { potRanges.push(opts) } else { refRanges.push(opts) }
    }
    editor.setDecorations(this.potential, potRanges)
    editor.setDecorations(this.refactor, refRanges)
  }

  dispose(): void {
    this.potential.dispose()
    this.refactor.dispose()
  }
}
