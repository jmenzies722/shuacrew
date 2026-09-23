import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Board } from "./screens/Board";
import { MissionControl } from "./screens/MissionControl";
import { Integrations, Memory, Policy, Schedules, Settings, Specs } from "./screens/Pages";
import { RunDetail } from "./screens/RunDetail";
import { Shell } from "./shell/Shell";

const root = createRootRoute({ component: Shell });

const routes = [
  createRoute({ getParentRoute: () => root, path: "/", component: MissionControl }),
  createRoute({ getParentRoute: () => root, path: "/board", component: Board }),
  createRoute({ getParentRoute: () => root, path: "/runs/$id", component: RunDetail }),
  createRoute({ getParentRoute: () => root, path: "/specs", component: Specs }),
  createRoute({ getParentRoute: () => root, path: "/schedules", component: Schedules }),
  createRoute({ getParentRoute: () => root, path: "/memory", component: Memory }),
  createRoute({ getParentRoute: () => root, path: "/integrations", component: Integrations }),
  createRoute({ getParentRoute: () => root, path: "/policy", component: Policy }),
  createRoute({ getParentRoute: () => root, path: "/settings", component: Settings }),
];

export const router = createRouter({ routeTree: root.addChildren(routes), defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
