import { RootRoute, Route, Router, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { AppShell } from './layout/AppShell';
import { LoadingOverlay } from './components/LoadingOverlay';

const HomeRouteComponent = lazy(() => import('./routes/home'));
const CatalogRouteComponent = lazy(() => import('./routes/catalog'));
const TasksRouteComponent = lazy(() => import('./routes/tasks'));
const StorageRouteComponent = lazy(() => import('./routes/storage'));
const SystemRouteComponent = lazy(() => import('./routes/system'));
const ImportExportRouteComponent = lazy(() => import('./routes/importExport'));
const DebugRouteComponent = lazy(() => import('./routes/debug'));

const rootRoute = new RootRoute({
  component: () => (
    <AppShell>
      <Suspense fallback={<LoadingOverlay label="Loading module" />}>
        <Outlet />
      </Suspense>
    </AppShell>
  ),
});

const homeRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRouteComponent,
});

const catalogRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/catalog',
  component: CatalogRouteComponent,
});

const tasksRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksRouteComponent,
});

const storageRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/storage',
  component: StorageRouteComponent,
});

const systemRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/system',
  component: SystemRouteComponent,
});

const importExportRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/import-export',
  component: ImportExportRouteComponent,
});

const debugRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/debug',
  component: DebugRouteComponent,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  catalogRoute,
  tasksRoute,
  storageRoute,
  systemRoute,
  importExportRoute,
  debugRoute,
]);

export const router = new Router({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
