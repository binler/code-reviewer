import * as vscode from 'vscode'

/**
 * Centralized logging service for the extension
 */
export class Logger {
	private static instance: Logger | undefined
	private channel: vscode.OutputChannel

	private constructor(name: string) {
		this.channel = vscode.window.createOutputChannel(name)
	}

    static getInstance(name: string = 'Review Hộ'): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger(name)
		}
		return Logger.instance
	}

	private formatMessage(level: string, message: string): string {
		const timestamp = new Date().toISOString()
		return `[${timestamp}] [${level}] ${message}`
	}

	info(message: string): void {
		this.channel.appendLine(this.formatMessage('INFO', message))
	}

	warn(message: string): void {
		this.channel.appendLine(this.formatMessage('WARN', message))
	}

	error(message: string, error?: Error | unknown): void {
		this.channel.appendLine(this.formatMessage('ERROR', message))
		if (error instanceof Error) {
			this.channel.appendLine(`  Stack: ${error.stack || error.message}`)
		} else if (error) {
			this.channel.appendLine(`  Details: ${String(error)}`)
		}
	}

	debug(message: string): void {
		this.channel.appendLine(this.formatMessage('DEBUG', message))
	}

	show(): void {
		this.channel.show()
	}

	dispose(): void {
		this.channel.dispose()
		Logger.instance = undefined
	}
}
