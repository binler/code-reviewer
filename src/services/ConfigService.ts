import * as vscode from 'vscode'
import { CONFIG_SECTION, CONFIG_KEYS, DEFAULTS } from '../core/Constants'

/**
 * Typed configuration service wrapper around VS Code configuration API
 */
export class ConfigService {
	constructor(private context?: vscode.ExtensionContext) { }

	getApiUrl(): string {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
		return config.get<string>(CONFIG_KEYS.API_URL) || DEFAULTS.API_URL
	}

	getModel(): string {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
		return config.get<string>(CONFIG_KEYS.MODEL) || DEFAULTS.MODEL
	}

	async setApiUrl(url: string): Promise<void> {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
		await config.update(CONFIG_KEYS.API_URL, url, vscode.ConfigurationTarget.Workspace)
	}

	async setModel(model: string): Promise<void> {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
		await config.update(CONFIG_KEYS.MODEL, model, vscode.ConfigurationTarget.Workspace)
	}

	/**
	 * Future: Use SecretStorage for API keys
	 */
	async getApiKey(): Promise<string | undefined> {
		if (!this.context) return undefined
		return await this.context.secrets.get('deepseekAgent.apiKey')
	}

	async setApiKey(key: string): Promise<void> {
		if (!this.context) {
			throw new Error('Context required for secret storage')
		}
		await this.context.secrets.store('deepseekAgent.apiKey', key)
	}
}
