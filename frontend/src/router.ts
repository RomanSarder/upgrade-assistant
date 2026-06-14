import { createRouter, createRoute, createRootRoute, redirect } from "@tanstack/react-router";
import App from "./App";

const rootRoute = createRootRoute();

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

const routeTree = rootRoute.addChildren([indexRoute, signInRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
