import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceIllustration } from "./WorkspaceIllustration";

it("renders distinct, decorative room and learning card stacks without an orb", () => {
  for (const kind of ["rooms", "learning"] as const) {
    const markup = renderToStaticMarkup(<WorkspaceIllustration kind={kind} />);
    expect(markup).toContain(`workspace-illustration is-${kind}`);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("orb");
  }
});
