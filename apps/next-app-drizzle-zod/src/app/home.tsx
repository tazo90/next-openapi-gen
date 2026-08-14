import type { ReactNode } from "react";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-12">
      <div className="mx-auto max-w-4xl">{children}</div>
    </div>
  );
}

function Header({ title, children }: { title: string; children: ReactNode }) {
  return (
<<<<<<< HEAD
    <header className="mb-12 text-center">
      <h1 data-testid="home-shell-marker" className="mb-4 text-4xl font-bold text-gray-900">
        {title}
      </h1>
      <p className="text-xl text-gray-600">{children}</p>
    </header>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8 rounded-lg bg-white p-8 shadow-lg last:mb-0">
      <h2 className="mb-4 text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function FeatureList({ children }: { children: ReactNode }) {
  return <ul className="space-y-3 text-gray-700">{children}</ul>;
}

function Feature({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="flex items-start">
      <span className="mr-2 text-green-500">✓</span>
      <span>
        <strong>{name}</strong> - {children}
      </span>
    </li>
  );
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  );
}

function CodeSample({ children }: { children: ReactNode }) {
  return <code className="block overflow-x-auto rounded bg-gray-100 p-4 text-sm">{children}</code>;
}

function EndpointList({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

function Endpoint({
  accentClassName,
  method,
  path,
  children,
}: {
  accentClassName: string;
  method: string;
  path: string;
  children: ReactNode;
}) {
  return (
    <div className={`border-l-4 ${accentClassName} pl-4`}>
      <div className="font-mono text-sm text-gray-600">
        {method} {path}
      </div>
      <div className="text-gray-700">{children}</div>
    </div>
  );
}

function GetEndpoint({ path, children }: { path: string; children: ReactNode }) {
  return (
    <Endpoint accentClassName="border-blue-500" method="GET" path={path}>
      {children}
    </Endpoint>
  );
}

function PostEndpoint({ path, children }: { path: string; children: ReactNode }) {
  return (
    <Endpoint accentClassName="border-green-500" method="POST" path={path}>
      {children}
    </Endpoint>
  );
}

function PatchEndpoint({ path, children }: { path: string; children: ReactNode }) {
  return (
    <Endpoint accentClassName="border-yellow-500" method="PATCH" path={path}>
      {children}
    </Endpoint>
  );
}

function DeleteEndpoint({ path, children }: { path: string; children: ReactNode }) {
  return (
    <Endpoint accentClassName="border-red-500" method="DELETE" path={path}>
      {children}
    </Endpoint>
  );
}

export const Home = {
  Frame,
  Header,
  Section,
  FeatureList,
  Feature,
  Step,
  CodeSample,
  EndpointList,
  GetEndpoint,
  PostEndpoint,
  PatchEndpoint,
  DeleteEndpoint,
};
