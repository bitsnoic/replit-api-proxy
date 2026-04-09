import { useState, useEffect, useCallback } from "react";

const DARK_BG = "hsl(222, 47%, 11%)";
const CARD_BG = "hsl(222, 47%, 15%)";
const BORDER = "hsl(222, 47%, 22%)";
const TEXT = "hsl(210, 40%, 96%)";
const MUTED = "hsl(215, 16%, 57%)";
const OPENAI_BLUE = "#3B82F6";
const ANTHROPIC_ORANGE = "#F97316";
const SUCCESS_GREEN = "#22C55E";

const models = [
  { id: "gpt-5.2", provider: "OpenAI" },
  { id: "gpt-5-mini", provider: "OpenAI" },
  { id: "gpt-5-nano", provider: "OpenAI" },
  { id: "o4-mini", provider: "OpenAI" },
  { id: "o3", provider: "OpenAI" },
  { id: "claude-opus-4-6", provider: "Anthropic" },
  { id: "claude-sonnet-4-6", provider: "Anthropic" },
  { id: "claude-haiku-4-5", provider: "Anthropic" },
];

const endpoints = [
  {
    method: "GET",
    path: "/v1/models",
    type: "Both",
    description: "List all available models from OpenAI and Anthropic",
  },
  {
    method: "POST",
    path: "/v1/chat/completions",
    type: "OpenAI",
    description: "OpenAI-compatible chat completions. Supports streaming, tool calls, and both OpenAI and Anthropic models.",
  },
  {
    method: "POST",
    path: "/v1/messages",
    type: "Anthropic",
    description: "Anthropic Messages API native format. Supports streaming, tool calls, and both Claude and OpenAI models.",
  },
];

const steps = [
  {
    n: 1,
    title: "Add Provider",
    desc: 'In CherryStudio, go to Settings > Model Providers > click "+" to add a new provider.',
  },
  {
    n: 2,
    title: "Choose Format",
    desc: 'Select "OpenAI" as the provider type for /v1/chat/completions, or "Anthropic" for /v1/messages native format.',
  },
  {
    n: 3,
    title: "Enter Base URL & Key",
    desc: "Set the API Base URL to your deployment domain (e.g. https://your-app.replit.app) and paste your PROXY_API_KEY as the API Key.",
  },
  {
    n: 4,
    title: "Start Chatting",
    desc: "Pick any model from the list above. All requests are proxied via Replit AI Integrations -- no personal API keys needed.",
  },
];

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve) => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    resolve();
  });
}

