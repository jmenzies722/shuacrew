import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ERASES, KEEPS, StartFresh } from "./StartFresh";

it("says what goes and what stays, and won't start until you type the words", () => {
  const html = renderToStaticMarkup(<StartFresh />);
  expect(html).toContain("backups/fresh-start");
  for (const x of [...ERASES, ...KEEPS]) expect(html).toContain(x.replace(/'/g, "&#x27;"));
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Start fresh<\/button>/);
  expect(KEEPS.join(" ")).toMatch(/Crew members.*schedules.*look.*voice.*keys/);
  expect(ERASES.join(" ")).toMatch(/Sessions.*conversations.*Memory.*Library.*Learn.*Ventures/);
});
