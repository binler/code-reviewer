import * as vscode from 'vscode'
import { ConfigService } from '../services/ConfigService'

export function registerConfigCommands(context: vscode.ExtensionContext) {
  const cfg = new ConfigService(context)
  context.subscriptions.push(vscode.commands.registerCommand('reviewho.setApiUrl', async () => {
    const input = await vscode.window.showInputBox({ prompt: 'API URL Ollama' })
    if (input) await cfg.setApiUrl(input)
  }))
  context.subscriptions.push(vscode.commands.registerCommand('reviewho.setModel', async () => {
    const input = await vscode.window.showInputBox({ prompt: 'Model Ollama' })
    if (input) await cfg.setModel(input)
  }))
}

