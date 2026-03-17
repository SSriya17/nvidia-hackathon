'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

const ACCEPT = '.pdf,.txt';

/** Parse full report text so we always show data even if stream format varied */
function parseReportFromText(fullText, lines) {
  const out = { riskScore: null, companyName: '', violations: [], nextSteps: [], supplierText: '', keyIncidentsText: '', topAction: '' };
  if (!fullText && !lines?.length) return out;
  const text = fullText || lines.map(l => l.text).join('\n');
  const riskM = text.match(/(?:risk\s*score|RISK\s*SCORE)[:\s]*(\d+)/i);
  if (riskM) out.riskScore = parseInt(riskM[1], 10);
  const companyM = text.match(/(?:company|COMPANY)[:\s]*([^\n]+?)(?:\n|$)/i);
  if (companyM) out.companyName = companyM[1].trim();
  const linesOfText = text.split(/\n/).map(s => s.trim()).filter(Boolean);
  const violationLines = linesOfText.filter(l => /violation|severity:\s*(critical|high|medium)/i.test(l));
  out.violations = violationLines;
  const fromStream = (lines || []).filter(l => /violation|severity:\s*(critical|high|medium)/i.test(l.text));
  if (fromStream.length) out.violations = [...new Set([...out.violations, ...fromStream.map(l => l.text)])];
  const nextImmediate = text.match(/(?:immediate|NEXT STEPS\s*[—\-]?\s*Immediate)[:\s]*([^\n]+)/i);
  const next30 = text.match(/(?:30\s*days|NEXT STEPS\s*[—\-]?\s*30)[^\n]*[:\s]*([^\n]+)/i);
  const next90 = text.match(/(?:90\s*days|NEXT STEPS\s*[—\-]?\s*90)[^\n]*[:\s]*([^\n]+)/i);
  if (nextImmediate) out.nextSteps.push({ label: 'Immediate', text: nextImmediate[1].trim() });
  if (next30) out.nextSteps.push({ label: '30 days', text: next30[1].trim() });
  if (next90) out.nextSteps.push({ label: '90 days', text: next90[1].trim() });
  const supplierM = text.match(/(?:supplier\s*risks?|SUPPLIER\s*RISKS?)[:\s]*([^\n]+(?:\n(?!\s*[A-Z][a-z]*:)[^\n]*)*)/i);
  if (supplierM) out.supplierText = supplierM[1].trim();
  const incidentsM = text.match(/(?:key\s*incidents?|KEY\s*INCIDENTS?)[:\s]*([^\n]+(?:\n(?!\s*[A-Z][a-z]*:)[^\n]*)*)/i);
  if (incidentsM) out.keyIncidentsText = incidentsM[1].trim();
  const topM = text.match(/(?:top\s*action|TOP\s*ACTION)[:\s]*([^\n]+)/i);
  if (topM) out.topAction = topM[1].trim();
  return out;
}
const TRANSITION = 'cubic-bezier(0.4, 0, 0.2, 1)';

const classifyLine = (line) => {
  if (line.startsWith('Thought:')) return 'amber';
  if (line.startsWith('Action')) return 'blue';
  if (line.startsWith('Observation:')) return 'green';
  if (line.startsWith('Violation')) return 'red';
  if (line.startsWith('Final Report') || line.startsWith('COMPANY:') || line.startsWith('RISK SCORE') || line.startsWith('VIOLATIONS:') || line.startsWith('SUPPLIER') || line.startsWith('NEXT STEPS') || line.startsWith('KEY INCIDENTS')) return 'purple';
  if (line.startsWith('TOP ACTION')) return 'red';
  return 'gray';
};

const colorMap = { amber: '#F59E0B', blue: '#3B82F6', green: '#10B981', red: '#EF4444', purple: '#8B5CF6', gray: '#6B7280' };
const textColorMap = { amber: '#FDE68A', blue: '#93C5FD', green: '#6EE7B7', red: '#FCA5A5', purple: '#C4B5FD', gray: '#9CA3AF' };

const severityPill = (s) => {
  const t = (s || '').toUpperCase();
  if (t.includes('CRITICAL')) return 'pill-critical';
  if (t.includes('HIGH')) return 'pill-high';
  if (t.includes('MEDIUM')) return 'pill-medium';
  return 'pill-pass';
};

