import * as vscode from 'vscode'
import { ReviewPanel } from '../panels/ReviewPanel'

export function registerReviewCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.openPanel', async () => {
      const panel = await ReviewPanel.createOrShow(context)
      if (vscode.window.activeTextEditor) panel.postReady()
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgent.analyzeFile', async (uri?: vscode.Uri) => {
      const panel = await ReviewPanel.createOrShow(context)
      if (uri) await panel.analyzeDocument(uri)
      else if (vscode.window.activeTextEditor) await panel.analyzeDocument(vscode.window.activeTextEditor.document.uri)
      else vscode.window.showWarningMessage('Không có tệp đang mở để phân tích')
    })
  )
}

