import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaneHeader, PaneState, SourceLink } from "../components/Pane";

it("renders the recovery action and escaped failure text", () => {
  const html = renderToStaticMarkup(<PaneState kind="error" title="Cannot load work" detail="<script>bad()</script>" action={<button>Retry</button>} />);
  expect(html).toContain('role="alert"');
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("<button>Retry</button>");
});
it("does not expose a navigable unknown source", () => {
  expect(renderToStaticMarkup(<SourceLink to="javascript:alert(1)" label="Source unavailable" />)).not.toContain("href=");
});
it("keeps the pane title and primary action accessible", () => {
  const html = renderToStaticMarkup(<PaneHeader title="Projects" description="Your current outcomes" actions={<button>New project</button>} />);
  expect(html).toContain("<h1>Projects</h1>");
  expect(html).toContain("<button>New project</button>");
});
