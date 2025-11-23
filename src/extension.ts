import * as vscode from 'vscode'
import { ReviewPanel } from './panels/ReviewPanel'
import { SettingsViewProvider } from './views/settingsView'
import { ReviewViewProvider } from './views/reviewView'
import { Logger } from './core/Logger'
import { COMMANDS, VIEWS } from './core/Constants'

/**
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
	const logger = Logger.getInstance()
	logger.info('Activating Review Hộ extension')

	// Check workspace trust
	if (!vscode.workspace.isTrusted) {
		logger.warn('Workspace is not trusted, showing warning')
		vscode.window.showWarningMessage(
			'DeepSeek Agent requires workspace trust to analyze files. Please trust this workspace to use the extension.'
		)
		// Don't return - allow extension to activate, but commands will show warnings
	}

	// Register "Open Panel" command
	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.OPEN_PANEL, async () => {
			try {
				logger.info('Executing openPanel command')
				const panel = await ReviewPanel.createOrShow(context)

				// Send ready message if there's an active editor
				if (vscode.window.activeTextEditor) {
					panel.postReady()
				}
			} catch (err) {
				logger.error('Failed to open panel', err)
				vscode.window.showErrorMessage(`Không thể mở panel: ${err instanceof Error ? err.message : String(err)}`)
			}
		})
	)

	// Register "Analyze File" command
	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.ANALYZE_FILE, async (uri?: vscode.Uri) => {
			try {
				logger.info('Executing analyzeFile command')

				// Check workspace trust before analyzing
				if (!vscode.workspace.isTrusted) {
					vscode.window.showWarningMessage('Cannot analyze files in untrusted workspace')
					return
				}

				const panel = await ReviewPanel.createOrShow(context)

				if (uri) {
					// Analyze specific file from context menu
					logger.info(`Analyzing file from URI: ${uri.toString()}`)
					await panel.analyzeDocument(uri)
				} else {
					// Analyze current active editor
					if (!vscode.window.activeTextEditor) {
						vscode.window.showWarningMessage('Không có tệp đang mở để phân tích')
						return
					}
					logger.info('Analyzing active editor')
					await panel.analyzeDocument(vscode.window.activeTextEditor.document.uri)
				}
			} catch (err) {
				logger.error('Failed to analyze file', err)
				vscode.window.showErrorMessage(`Không thể phân tích tệp: ${err instanceof Error ? err.message : String(err)}`)
			}
		})
	)

	// Register settings view provider
	const settingsProvider = new SettingsViewProvider()
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(VIEWS.SETTINGS, settingsProvider)
	)

	const reviewProvider = new ReviewViewProvider()
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(VIEWS.REVIEW, reviewProvider)
	)

	// Register logger for disposal
	context.subscriptions.push({
		dispose: () => {
			logger.info('Deactivating DeepSeek Agent extension')
			logger.dispose()
		}
	})

	logger.info('Review Hộ extension activated successfully')
}

/**
 * Extension deactivation
 */
export function deactivate() {
	const logger = Logger.getInstance()
	logger.info('Review Hộ extension deactivated')
}
