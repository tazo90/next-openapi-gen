import type { ReactNode } from "react";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">{children}</div>
    </div>
  );
}

function Header({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="text-center mb-12">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">{title}</h1>
      <p className="text-xl text-gray-600">{children}</p>
    </header>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-lg shadow-lg p-8 mb-8 last:mb-0">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
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
      <span className="text-green-500 mr-2">✓</span>
      <span>
        <strong>{name}</strong> - {children}
      </span>
    </li>
  );
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function CodeSample({ children }: { children: ReactNode }) {
  return <code className="block bg-gray-100 p-4 rounded text-sm overflow-x-auto">{children}</code>;
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
