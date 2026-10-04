import { z } from "zod";
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const Point = z
  .object({
    x: z.number().finite().min(-100000).max(100000),
    y: z.number().finite().min(-100000).max(100000),
  })
  .strict();
export const CaptureSchema = z
  .object({
    id: Id,
    displayId: z.number().int(),
    capturedAt: z.number(),
    sourceWidth: z.number().positive(),
    sourceHeight: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    display: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    crop: z.object({
      x: z.number().nonnegative(),
      y: z.number().nonnegative(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    context: z.string().max(200),
  })
  .strict();
export const TeachingSourceSchema = z
  .object({
    id: Id,
    title: z.string().max(200),
    kind: z.enum(["text", "code", "document", "image", "capture"]),
    text: z.string().max(100000),
    image: z.string().max(2800000).nullable(),
    mime: z.enum(["image/png", "image/jpeg", "image/webp"]).nullable(),
    capture: CaptureSchema.nullable(),
  })
  .strict();
export const VisualObjectSchema = z
  .object({
    id: Id,
    kind: z.enum(["rectangle", "circle", "text", "callout", "group", "connector"]),
    label: z.string().max(600),
    groupId: Id.nullable(),
    from: Id.nullable(),
    to: Id.nullable(),
    tone: z.enum(["neutral", "accent", "success", "warning"]),
  })
  .strict();
export const TeachingStepSchema = z
  .object({
    id: Id,
    title: z.string().max(160),
    text: z.string().min(1).max(8000),
    sources: z.array(z.object({ sourceId: Id, locator: z.string().max(200) }).strict()).max(30),
    objects: z.array(Id).max(80),
  })
  .strict();
export const AnnotationSchema = z
  .object({
    id: Id,
    captureId: Id,
    stepId: Id,
    kind: z.enum(["arrow", "circle", "rectangle", "highlight", "underline", "label"]),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
    label: z.string().max(100),
    endX: z.number().min(0).max(1).nullable(),
    endY: z.number().min(0).max(1).nullable(),
  })
  .strict();
export const TeachingPatchSchema = z
  .object({
    version: z.literal(1),
    sessionId: Id,
    baseRevision: z.number().int().nonnegative(),
    title: z.string().max(200),
    answer: z.string().min(1).max(12000),
    assumptions: z.array(z.string().max(1000)).max(20),
    steps: z.array(TeachingStepSchema).min(1).max(20),
    operations: z
      .array(
        z.union([ // Distinct op literals preserve discrimination; JSON Schema anyOf is supported by Codex.
          z.object({ op: z.literal("create"), object: VisualObjectSchema }).strict(),
          z.object({ op: z.literal("update"), object: VisualObjectSchema }).strict(),
          z.object({ op: z.literal("delete"), id: Id }).strict(),
          z.object({ op: z.literal("highlight"), ids: z.array(Id).max(80) }).strict(),
          z.object({ op: z.literal("focus"), id: Id }).strict(),
        ]),
      )
      .max(160),
    annotations: z.array(AnnotationSchema).max(30),
  })
  .strict();
export const PracticeSchema = z
  .object({
    active: z.boolean(),
    status: z.enum(["paused", "waiting", "checking", "retry", "verified", "uncertain"]),
    stepId: Id.nullable(),
    eventId: Id.nullable(),
    feedback: z.string().max(5100),
    model: z.string().max(100).nullable(),
    displayId: z.number().int().nullable(),
    observedAt: z.number().nonnegative(),
    capture: CaptureSchema.nullable().default(null),
  })
  .strict();
export const pausedPractice = () => ({
  active: false,
  status: "paused" as const,
  stepId: null,
  eventId: null,
  feedback: "",
  model: null,
  displayId: null,
  observedAt: 0,
  capture: null,
});
export const TeachingObservationSchema = z
  .object({
    eventId: Id,
    sessionId: Id,
    kind: z.enum(["click", "check"]),
    observedAt: z.number().nonnegative(),
    displayId: z.number().int(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    source: TeachingSourceSchema,
  })
  .strict();
export const TeachingAssessmentSchema = z
  .object({
    eventId: Id,
    stepId: Id,
    outcome: z.enum(["verified", "retry", "uncertain"]),
    feedback: z.string().min(1).max(3000),
    evidence: z.string().min(1).max(2000),
    annotations: z.array(AnnotationSchema).max(10),
  })
  .strict();
export const TeachingDocumentSchema = z
  .object({
    version: z.literal(1),
    sessionId: Id,
    revision: z.number().int().nonnegative(),
    title: z.string().max(200),
    answer: z.string().max(12000),
    assumptions: z.array(z.string().max(1000)).max(20),
    sources: z.array(TeachingSourceSchema).max(12),
    objects: z.array(VisualObjectSchema).max(80),
    steps: z.array(TeachingStepSchema).max(20),
    selected: z.array(Id).max(80),
    stepId: Id.nullable(),
    focusId: Id.nullable(),
    highlighted: z.array(Id).max(80),
    annotations: z.array(AnnotationSchema).max(30),
    positions: z.record(Id, Point),
    edited: z.array(Id).max(80),
    practice: PracticeSchema.default(pausedPractice),
  })
  .strict();
export type TeachingDocument = z.infer<typeof TeachingDocumentSchema>;
export type VisualObject = z.infer<typeof VisualObjectSchema>;
export type TeachingPatch = z.infer<typeof TeachingPatchSchema>;
export type TeachingSource = z.infer<typeof TeachingSourceSchema>;
export type Capture = z.infer<typeof CaptureSchema>;
export function emptyLesson(sessionId: string): TeachingDocument {
  return {
    version: 1,
    sessionId,
    revision: 0,
    title: "New lesson",
    answer: "",
    assumptions: [],
    sources: [],
    objects: [],
    steps: [],
    selected: [],
    stepId: null,
    focusId: null,
    highlighted: [],
    annotations: [],
    positions: {},
    edited: [],
    practice: pausedPractice(),
  };
}
export function validateLesson(value: unknown): TeachingDocument {
  const doc = TeachingDocumentSchema.parse(value),
    ids = new Set(doc.objects.map((o) => o.id));
  if (ids.size !== doc.objects.length) throw new Error("Duplicate object ID");
  const sourceIds = new Set(doc.sources.map((s) => s.id)),
    stepIds = new Set(doc.steps.map((s) => s.id));
  if (sourceIds.size !== doc.sources.length || stepIds.size !== doc.steps.length)
    throw new Error("Duplicate source or step ID");
  for (const source of doc.sources) {
    if (Boolean(source.image) !== Boolean(source.mime))
      throw new Error("Image data and MIME must be supplied together");
    if (source.image && !/^[A-Za-z0-9+/]+={0,2}$/.test(source.image))
      throw new Error("Invalid image encoding");
    if (
      source.capture &&
      (source.capture.crop.x + source.capture.crop.width > source.capture.sourceWidth ||
        source.capture.crop.y + source.capture.crop.height > source.capture.sourceHeight)
    )
      throw new Error("Capture crop exceeds source pixels");
    if (source.capture && source.kind !== "capture")
      throw new Error("Capture metadata requires a capture source");
  }
  for (const o of doc.objects) {
    if (
      o.kind === "connector" &&
      (!o.from ||
        !o.to ||
        !ids.has(o.from) ||
        !ids.has(o.to) ||
        o.from === o.to ||
        [o.from, o.to].some((id) => doc.objects.find((n) => n.id === id)?.kind === "connector"))
    )
      throw new Error("Invalid connector endpoints");
    if (o.kind !== "connector" && (o.from || o.to)) throw new Error("Only connectors have endpoints");
    if (o.groupId && (!ids.has(o.groupId) || doc.objects.find((n) => n.id === o.groupId)?.kind !== "group"))
      throw new Error("Missing group");
    const seen = new Set([o.id]);
    let parent = o.groupId;
    while (parent) {
      if (seen.has(parent)) throw new Error("Cyclic group");
      seen.add(parent);
      parent = doc.objects.find((n) => n.id === parent)?.groupId ?? null;
    }
  }
  for (const step of doc.steps) {
    if (step.objects.some((id) => !ids.has(id)) || step.sources.some((s) => !sourceIds.has(s.sourceId)))
      throw new Error("Unknown step reference");
  }
  if (
    [
      ...doc.selected,
      ...doc.highlighted,
      ...doc.edited,
      ...Object.keys(doc.positions),
      ...(doc.focusId ? [doc.focusId] : []),
    ].some((id) => !ids.has(id))
  )
    throw new Error("Unknown object reference");
  if (
    doc.practice.active &&
    (!doc.stepId || doc.practice.stepId !== doc.stepId || doc.practice.displayId === null)
  )
    throw new Error("Practice requires the current step and a display");
  if (doc.stepId && !stepIds.has(doc.stepId)) throw new Error("Unknown current step");
  for (const a of doc.annotations) {
    if (
      (a.kind === "arrow" && (a.endX === null || a.endY === null)) ||
      !stepIds.has(a.stepId) ||
      (!doc.sources.some((s) => s.capture?.id === a.captureId) && doc.practice.capture?.id !== a.captureId) ||
      a.x + a.w > 1.000001 ||
      a.y + a.h > 1.000001
    )
      throw new Error("Invalid annotation provenance or bounds");
  }
  return doc;
}
export function applyTeachingPatch(
  current: TeachingDocument,
  value: unknown,
  actor: "model" | "user" = "model",
): TeachingDocument {
  const p = TeachingPatchSchema.parse(value);
  if (p.sessionId !== current.sessionId || p.baseRevision !== current.revision)
    throw new Error("Stale lesson revision; reload and try again");
  const next = structuredClone(current);
  const touched = new Set<string>();
  for (const op of p.operations) {
    if (op.op === "highlight") {
      next.highlighted = op.ids;
      continue;
    }
    if (op.op === "focus") {
      next.focusId = op.id;
      continue;
    }
    const id = op.op === "delete" ? op.id : op.object.id;
    if (touched.has(id)) throw new Error("Multiple changes to one object in a patch");
    touched.add(id);
    if (actor === "model" && current.edited.includes(id))
      throw new Error(`Object ${id} was edited by the user; preserve it`);
    const index = next.objects.findIndex((o) => o.id === id);
    if (op.op === "create") {
      if (index >= 0) throw new Error("Object already exists");
      next.objects.push(op.object);
    } else if (index < 0) throw new Error("Object does not exist");
    else if (op.op === "update") next.objects[index] = op.object;
    else {
      next.objects.splice(index, 1);
      delete next.positions[id];
      next.edited = next.edited.filter((x) => x !== id);
      next.selected = next.selected.filter((x) => x !== id);
      next.highlighted = next.highlighted.filter((x) => x !== id);
      if (next.focusId === id) next.focusId = null;
    }
  }
  Object.assign(next, {
    title: p.title,
    answer: p.answer,
    assumptions: p.assumptions,
    steps: p.steps,
    annotations: p.annotations,
    stepId: p.steps.some((s) => s.id === current.stepId) ? current.stepId : p.steps[0]!.id,
    revision: current.revision + 1,
  });
  if (next.practice.active) {
    next.practice.stepId = next.stepId;
    next.practice.status = "waiting";
    next.practice.eventId = null;
  }
  return validateLesson(next);
}