export default function AMRSentinel() {
  const [page, setPage] = useState(1);
  const [file, setFile] = useState(null);
  const [fileContents, setFileContents] = useState('');
  const [isPdf, setIsPdf] = useState(false);
  const [lines, setLines] = useState([]);
  const [running, setRunning] = useState(false);
  const [riskScore, setRiskScore] = useState(null);
  const [displayScore, setDisplayScore] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [reportFullText, setReportFullText] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');
  const traceRef = useRef(null);
  const lineIdRef = useRef(0);
  const fileInputRef = useRef(null);
  const shareWrapRef = useRef(null);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const close = (e) => {
      if (shareWrapRef.current && !shareWrapRef.current.contains(e.target)) setShareMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [shareMenuOpen]);

  useEffect(() => { if (traceRef.current) traceRef.current.scrollTop = traceRef.current.scrollHeight; }, [lines]);

  useEffect(() => {
    if (riskScore == null) { setDisplayScore(null); return; }
    setDisplayScore(0);
    const duration = 1200;
    const start = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      setDisplayScore(Math.round((1 - Math.pow(1 - t, 2)) * riskScore));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [riskScore]);

  const readFile = useCallback((f) => {
    if (!f) return;
    const isPdfFile = f.name.toLowerCase().endsWith('.pdf');
    setIsPdf(isPdfFile);
    const fr = new FileReader();
    fr.onload = () => {
      if (isPdfFile) {
        const b64 = typeof fr.result === 'string' ? fr.result.replace(/^data:[^;]+;base64,/, '') : '';
        setFileContents(b64);
      } else {
        setFileContents(fr.result || '');
      }
    };
    if (isPdfFile) fr.readAsDataURL(f);
    else fr.readAsText(f);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f && (f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.txt'))) {
      setFile(f);
      readFile(f);
    }
  };
  const onDragOver = (e) => e.preventDefault();
  const onFileSelect = (e) => {
    const f = e.target?.files?.[0];
    if (f) { setFile(f); readFile(f); }
  };

  const startAnalysis = async () => {
    if (!file || !fileContents) return;
    setPage(2);
    setRunning(true);
    setLines([]);
    setRiskScore(null);
    setDisplayScore(null);
    setCompanyName('');
    setReportFullText('');
    lineIdRef.current = 0;

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityDoc: fileContents, isPdf }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setLines(prev => [...prev, { text: `Error ${res.status}: ${errText.slice(0, 200)}`, color: 'red', id: lineIdRef.current++ }]);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lineBuffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          if (!event.startsWith('data: ')) continue;
          const raw = event.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const data = JSON.parse(raw);
            const content = (data.type === 'token' || data.type === 'reasoning') ? data.content : null;
            if (content) {
              lineBuffer += content;
              fullText += content;
              const parts = lineBuffer.split('\n');
              lineBuffer = parts.pop() ?? '';
              for (const part of parts) {
                const trimmed = part.trim();
                if (!trimmed) continue;
                const id = lineIdRef.current++;
                setLines(prev => [...prev, { text: trimmed, color: classifyLine(trimmed), id }]);
                const riskM = trimmed.match(/RISK SCORE[:\s]+(\d+)/i);
                if (riskM) setRiskScore(parseInt(riskM[1], 10));
                const companyM = trimmed.match(/^COMPANY:\s*(.+)/i);
                if (companyM) setCompanyName(companyM[1].trim());
              }
            }
          } catch (_) {}
        }
      }

      // Flush remaining lineBuffer (last line often has no trailing newline)
      if (lineBuffer.trim()) {
        const trimmed = lineBuffer.trim();
        const id = lineIdRef.current++;
        setLines(prev => [...prev, { text: trimmed, color: classifyLine(trimmed), id }]);
        const riskM = trimmed.match(/RISK SCORE[:\s]+(\d+)/i);
        if (riskM) setRiskScore(parseInt(riskM[1], 10));
        const companyM = trimmed.match(/^COMPANY:\s*(.+)/i);
        if (companyM) setCompanyName(companyM[1].trim());
      }

      setReportFullText(fullText);

      // Fallback: extract risk score and company from full text if not yet set
      if (fullText) {
        const riskFallback = fullText.match(/RISK SCORE[:\s]+(\d+)/i);
        if (riskFallback) setRiskScore(prev => prev ?? parseInt(riskFallback[1], 10));
        const companyFallback = fullText.match(/COMPANY:\s*(.+?)(?:\n|$)/i);
        if (companyFallback) setCompanyName(prev => prev || companyFallback[1].trim());
      }
    } catch (err) {
      setLines(prev => [...prev, { text: 'Error: ' + (err?.message || String(err)), color: 'red', id: lineIdRef.current++ }]);
    }
    setRunning(false);
    setPage(3);
  };

  const violations = lines.filter(l => l.text.startsWith('Violation') || /violation|severity:\s*(critical|high|medium)/i.test(l.text));
  const topActionLine = lines.find(l => l.text.startsWith('TOP ACTION'));
  const nextStepsLines = lines.filter(l => /NEXT STEPS\s*[—\-]?\s*(Immediate|30|90)/i.test(l.text));
  const supplierLine = lines.find(l => /SUPPLIER RISKS?/i.test(l.text));
  const keyIncidentsLine = lines.find(l => /KEY INCIDENTS?/i.test(l.text));

  const parsedReport = useMemo(() => parseReportFromText(reportFullText, lines), [reportFullText, lines]);
  const reportRisk = parsedReport.riskScore ?? riskScore ?? displayScore;
  const reportCompany = parsedReport.companyName || companyName;
  const reportViolations = parsedReport.violations.length ? parsedReport.violations : violations.map(v => v.text);
  const reportNextSteps = parsedReport.nextSteps.length ? parsedReport.nextSteps : nextStepsLines.map(l => {
    const label = /Immediate/i.test(l.text) ? 'Immediate' : /30 days/i.test(l.text) ? '30 days' : '90 days';
    const text = l.text.replace(/^NEXT STEPS\s*[—\-]?\s*(Immediate|30 days|90 days):?\s*/i, '').trim();
    return { label, text };
  });
  const reportSupplier = parsedReport.supplierText || (supplierLine ? supplierLine.text.replace(/^SUPPLIER RISKS?:\s*/i, '') : '');
  const reportIncidents = parsedReport.keyIncidentsText || (keyIncidentsLine ? keyIncidentsLine.text.replace(/^KEY INCIDENTS?:\s*/i, '') : '');
  const reportTopAction = parsedReport.topAction || topActionLine?.text?.replace(/^TOP ACTION:\s*/i, '') || '';

  const riskBadge = reportRisk != null
    ? (reportRisk >= 70 ? 'RED' : reportRisk >= 40 ? 'AMBER' : 'GREEN')
    : null;

  useEffect(() => {
    if (page === 3 && parsedReport.riskScore != null && riskScore == null)
      setRiskScore(parsedReport.riskScore);
  }, [page, parsedReport.riskScore, riskScore]);

  const buildReportExportText = useCallback(() => {
    const risk = reportRisk != null ? reportRisk : '--';
    const company = reportCompany || 'Facility Report';
    let s = `AMR SENTINEL — Compliance Report\n${'='.repeat(40)}\n\n`;
    s += `${company}\nRisk Score: ${risk}/100\n\n`;
    s += `CRITICAL FINDINGS\n${'-'.repeat(24)}\n`;
    reportViolations.forEach(v => { s += `• ${typeof v === 'string' ? v : v.text}\n`; });
    if (!reportViolations.length) s += 'None identified\n';
    s += `\nRECOMMENDED NEXT STEPS\n${'-'.repeat(24)}\n`;
    reportNextSteps.forEach(step => { s += `• ${step.label}: ${step.text}\n`; });
    s += `\nSUPPLIER RISK\n${'-'.repeat(24)}\n${reportSupplier || 'None identified'}\n`;
    s += `\nCOMPLIANCE TIMELINE\n${'-'.repeat(24)}\n${reportIncidents || 'No dated incidents'}\n`;
    if (reportTopAction) s += `\nTOP ACTION\n${'-'.repeat(24)}\n${reportTopAction}\n`;
    s += `\n${'='.repeat(40)}\nGenerated by AMR Sentinel`;
    return s;
  }, [reportCompany, reportRisk, reportViolations, reportNextSteps, reportSupplier, reportIncidents, reportTopAction]);

  const handleExportDownload = useCallback(() => {
    const text = buildReportExportText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AMR-Sentinel-Report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShareFeedback('Downloaded');
    setShareMenuOpen(false);
    setTimeout(() => setShareFeedback(''), 2000);
  }, [buildReportExportText]);

  const handleCopyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildReportExportText());
      setShareFeedback('Copied to clipboard');
      setShareMenuOpen(false);
      setTimeout(() => setShareFeedback(''), 2000);
    } catch {
      setShareFeedback('Copy failed');
      setTimeout(() => setShareFeedback(''), 2000);
    }
  }, [buildReportExportText]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(typeof window !== 'undefined' ? window.location.href : '');
      setShareFeedback('Link copied');
      setShareMenuOpen(false);
      setTimeout(() => setShareFeedback(''), 2000);
    } catch {
      setShareFeedback('Copy failed');
      setTimeout(() => setShareFeedback(''), 2000);
    }
  }, []);

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    const userMsg = { role: 'user', content: msg };
    const messagesToSend = [...chatMessages, userMsg];
    setChatMessages(messagesToSend);
    setChatInput('');
    setChatLoading(true);
    const context = reportFullText || lines.map(l => l.text).join('\n');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentContext: context,
          messages: messagesToSend.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = data?.reply ?? data?.error ?? 'No response.';
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + (e?.message || 'Failed') }]);
    }
    setChatLoading(false);
  };

  return (
    <div className="sentinel-root">
      {/* Animated background (page 1) */}
      {page === 1 && (
        <div className="particle-bg" aria-hidden>
          <div className="particle" />
          <div className="particle particle-2" />
          <div className="particle particle-3" />
        </div>
      )}

      {page === 1 && (
        <div className="page page-1" style={{ animation: 'fadeSlideIn 0.4s var(--ease) forwards' }}>
          <header className="landing-header">
            <h1 className="landing-logo">AMR SENTINEL</h1>
            <p className="landing-tagline">Compliance Intelligence</p>
          </header>
          <main className="landing-main">
            <div
              className="upload-zone glass"
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={onFileSelect}
                className="upload-input"
              />
              <p className="upload-text">Drop your compliance document here</p>
              <p className="upload-hint">PDF or TXT • Any company</p>
              {file && (
                <div className="upload-file-info">
                  <span className="upload-filename">{file.name}</span>
                  <span className="upload-filesize">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="glossy-btn"
              disabled={!file || !fileContents}
              onClick={startAnalysis}
            >
              ANALYZE FACILITY
            </button>
          </main>
        </div>
      )}

      {page === 2 && (
        <div className="page page-2" style={{ animation: 'fadeSlideIn 0.4s var(--ease) forwards' }}>
          <div className="top-bar">
            <div>
              <span className="logo">AMR SENTINEL</span>
              <span className="tagline">Compliance Intelligence</span>
            </div>
          </div>
          <div className="panels">
            <div className="left-panel" style={{ width: '40%' }}>
              <div className="trace-header">
                <span className="pulse-dot" />
                AGENT REASONING TRACE
                <span className="analyzing">Analyzing...</span>
              </div>
              <div ref={traceRef} className="trace-content">
                {lines.map((line, i) => (
                  <div key={line.id} className="trace-line" style={{ '--line-color': colorMap[line.color], '--text-color': textColorMap[line.color], '--stagger': `${i * 150}ms` }}>{line.text}</div>
                ))}
              </div>
            </div>
            <div className="right-panel" style={{ flex: 1 }}>
              <div className="glass card risk-card">
                <div className="card-label">Risk Score</div>
                <div className="risk-value" style={{ color: displayScore != null ? (displayScore >= 70 ? '#EF4444' : displayScore >= 40 ? '#F59E0B' : '#10B981') : '#6B7280' }}>{displayScore != null ? displayScore : '--'}</div>
                <div className="risk-denom">/100</div>
              </div>
              <div className="glass card violations-card">
                <div className="card-label">Violations</div>
                {violations.length === 0 ? <div className="empty-state">Detecting...</div> : violations.map((v, i) => <div key={i} className="violation-card">{v.text}</div>)}
              </div>
              {topActionLine && (
                <div className="glass card top-action-card">
                  <div className="card-label">Top Priority Action</div>
                  <div className="top-action-text">{topActionLine.text}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {page === 3 && (
        <div className="page page-3" style={{ animation: 'slideUpIn 0.5s var(--ease) forwards' }}>
          <div className="top-bar">
            <div>
              <span className="logo">AMR SENTINEL</span>
              <span className="tagline">Compliance Intelligence</span>
            </div>
            <div className="report-actions">
              <button type="button" className="glossy-btn secondary" onClick={() => { setPage(1); setFile(null); setFileContents(''); setLines([]); setReportFullText(''); setChatMessages([]); }}>Analyze Another Document</button>
              <div className="share-wrap" ref={shareWrapRef}>
                <button type="button" className="glossy-btn outline" onClick={() => setShareMenuOpen(prev => !prev)} aria-expanded={shareMenuOpen}>Export / Share</button>
                {shareMenuOpen && (
                  <div className="share-menu glass">
                    <button type="button" className="share-menu-item" onClick={handleExportDownload}>Download report (.txt)</button>
                    <button type="button" className="share-menu-item" onClick={handleCopyReport}>Copy report to clipboard</button>
                    <button type="button" className="share-menu-item" onClick={handleCopyLink}>Copy link</button>
                  </div>
                )}
                {shareFeedback && <span className="share-feedback">{shareFeedback}</span>}
              </div>
            </div>
          </div>
          <div className="report-scroll">
            <header className="report-summary glass">
              <h2 className="report-company">{reportCompany || 'Facility Report'}</h2>
              <div className="report-badges">
                {riskBadge && <span className={`severity-pill badge-${riskBadge.toLowerCase()}`}>{riskBadge}</span>}
                <span className="risk-number">Risk: {reportRisk != null ? (displayScore ?? reportRisk) : '--'}/100</span>
              </div>
            </header>

            <section className="glass report-section">
              <h3 className="section-title">Critical Findings</h3>
              {reportViolations.length === 0 ? <p className="empty-state">None identified</p> : reportViolations.map((v, i) => (
                <div key={i} className="finding-card">
                  <span className={`severity-pill ${severityPill(typeof v === 'string' ? v : v.text)}`}>{typeof v === 'string' ? (v.includes('CRITICAL') ? 'CRITICAL' : v.includes('HIGH') ? 'HIGH' : 'MEDIUM') : (v.text.includes('CRITICAL') ? 'CRITICAL' : v.text.includes('HIGH') ? 'HIGH' : 'MEDIUM')}</span>
                  <p className="finding-text">{typeof v === 'string' ? v : v.text}</p>
                </div>
              ))}
            </section>

            <section className="glass report-section">
              <h3 className="section-title">Recommended Next Steps</h3>
              <ul className="next-steps-list">
                {reportNextSteps.length ? reportNextSteps.map((step, i) => (
                  <li key={i} className="next-step-item">
                    <span className="next-step-timeline">{step.label || ''}</span>
                    <span>{step.text ?? ''}</span>
                  </li>
                )) : (reportFullText ? <li className="empty-state">See full report below</li> : null)}
              </ul>
            </section>

            <section className="glass report-section">
              <h3 className="section-title">Supplier Risk</h3>
              <p className="section-body">{reportSupplier || (reportFullText ? 'None identified' : '—')}</p>
            </section>

            <section className="glass report-section">
              <h3 className="section-title">Compliance Timeline</h3>
              <p className="section-body">{reportIncidents || (reportFullText ? 'No dated incidents' : '—')}</p>
            </section>

            {reportTopAction && (
              <section className="glass report-section top-action-section">
                <h3 className="section-title">Top Priority Action</h3>
                <p className="section-body top-action-body">{reportTopAction}</p>
              </section>
            )}

            {reportFullText && reportRisk == null && reportViolations.length === 0 && (
              <section className="glass report-section raw-report">
                <h3 className="section-title">Raw report (no structured data extracted)</h3>
                <pre className="raw-report-pre">{reportFullText.slice(0, 8000)}</pre>
              </section>
            )}
          </div>

          {page === 3 && (
            <>
              <button type="button" className="chat-fab" onClick={() => setChatOpen(!chatOpen)} aria-label="Chat">
                {chatOpen ? '✕' : '💬'}
              </button>
              {chatOpen && (
                <div className="chat-panel glass">
                  <div className="chat-header">
                    <h4>Ask about this report</h4>
                    <button type="button" className="chat-close" onClick={() => setChatOpen(false)}>✕</button>
                  </div>
                  <div className="chat-messages">
                    {chatMessages.length === 0 && <p className="chat-placeholder">Ask anything about the facility or report.</p>}
                    {chatMessages.map((m, i) => (
                      <div key={i} className={`chat-msg ${m.role}`}>
                        <span className="chat-msg-role">{m.role === 'user' ? 'You' : 'AMR Sentinel'}</span>
                        <p>{m.content}</p>
                      </div>
                    ))}
                  </div>
                  <form className="chat-form" onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
                    <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type a question..." className="chat-input" />
                    <button type="submit" disabled={chatLoading} className="glossy-btn small">Send</button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
