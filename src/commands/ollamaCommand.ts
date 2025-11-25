import * as vscode from 'vscode'
import { isModelAvailable } from '../utils/ollamaHealthCheck'
import { getApiUrl, getModel } from '../utils/config'

export function registerOllamaCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('reviewho.checkOllama', async () => {
    const ok = await isModelAvailable(getApiUrl(), getModel())
    if (ok) vscode.window.showInformationMessage('Ollama OK, model đã sẵn sàng')
    else vscode.window.showWarningMessage('Không tìm thấy model trên Ollama')
  }))
}

