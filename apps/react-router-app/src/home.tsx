import type { ReactNode } from "react";

function Frame({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}

function Header({ children }: { children: ReactNode }) {
  return <h1>{children}</h1>;
}

function Lead({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export const Home = {
  Frame,
  Header,
  Lead,
};
