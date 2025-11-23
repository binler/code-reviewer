/**
 * Configuration and constant definitions for DeepSeek Agent extension
 */

// Configuration section name
export const CONFIG_SECTION = 'deepseekAgent'

// Configuration keys
export const CONFIG_KEYS = {
	API_URL: 'apiUrl',
	MODEL: 'model',
} as const

// Command IDs
export const COMMANDS = {
	OPEN_PANEL: 'aiAgent.openPanel',
	ANALYZE_FILE: 'aiAgent.analyzeFile',
} as const

// Message types for webview communication
export const MESSAGE_TYPES = {
	// From webview to extension
	ANALYZE_CURRENT_FILE: 'analyzeCurrentFile',
	GET_SETTINGS: 'getSettings',
	UPDATE_SETTINGS: 'updateSettings',
	APPLY_IMPROVED_CODE: 'applyImprovedCode',
	PREVIEW_IMPROVED_CODE: 'previewImprovedCode',
	APPLY_SELECTED_HUNKS: 'applySelectedHunks',

	// From extension to webview
	RESULT: 'result',
	READY: 'ready',
	SETTINGS: 'settings',
	SETTINGS_SAVED: 'settingsSaved',
} as const

// Default configuration values
export const DEFAULTS = {
	API_URL: 'http://localhost:11434/api/generate',
	MODEL: 'deepseek-v3',
	REQUEST_TIMEOUT_MS: 30000, // 30 seconds
} as const

// View IDs
export const VIEWS = {
	SETTINGS: 'deepseek.settings',
} as const
