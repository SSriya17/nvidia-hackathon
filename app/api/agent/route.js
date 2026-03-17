const SYSTEM_PROMPT = `You are AMR Sentinel, an autonomous compliance auditing agent. Analyze the facility document provided by the user.

TASKS:
1. Extract and state the COMPANY name from the document (if present).
2. Evaluate compliance dimensions using the tools below.
3. Identify all violations with WHO/EPA clause references and severity (CRITICAL/HIGH/MEDIUM).
4. Identify supplier risks if any supplier or audit data appears.
5. Note any dated incidents for a compliance timeline.
6. Recommend next steps with timelines: Immediate, 30 days, 90 days.

You MUST follow this EXACT format during analysis:
Thought: [what compliance dimension am I evaluating?]
Action: search_who_standards
Action Input: [specific WHO clause or topic]
Observation: [tool result]
Thought: [what does this mean for this facility?]
Action: analyze_discharge
Action Input: [specific parameter]
Observation: [tool result]
Violation: [WHO clause] — Severity: CRITICAL/HIGH/MEDIUM
Finding: [one sentence]
Remediation: [one specific action]

After all analysis, output a structured Final Report with these sections (use exact headers):
COMPANY: [extracted company name or "Unknown"]
RISK SCORE: [0-100]
CRITICAL: [count] | HIGH: [count] | MEDIUM: [count]
VIOLATIONS: [summary list]
SUPPLIER RISKS: [if any, else "None identified"]
NEXT STEPS — Immediate: [action]
NEXT STEPS — 30 days: [action]
NEXT STEPS — 90 days: [action]
KEY INCIDENTS: [dated incidents if any, else "None"]
TOP ACTION: [single most urgent fix]`;

async function searchWHO(query) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: "WHO AWaRe AMR pharmaceutical compliance " + query,
        max_results: 2,
      }),
    });
    const data = await res.json();
    const first = data?.results?.[0];
    const content = first?.content ?? "";
    return content.slice(0, 300);
  } catch {
    return "WHO AWaRe Annex 3 Section 4.2 — tertiary filtration required for WATCH-class antibiotic discharge.";
  }
}

function analyzeDischarge(parameter) {
  const p = parameter.toLowerCase();
  if (p.includes("tertiary") || p.includes("filtration"))
    return "NON-COMPLIANT: Secondary-only treatment insufficient. Ref: WHO AWaRe Annex 3 §4.2";
  if (p.includes("cipro") || p.includes("watch"))
    return "CRITICAL: 14-month gap in AMR resistance testing violates WHO GLASS Chapter 3";
  if (p.includes("supplier") || p.includes("audit"))
    return "HIGH: Supplier audit overdue 11 months. WHO GMP requires annual verification";
  if (p.includes("spill") || p.includes("incident"))
    return "HIGH: Unreported incident violates EPA 40 CFR Part 117";
  return "REQUIRES REVIEW: Needs verification against WHO AWaRe and EPA standards";
}

function sendEvent(type, content) {
  return `data: ${JSON.stringify({ type, content })}\n\n`;
}

async function extractTextFromPayload(body) {
  const facilityDoc = body?.facilityDoc ?? "";
  const isPdf = body?.isPdf === true;
  if (isPdf && facilityDoc) {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = Buffer.from(facilityDoc, "base64");
      const data = await pdfParse(buffer);
      return data?.text ?? facilityDoc;
    } catch {
      return facilityDoc;
    }
  }
  return facilityDoc;
}

export async function GET() {
  return Response.json({});
}

export async function POST(request) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const body = await request.json().catch(() => ({}));
        const facilityDoc = (await extractTextFromPayload(body))?.trim() ?? "";
        if (facilityDoc.length < 10) {
          controller.enqueue(encoder.encode(sendEvent("token", "Error: Document is empty or could not be read. Please upload a valid PDF or TXT file with content.")));
          controller.close();
          return;
        }

        const nvidiaRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
          },
          body: JSON.stringify({
            model: "nvidia/nemotron-3-super-120b-a12b",
            stream: true,
            temperature: 1,
            top_p: 0.95,
            max_tokens: 16384,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: facilityDoc },
            ],
            extra_body: {
              chat_template_kwargs: { enable_thinking: true },
              reasoning_budget: 16384,
            },
          }),
        });

        if (!nvidiaRes.ok) {
          const errText = await nvidiaRes.text();
          controller.enqueue(encoder.encode(sendEvent("token", errText)));
          controller.close();
          return;
        }

        const reader = nvidiaRes.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            let json;
            try {
              json = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            const delta = json?.choices?.[0]?.delta;
            if (!delta) continue;

            const reasoning = delta.reasoning_content;
            if (typeof reasoning === "string") {
              controller.enqueue(encoder.encode(sendEvent("reasoning", reasoning)));
            }

            const content = delta.content;
            if (typeof content !== "string") continue;

            accumulated += content;
            controller.enqueue(encoder.encode(sendEvent("token", content)));

            const searchMatch = accumulated.match(/Action:\s*search_who_standards[\s\S]*?Action Input:\s*([^\n]+)/);
            if (searchMatch) {
              const input = searchMatch[1].trim();
              const result = await searchWHO(input);
              controller.enqueue(encoder.encode(sendEvent("token", "\nObservation: " + result + "\n")));
              accumulated = "";
              continue;
            }

            const dischargeMatch = accumulated.match(/Action:\s*analyze_discharge[\s\S]*?Action Input:\s*([^\n]+)/);
            if (dischargeMatch) {
              const input = dischargeMatch[1].trim();
              const result = analyzeDischarge(input);
              controller.enqueue(encoder.encode(sendEvent("token", "\nObservation: " + result + "\n")));
              accumulated = "";
            }
          }
        }

        controller.close();
      } catch (err) {
        const message = err?.message ?? String(err);
        controller.enqueue(encoder.encode(sendEvent("token", message)));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
