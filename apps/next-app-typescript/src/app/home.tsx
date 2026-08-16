import type { ReactNode } from "react";

function Frame({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}

function Lead({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export const Home = {
  Frame,
  Lead,
};
