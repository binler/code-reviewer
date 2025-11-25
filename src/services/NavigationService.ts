import * as vscode from 'vscode'

export class NavigationService {
  private controller = vscode.comments.createCommentController('reviewho', 'Review Hộ')
  private decoration = vscode.window.createTextEditorDecorationType({ textDecoration: 'underline wavy #ef4444' })
  private last: { uri: vscode.Uri; line: number; improved: string } | null = null

  private static instance: NavigationService | null = null
  static getInstance(): NavigationService {
    if (!NavigationService.instance) NavigationService.instance = new NavigationService()
    return NavigationService.instance
  }

  private getRegion(doc: vscode.TextDocument, line: number): vscode.Range {
    const clamp = Math.min(Math.max(line, 0), doc.lineCount - 1)
    const base = doc.lineAt(clamp)
    const indent = base.text.match(/^\s*/)?.[0].length || 0
    let start = clamp
    while (start > 0) {
      const t = doc.lineAt(start - 1).text
      if (!t.trim()) break
      const i = t.match(/^\s*/)?.[0].length || 0
      if (i + 1 < indent) break
      start--
    }
    let end = clamp
    while (end < doc.lineCount - 1) {
      const t = doc.lineAt(end + 1).text
      if (!t.trim()) break
      const i = t.match(/^\s*/)?.[0].length || 0
      if (i + 1 < indent) break
      end++
    }
    const s = doc.lineAt(start).range.start
    const e = doc.lineAt(end).range.end
    return new vscode.Range(s, e)
  }

  async openAndAnnotate(uri: vscode.Uri, line: number, suggestion: { title?: string; description?: string; improved?: string }): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(doc)
    const range = this.getRegion(doc, line)
    editor.selection = new vscode.Selection(range.start, range.end)
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter)
    editor.setDecorations(this.decoration, [{ range }])

    const md = new vscode.MarkdownString()
    const title = suggestion.title || 'Suggestion'
    const desc = suggestion.description || ''
    const code = suggestion.improved || ''
    md.appendMarkdown(`**${title}**\n\n${desc}\n\n`)
    md.appendMarkdown(`[Áp dụng](command:reviewho.applyHunk) · [Diff](command:reviewho.previewHunk)\n\n`)
    if (code) md.appendCodeblock(code)
    const thread = this.controller.createCommentThread(uri, range, [{ body: md, mode: vscode.CommentMode.Preview } as vscode.Comment])
    thread.label = 'Refactor Suggestion'
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded
    this.last = { uri, line, improved: code }
  }

  async applySuggestion(uri: vscode.Uri, line: number, improved: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(doc)
    const range = this.getRegion(doc, line)
    await editor.edit(ed => ed.replace(range, improved || ''))
    vscode.window.showInformationMessage('Đã áp dụng sửa đổi tại dòng')
  }

  async previewSuggestion(uri: vscode.Uri, line: number, improved: string): Promise<void> {
    const baseDoc = await vscode.workspace.openTextDocument(uri)
    const text = baseDoc.getText()
    const region = this.getRegion(baseDoc, line)
    const startOffset = baseDoc.offsetAt(region.start)
    const endOffset = baseDoc.offsetAt(region.end)
    const newText = text.slice(0, startOffset) + (improved || '') + text.slice(endOffset)
    const right = await vscode.workspace.openTextDocument({ content: newText, language: baseDoc.languageId })
    await vscode.commands.executeCommand('vscode.diff', baseDoc.uri, right.uri, `Diff: ${uri.fsPath} ↔ đề xuất`)
  }

  async applyLast(): Promise<void> {
    if (!this.last) return
    await this.applySuggestion(this.last.uri, this.last.line, this.last.improved)
  }

  async previewLast(): Promise<void> {
    if (!this.last) return
    await this.previewSuggestion(this.last.uri, this.last.line, this.last.improved)
  }

  dispose(): void {
    this.decoration.dispose()
    this.controller.dispose()
  }
}
