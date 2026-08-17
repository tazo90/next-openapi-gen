import type { ReactNode } from "react";

export function Frame({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}

export function Header({ children }: { children: ReactNode }) {
  return <h1>{children}</h1>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}
