import * as vscode from 'vscode'
import { CONFIG_SECTION, CONFIG_KEYS, MESSAGE_TYPES } from '../core/Constants'

export class SettingsViewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.html = getHtml(webviewView.webview)
        webviewView.webview.onDidReceiveMessage(async msg => {
			if (msg?.type === MESSAGE_TYPES.GET_SETTINGS) {
				const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION)
				webviewView.webview.postMessage({
					type: MESSAGE_TYPES.SETTINGS,
					payload: {
						apiUrl: cfg.get(CONFIG_KEYS.API_URL),
						model: cfg.get(CONFIG_KEYS.MODEL)
					}
				})
			} else if (msg?.type === MESSAGE_TYPES.UPDATE_SETTINGS) {
				const apiUrl = String(msg.apiUrl || '')
				const model = String(msg.model || '')
				const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION)
				if (apiUrl) await cfg.update(CONFIG_KEYS.API_URL, apiUrl, vscode.ConfigurationTarget.Workspace)
				if (model) await cfg.update(CONFIG_KEYS.MODEL, model, vscode.ConfigurationTarget.Workspace)
				webviewView.webview.postMessage({ type: MESSAGE_TYPES.SETTINGS_SAVED })
			}
		})
	}
}

function getHtml(webview: vscode.Webview) {
    const csp = `default-src 'none'; img-src ${webview.cspSource} https:; script-src 'unsafe-inline' ${webview.cspSource}; style-src 'unsafe-inline';`
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Cài đặt DeepSeek</title><style>body{font-family:system-ui;padding:10px}label{display:block;margin-bottom:8px}input{width:100%;padding:6px}button{padding:6px 10px}</style></head><body><h3>Cài đặt Ollama</h3><label>API URL<input id="apiUrl" type="text" placeholder="http://localhost:11434/api/generate"></label><label>Model<input id="model" type="text" placeholder="deepseek-v3"></label><div style="display:flex;gap:8px"><button id="save">Lưu</button><button id="reload">Tải lại</button></div><div id="status" style="margin-top:8px"></div><script>const vscode=acquireVsCodeApi();const api=document.getElementById('apiUrl');const model=document.getElementById('model');const save=document.getElementById('save');const reload=document.getElementById('reload');const status=document.getElementById('status');window.addEventListener('message',e=>{const m=e.data;if(m.type==='settings'){api.value=m.payload.apiUrl||'';model.value=m.payload.model||''}else if(m.type==='settingsSaved'){status.textContent='Đã lưu cài đặt'}});save.addEventListener('click',()=>{vscode.postMessage({type:'updateSettings',apiUrl:api.value,model:model.value})});reload.addEventListener('click',()=>{vscode.postMessage({type:'getSettings'})});window.addEventListener('DOMContentLoaded',()=>{vscode.postMessage({type:'getSettings'})});</script></body></html>`
}
