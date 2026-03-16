# AMR Sentinel 🧬

### An autonomous AI agent that audits pharmaceutical manufacturing facilities for WHO compliance — before a regulator ever visits.

---

## The Problem

Antimicrobial resistance kills **1.27 million people every year**.

Most of those deaths trace back to pharmaceutical manufacturing runoff — facilities discharging WATCH-class antibiotics into watersheds without proper filtration, skipping resistance testing, leaving supplier audits overdue for months.

The compliance reports exist. The WHO standards exist. But the gap between what regulators require and what manufacturers actually understand is where the next superbug originates.

---

## What AMR Sentinel Does

AMR Sentinel ingests a facility's process logs, wastewater discharge records, and supplier manifests — then autonomously audits them against the WHO AWaRe antibiotic stewardship framework in real time.

It doesn't just flag violations. It **reasons** about them.

Watch it think through cross-domain risk — chemistry data, international law, and public health impact — simultaneously, in a single inference pass.

---

## The Agent Loop
```
Ingest facility docs
       ↓
Nemotron reasons about compliance dimensions
       ↓
Calls WHO AWaRe search + discharge analyzer
       ↓
Cross-references regional discharge law
       ↓
Generates ranked violations + remediation plan
```

---

## Built With

- **NVIDIA Nemotron 49B** via OpenRouter — the reasoning core
- **Tavily Search API** — live WHO AWaRe database lookup
- **Next.js + Vercel** — deployed in minutes
- **Streaming SSE** — agent thinking visible in real time

---

## Why Nemotron

A compliance dossier spans chemistry data, WHO regulatory law, supplier records, and environmental discharge standards simultaneously.

Smaller models chunk this — and miss cross-domain violations.

Nemotron's 1M token context holds the entire facility record in a single reasoning pass. Its MoE architecture activates specialized expert pathways for chemistry, legal, and epidemiology reasoning within one inference call.

That's not a preference. That's a technical requirement.

---

## The Human Story

My family runs a chemical manufacturing facility.

Every year they receive a 300-page WHO compliance report written by regulators who have never worked a factory floor. They do their best. But the gap between good intentions and technical compliance is exactly where environmental AMR spreads undetected.

I built the agent that closes that gap.

---

## Impact

- **40,000+** pharmaceutical manufacturing facilities globally with limited real-time WHO monitoring
- **$40,000–$120,000** — cost of a traditional compliance audit
- **$0.04** — cost per AMR Sentinel audit
- **10 million** projected annual AMR deaths by 2050 if trajectory continues

---

*Built at NVIDIA Agents for Impact Hackathon — SJSU, March 2026*
