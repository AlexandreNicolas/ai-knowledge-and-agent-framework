import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { createAgent, createMiddleware } from "langchain";
import { MemorySaver, REMOVE_ALL_MESSAGES } from "@langchain/langgraph";
import { BaseMessage, RemoveMessage } from "@langchain/core/messages";
import * as z from "zod";
import { tool } from "@langchain/core/tools";

import { CreateCheesecakeDto } from './dto/create-cheesecake.dto';
import { UpdateCheesecakeDto } from './dto/update-cheesecake.dto';
import { AskCheesecakeDto } from './dto/ask-cheesecake.dto';
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { SystemMessage } from "@langchain/core/messages";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small"
});

const vectorStore = new MemoryVectorStore(embeddings);
const checkpointer = new MemorySaver();

const SITE_URL = 'https://cheesecakelabs.com';
const P_TAG_SELECTOR = 'p';

/** Cheesecake Labs client id; used to build thread_id until auth provides it. */
const CHEESECAKE_CLIENT_ID = 'cheesecake-labs';
/** Placeholder when auth is not implemented; replace with userId from auth. */
const ANONYMOUS_USER_ID = 'anonymous';

/** Keeps first message (e.g. system) + last N messages to stay within context limits. */
const MAX_RECENT_MESSAGES = 10;

const trimMessagesMiddleware = createMiddleware({
  name: 'TrimMessages',
  beforeModel: (state: { messages?: BaseMessage[] }) => {
    const messages = state.messages ?? [];
    if (messages.length <= MAX_RECENT_MESSAGES + 1) {
      return;
    }
    const firstMsg = messages[0];
    const recentMessages = messages.slice(-MAX_RECENT_MESSAGES);
    const newMessages: BaseMessage[] = [firstMsg, ...recentMessages];
    return {
      messages: [
        new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
        ...newMessages,
      ],
    };
  },
});


@Injectable()
export class CheesecakeService {

  /**
   * Builds thread_id for short-term memory. Same thread_id = same conversation.
   * When auth is added, pass clientId and userId from the auth layer.
   */
  private buildThreadId(conversationId: string): string {
    return `${CHEESECAKE_CLIENT_ID}:${ANONYMOUS_USER_ID}:${conversationId}`;
  }

  /**
   * Builds user message enriched with preferences context for personalized responses.
   */
  private buildUserMessage(askCheesecakeDto: AskCheesecakeDto): string {
    const prefs = askCheesecakeDto.userPreferences;
    if (!prefs || Object.keys(prefs).length === 0) {
      return askCheesecakeDto.message;
    }
    const parts: string[] = [];
    if (prefs.userName) parts.push(`Name: ${prefs.userName}`);
    if (prefs.interests?.length) parts.push(`Interests: ${prefs.interests.join(', ')}`);
    if (prefs.industry) parts.push(`Industry: ${prefs.industry}`);
    if (prefs.projectType) parts.push(`Project type: ${prefs.projectType}`);
    if (prefs.companySize) parts.push(`Company size: ${prefs.companySize}`);
    const context = parts.length ? `[User context: ${parts.join('; ')}]\n\n` : '';
    return `${context}Question: ${askCheesecakeDto.message}`;
  }

  /** Non-streaming ask: runs RAG and returns the full response. */
  async ask(askCheesecakeDto: AskCheesecakeDto): Promise<string> {
    const conversationId = askCheesecakeDto.conversationId ?? randomUUID();
    const threadId = this.buildThreadId(conversationId);
    const agent = await this.getAgent();
    const userMessage = this.buildUserMessage(askCheesecakeDto);
    const stream = await agent.stream(
      { messages: [{ role: 'user', content: userMessage }] },
      { streamMode: 'values', configurable: { thread_id: threadId } },
    );
    let response = '';
    for await (const step of stream) {
      const lastMessage = step.messages.at(-1);
      if (lastMessage?.name === 'model') {
        response += lastMessage.content;
      }
    }
    return response;
  }

  /**
   * SSE streaming: each token/chunk is pushed immediately.
   * Client can use EventSource (GET) or fetch with ReadableStream.
   * Send conversationId in body to continue the same conversation (short-term memory).
   */
  askStream(askCheesecakeDto: AskCheesecakeDto): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      (async () => {
        try {
          const conversationId = askCheesecakeDto.conversationId ?? randomUUID();
          const threadId = this.buildThreadId(conversationId);
          const agent = await this.getAgent();
          const userMessage = this.buildUserMessage(askCheesecakeDto);
          const stream = await agent.stream(
            { messages: [{ role: 'user', content: userMessage }] },
            {
              streamMode: 'messages',
              configurable: { thread_id: threadId },
            },
          );

          let accumulated = "";
          for await (const [token, metadata] of stream) {
            if (token.content && token.name !== 'retrieve') {
              accumulated += token.content;
              subscriber.next({ data: accumulated } as MessageEvent);
            }
          }
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
        }
      })();
    });
  }

  /** Load site, split, add to vector store, create retrieve tool and agent. */
  private async getAgent() {
    const cheerioLoader = new CheerioWebBaseLoader(SITE_URL, {
      selector: P_TAG_SELECTOR,
    });
    const docs = await cheerioLoader.load();
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const allSplits = await splitter.splitDocuments(docs);
    await vectorStore.addDocuments(allSplits);

    const retrieveSchema = z.object({ query: z.string() });
    const retrieve = tool(
      async ({ query }) => {
        const retrievedDocs = await vectorStore.similaritySearch(query, 2);

        const context = retrievedDocs
          .map((doc) => doc.pageContent)
          .join('\n\n');

        return context;
      },
      {
        name: 'retrieve',
        description: 'Retrieve relevant context to answer the user question.',
        schema: retrieveSchema,
        responseFormat: 'content',
      },
    );

    const systemPrompt = new SystemMessage(
      `You are Cheesecake AI, a helpful assistant specialized in Cheesecake Labs — a digital product studio.
Your goal is to help users learn about Cheesecake Labs' services, expertise, portfolio, team, and how they can work together.
Always:
- Ask clarifying questions when context is missing
- Explain Cheesecake Labs' capabilities and how they can help the user's specific needs
- Base answers on real content from the Cheesecake Labs website
- Highlight relevant case studies, services, or technologies when applicable
- Use the retrieve tool to find accurate information before answering
- Only answer questions related to Cheesecake Labs and its services
- Keep responses concise and direct, in markdown format
- When the user provides [User context: ...] with preferences (name, interests, industry, project type, company size), use that information to personalize responses and highlight the most relevant services or case studies for their profile.`
    );

    const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

    return createAgent({
      model: llm,
      tools: [retrieve],
      systemPrompt,
      checkpointer,
      middleware: [trimMessagesMiddleware],
    });
  }


  create(createCheesecakeDto: CreateCheesecakeDto) {
    return 'This action adds a new cheesecake';
  }

  findAll() {
    return `This action returns all cheesecake`;
  }

  findOne(id: number) {
    return `This action returns a #${id} cheesecake`;
  }

  update(id: number, updateCheesecakeDto: UpdateCheesecakeDto) {
    return `This action updates a #${id} cheesecake`;
  }

  remove(id: number) {
    return `This action removes a #${id} cheesecake`;
  }
}
