import * as vscode from 'vscode'
import * as crypto from 'crypto'
import { analyzeWithOllama } from '../agents/ollamaAgent'
import { DiffService, Hunk } from '../services/DiffService'
import { ConfigService } from '../services/ConfigService'
import { Logger } from '../core/Logger'
import { MESSAGE_TYPES } from '../core/Constants'

/**
 * Manages the DeepSeek Agent webview panel with proper resource disposal
 * Implements singleton pattern to prevent multiple instances
 */
export class ReviewPanel {
    private static instance: ReviewPanel | undefined
	private panel: vscode.WebviewPanel
	private disposables: vscode.Disposable[] = []
	private lastAnalyzedDocUri: vscode.Uri | undefined
	private readonly diffService: DiffService
	private readonly configService: ConfigService
	private readonly logger: Logger

	private constructor(private readonly context: vscode.ExtensionContext) {
		this.diffService = new DiffService()
		this.configService = new ConfigService(context)
		this.logger = Logger.getInstance()

		this.logger.info('Creating DeepSeek panel')

		this.panel = vscode.window.createWebviewPanel(
			'deepseekAgentPanel',
			'DeepSeek Agent',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')]
			}
		)

		// Register disposal handler
		this.disposables.push(
			this.panel.onDidDispose(() => this.dispose())
		)

		// Load webview content
		this.loadWebviewContent()

