const vscode = acquireVsCodeApi()
const btn = document.getElementById('analyze')
const status = document.getElementById('status')
const fix = document.getElementById('fix')
const reason = document.getElementById('reason')
const code = document.getElementById('code')
const applyBtn = document.getElementById('apply')
const previewBtn = document.getElementById('preview')
const hunksBox = document.getElementById('hunks')
const applyHunksBtn = document.getElementById('applyHunks')
const toggleAll = document.getElementById('toggleAll')
let lastImproved = ''
let lastHunks = []

btn.addEventListener('click', () => {
  status.textContent = 'Đang phân tích...'
  vscode.postMessage({ type: 'analyzeCurrentFile' })
})

window.addEventListener('message', event => {
  const msg = event.data
  if (msg.type === 'result') {
    status.textContent = 'Hoàn tất'
    const r = msg.payload
    fix.textContent = r.code_fix || ''
    reason.textContent = r.reasoning || ''
    code.textContent = r.improved_code || ''
    lastImproved = r.improved_code || ''
    lastHunks = Array.isArray(msg.hunks) ? msg.hunks : []
    renderHunks(lastHunks)
  }
})

applyBtn.addEventListener('click', () => {
  if (!lastImproved) {
    status.textContent = 'Không có mã cải thiện để áp dụng'
    return
  }
  vscode.postMessage({ type: 'applyImprovedCode', code: lastImproved })
})

previewBtn.addEventListener('click', () => {
  if (!lastImproved) {
    status.textContent = 'Không có mã cải thiện để xem diff'
    return
  }
  vscode.postMessage({ type: 'previewImprovedCode', code: lastImproved })
})

applyHunksBtn.addEventListener('click', () => {
  const selected = []
  const inputs = hunksBox.querySelectorAll('input[type="checkbox"][data-id]')
  inputs.forEach(i => {
    if (i.checked) {
      const id = Number(i.getAttribute('data-id'))
      const h = lastHunks.find(x => x.id === id)
      if (h) selected.push(h)
    }
  })
  if (!selected.length) {
    status.textContent = 'Chưa chọn hunk để áp dụng'
    return
  }
  vscode.postMessage({ type: 'applySelectedHunks', hunks: selected })
})

toggleAll.addEventListener('change', e => {
  const checked = e.target.checked
  const inputs = hunksBox.querySelectorAll('input[type="checkbox"][data-id]')
  inputs.forEach(i => { i.checked = checked })
})

function renderHunks(hunks) {
  hunksBox.innerHTML = ''
  if (!hunks || !hunks.length) {
    hunksBox.textContent = 'Không có thay đổi so với mã gốc'
    return
  }
  hunks.forEach(h => {
    const wrap = document.createElement('div')
    wrap.style.border = '1px solid #333'
    wrap.style.padding = '8px'
    wrap.style.marginBottom = '8px'
    const lineInfo = document.createElement('div')
    lineInfo.textContent = `Dòng ${h.startLine} → ${Math.max(h.endLine, h.startLine)}`
    const choice = document.createElement('label')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.setAttribute('data-id', String(h.id))
    choice.appendChild(cb)
    choice.appendChild(document.createTextNode(' Áp dụng hunk này'))
    const grid = document.createElement('div')
    grid.className = 'hunk-grid'
    const oldWrap = document.createElement('div')
    const oldTitle = document.createElement('div')
    oldTitle.textContent = 'Gốc'
    const oldPre = document.createElement('pre')
    const oldTxt = (h.oldLines || []).join('\n')
    oldPre.textContent = oldTxt || '∅ (không có dòng gốc, chỉ thêm mới)'
    oldPre.className = 'hunk-old'
    oldWrap.appendChild(oldTitle)
    oldWrap.appendChild(oldPre)
    const newWrap = document.createElement('div')
    const newTitle = document.createElement('div')
    newTitle.textContent = 'Cải thiện'
    const newPre = document.createElement('pre')
    const newTxt = (h.newLines || []).join('\n')
    newPre.textContent = newTxt || '∅ (không có dòng cải thiện, chỉ xoá)'
    newPre.className = 'hunk-new'
    newWrap.appendChild(newTitle)
    newWrap.appendChild(newPre)
    grid.appendChild(oldWrap)
    grid.appendChild(newWrap)
    wrap.appendChild(lineInfo)
    wrap.appendChild(choice)
    wrap.appendChild(grid)
    hunksBox.appendChild(wrap)
  })
}
 
