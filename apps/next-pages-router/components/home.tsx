import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

const pageStyle: CSSProperties = { padding: "2rem", fontFamily: "system-ui, sans-serif" };
const docsLinkStyle: CSSProperties = { color: "#0070f3" };

function Frame({ children }: { children: ReactNode }) {
  return <main style={pageStyle}>{children}</main>;
}

function Header({ children }: { children: ReactNode }) {
  return <h1>{children}</h1>;
}

function Intro({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

function Heading({ children }: { children: ReactNode }) {
  return <h2>{children}</h2>;
}

function List({ children }: { children: ReactNode }) {
  return <ul>{children}</ul>;
}

function EndpointItem({ path, children }: { path: string; children: ReactNode }) {
  return (
    <li>
      <code>{path}</code> - {children}
    </li>
  );
}

function DocsLink({ children }: { children: ReactNode }) {
  return (
    <Link href="/api-docs" style={docsLinkStyle}>
      {children}
    </Link>
  );
}

export const Home = {
  Frame,
  Header,
  Intro,
  Heading,
  List,
  EndpointItem,
  DocsLink,
};
