import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

const pageStyle: CSSProperties = { padding: "2rem", fontFamily: "system-ui, sans-serif" };

const docsLinkStyle: CSSProperties = {
  display: "inline-block",
  padding: "0.75rem 1.5rem",
  backgroundColor: "#0070f3",
  color: "white",
  textDecoration: "none",
  borderRadius: "5px",
  fontWeight: "bold",
};

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

function Item({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li>
      <strong>{name}</strong> - {children}
    </li>
  );
}

function EndpointItem({ path, children }: { path: string; children: ReactNode }) {
  return (
    <li>
      <code>{path}</code> - {children}
    </li>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: "2rem" }}>{children}</div>;
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
  Item,
  EndpointItem,
  Actions,
  DocsLink,
};
