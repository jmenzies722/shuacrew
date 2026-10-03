import { expect, it } from "vitest";
import { learningProgress } from "./learning-progress";

it("continues an unfinished lesson and counts only actual completed lessons", () => {
  const courses = [
    { id: "finished", lessons: [{ done: true }] },
    { id: "active", lessons: [{ done: true }, { done: false }, { done: false }] },
    { id: "planning", lessons: [] },
  ];
  expect(learningProgress(courses)).toEqual({ course: courses[1], lessonIndex: 1, completed: 2, total: 4, active: 1 });
});

it("does not invent a next lesson when courses are empty or complete", () => {
  expect(learningProgress([])).toEqual({ course: undefined, lessonIndex: -1, completed: 0, total: 0, active: 0 });
  expect(learningProgress([{ lessons: [{ done: true }] }]).lessonIndex).toBe(-1);
});