function CopyButton({ text, style }: { text: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={{
        background: copied ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.12)",
        color: copied ? SUCCESS_GREEN : OPENAI_BLUE,
        border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(59,130,246,0.3)"}`,
        borderRadius: 6,
        padding: "4px 12px",
        fontSize: 12,
        cursor: "pointer",
        transition: "all 0.2s",
        fontWeight: 500,
        ...style,
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function MethodBadge({ method }: { method: string }) {
  const bg = method === "GET" ? "rgba(34,197,94,0.15)" : "rgba(168,85,247,0.15)";
  const color = method === "GET" ? SUCCESS_GREEN : "#A855F7";
  const border = method === "GET" ? "rgba(34,197,94,0.3)" : "rgba(168,85,247,0.3)";
  return (
    <span style={{ background: bg, color, border: `1px solid ${border}`, borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>
      {method}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    OpenAI: { bg: "rgba(59,130,246,0.12)", color: OPENAI_BLUE, border: "rgba(59,130,246,0.3)" },
    Anthropic: { bg: "rgba(249,115,22,0.12)", color: ANTHROPIC_ORANGE, border: "rgba(249,115,22,0.3)" },
    Both: { bg: "rgba(100,116,139,0.15)", color: "#94A3B8", border: "rgba(100,116,139,0.3)" },
  };
  const s = map[type] ?? map["Both"];
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 500 }}>
      {type}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const isOpenAI = provider === "OpenAI";
  return (
    <span style={{
      background: isOpenAI ? "rgba(59,130,246,0.12)" : "rgba(249,115,22,0.12)",
      color: isOpenAI ? OPENAI_BLUE : ANTHROPIC_ORANGE,
      border: `1px solid ${isOpenAI ? "rgba(59,130,246,0.3)" : "rgba(249,115,22,0.3)"}`,
      borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 500,
    }}>
      {provider}
    </span>
  );
}

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null);
  const baseUrl = window.location.origin;

  useEffect(() => {
    fetch("/api/healthz")
      .then((r) => setOnline(r.ok))
      .catch(() => setOnline(false));
  }, []);

  const curlExample = `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_PROXY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5.2",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'`;

  return (
    <div style={{ minHeight: "100vh", background: DARK_BG, color: TEXT, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.5, marginBottom: 8 }}>
            AI Proxy Gateway
          </h1>
          <p style={{ color: MUTED, fontSize: 16, marginBottom: 16 }}>
            Dual-compatible OpenAI + Anthropic reverse proxy powered by Replit AI Integrations
          </p>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: online === true ? "rgba(34,197,94,0.12)" : online === false ? "rgba(239,68,68,0.12)" : "rgba(100,116,139,0.12)",
            color: online === true ? SUCCESS_GREEN : online === false ? "#EF4444" : MUTED,
            border: `1px solid ${online === true ? "rgba(34,197,94,0.3)" : online === false ? "rgba(239,68,68,0.3)" : "rgba(100,116,139,0.3)"}`,
            borderRadius: 20, padding: "6px 16px", fontSize: 13, fontWeight: 500,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />
            {online === null ? "Checking..." : online ? "Online" : "Offline"}
          </span>
        </div>

        {/* Connection Details */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Connection Details</h2>
          {[
            { label: "Base URL", value: baseUrl },
            { label: "Authorization Header", value: "Bearer YOUR_PROXY_API_KEY" },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
              <div>
                <div style={{ color: MUTED, fontSize: 12, marginBottom: 4 }}>{row.label}</div>
                <code style={{ fontSize: 14, color: TEXT, background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: 4 }}>
                  {row.value}
                </code>
              </div>
              <CopyButton text={row.value} />
            </div>
          ))}
        </div>

        {/* API Endpoints */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>API Endpoints</h2>
          {endpoints.map((ep) => (
            <div key={ep.path} style={{ padding: "16px 0", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <MethodBadge method={ep.method} />
                <code style={{ fontSize: 14, color: TEXT, background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: 4 }}>
                  {baseUrl}{ep.path}
                </code>
                <TypeBadge type={ep.type} />
              </div>
              <p style={{ color: MUTED, fontSize: 13, margin: 0, lineHeight: 1.5 }}>{ep.description}</p>
            </div>
          ))}
        </div>

        {/* Available Models */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Available Models</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {models.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px" }}>
                <code style={{ fontSize: 13, color: TEXT }}>
                  {m.id}
                </code>
                <ProviderBadge provider={m.provider} />
              </div>
            ))}
          </div>
        </div>

        {/* CherryStudio Setup */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>CherryStudio Setup Guide</h2>
          <div style={{ display: "grid", gap: 16 }}>
            {steps.map((step) => (
              <div key={step.n} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{
                  minWidth: 32, height: 32, borderRadius: "50%",
                  background: "rgba(59,130,246,0.15)", color: OPENAI_BLUE,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700,
                }}>
                  {step.n}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{step.title}</div>
                  <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.5 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Test */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Quick Test (curl)</h2>
            <CopyButton text={curlExample} />
          </div>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 16, overflow: "auto" }}>
            <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, fontFamily: "'Fira Code', 'JetBrains Mono', monospace", color: TEXT, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              <span style={{ color: MUTED }}>bash</span>{"\n"}
              {curlExample.split("\n").map((line, i) => {
                if (line.startsWith("curl ")) {
                  return (
                    <span key={i}>
                      <span style={{ color: SUCCESS_GREEN }}>curl</span>
                      <span>{line.slice(4)}</span>
                      {"\n"}
                    </span>
                  );
                }
                if (line.trimStart().startsWith("-H ")) {
                  const flagIdx = line.indexOf("-H");
                  const flag = line.slice(0, flagIdx + 2);
                  const rest = line.slice(flagIdx + 2);
                  return (
                    <span key={i}>
                      <span style={{ color: OPENAI_BLUE }}>{flag}</span>
                      <span style={{ color: ANTHROPIC_ORANGE }}>{rest}</span>
                      {"\n"}
                    </span>
                  );
                }
                if (line.trimStart().startsWith("-d ")) {
                  const flagIdx = line.indexOf("-d");
                  return (
                    <span key={i}>
                      <span style={{ color: OPENAI_BLUE }}>{line.slice(0, flagIdx + 2)}</span>
                      <span style={{ color: ANTHROPIC_ORANGE }}>{line.slice(flagIdx + 2)}</span>
                      {"\n"}
                    </span>
                  );
                }
                return <span key={i}>{line}{"\n"}</span>;
              })}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", color: MUTED, fontSize: 12, padding: "24px 0" }}>
          Powered by Replit AI Integrations
        </div>
      </div>
    </div>
  );
}
