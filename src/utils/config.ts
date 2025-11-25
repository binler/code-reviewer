import * as vscode from 'vscode'
import { CONFIG_SECTION, CONFIG_KEYS, DEFAULTS } from '../core/Constants'

export function getApiUrl(): string {
	const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION)
	return cfg.get<string>(CONFIG_KEYS.API_URL) || DEFAULTS.API_URL
}

export function getModel(): string {
	const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION)
	return cfg.get<string>(CONFIG_KEYS.MODEL) || DEFAULTS.MODEL
}

export async function setApiUrl(url: string): Promise<void> {
	const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION)
	await cfg.update(CONFIG_KEYS.API_URL, url, vscode.ConfigurationTarget.Workspace)
}

export async function setModel(model: string): Promise<void> {
	const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION)
	await cfg.update(CONFIG_KEYS.MODEL, model, vscode.ConfigurationTarget.Workspace)
}

