import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  validateCaptionRequest,
  formatCaption,
  generateCaption,
} from "../server/captions.js";
import { createMiniMaxMiddleware } from "../server/minimax.js";
import { validateProject, defaults } from "../src/model.js";
import { plainCaption } from "../src/caption-model.js";

const input = {
  source:
    "Código ID: 12238\nApartamento en Cartagena con 4 alcobas, 5 baños y 212 m².",
  reference: "999",
  phone: "3106573536",
  website: "https://gocartagenarealestate.com/",
  city: "Cartagena",
};
const content = JSON.stringify({
  title: "🏡 EN VENTA | Cartagena",
  introduction: "Apartamento con amplios espacios.",
  features: ["📐 212 m²", "🛏️ 4 alcobas", "🚿 5 baños"],
  building: "",
  cta: "",
  hashtags: ["#Cartagena", "#Cartagena", "<script>"],
});
const response = () =>
  Response.json({
    choices: [
      {
        finish_reason: "stop",
        message: { content, reasoning_content: "private reasoning" },
      },
    ],
  });
const testKey = "sk-cp-test-only-not-a-real-secret";

test("source ID is validated against the publication and invalid refinements are rejected", () => {
  assert.equal(validateCaptionRequest(input).reference, "12238");
  assert.throws(
    () => validateCaptionRequest({ ...input, action: "shorter" }),
    /antes de ajustarla/,
  );
  assert.throws(
    () => validateCaptionRequest({ ...input, publicationCode: "999" }),
    /publicación 999/,
  );
  assert.throws(
    () => validateCaptionRequest({ source: "a".repeat(18001) }),
    /18.000/,
  );
});
test("formatted publication includes exact contact, emoji lines and no reasoning", () => {
  const text = formatCaption(
    `<think>private reasoning</think>\n\`\`\`json\n${content}\n\`\`\``,
    validateCaptionRequest(input),
  );
  assert.match(text, /Código ID:\*\* 12238/);
  assert.match(text, /3106573536/);
  assert.match(text, /📐 212 m²\n🛏️ 4 alcobas/);
  assert.doesNotMatch(text, /private reasoning|script|999/);
  assert.doesNotMatch(text, /https?:|www\./);
  assert.equal(text.match(/#Cartagena/g).length, 1);
  assert.doesNotMatch(plainCaption(text), /\*\*/);
  assert.throws(() => formatCaption('{"title":"unfinished', input), /formato/);
});
test("legacy and newly generated descriptions exclude web links", () => {
  const project = validateProject({
    version: 1,
    settings: defaults,
    photos: [],
    description: {
      website: input.website,
      output: `**Mi anuncio**\n\n${input.website}\n\n#Cartagena`,
    },
  });
  assert.equal("website" in project.description, false);
  assert.doesNotMatch(project.description.output, /https?:/);
  const text = formatCaption(
    JSON.stringify({
      ...JSON.parse(content),
      cta: "Visita https://example.com y www.example.com",
    }),
    validateCaptionRequest(input),
  );
  assert.doesNotMatch(text, /https?:|www\./);
});
test("provider receives subscription credential only via Authorization; output excludes it", async () => {
  const result = await generateCaption({
    apiKey: testKey,
    model: "MiniMax-M2.7",
    data: validateCaptionRequest(input),
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.minimax.io/v1/chat/completions");
      assert.equal(options.headers.Authorization, `Bearer ${testKey}`);
      assert.equal(options.redirect, "error");
      const request = JSON.parse(options.body);
      assert.equal(
        JSON.parse(request.messages[1].content).propertySheet,
        input.source,
      );
      assert.equal(request.reasoning_split, true);
      assert.doesNotMatch(options.body, /sk-cp/);
      return response();
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /sk-cp|reasoning/);
});
test("provider authentication, quota and truncated response failures stay actionable without exposing upstream body", async () => {
  for (const status of [401, 429, 500])
    await assert.rejects(
      generateCaption({
        apiKey: testKey,
        model: "MiniMax-M2.7",
        data: input,
        fetchImpl: async () => new Response(testKey, { status }),
      }),
      (error) => !error.message.includes(testKey) && error.status >= 400,
    );
  await assert.rejects(
    generateCaption({
      apiKey: testKey,
      model: "MiniMax-M2.7",
      data: input,
      fetchImpl: async () =>
        Response.json({ choices: [{ finish_reason: "length" }] }),
    }),
    /límite de respuesta/,
  );
});
test("portable projects preserve descriptions but never configuration credentials", () => {
  const project = validateProject({
    version: 1,
    settings: defaults,
    photos: [],
    apiKey: testKey,
    description: { ...input, output: "**Mi anuncio**", apiKey: testKey },
  });
  assert.equal(project.description.output, "**Mi anuncio**");
  assert.equal(project.description.source, input.source);
  assert.doesNotMatch(JSON.stringify(project), /sk-cp|apiKey/);
  assert.equal(
    validateProject({ version: 1, settings: defaults, photos: [] }).description
      .output,
    "",
  );
});

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "piezas-test-"));
  let middleware = createMiniMaxMiddleware({
    root,
    fetchImpl: async () => response(),
    ...options,
  });
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    base,
    restart() {
      middleware = createMiniMaxMiddleware({
        root,
        fetchImpl: async () => response(),
        ...options,
      });
    },
    async post(route, data, headers = {}) {
      return fetch(`${base}/api/ai/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(data),
      });
    },
  };
}
test("local API keeps credentials private, persists only on request, and rejects cross-site writes", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await (await fetch(`${f.base}/api/ai/config`)).json()).configured,
    false,
  );
  assert.equal((await f.post("generate", input)).status, 400);
  assert.equal(
    (await f.post("config", { apiKey: "sk-paygo-key" })).status,
    400,
  );
  assert.equal(
    (await f.post("config", {}, { Origin: "https://evil.example" })).status,
    403,
  );
  assert.equal((await f.post("config", null)).status, 400);
  let res = await f.post("config", {
    apiKey: testKey,
    model: "MiniMax-M2.7",
    remember: true,
  });
  assert.equal(res.status, 200);
  assert.doesNotMatch(await res.text(), /sk-cp/);
  assert.equal(
    JSON.parse(await readFile(path.join(f.root, ".local/minimax.json"), "utf8"))
      .apiKey,
    testKey,
  );
  f.restart();
  assert.equal(
    (await (await fetch(`${f.base}/api/ai/config`)).json()).configured,
    true,
  );
  res = await f.post("generate", input);
  assert.equal(res.status, 200);
  const output = await res.json();
  assert.match(output.text, /12238/);
  assert.equal(
    (
      await f.post("generate", {
        ...input,
        action: "shorter",
        current: output.text,
      })
    ).status,
    200,
  );
  await f.post("config", { model: "MiniMax-M2.7", remember: false });
  await assert.rejects(readFile(path.join(f.root, ".local/minimax.json")), {
    code: "ENOENT",
  });
  f.restart();
  assert.equal(
    (await (await fetch(`${f.base}/api/ai/config`)).json()).configured,
    false,
  );
});
test("timeouts release the generation lock and provider requests are abortable", async (t) => {
  const f = await fixture(t, {
    timeoutMs: 40,
    fetchImpl: async (_url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
  });
  await f.post("config", { apiKey: testKey, model: "MiniMax-M2.7" });
  for (let i = 0; i < 2; i++)
    assert.equal((await f.post("generate", input)).status, 504);
});
