import {
  createBrowserRouter,
  isRouteErrorResponse,
  Outlet,
  RouterProvider,
  useRouteError,
} from "react-router";

import HomePage from "./routes/_index";
import ApiDocsPage from "./routes/api-docs";
import "./routes/api/projects.$projectId";
import "./routes/api/settings.profile";
import "./routes/api/uploads";

function Root() {
  return <Outlet />;
}

function RootErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred.";

  return (
    <main>
      <h1>Something went wrong</h1>
      <p>{message}</p>
    </main>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    ErrorBoundary: RootErrorBoundary,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: "api-docs",
        Component: ApiDocsPage,
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
