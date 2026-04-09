import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy",
});

const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "dummy",
});

const OPENAI_MODELS = [
  { id: "gpt-5.2", provider: "openai" },
  { id: "gpt-5-mini", provider: "openai" },
  { id: "gpt-5-nano", provider: "openai" },
  { id: "o4-mini", provider: "openai" },
  { id: "o3", provider: "openai" },
];

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-6", provider: "anthropic" },
  { id: "claude-sonnet-4-6", provider: "anthropic" },
  { id: "claude-haiku-4-5", provider: "anthropic" },
];

const ALL_MODELS = [...OPENAI_MODELS, ...ANTHROPIC_MODELS];

const LARGE_REQUEST_THRESHOLD = 50_000;
const PING_INTERVAL_MS = 5000;
const PING_EVENT = `event: ping\ndata: {"type":"ping"}\n\n`;
const OAI_COMMENT_PING = `: ping\n\n`;

function estimateContentSize(body: Record<string, unknown>): number {
  return JSON.stringify(body).length;
}

function flush(res: Response): void {
  (res as unknown as { flush?: () => void }).flush?.();
}

function maybePing(res: Response, lastPingRef: { t: number }, anthropicFormat: boolean): void {
  const now = Date.now();
  if (now - lastPingRef.t >= PING_INTERVAL_MS) {
    try {
      res.write(anthropicFormat ? PING_EVENT : OAI_COMMENT_PING);
      flush(res);
      lastPingRef.t = now;
    } catch {}
  }
}

function startKeepalive(res: Response, lastPingRef: { t: number }, anthropicFormat: boolean): ReturnType<typeof setInterval> {
  return setInterval(() => {
    maybePing(res, lastPingRef, anthropicFormat);
  }, 2000);
}

function verifyBearer(req: Request, res: Response): boolean {
  const auth = req.headers["authorization"] ?? "";
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const xApiKey = (req.headers["x-api-key"] as string) ?? "";
  const token = bearerToken || xApiKey;
  if (!token || token !== process.env.PROXY_API_KEY) {
    res.status(401).json({ error: { message: "Unauthorized", type: "authentication_error" } });
    return false;
  }
  return true;
}

function isOpenAIModel(model: string): boolean {
  return model.startsWith("gpt-") || model.startsWith("o");
}

function isAnthropicModel(model: string): boolean {
  return model.startsWith("claude-");
}

function extractAnthropicHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const betaHeader = req.headers["anthropic-beta"] as string | undefined;
  if (betaHeader) headers["anthropic-beta"] = betaHeader;
  const versionHeader = req.headers["anthropic-version"] as string | undefined;
  if (versionHeader) headers["anthropic-version"] = versionHeader;
  return headers;
}

type OpenAITool = OpenAI.Chat.Completions.ChatCompletionTool;
type AnthropicTool = Anthropic.Tool;
type OpenAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type AnthropicMessage = Anthropic.MessageParam;

function openAIToolsToAnthropic(tools: OpenAITool[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
}

function openAIToolChoiceToAnthropic(
  choice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined,
): Anthropic.ToolChoice | undefined {
  if (!choice) return undefined;
  if (choice === "auto") return { type: "auto" };
  if (choice === "none") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  if (typeof choice === "object" && choice.function) {
    return { type: "tool", name: choice.function.name };
  }
  return undefined;
}

function openAIMessagesToAnthropic(
  messages: OpenAIMessage[],
): { system?: string; messages: AnthropicMessage[] } {
  let system: string | undefined;
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = typeof msg.content === "string" ? msg.content : "";
      continue;
    }

    if (msg.role === "tool") {
      const last = result[result.length - 1];
      const block: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: msg.tool_call_id ?? "",
        content: typeof msg.content === "string" ? msg.content : "",
      };
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as Anthropic.ToolResultBlockParam[]).push(block);
      } else {
        result.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (msg.role === "assistant") {
      const contentBlocks: Anthropic.ContentBlock[] = [];
      if (typeof msg.content === "string" && msg.content) {
        contentBlocks.push({ type: "text", text: msg.content } as Anthropic.ContentBlock);
      }
      if ("tool_calls" in msg && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.function.arguments);
          } catch {
            input = {};
          }
          contentBlocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
          } as Anthropic.ContentBlock);
        }
      }
      result.push({ role: "assistant", content: contentBlocks as unknown as string });
      continue;
    }

    if (msg.role === "user") {
      const content = typeof msg.content === "string" ? msg.content : "";
      result.push({ role: "user", content });
    }
  }

  return { system, messages: result };
}

