'use client';
import { useState, useRef, useEffect } from 'react';

const APEX_DOC = `APEX CHEMICAL INDUSTRIES Q3 Compliance Summary.
Facility: San Jose CA.
Antibiotic compounds: Amoxicillin trihydrate WHO AWaRe ACCESS class 2400kg/month, Ciprofloxacin HCl WHO AWaRe WATCH class 180kg/month.
Wastewater: Secondary biological treatment only, no tertiary filtration, discharge into Coyote Creek 4200L/day.
Last AMR resistance test: 14 months ago.
Supplier audit overdue 11 months.
Incident: March 2025 Ciprofloxacin spillage not externally reported.
Staff AMR training: 0 of 12 certified.`;

const classifyLine = (line) => {
  if (line.startsWith('Thought:'))     return '#F59E0B';
  if (line.startsWith('Action'))       return '#3B82F6';
  if (line.startsWith('Observation:')) return '#10B981';
  if (line.startsWith('Violation'))    return '#EF4444';
  if (line.startsWith('Final Report')) return '#8B5CF6';
  if (line.startsWith('RISK SCORE'))   return '#8B5CF6';
  if (line.startsWith('TOP ACTION'))   return '#EF4444';
  return '#6B7280';
};

export default function AMRSentinel() {
  const [lines, setLines]     = useState([]);
  const [running, setRunning] = useState(false);
  const [riskScore, setRisk]  = useState(null);
  const [done, setDone]       = useState(false);
  const traceRef              = useRef(null);

  useEffect(() => {
    if (traceRef.current)
      traceRef.current.scrollTop = traceRef.current.scrollHeight;
  }, [lines]);

  const runAudit = async () => {
    setRunning(true);
    setLines([]);
    setRisk(null);
    setDone(false);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityDoc: APEX_DOC })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lineBuffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const event of events) {
          if (!event.startsWith('data: ')) continue;
          const raw = event.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const data = JSON.parse(raw);
            if (data.type === 'token' && data.content) {
              lineBuffer += data.content;
              const parts = lineBuffer.split('\n');
              lineBuffer = parts.pop();
              for (const part of parts) {
                const trimmed = part.trim();
                if (!trimmed) continue;
                setLines(prev => [...prev, {
                  text: trimmed,
                  color: classifyLine(trimmed),
                  id: Math.random()
                }]);
                const m = trimmed.match(/RISK SCORE[:\s]+(\d+)/);
                if (m) setRisk(parseInt(m[1]));
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      setLines(prev => [...prev, { text: 'Error: ' + err.message, color: '#EF4444', id: Math.random() }]);
    }
    setRunning(false);
    setDone(true);
  };

  const riskColor = !riskScore ? '#6B7280' : riskScore >= 70 ? '#EF4444' : riskScore >= 40 ? '#F59E0B' : '#10B981';

  return (
    <div style={{ minHeight:'100vh', background:'#0F0F0F', color:'#E5E7EB', fontFamily:'monospace', display:'flex', flexDirection:'column' }}>
      
      {/* TOP BAR */}
      <div style={{ background:'#1A1A1A', borderBottom:'1px solid #2D2D2D', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <span style={{ color:'#EF4444', fontWeight:'bold', fontSize:'18px' }}>AMR SENTINEL</span>
          <span style={{ color:'#6B7280', fontSize:'12px', marginLeft:'12px' }}>WHO AWaRe Compliance Agent | Powered by NVIDIA Nemotron</span>
        </div>
        <button onClick={runAudit} disabled={running} style={{ background: running ? '#374151' : '#DC2626', color:'white', border:'none', padding:'10px 24px', borderRadius:'6px', fontWeight:'bold', fontSize:'14px', cursor: running ? 'not-allowed' : 'pointer' }}>
          {running ? '⏳ ANALYZING...' : done ? '✓ COMPLETE — RUN AGAIN' : '▶ RUN AUDIT'}
        </button>
      </div>

      {/* PANELS */}
      <div style={{ display:'flex', flex:1, height:'calc(100vh - 57px)' }}>

        {/* LEFT */}
        <div style={{ width:'42%', borderRight:'1px solid #2D2D2D', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'8px 16px', background:'#161616', borderBottom:'1px solid #2D2D2D', fontSize:'11px', color:'#9CA3AF', display:'flex', alignItems:'center', gap:'8px' }}>
            {running && <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#F59E0B', display:'inline-block' }}/>}
            AGENT REASONING TRACE
            {running && <span style={{ color:'#F59E0B' }}>Analyzing...</span>}
          </div>
          <div ref={traceRef} style={{ flex:1, overflowY:'auto', padding:'12px', display:'flex', flexDirection:'column', gap:'3px' }}>
            {lines.length === 0 && !running && (
              <div style={{ color:'#4B5563', fontSize:'13px', textAlign:'center', marginTop:'40px' }}>Click RUN AUDIT to begin</div>
            )}
            {lines.map(line => (
              <div key={line.id} style={{ borderLeft:`3px solid ${line.color}`, paddingLeft:'10px', paddingTop:'3px', paddingBottom:'3px', fontSize:'12px', lineHeight:'1.5', color: line.color === '#EF4444' ? '#FCA5A5' : line.color === '#F59E0B' ? '#FDE68A' : line.color === '#10B981' ? '#6EE7B7' : line.color === '#3B82F6' ? '#93C5FD' : line.color === '#8B5CF6' ? '#C4B5FD' : '#9CA3AF', background: line.color === '#EF4444' ? 'rgba(239,68,68,0.05)' : 'transparent', borderRadius:'2px' }}>
                {line.text}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px', display:'flex', flexDirection:'column', gap:'16px' }}>
          
          <div style={{ background:'#1A1A1A', border:'1px solid #2D2D2D', borderRadius:'8px', padding:'24px', textAlign:'center' }}>
            <div style={{ color:'#9CA3AF', fontSize:'11px', marginBottom:'8px' }}>FACILITY RISK SCORE</div>
            <div style={{ fontSize:'80px', fontWeight:'bold', color: riskColor, lineHeight:1 }}>{riskScore ?? '--'}</div>
            <div style={{ color:'#6B7280', fontSize:'12px' }}>/100</div>
            {riskScore >= 70 && <div style={{ marginTop:'10px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'4px', padding:'6px 12px', color:'#FCA5A5', fontSize:'12px', display:'inline-block' }}>⚠️ HIGH RISK — IMMEDIATE ACTION REQUIRED</div>}
          </div>

          <div style={{ background:'#1A1A1A', border:'1px solid #2D2D2D', borderRadius:'8px', padding:'16px' }}>
            <div style={{ color:'#9CA3AF', fontSize:'11px', marginBottom:'12px' }}>VIOLATIONS DETECTED</div>
            {lines.filter(l => l.text.startsWith('Violation')).length === 0
              ? <div style={{ color:'#4B5563', fontSize:'13px' }}>{running ? 'Scanning...' : 'None detected yet'}</div>
              : lines.filter(l => l.text.startsWith('Violation')).map((v, i) => (
                <div key={i} style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'6px', padding:'10px', marginBottom:'8px', fontSize:'12px', color:'#FCA5A5' }}>{v.text}</div>
              ))
            }
          </div>

          {lines.find(l => l.text.startsWith('TOP ACTION')) && (
            <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'8px', padding:'16px' }}>
              <div style={{ color:'#9CA3AF', fontSize:'11px', marginBottom:'8px' }}>TOP PRIORITY ACTION</div>
              <div style={{ color:'#FCA5A5', fontSize:'13px' }}>{lines.find(l => l.text.startsWith('TOP ACTION'))?.text}</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
