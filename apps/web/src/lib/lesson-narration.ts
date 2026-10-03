import type { ArchitectureLesson } from "./notch-lesson";
export type NarrationIdentity = { lessonId: string; revision: number; stepId: string };
export function narrationSegments(text: string): string[] {
  return (text.match(/[\s\S]{1,500}(?:\s|$)|[\s\S]{1,500}/g) ?? []).map(part => part.trim()).filter(Boolean);
}
export function narrationFocus(lesson: ArchitectureLesson, identity?: NarrationIdentity | null) {
  const step = identity && identity.lessonId === lesson.id && identity.revision === lesson.revision ? lesson.steps.find(item => item.id === identity.stepId) : undefined;
  return { nodes: step?.focus ?? [], edges: step?.edgeFocus ?? [], stepId: step?.id ?? null };
}