		// Register message handler
		this.disposables.push(
			this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg))
		)
	}

	/**
	 * Create or show existing panel (singleton pattern)
	 */
    static async createOrShow(context: vscode.ExtensionContext): Promise<ReviewPanel> {
        if (ReviewPanel.instance) {
            ReviewPanel.instance.logger.info('Revealing existing panel')
            ReviewPanel.instance.panel.reveal()
            return ReviewPanel.instance
        }

        const panel = new ReviewPanel(context)
        ReviewPanel.instance = panel
        return panel
    }

	/**
	 * Load HTML content into webview
	 */
	private async loadWebviewContent(): Promise<void> {
		const htmlUri = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'index.html')
		const html = await vscode.workspace.fs.readFile(htmlUri)
		const htmlStr = Buffer.from(html).toString('utf8')

		// Generate dynamic nonce for CSP
		const nonce = this.generateNonce()
		const scriptUri = this.getWebviewUri(['webview', 'main.js'])

		this.panel.webview.html = htmlStr
			.replace(/__MAIN_JS__/g, scriptUri.toString())
			.replace(/{{NONCE}}/g, nonce)
	}

	/**
	 * Generate cryptographically secure nonce for CSP
	 */
	private generateNonce(): string {
		return crypto.randomBytes(16).toString('base64')
	}

	/**
	 * Get webview URI for resources
	 */
	private getWebviewUri(pathSegments: string[]): vscode.Uri {
		const uri = vscode.Uri.joinPath(this.context.extensionUri, ...pathSegments)
		return this.panel.webview.asWebviewUri(uri)
	}

	/**
	 * Handle messages from webview
	 */
	private async handleMessage(msg: any): Promise<void> {
		try {
			if (!msg || typeof msg.type !== 'string') {
				this.logger.warn('Received invalid message from webview')
				return
			}

			this.logger.debug(`Received message: ${msg.type}`)

			switch (msg.type) {
				case MESSAGE_TYPES.ANALYZE_CURRENT_FILE:
					await this.analyzeCurrentFile()
					break

				case MESSAGE_TYPES.GET_SETTINGS:
					this.sendSettings()
					break

				case MESSAGE_TYPES.UPDATE_SETTINGS:
					await this.updateSettings(msg.apiUrl, msg.model)
					break

				case MESSAGE_TYPES.APPLY_IMPROVED_CODE:
					await this.applyImprovedCode(msg.code)
					break

				case MESSAGE_TYPES.PREVIEW_IMPROVED_CODE:
					await this.previewImprovedCode(msg.code)
					break

				case MESSAGE_TYPES.APPLY_SELECTED_HUNKS:
					await this.applySelectedHunks(msg.hunks)
					break

				default:
					this.logger.warn(`Unknown message type: ${msg.type}`)
			}
		} catch (err) {
			this.logger.error('Error handling message', err)
			vscode.window.showErrorMessage(`Lỗi: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	/**
	 * Analyze the currently active file
	 */
	private async analyzeCurrentFile(): Promise<void> {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			vscode.window.showWarningMessage('Không có tệp đang mở để phân tích')
			return
		}

		const text = editor.document.getText()
		this.lastAnalyzedDocUri = editor.document.uri

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'DeepSeek Agent',
				cancellable: false
			},
			async (progress) => {
				progress.report({ message: 'Đang phân tích...', increment: 0 })

                const result = await analyzeWithOllama(text)
				const hunks = this.diffService.computeHunks(text, result.improved_code || text)

				progress.report({ increment: 100 })

				this.panel.webview.postMessage({
					type: MESSAGE_TYPES.RESULT,
					payload: result,
					hunks
				})
			}
		)
	}

	/**
	 * Analyze a specific document
	 */
	async analyzeDocument(uri: vscode.Uri): Promise<void> {
		const doc = await vscode.workspace.openTextDocument(uri)
		const text = doc.getText()
		this.lastAnalyzedDocUri = uri

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'DeepSeek Agent',
				cancellable: false
			},
			async (progress) => {
				progress.report({ message: 'Đang phân tích...', increment: 0 })

                const result = await analyzeWithOllama(text)
				const hunks = this.diffService.computeHunks(text, result.improved_code || text)

				progress.report({ increment: 100 })

				this.panel.webview.postMessage({
					type: MESSAGE_TYPES.RESULT,
					payload: result,
					hunks
				})
			}
		)
	}

	/**
	 * Send current settings to webview
	 */
	private sendSettings(): void {
		this.panel.webview.postMessage({
			type: MESSAGE_TYPES.SETTINGS,
			payload: {
				apiUrl: this.configService.getApiUrl(),
				model: this.configService.getModel()
			}
		})
	}

	/**
	 * Update settings
	 */
	private async updateSettings(apiUrl?: string, model?: string): Promise<void> {
		if (apiUrl && typeof apiUrl === 'string') {
			await this.configService.setApiUrl(apiUrl)
		}
		if (model && typeof model === 'string') {
			await this.configService.setModel(model)
		}

		this.panel.webview.postMessage({ type: MESSAGE_TYPES.SETTINGS_SAVED })
	}

	/**
	 * Apply improved code to the document
	 */
	private async applyImprovedCode(code: string | undefined): Promise<void> {
		const targetUri = this.lastAnalyzedDocUri || vscode.window.activeTextEditor?.document.uri
		if (!targetUri) {
			vscode.window.showWarningMessage('Không có ngữ cảnh tệp đã phân tích để áp dụng')
			return
		}

		const codeStr = String(code ?? '')
		const doc = await vscode.workspace.openTextDocument(targetUri)
		const editor = await vscode.window.showTextDocument(doc)
		const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length))

		await editor.edit(editBuilder => editBuilder.replace(fullRange, codeStr))
		vscode.window.showInformationMessage('Đã áp dụng mã cải thiện vào tệp hiện tại')
	}

	/**
	 * Preview improved code in diff view
	 */
	private async previewImprovedCode(code: string | undefined): Promise<void> {
		const targetUri = this.lastAnalyzedDocUri || vscode.window.activeTextEditor?.document.uri
		if (!targetUri) {
			vscode.window.showWarningMessage('Không có ngữ cảnh tệp đã phân tích để xem diff')
			return
		}

		const baseDoc = await vscode.workspace.openTextDocument(targetUri)
		const improved = String(code ?? '')
		const rightDoc = await vscode.workspace.openTextDocument({
			content: improved,
			language: baseDoc.languageId
		})

		await vscode.commands.executeCommand('vscode.diff', baseDoc.uri, rightDoc.uri, 'So sánh: gốc ↔ cải thiện')
	}

	/**
	 * Apply selected hunks to the document
	 */
	private async applySelectedHunks(hunks: Hunk[] | undefined): Promise<void> {
		const targetUri = this.lastAnalyzedDocUri || vscode.window.activeTextEditor?.document.uri
		if (!targetUri) {
			vscode.window.showWarningMessage('Không có ngữ cảnh tệp đã phân tích để áp dụng hunks')
			return
		}

		const selections: Hunk[] = Array.isArray(hunks) ? hunks : []
		if (selections.length === 0) {
			vscode.window.showWarningMessage('Không có hunks được chọn')
			return
		}

		const doc = await vscode.workspace.openTextDocument(targetUri)
		const editor = await vscode.window.showTextDocument(doc)

		// Sort hunks in reverse order to apply from bottom to top
		const sorted = selections.slice().sort((a, b) => b.startLine - a.startLine)

		await editor.edit(editBuilder => {
			for (const hunk of sorted) {
				const startPos = hunk.startLine < doc.lineCount
					? doc.lineAt(Math.max(hunk.startLine, 0)).range.start
					: doc.lineAt(doc.lineCount - 1).range.end

				const endPos = hunk.endLine >= hunk.startLine && hunk.endLine < doc.lineCount
					? doc.lineAt(hunk.endLine).range.end
					: startPos

				const replacement = hunk.newLines.join('\n')
				editBuilder.replace(new vscode.Range(startPos, endPos), replacement)
			}
		})

		vscode.window.showInformationMessage(`Đã áp dụng ${selections.length} hunks đã chọn`)
	}

	/**
	 * Send ready message to webview
	 */
	postReady(): void {
		this.panel.webview.postMessage({ type: MESSAGE_TYPES.READY })
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
        this.logger.info('Disposing Review Hộ panel')
        ReviewPanel.instance = undefined

		this.panel.dispose()

		while (this.disposables.length) {
			const disposable = this.disposables.pop()
			disposable?.dispose()
		}
	}
}
