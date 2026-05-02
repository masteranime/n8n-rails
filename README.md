<div align="center">

# n8n-rails

**Your AI agent is broken in production right now. You just don't know it yet.**

Production hardening for n8n AI Agents. Force tool order. Validate every step. Stop silent failures before they cost you a client.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![n8n Community Node](https://img.shields.io/badge/n8n-Community%20Node-orange)
![npm](https://img.shields.io/npm/v/n8n-nodes-rails)

</div>

---

![n8n-rails demo](https://raw.githubusercontent.com/masteranime/n8n-rails/main/demo.gif)

---

## The story behind this repo

Last month I built a WhatsApp sales agent for a UK agency client. n8n AI Agent node, Groq Llama 70B as the brain, three tools: MySQL customer lookup, Stripe payment link, WhatsApp send.

Customer texts "I want to pay". Agent is supposed to do steps 1, 2, 3 in order.

Instead, around 15 to 20 percent of the time, Llama just skipped step 1. Decided it didn't need the database. Made up a customer_id. Sent a broken Stripe link to a real customer.

Client lost two sales in one day before I caught it.

I tried the official advice. Better system prompt. Few shot examples. Stricter tool descriptions. None of it actually worked at production volume. The model is probabilistic. My business logic is not. When they fight, the model wins and money goes out the window.

So I built n8n-rails.

## What it does

It puts your AI agent on rails. The LLM cannot skip steps, cannot reorder them, cannot send hallucinated parameters to your real APIs.

Three things, simple:

1. Forces tool order. The LLM only sees the tool it is supposed to call right now. It literally cannot pick a different one because the others are not in the prompt.
2. Validates between steps. Coming in v0.2: every output checked with a Zod schema before the next step runs.
3. Falls back on failure. Coming in v0.3: if Groq Llama refuses to cooperate, retry with Claude or GPT automatically.

## Screenshots

The workflow on n8n canvas:

![Workflow](https://raw.githubusercontent.com/masteranime/n8n-rails/main/n8n-rail.jpg)

Step-by-step output (proof it works):

![Output](https://raw.githubusercontent.com/masteranime/n8n-rails/main/n8n-rail-2.jpg)

## Install

npm install n8n-nodes-rails

Or in your n8n instance: Settings then Community Nodes then search n8n-nodes-rails then install.

n8n version 1.20 or higher.

## Quick start

1. Drop the n8n-rails node into your workflow before any AI Agent node
2. Set your LLM provider (OpenAI, Groq, or any OpenAI-compatible)
3. Define your tool order in the Rails Config JSON
4. Connect a trigger and a Set node that creates a message field
5. Execute. The LLM cannot skip your steps anymore.

## How it compares

Feature comparison:

- Tool order: Vanilla n8n AI Agent hopes the prompt works. n8n-rails locks it, cannot skip.
- Hallucination handling: Vanilla sends bad data. n8n-rails halts or retries.
- Production safe: Vanilla is for demos. n8n-rails is for client work.

## How is this different from n8n's native Guardrails?

The native Guardrails node validates the CONTENT of text (NSFW, prompt injection, PII). It does not enforce tool execution order.

n8n-rails forces deterministic execution flow at the orchestration layer. Different problem, different solution. They are complementary, not competing.

## Roadmap

- v0.1: Forced tool execution order (DONE)
- v0.2: Zod validation between steps
- v0.3: Multi model retry and failover
- v0.4: Step-by-step replay UI
- v0.5: Portable TypeScript engine for LangChain and CrewAI users

## Why I built this

I am Muhammad Shaheer, n8n Verified Creator with 100+ workflows shipped. I build agentic AI systems for clients in US, UK, and Pakistan. I have been burned by exactly this problem in three different production projects. Prompt engineering does not solve probabilistic models meeting deterministic business logic. Code does.

If you find this useful, the best thank you is starring the repo and sharing with one other n8n builder.

## Contributing

PRs welcome. If you have lost money or sleep to an LLM hallucinating an API call in production, I want your help.

## License

MIT, Muhammad Shaheer
