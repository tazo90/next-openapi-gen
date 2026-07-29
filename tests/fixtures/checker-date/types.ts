// Fixtures for `Date` properties resolved through a TypeScript checker rather than
// the Babel AST path. Intersections are one of the constructs that route to the
// checker (see `shouldUseTypeScriptChecker`), so they reproduce the real-world shape.

export type AuditFields = {
  createdAt: Date;
  updatedAt: Date;
};

// Intersection -> resolved by the checker, not the Babel AST walker.
export type AuditedRecord = AuditFields & {
  id: string;
};

// A single `Date` reached through the checker, without a sibling to exercise the
// recursion guard.
export type PublishedAt = AuditFields & {
  publishedAt: Date;
};

// Plain alias -> handled by the Babel AST path; asserts both paths agree.
export type PlainAudit = {
  createdAt: Date;
};
