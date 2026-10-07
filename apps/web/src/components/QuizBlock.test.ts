import { describe, expect, it } from "vitest";
import { parseCards, parseQuiz } from "./QuizBlock";

describe("lesson quizzes and flashcards", () => {
  it("reads the shapes models write: string or {id, text} options, answers as letters, indexes or the option's text", () => {
    const quiz = parseQuiz(JSON.stringify([
      { stem: "Which service shifts Lambda traffic gradually?", options: ["CodeDeploy", "CloudFormation", "Config"], answer: ["a"], explain: "Canary configs.", why: { B: "Provisions, doesn't shift." } },
      { question: "Pick the two detective services.", choices: [{ text: "GuardDuty" }, { text: "Macie" }, { text: "IAM" }], answer: ["GuardDuty", 1] },
      { stem: "No real answer here.", options: ["x", "y"], answer: ["F"] },
      { stem: "Too few options.", options: ["only"], answer: ["A"] },
    ]));
    expect(quiz).toHaveLength(2);
    expect(quiz![0]).toMatchObject({ answer: ["A"], explain: "Canary configs.", why: { B: "Provisions, doesn't shift." } });
    expect(quiz![0]!.options[1]).toEqual({ id: "B", text: "CloudFormation" });
    expect(quiz![1]).toMatchObject({ stem: "Pick the two detective services.", answer: ["A", "B"] });
    expect(parseQuiz(JSON.stringify({ questions: [{ stem: "Wrapped?", options: ["yes", "no"], answer: 0 }] }))![0]!.answer).toEqual(["A"]);
    expect(parseQuiz("not json")).toBeNull();
    expect(parseQuiz("[]")).toBeNull();
  });

  it("keeps only complete flashcards", () => {
    expect(parseCards('[{"front":"RTO?","back":"How long you can be down."},{"front":"","back":"x"},{"q":"RPO?","a":"How much data you can lose."}]'))
      .toEqual([{ front: "RTO?", back: "How long you can be down." }, { front: "RPO?", back: "How much data you can lose." }]);
    expect(parseCards("{}")).toBeNull();
  });
});