function anthropicMessageToOpenAI(msg: Anthropic.Message): OpenAI.Chat.Completions.ChatCompletion {
  const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
  let text = "";

  for (const block of msg.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  const finishReason: "stop" | "tool_calls" =
    msg.stop_reason === "tool_use" ? "tool_calls" : "stop";

  return {
    id: msg.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: msg.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          refusal: null,
        },
        finish_reason: finishReason,
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: msg.usage.input_tokens,
      completion_tokens: msg.usage.output_tokens,
      total_tokens: msg.usage.input_tokens + msg.usage.output_tokens,
    },
  };
}

router.get("/models", (req: Request, res: Response) => {
  if (!verifyBearer(req, res)) return;

  const now = Math.floor(Date.now() / 1000);
  res.json({
    object: "list",
    data: ALL_MODELS.map((m) => ({
      id: m.id,
      object: "model",
      created: now,
      owned_by: m.provider,
    })),
  });
});

router.post("/chat/completions", async (req: Request, res: Response) => {
  if (!verifyBearer(req, res)) return;

  const body = req.body as {
    model: string;
    messages: OpenAIMessage[];
    stream?: boolean;
    tools?: OpenAITool[];
    tool_choice?: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    metadata?: unknown;
    stop_sequences?: string[];
    thinking?: unknown;
    [key: string]: unknown;
  };

  const { model, messages, stream: streamRequested, tools, tool_choice, max_tokens: _mt, temperature, top_p, top_k, metadata, stop_sequences, thinking, ...restBody } = body;

  const isLarge = estimateContentSize(body as unknown as Record<string, unknown>) > LARGE_REQUEST_THRESHOLD;
  const stream = streamRequested || isLarge;

  if (!model) {
    res.status(400).json({ error: { message: "model is required", type: "invalid_request_error" } });
    return;
  }

  try {
    if (isOpenAIModel(model)) {
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const lastPingRef = { t: Date.now() };
        const keepalive = startKeepalive(res, lastPingRef, false);
        req.on("close", () => clearInterval(keepalive));

        try {
          const streamReq = await openai.chat.completions.create({
            ...body,
            stream: true,
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);

          for await (const chunk of streamReq) {
            maybePing(res, lastPingRef, false);
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            flush(res);
          }

          res.write("data: [DONE]\n\n");
          res.end();
        } finally {
          clearInterval(keepalive);
        }
      } else {
        const completion = await openai.chat.completions.create({
          ...body,
          stream: false,
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
        res.json(completion);
      }
    } else if (isAnthropicModel(model)) {
      const extraHeaders = extractAnthropicHeaders(req);
      const { system, messages: anthropicMessages } = openAIMessagesToAnthropic(messages);
      const anthropicTools = tools ? openAIToolsToAnthropic(tools) : undefined;
      const anthropicToolChoice = openAIToolChoiceToAnthropic(tool_choice);
      const maxTokens = body.max_tokens ?? 8192;

      const anthropicParams: Anthropic.Messages.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        ...(system ? { system } : {}),
        ...(anthropicTools ? { tools: anthropicTools } : {}),
        ...(anthropicToolChoice ? { tool_choice: anthropicToolChoice } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(top_p !== undefined ? { top_p } : {}),
        ...(top_k !== undefined ? { top_k } : {}),
        ...(metadata !== undefined ? { metadata: metadata as Anthropic.Messages.MessageCreateParamsNonStreaming["metadata"] } : {}),
        ...(stop_sequences !== undefined ? { stop_sequences } : {}),
        ...(thinking !== undefined ? { thinking: thinking as Anthropic.ThinkingConfigParam } : {}),
        stream: false,
      };

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const lastPingRef = { t: Date.now() };
        const keepalive = startKeepalive(res, lastPingRef, true);
        req.on("close", () => clearInterval(keepalive));

        try {
          const rawStream = await anthropic.messages.create(
            { ...anthropicParams, stream: true },
            { headers: extraHeaders },
          );

          for await (const event of rawStream) {
            maybePing(res, lastPingRef, true);
            res.write(`data: ${JSON.stringify(event)}\n\n`);
            flush(res);
          }

          res.write("data: [DONE]\n\n");
          res.end();
        } finally {
          clearInterval(keepalive);
        }
      } else {
        const finalMessage = await anthropic.messages.create(
          { ...anthropicParams, stream: false },
          { headers: extraHeaders },
        );
        const oaiResponse = anthropicMessageToOpenAI(finalMessage);
        res.json(oaiResponse);
      }
    } else {
      res.status(400).json({ error: { message: `Unknown model: ${model}`, type: "invalid_request_error" } });
    }
  } catch (err) {
    logger.error({ err }, "Proxy error in /v1/chat/completions");
    if (!res.headersSent) {
      res.status(500).json({ error: { message: "Internal server error", type: "server_error" } });
    }
  }
});

type AnthropicNativeMessage = {
  model: string;
  messages: AnthropicMessage[];
  system?: string | Anthropic.Messages.SystemBlockParam[];
  tools?: AnthropicTool[];
  tool_choice?: Anthropic.ToolChoice;
  max_tokens?: number;
  stream?: boolean;
  thinking?: Anthropic.ThinkingConfigParam;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  metadata?: Anthropic.Messages.MessageCreateParamsNonStreaming["metadata"];
  stop_sequences?: string[];
  betas?: string[];
  [key: string]: unknown;
};

function sanitizeMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant") return msg;
    if (!Array.isArray(msg.content)) return msg;
    const filtered = (msg.content as Array<Record<string, unknown>>).filter(
      (block) => block.type !== "thinking" && block.type !== "redacted_thinking",
    );
    if (filtered.length === 0) {
      return { ...msg, content: [{ type: "text", text: "" }] };
    }
    return { ...msg, content: filtered };
  });
}

