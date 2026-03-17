export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { documentContext, messages } = body;

    const systemContent = `You are AMR Sentinel's report assistant. Answer questions about the compliance report and the facility document based ONLY on the context below. Be concise and accurate.

CONTEXT (facility document and report):
${documentContext || "(No document context provided)"}`;

    const chatMessages = [
      { role: "system", content: systemContent },
      ...(Array.isArray(messages) ? messages : []),
    ].filter(m => m.role && m.content);

    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-super-120b-a12b",
        messages: chatMessages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: errText }, { status: res.status });
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content ?? "No response.";
    return Response.json({ reply });
  } catch (err) {
    return Response.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
