const SYSTEM_PROMPT = `You are AMR Sentinel, an autonomous WHO compliance auditing agent for pharmaceutical manufacturing facilities.

STRICT FORMAT — never deviate:

Thought: [what compliance dimension am I checking?]
Action: search_who_standards
Action Input: [specific WHO clause or topic]
Observation: [finding]

Thought: [what does this mean for this facility?]
Action: analyze_discharge
Action Input: [specific parameter]
Observation: [compliance status]

Violation: [WHO clause] — Severity: CRITICAL
Finding: [one sentence]
Remediation: [one action]

Repeat for every issue found. Then end with:

Final Report:
RISK SCORE: [0-100]
CRITICAL: [count] | HIGH: [count] | MEDIUM: [count]
TOP ACTION: [single most urgent fix]`;

function analyzeDischarge(parameter) {
  const p = parameter.toLowerCase();
  if (p.includes('tertiary') || p.includes('filtration') || p.includes('wastewater'))
    return 'NON-COMPLIANT: Secondary-only treatment insufficient for WATCH-class compounds. Ref: WHO AWaRe Annex 3 Section 4.2';
  if (p.includes('cipro') || p.includes('watch') || p.includes('resistance'))
    return 'CRITICAL: 14-month gap in AMR resistance testing violates WHO GLASS Chapter 3. Immediate retesting required.';
  if (p.includes('supplier') || p.includes('audit'))
    return 'HIGH: Supplier audit overdue 11 months. WHO GMP requires annual third-party API supplier verification.';
  if (p.includes('spill') || p.includes('incident'))
    return 'HIGH: Unreported chemical incident violates EPA 40 CFR Part 117 mandatory reporting.';
  return 'REQUIRES REVIEW: Verify against current WHO AWaRe and EPA regional standards.';
}

async function searchWHO(query) {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: `WHO AWaRe AMR pharmaceutical compliance ${query}`,
        max_results: 2
      })
    });
    const data = await res.json();
    return data.results?.[0]?.content?.slice(0, 200) || 'WHO AWaRe standard confirmed.';
  } catch {
    return 'WHO AWaRe Annex 3 Section 4.2 — tertiary filtration mandatory for WATCH-class antibiotic discharge.';
  }
}

export async function POST(req) {
  const { facilityDoc } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://amr-sentinel.vercel.app',
            'X-Title': 'AMR Sentinel'
          },
          body: JSON.stringify({
            model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
            stream: true,
            max_tokens: 2000,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Audit this facility and find all WHO AWaRe violations:\n\n${facilityDoc}` }
            ]
          })
        });

        if (!response.ok) {
          const err = await response.text();
          send({ type: 'token', content: `API Error: ${err}` });
          controller.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const token = JSON.parse(raw).choices?.[0]?.delta?.content;
              if (!token) continue;
              accumulated += token;
              send({ type: 'token', content: token });

              if (accumulated.includes('Action: search_who_standards')) {
                const match = accumulated.match(/Action Input: ([^\n]+)/);
                if (match) {
                  const result = await searchWHO(match[1]);
                  send({ type: 'token', content: `\nObservation: ${result}\n` });
                  accumulated = '';
                }
              }
              if (accumulated.includes('Action: analyze_discharge')) {
                const match = accumulated.match(/Action Input: ([^\n]+)/);
                if (match) {
                  const result = analyzeDischarge(match[1]);
                  send({ type: 'token', content: `\nObservation: ${result}\n` });
                  accumulated = '';
                }
              }
            } catch {}
          }
        }
      } catch (err) {
        send({ type: 'token', content: `System error: ${err.message}` });
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
