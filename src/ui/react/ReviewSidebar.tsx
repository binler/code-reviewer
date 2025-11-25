import React from 'react'

export type Issue = { file: string; line: number; severity: 'critical' | 'high' | 'medium' | 'low'; title: string; description: string; suggestion?: string }
export type Summary = { total: number; critical: number; high: number; medium: number; low: number }
export type FileGroup = { path: string; issues: Issue[]; summary?: Summary }

export function ReviewSidebar({ files, onOpen, onStartWork, onStartBranches, onApply, onPreview }: {
    files: FileGroup[];
    onOpen: (file: string, line: number, issue: Issue) => void;
    onStartWork: () => void;
    onStartBranches: (from: string, to: string) => void;
    onApply: (file: string, line: number, improved: string) => void;
    onPreview: (file: string, line: number, improved: string) => void;
}) {
    const [branches, setBranches] = React.useState<string[]>([])
    const [current, setCurrent] = React.useState('')
    const [from, setFrom] = React.useState('')
    const [to, setTo] = React.useState('')
    React.useEffect(() => {
        const w: any = window as any
        const fn = (m: any) => {
            if (m?.type === 'branches') {
                const bs = (m.payload?.branches || []) as string[]
                const cur = String(m.payload?.current || '')
                setBranches(bs); setCurrent(cur); setFrom(cur); setTo(cur)
            }
        }
        w.__sidebarBranches = fn
    }, [])

    return (
        <div className="sidebar">
            <div className="section">
                <div className="section-head"><div className="section-title">NEW REVIEW</div></div>
                <div className="section-body">
                    <div className="row">
                        <label className="pill">From <select value={from} onChange={e => setFrom(e.target.value)}>{branches.map(b => <option key={b} value={b}>{b}</option>)}</select></label>
                        <label className="pill">To <select value={to} onChange={e => setTo(e.target.value)}>{branches.map(b => <option key={b} value={b}>{b}</option>)}</select></label>
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <button className="btn" onClick={onStartWork}>Review uncommitted changes</button>
                        <button className="btn" style={{ marginLeft: 8 }} onClick={() => onStartBranches(from, to)}>Review branches</button>
                    </div>
                </div>
            </div>
            <div className="section">
                <div className="section-head"><div className="section-title">FILES</div></div>
                <div className="section-body">
                    {files.map(f => (
                        <details key={f.path} className="file">
                            <summary>
                                <span>{f.path.split(/\\|\//).pop()}</span>
                                <span className="count">{f.issues.length}</span>
                                <span className="count red" title="Critical">{f.summary?.critical || 0}</span>
                                <span className="count orange" title="High">{f.summary?.high || 0}</span>
                                <span className="count blue" title="Medium">{f.summary?.medium || 0}</span>
                                <span className="count green" title="Low">{f.summary?.low || 0}</span>
                            </summary>
                            <div className="issues">
                                {f.issues.map((it, idx) => (
                                    <div key={idx} className={`issue ${it.severity === 'critical' ? 'red' : it.severity === 'high' ? 'orange' : it.severity === 'medium' ? 'blue' : 'green'}`} onClick={() => onOpen(f.path, it.line, it)}>
                                        <div className="title">{it.title || 'Issue'}</div>
                                        <div className={`badge ${it.severity === 'critical' ? 'red' : 'blue'}`}>{it.severity === 'critical' ? 'Potential Issue' : 'Refactor Suggestion'}</div>
                                        {it.suggestion ? (
                                            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                                                <button className="btn" onClick={(e) => { e.stopPropagation(); onApply(f.path, it.line, it.suggestion!) }}>Áp dụng</button>
                                                <button className="btn" onClick={(e) => { e.stopPropagation(); onPreview(f.path, it.line, it.suggestion!) }}>Diff</button>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                                {f.issues.length===0 ? <div className="muted">Đang phân tích...</div> : null}
                            </div>
                        </details>
                    ))}
                </div>
            </div>
        </div>
    )
}

