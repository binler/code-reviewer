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
			} else if (msg?.type === 'pingApi') {
				const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION)
				const apiUrl = cfg.get<string>(CONFIG_KEYS.API_URL) || 'http://localhost:11434/api/generate'
				const model = cfg.get<string>(CONFIG_KEYS.MODEL) || 'deepseek-v3'
				const res = await this.pingOllama(apiUrl, model)
				webviewView.webview.postMessage({ type: 'pingResult', payload: res })
			} else if (msg?.type === 'checkModel') {
				const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION)
				const apiUrl = cfg.get<string>(CONFIG_KEYS.API_URL) || 'http://localhost:11434'
				const model = cfg.get<string>(CONFIG_KEYS.MODEL) || 'deepseek-v3'
				const has = await this.hasModel(apiUrl, model)
				webviewView.webview.postMessage({ type: 'modelStatus', payload: { model, available: has } })
			}
		})
	}

	private async pingOllama(apiUrl: string, model: string): Promise<{ ok: boolean; error?: string }> {
		try {
			const controller = new AbortController()
			const to = setTimeout(() => controller.abort(), 10000)
			const res = await fetch(apiUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
				body: JSON.stringify({ model, prompt: 'ping', stream: false }),
				signal: controller.signal
			})
			clearTimeout(to)
			if (!res.ok) {
				const text = await res.text().catch(() => '')
				return { ok: false, error: `HTTP ${res.status}: ${text}` }
			}
			return { ok: true }
		} catch (e: any) {
			const msg = e?.name === 'AbortError' ? 'Timeout khi gọi Ollama (10s)' : String(e?.message || e)
			return { ok: false, error: msg }
		}
	}

	private async hasModel(apiBase: string, model: string): Promise<boolean> {
		try {
			const url = apiBase.endsWith('/api/generate') ? apiBase.replace('/api/generate', '/api/tags') : `${apiBase}/api/tags`
			const res = await fetch(url)
			if (!res.ok) return false
			const data = await res.json().catch(() => ({} as any))
			const anyData: any = data as any
			const list: any[] = Array.isArray(anyData?.models) ? anyData.models : (Array.isArray(anyData) ? anyData : [])
			return list.some((m: any) => String(m?.name || m).toLowerCase() === model.toLowerCase())
		} catch {
			return false
		}
	}
}

function getHtml(webview: vscode.Webview) {
    const csp = `default-src 'none'; img-src ${webview.cspSource} https:; script-src 'unsafe-inline' ${webview.cspSource}; style-src 'unsafe-inline';`
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Review Hộ • Cài đặt</title><style>body{font-family:system-ui;padding:12px}label{display:block;margin-bottom:8px}input{width:100%;padding:8px;border-radius:6px;border:1px solid #444;background:#1e1e1e;color:#eee}button{padding:8px 12px;border-radius:6px;border:1px solid #555;background:#2a2a2a;color:#eee} .row{display:flex;gap:8px;align-items:center;margin-top:8px} .badge{display:inline-block;padding:2px 6px;border-radius:4px;background:#333;color:#9cdcfe;margin-left:8px}</style></head><body><h3>Cài đặt Ollama</h3><label>API URL<input id="apiUrl" type="text" placeholder="http://localhost:11434/api/generate"></label><label>Model<input id="model" type="text" placeholder="deepseek-v3"></label><div class="row"><button id="save">Lưu</button><button id="reload">Tải lại</button><button id="ping">Kiểm tra kết nối</button><button id="checkModel">Kiểm tra model</button><span id="badge" class="badge"></span></div><div id="status" style="margin-top:8px"></div><script>const vscode=acquireVsCodeApi();const api=document.getElementById('apiUrl');const model=document.getElementById('model');const save=document.getElementById('save');const reload=document.getElementById('reload');const ping=document.getElementById('ping');const checkModel=document.getElementById('checkModel');const status=document.getElementById('status');const badge=document.getElementById('badge');window.addEventListener('message',e=>{const m=e.data;if(m.type==='settings'){api.value=m.payload.apiUrl||'';model.value=m.payload.model||'';badge.textContent=''}else if(m.type==='settingsSaved'){status.textContent='Đã lưu cài đặt'}else if(m.type==='pingResult'){status.textContent=m.payload.ok?'Kết nối Ollama OK':('Lỗi kết nối: '+(m.payload.error||''))}else if(m.type==='modelStatus'){badge.textContent=m.payload.available?'Model sẵn sàng':'Model chưa có' }});save.addEventListener('click',()=>{vscode.postMessage({type:'updateSettings',apiUrl:api.value,model:model.value})});reload.addEventListener('click',()=>{vscode.postMessage({type:'getSettings'})});ping.addEventListener('click',()=>{status.textContent='Đang kiểm tra kết nối...';vscode.postMessage({type:'pingApi'})});checkModel.addEventListener('click',()=>{badge.textContent='Đang kiểm tra...';vscode.postMessage({type:'checkModel'})});window.addEventListener('DOMContentLoaded',()=>{vscode.postMessage({type:'getSettings'})});</script></body></html>`
}
