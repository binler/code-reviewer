import * as vscode from 'vscode'
import { ReviewPanel } from './panels/ReviewPanel'
import { SettingsViewProvider } from './views/settingsView'
import { ReviewViewProvider } from './providers/reviewViewProvider'
import { SidebarProvider } from './providers/SidebarProvider'
import { NavigationService } from './services/NavigationService'
import { Logger } from './core/Logger'
import { COMMANDS, VIEWS } from './core/Constants'
import { registerReviewCommands } from './commands/reviewCommand'
import { registerConfigCommands } from './commands/configCommand'
import { registerOllamaCommands } from './commands/ollamaCommand'
import { Container, TOKENS } from './utils/di'
import { ConfigService } from './services/ConfigService'
import { GitService } from './services/gitService'
import { DiffService } from './services/DiffService'

/**
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
    const logger = Logger.getInstance()
    logger.info('Activating Review Hộ extension')

    const container = new Container()
    container.register(TOKENS.Logger, logger)
    container.register(TOKENS.ConfigService, new ConfigService(context))
    container.register(TOKENS.GitService, new GitService())
    container.register(TOKENS.DiffService, new DiffService())

	// Check workspace trust
	if (!vscode.workspace.isTrusted) {
		logger.warn('Workspace is not trusted, showing warning')
		vscode.window.showWarningMessage(
			'DeepSeek Agent requires workspace trust to analyze files. Please trust this workspace to use the extension.'
		)
		// Don't return - allow extension to activate, but commands will show warnings
	}

    registerReviewCommands(context)

    registerConfigCommands(context)
    registerOllamaCommands(context)

	// Register settings view provider
    const settingsProvider = new SettingsViewProvider()
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(VIEWS.SETTINGS, settingsProvider)
    )

    const reviewProvider = new SidebarProvider(context.extensionUri)
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(VIEWS.REVIEW, reviewProvider)
    )

    const nav = NavigationService.getInstance()
    context.subscriptions.push(vscode.commands.registerCommand('reviewho.applyHunk', async ()=>{ await nav.applyLast() }))
    context.subscriptions.push(vscode.commands.registerCommand('reviewho.previewHunk', async ()=>{ await nav.previewLast() }))

	// Register logger for disposal
    context.subscriptions.push({
        dispose: () => {
            logger.info('Deactivating DeepSeek Agent extension')
            logger.dispose()
            container.dispose()
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
