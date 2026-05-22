# AI Agent Framework with RAG — NestJS + LangChain

A reference implementation for building production-ready AI agents with **Retrieval-Augmented Generation (RAG)**, **short-term memory**, **user context injection**, and **SSE streaming** — built on NestJS and LangChain.

Use this project as a starting point when you need to ship an AI assistant grounded in a specific website or knowledge base.

---

## What this project demonstrates

| Concept | Where to look |
|---|---|
| RAG with web scraping | `cheesecake.service.ts` → `getAgent()` |
| Short-term conversation memory | `MemorySaver` + `thread_id` per conversation |
| User context injection | `buildUserMessage()` enriches each prompt with user profile |
| SSE token streaming | `POST /cheesecake/ask/stream` via `@Sse()` |
| Modular, pluggable design | Each domain is a self-contained NestJS module |

---

## Architecture

```
src/
├── cheesecake/          # AI agent for cheesecakelabs.com (reference module)
│   ├── cheesecake.service.ts     # RAG agent: scrape → embed → retrieve → generate
│   ├── cheesecake.controller.ts  # POST /cheesecake/ask/stream (SSE)
│   ├── dto/
│   │   └── ask-cheesecake.dto.ts # AskCheesecakeDto + UserPreferencesDto
│   └── cheesecake.module.ts
├── knowledge/           # Shared knowledge utilities
└── app.module.ts
```

### Key building blocks

**RAG pipeline** — `CheerioWebBaseLoader` scrapes the target website, `RecursiveCharacterTextSplitter` chunks the content, `OpenAIEmbeddings` vectorizes it, and `MemoryVectorStore` stores it for similarity search.

**Short-term memory** — `MemorySaver` (LangGraph checkpointer) persists conversation state keyed by `thread_id = clientId:userId:conversationId`. Pass the same `conversationId` across requests to continue a conversation.

**Message trimming** — A `TrimMessages` middleware keeps only the first (system) message + the last 10 messages, preventing context overflow without losing the agent's persona.

**User context injection** — Before each LLM call, `buildUserMessage()` prepends structured user preferences (name, industry, project type, etc.) as plaintext context inside the user message — no extra tokens in the system prompt.

**SSE streaming** — The controller uses RxJS `concatMap` + `delayWhen` to emit tokens with natural typing delays (40ms base, 80ms on spaces, 120ms on punctuation).

---

## Adding your own agent

1. Generate a new module:
   ```bash
   nest g resource my-domain
   ```

2. Copy the pattern from `src/cheesecake/` and update:
   - `SITE_URL` — point to your knowledge source
   - `systemPrompt` — describe your agent's persona and constraints
   - `UserPreferencesDto` — add the context fields relevant to your domain
   - `buildUserMessage()` — map your preferences to the prompt string

3. Register the module in `app.module.ts`.

That's it — the RAG pipeline, memory, and streaming are inherited automatically.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| LLM | OpenAI `gpt-4o-mini` |
| Embeddings | OpenAI `text-embedding-3-small` |
| Agent / graph | LangChain + LangGraph |
| Web scraping | Cheerio (`@langchain/community`) |
| Vector store | In-memory (`@langchain/classic`) |
| Streaming | RxJS + NestJS SSE (`@Sse`) |
| Language | TypeScript 5 |

---

## Documentation

The [`docs/`](docs/) directory contains detailed guides for each major concept in this project:

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system design: multi-tenancy model, RAG design, memory isolation, persistence layer, API design, and evolution roadmap from the current implementation to production |
| [short-term-memory-implementation.md](docs/short-term-memory-implementation.md) | Step-by-step guide to adding conversation memory: checkpointer setup, `thread_id` design, receiving `conversationId` from the frontend, and trimming messages by count or token budget |
| [rag-knowledge-flow.md](docs/rag-knowledge-flow.md) | How the 2-step RAG pipeline works: index documents once, retrieve relevant chunks at query time, and ground LLM responses in that context |
| [DOCKER-AWS-EC2-REQUIREMENTS.md](docs/DOCKER-AWS-EC2-REQUIREMENTS.md) | Containerisation with Docker, Makefile automation, and deployment to AWS EC2 |

Start with [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the big picture, then the concept guides for implementation details.

---

## Setup

### Prerequisites

- Node.js 20+
- OpenAI API key

### Install and run

```bash
npm install

# development (watch mode)
npm run start:dev

# production
npm run start:prod
```

### Environment variables

Create a `.env` file at the project root:

```env
OPENAI_API_KEY=sk-...
```

### Docker

```bash
# Copy the example and fill in your values, then:
make up
```

---

## API reference

### `POST /cheesecake/ask/stream`

Stream a response about Cheesecake Labs as Server-Sent Events.

**Request body:**
```json
{
  "message": "What services does Cheesecake Labs offer?",
  "conversationId": "optional-uuid-to-continue-a-conversation",
  "userPreferences": {
    "userName": "Alice",
    "industry": "fintech",
    "projectType": "mobile app",
    "companySize": "startup",
    "interests": ["React Native", "AI"]
  }
}
```

**Response:** SSE stream where each event's `data` field contains the accumulated response text so far.

---

## Tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# coverage
npm run test:cov
```
