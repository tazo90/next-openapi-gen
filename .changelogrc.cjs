module.exports = {
  writerOpts: {
    transform: (commit, context) => {
      const issues = [];

      // Emoji mapping
      const emojis = {
        feat: "✨",
        fix: "🐛",
        perf: "⚡",
        docs: "📝",
        style: "💄",
        refactor: "♻️",
        test: "✅",
        build: "👷",
        ci: "🔧",
        chore: "🔨",
        revert: "⏪",
      };

      // Ignore commits without proper type (not conventional commits)
      const validTypes = [
        "feat",
        "fix",
        "perf",
        "docs",
        "style",
        "refactor",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ];
      if (!commit.type || !validTypes.includes(commit.type)) {
        return;
      }

      // Ignore certain commit subjects
      if (
        commit.subject &&
        (commit.subject.match(/^bump/i) ||
          commit.subject.match(/^v?\d+\.\d+\.\d+/) ||
          commit.subject.match(/^release/i) ||
          commit.subject.match(/^Merge/i))
      ) {
        return;
      }

      // Ignore chore commits about version bumps
      if (
        commit.type === "chore" &&
        commit.subject &&
        (commit.subject.match(/^bump/i) ||
          commit.subject.match(/^v?\d+\.\d+\.\d+/))
      ) {
        return;
      }

      // Create new commit object to avoid immutability issues
      const newCommit = Object.assign({}, commit);

      // Add emoji to type and capitalize
      if (newCommit.type && emojis[newCommit.type]) {
        const typeName =
          newCommit.type.charAt(0).toUpperCase() + newCommit.type.slice(1);
        const typeNames = {
          Feat: "Features",
          Fix: "Bug Fixes",
          Perf: "Performance Improvements",
          Docs: "Documentation",
          Style: "Styles",
          Refactor: "Code Refactoring",
          Test: "Tests",
          Build: "Build System",
          Ci: "Continuous Integration",
          Chore: "Chores",
          Revert: "Reverts",
        };
        newCommit.type = `${emojis[newCommit.type]} ${
          typeNames[typeName] || typeName
        }`;
      }

      // Handle breaking changes
      if (newCommit.notes && newCommit.notes.length > 0) {
        newCommit.type = "💥 BREAKING CHANGES";
      }

      // Add issue references
      if (typeof newCommit.hash === "string") {
        newCommit.shortHash = newCommit.hash.substring(0, 7);
      }

      if (typeof newCommit.subject === "string") {
        let url = context.repository
          ? `${context.host}/${context.owner}/${context.repository}`
          : context.repoUrl;
        if (url) {
          url = `${url}/issues/`;
          // Issue URLs.
          newCommit.subject = newCommit.subject.replace(
            /#([0-9]+)/g,
            (_, issue) => {
              issues.push(issue);
              return `[#${issue}](${url}${issue})`;
            }
          );
        }
        if (context.host) {
          // User URLs.
          newCommit.subject = newCommit.subject.replace(
            /\B@([a-z0-9](?:-?[a-z0-9/]){0,38})/g,
            (_, username) => {
              if (username.includes("/")) {
                return `@${username}`;
              }

              return `[@${username}](${context.host}/${username})`;
            }
          );
        }
      }

      // Remove references that already appear in the subject
      newCommit.references = newCommit.references.filter((reference) => {
        if (issues.indexOf(reference.issue) === -1) {
          return true;
        }

        return false;
      });

      return newCommit;
    },
    groupBy: "type",
    commitGroupsSort: "title",
    commitsSort: ["scope", "subject"],
    noteGroupsSort: "title",
  },
};
