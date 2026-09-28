import type { FastifyInstance } from "fastify";
import { z } from "zod";
import path from "node:path";
import { agentEnv } from "@shuacrew/core/redact";
import { teachingCompletion, type Runtime } from "@shuacrew/runtimes";
import type { Supervisor } from "./runs.js";
import { TeachingStore, TeachingEngine, TeachingRequestSchema } from "./teaching.js";
const Change = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    action: z.enum(["select", "step", "label", "move", "undo", "redo", "clearAnnotations"]),
    id: z.string().max(80).optional(),
    label: z.string().max(600).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
  })
  .strict();
export function teachingRoutes(
  app: FastifyInstance,
  deps: { home: string; runtimes: Map<string, Runtime>; supervisor: Supervisor },
) {
  const store = new TeachingStore(path.join(deps.home, "teaching", "lessons.json"));
  const cwd = path.join(deps.home, "teaching");
  const engine = new TeachingEngine(store, async (input) => {
    const runtime = deps.runtimes.get("claude");
    if (!runtime || runtime.authMode !== "subscription")
      throw new Error("Visual teaching needs the existing Claude subscription connection");
    return teachingCompletion({ ...input, cwd, env: agentEnv(process.env, "subscription") });
  });
  const snapshot = () => {
    const state = store.snapshot();
    return { ...state, busy: state.active ? engine.busy(state.active) : false };
  };
  const guarded = (fn: () => unknown, reply: any) => {
    try {
      return fn();
    } catch (e) {
      return reply.code(/Stale|changed/.test(String(e)) ? 409 : 400).send({ error: (e as Error).message });
    }
  };
  const stopPractice = () => {
    for (const lesson of store.snapshot().lessons) {
      const d = store.get(lesson.id);
      if (d.practice.active) {
        engine.cancel(lesson.id);
        store.commit(
          lesson.id,
          d.revision,
          (doc) => ({
            ...doc,
            annotations: [],
            practice: { ...doc.practice, active: false, status: "paused" },
          }),
          false,
        );
      }
    }
  };
  app.post<{ Params: { id: string } }>("/api/teaching/:id/practice", async (q, r) => {
    try {
      const body = z
        .object({
          active: z.boolean(),
          baseRevision: z.number().int(),
          displayId: z.number().int().optional(),
          model: z.string().max(100).optional(),
        })
        .strict()
        .parse(q.body);
      const current = store.get(q.params.id);
      if (current.revision !== body.baseRevision) throw new Error("Stale lesson revision");
      if (body.active) {
        if (store.snapshot().active !== q.params.id || !current.stepId || body.displayId === undefined)
          throw new Error("Open a lesson step and choose a display first");
        if (engine.busy(q.params.id)) throw new Error("Wait for the current teaching turn");
        const runtime = deps.runtimes.get("claude");
        if (!runtime) throw new Error("Claude is not connected");
        deps.supervisor.updateRuntimeStatus(runtime.id, await runtime.status());
        const choice = deps.supervisor.intelligence({
          ask: "Verify guided screen practice",
          mode: "auto",
          purpose: "conversation",
          images: true,
          tier: "balanced",
          preferredRuntime: "claude",
          preferredModel: body.model,
        });
        if (!choice.runtime) throw new Error(choice.reason);
        store.commit(
          q.params.id,
          body.baseRevision,
          (d) => ({
            ...d,
            practice: {
              ...d.practice,
              active: true,
              status: "waiting",
              stepId: d.stepId,
              eventId: null,
              feedback: "Ready. Try the current step; I’ll check the visible result.",
              displayId: body.displayId!,
              model: choice.model ?? null,
            },
          }),
          false,
        );
      } else {
        engine.cancel(q.params.id);
        store.commit(
          q.params.id,
          body.baseRevision,
          (d) => ({ ...d, annotations: [], practice: { ...d.practice, active: false, status: "paused" } }),
          false,
        );
      }
      return snapshot();
    } catch (e) {
      return r.code(400).send({ error: (e as Error).message });
    }
  });
  app.post<{ Params: { id: string } }>("/api/teaching/:id/observe", async (q, r) => {
    try {
      await engine.observe(q.params.id, q.body);
      return snapshot();
    } catch (e) {
      return r.code(400).send({ error: (e as Error).message });
    }
  });
  app.get("/api/teaching", async () => snapshot());
  app.get("/api/teaching/check", async () => {
    const s = store.check();
    return { ...s, busy: s.active ? engine.busy(s.active) : false };
  });
  app.post("/api/teaching/new", async (_q, r) =>
    guarded(() => {
      stopPractice();
      store.create();
      return snapshot();
    }, r),
  );
  app.post<{ Params: { id: string } }>("/api/teaching/:id/load", async (q, r) =>
    guarded(() => {
      stopPractice();
      store.load(q.params.id);
      return snapshot();
    }, r),
  );
  app.post("/api/teaching/import", async (q, r) =>
    guarded(() => {
      stopPractice();
      store.import(q.body);
      return snapshot();
    }, r),
  );
  app.post<{ Params: { id: string } }>("/api/teaching/:id/cancel", async (q) => {
    engine.cancel(q.params.id);
    return snapshot();
  });
  app.post<{ Params: { id: string } }>("/api/teaching/:id/change", async (q, r) =>
    guarded(() => {
      const change = Change.parse(q.body),
        id = q.params.id;
      if (change.action === "undo" || change.action === "redo")
        store.history(id, change.baseRevision, change.action);
      else
        store.commit(
          id,
          change.baseRevision,
          (d) => {
            if (change.action === "select") d.selected = change.id ? [change.id] : [];
            if (change.action === "step") {
              engine.cancel(id);
              d.stepId = change.id ?? null;
              d.practice = {
                ...d.practice,
                stepId: d.stepId,
                eventId: null,
                status: d.practice.active ? "waiting" : "paused",
                feedback: "",
              };
              d.highlighted = d.steps.find((s) => s.id === change.id)?.objects ?? [];
            }
            if (change.action === "clearAnnotations") d.annotations = [];
            if (change.action === "label" || change.action === "move") {
              const object = d.objects.find((o) => o.id === change.id);
              if (!object) throw new Error("Select an object first");
              if (change.action === "label") object.label = change.label ?? object.label;
              else {
                if (change.x === undefined || change.y === undefined) throw new Error("Position required");
                d.positions[object.id] = { x: change.x, y: change.y };
              }
              d.edited = [...new Set([...d.edited, object.id])];
            }
            return d;
          },
          !["select", "step", "clearAnnotations"].includes(change.action),
        );
      return snapshot();
    }, r),
  );
  app.post<{ Params: { id: string } }>("/api/teaching/:id/explain", async (q, r) => {
    try {
      const body = TeachingRequestSchema.parse(q.body);
      const runtime = deps.runtimes.get("claude");
      if (!runtime) throw new Error("Claude is not connected for visual teaching");
      const status = await runtime.status();
      deps.supervisor.updateRuntimeStatus(runtime.id, status);
      const choice = deps.supervisor.intelligence({
        ask: body.question,
        mode: "auto",
        purpose: "conversation",
        images: body.sources.some((s) => !!s.image),
        tier: "balanced",
        preferredRuntime: "claude",
        preferredModel: body.model,
      });
      if (!choice.runtime) throw new Error(choice.reason);
      await engine.explain(q.params.id, { ...body, model: choice.model });
      return snapshot();
    } catch (e) {
      return r.code(/Stale|changed/.test(String(e)) ? 409 : 400).send({
        error:
          (e as Error).name === "AbortError" ? "Teaching cancelled; lesson unchanged" : (e as Error).message,
      });
    }
  });
  app.addHook("onClose", async () => {
    for (const lesson of store.snapshot().lessons) engine.cancel(lesson.id);
  });
}
