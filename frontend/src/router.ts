import { createRouter, createRoute, createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import { apiClient, ApiError } from "./shared/api";
import App from "./App";
import { SignInPage } from "./auth/SignInPage";
import { VerifyPage } from "./auth/VerifyPage";

const rootRoute = createRootRoute({ component: Outlet });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
  beforeLoad: async () => {
    try {
      await apiClient("/auth/me");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({ to: "/sign-in" });
      }
      throw err;
    }
  },
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: SignInPage,
});

const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/verify",
  component: VerifyPage,
});

const routeTree = rootRoute.addChildren([indexRoute, signInRoute, verifyRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