function writeSSEError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  try {
    const errorEvent = {
      type: "error",
      error: { type: "api_error", message },
    };
    res.write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
    flush(res);
  } catch {}
}

router.post("/messages", async (req: Request, res: Response) => {
  if (!verifyBearer(req, res)) return;

  const body = req.body as AnthropicNativeMessage;
  const {
    model,
    messages: anthropicMessages,
    system,
    tools,
    tool_choice,
    stream: streamRequested,
    max_tokens,
    thinking,
    temperature,
    top_p,
    top_k,
    metadata,
    stop_sequences,
    betas,
  } = body;

  const maxTokens = max_tokens ?? 8192;

  const isLarge = estimateContentSize(body as unknown as Record<string, unknown>) > LARGE_REQUEST_THRESHOLD;
  const stream = streamRequested || isLarge;

  if (!model) {
    res.status(400).json({ error: { message: "model is required", type: "invalid_request_error" } });
    return;
  }

  const extraHeaders = extractAnthropicHeaders(req);
  if (betas) {
    const existing = extraHeaders["anthropic-beta"] ?? "";
    const merged = existing ? `${existing},${betas.join(",")}` : betas.join(",");
    extraHeaders["anthropic-beta"] = merged;
  }

  try {
    if (isAnthropicModel(model)) {
      const cleanedMessages = sanitizeMessages(anthropicMessages);
      const anthropicParams: Anthropic.Messages.MessageCreateParams = {
        model,
        max_tokens: maxTokens,
        messages: cleanedMessages,
        ...(system !== undefined ? { system } : {}),
        ...(tools ? { tools } : {}),
        ...(tool_choice ? { tool_choice } : {}),
        ...(thinking !== undefined ? { thinking } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(top_p !== undefined ? { top_p } : {}),
        ...(top_k !== undefined ? { top_k } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        ...(stop_sequences !== undefined ? { stop_sequences } : {}),
        stream: false,
      };

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const lastPingRef = { t: Date.now() };
        const keepalive = startKeepalive(res, lastPingRef, true);
        req.on("close", () => clearInterval(keepalive));

        try {
          const rawStream = await anthropic.messages.create(
            { ...anthropicParams, stream: true },
            { headers: extraHeaders },
          );

          for await (const event of rawStream) {
            maybePing(res, lastPingRef, true);
            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            flush(res);
          }

          res.end();
        } catch (streamErr) {
          clearInterval(keepalive);
          logger.error({ err: streamErr }, "Stream error in /v1/messages");
          writeSSEError(res, streamErr);
          res.end();
          return;
        } finally {
          clearInterval(keepalive);
        }
      } else {
        const finalMessage = await anthropic.messages.create(
          { ...anthropicParams, stream: false },
          { headers: extraHeaders },
        );
        res.json(finalMessage);
      }
    } else if (isOpenAIModel(model)) {
      const openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (system && typeof system === "string") {
        openAIMessages.push({ role: "system", content: system });
      }
      for (const m of anthropicMessages) {
        if (typeof m.content === "string") {
          openAIMessages.push({ role: m.role as "user" | "assistant", content: m.content });
        }
      }

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const lastPingRef = { t: Date.now() };
        const keepalive = startKeepalive(res, lastPingRef, true);
        req.on("close", () => clearInterval(keepalive));

        try {
          const oaiStream = await openai.chat.completions.create({
            model,
            messages: openAIMessages,
            max_tokens: maxTokens,
            stream: true,
          });

          const msgId = `msg_${Date.now()}`;
          res.write(`event: message_start\ndata: ${JSON.stringify({
            type: "message_start",
            message: { id: msgId, type: "message", role: "assistant", content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } }
          })}\n\n`);
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`);
          res.write(`event: ping\ndata: ${JSON.stringify({ type: "ping" })}\n\n`);

          for await (const chunk of oaiStream) {
            maybePing(res, lastPingRef, true);
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) {
              const event = { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: delta } };
              res.write(`event: content_block_delta\ndata: ${JSON.stringify(event)}\n\n`);
              flush(res);
            }
          }

          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
          res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`);
          res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
          res.end();
        } finally {
          clearInterval(keepalive);
        }
      } else {
        const completion = await openai.chat.completions.create({
          model,
          messages: openAIMessages,
          max_tokens: maxTokens,
          stream: false,
        });

        const text = completion.choices[0]?.message?.content ?? "";
        const anthropicResponse: Anthropic.Message = {
          id: completion.id,
          type: "message",
          role: "assistant",
          content: [{ type: "text", text }],
          model: completion.model,
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: completion.usage?.prompt_tokens ?? 0,
            output_tokens: completion.usage?.completion_tokens ?? 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        };
        res.json(anthropicResponse);
      }
    } else {
      res.status(400).json({ error: { message: `Unknown model: ${model}`, type: "invalid_request_error" } });
    }
  } catch (err) {
    logger.error({ err }, "Proxy error in /v1/messages");
    if (!res.headersSent) {
      res.status(500).json({ error: { message: "Internal server error", type: "server_error" } });
    } else {
      writeSSEError(res, err);
      try { res.end(); } catch {}
    }
  }
});

export default router;
