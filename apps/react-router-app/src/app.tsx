import { createBrowserRouter, RouterProvider } from "react-router";

import HomePage from "./routes/_index";
import ApiDocsPage from "./routes/api-docs";

const router = createBrowserRouter([
  {
    path: "/",
    Component: HomePage,
  },
  {
    path: "/api-docs",
    Component: ApiDocsPage,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
