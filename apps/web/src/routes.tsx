import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { Sessions } from "./screens/Sessions";
import { Shell } from "./shell/Shell";

// Everything but the chat loads the first time you open it, so the app starts fast.
const Board = lazyRouteComponent(() => import("./screens/Board"), "Board");
const MissionControl = lazyRouteComponent(() => import("./screens/MissionControl"), "MissionControl");
const Today = lazyRouteComponent(() => import("./screens/Today"), "Today");
const Memory = lazyRouteComponent(() => import("./screens/Memory"), "Memory");
const Schedules = lazyRouteComponent(() => import("./screens/Schedules"), "Schedules");
const TerminalPage = lazyRouteComponent(() => import("./screens/TerminalPage"), "TerminalPage");
const CrewFloor = lazyRouteComponent(() => import("./screens/CrewFloor"), "CrewFloor");
const Studio = lazyRouteComponent(() => import("./screens/Studio"), "Studio");
const CrewPage = lazyRouteComponent(() => import("./screens/CrewPage"), "CrewPage");
const Rooms = lazyRouteComponent(() => import("./screens/Rooms"), "Rooms");
const Observability = lazyRouteComponent(() => import("./screens/Observability"), "Observability");
const Usage = lazyRouteComponent(() => import("./screens/Usage"), "Usage");
const Developer = lazyRouteComponent(() => import("./screens/Developer"), "Developer");
const Learn = lazyRouteComponent(() => import("./screens/Learn"), "Learn");
const Teach = lazyRouteComponent(() => import("./screens/Learn"), "Teach");
const Library = lazyRouteComponent(() => import("./screens/Library"), "Library");
const Review = lazyRouteComponent(() => import("./screens/Review"), "Review");
const RunDetail = lazyRouteComponent(() => import("./screens/RunDetail"), "RunDetail");
const Integrations = lazyRouteComponent(() => import("./screens/Pages"), "Integrations");
const Policy = lazyRouteComponent(() => import("./screens/Pages"), "Policy");
const Settings = lazyRouteComponent(() => import("./screens/Settings"), "Settings");
const Guide = lazyRouteComponent(() => import("./screens/Guide"), "Guide");
const Specs = lazyRouteComponent(() => import("./screens/Pages"), "Specs");
const PlayPage = lazyRouteComponent(() => import("./screens/Playbooks"), "PlayPage");
const Playbooks = lazyRouteComponent(() => import("./screens/Playbooks"), "Playbooks");
const VenturePage = lazyRouteComponent(() => import("./screens/Ventures"), "VenturePage");
const Ventures = lazyRouteComponent(() => import("./screens/Ventures"), "Ventures");

const root = createRootRoute({ component: Shell });

const routes = [
  createRoute({ getParentRoute: () => root, path: "/", component: Sessions }),
  createRoute({ getParentRoute: () => root, path: "/sessions/$id", component: Sessions }),
  createRoute({ getParentRoute: () => root, path: "/activity", component: Today }),
  createRoute({ getParentRoute: () => root, path: "/terminal", component: TerminalPage }),
  createRoute({ getParentRoute: () => root, path: "/floor", component: CrewFloor }),
  createRoute({ getParentRoute: () => root, path: "/studio", component: Studio }),
  createRoute({ getParentRoute: () => root, path: "/ventures", component: Ventures }),
  createRoute({ getParentRoute: () => root, path: "/ventures/$id", component: VenturePage }),
  createRoute({ getParentRoute: () => root, path: "/crew", component: CrewPage }),
  createRoute({ getParentRoute: () => root, path: "/rooms", component: Rooms }),
  createRoute({ getParentRoute: () => root, path: "/observability", component: Observability }),
  createRoute({ getParentRoute: () => root, path: "/usage", component: Usage }),
  createRoute({ getParentRoute: () => root, path: "/developer", component: Developer }),
  // Learning and visual teaching are one place now; /teach opens it on Explain.
  createRoute({ getParentRoute: () => root, path: "/teach", component: Teach }),
  createRoute({ getParentRoute: () => root, path: "/learn", component: Learn }),
  createRoute({ getParentRoute: () => root, path: "/rooms/$id", component: Rooms }),
  createRoute({ getParentRoute: () => root, path: "/library", component: Library }),
  createRoute({ getParentRoute: () => root, path: "/playbooks", component: Playbooks }),
  createRoute({ getParentRoute: () => root, path: "/plays/$id", component: PlayPage }),
  createRoute({ getParentRoute: () => root, path: "/board", component: Board }),
  createRoute({ getParentRoute: () => root, path: "/runs/$id", component: RunDetail }),
  createRoute({ getParentRoute: () => root, path: "/review/$id", component: Review }),
  createRoute({ getParentRoute: () => root, path: "/specs", component: Specs }),
  createRoute({ getParentRoute: () => root, path: "/schedules", component: Schedules }),
  createRoute({ getParentRoute: () => root, path: "/memory", component: Memory }),
  createRoute({ getParentRoute: () => root, path: "/integrations", component: Integrations }),
  createRoute({ getParentRoute: () => root, path: "/policy", component: Policy }),
  createRoute({ getParentRoute: () => root, path: "/settings", component: Settings }),
  createRoute({ getParentRoute: () => root, path: "/guide", component: Guide }),
];

export const router = createRouter({ routeTree: root.addChildren(routes), defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
