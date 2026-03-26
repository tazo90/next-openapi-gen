#!/usr/bin/env python3
"""
GitHub Actions Security Audit Script

Audits workflows for security issues:
- Excessive permissions
- Insecure triggers (pull_request_target)
- Hardcoded secrets
- Command injection vulnerabilities
- Unpinned actions
"""

import sys
import yaml
import re
import argparse
from pathlib import Path
from typing import Dict, List


class SecurityAuditor:
    def __init__(self):
        self.critical = []
        self.high = []
        self.medium = []
        self.low = []

    def audit_file(self, file_path: Path) -> Dict[str, int]:
        """Audit a single workflow file."""
        print(f"\n🔒 Auditing: {file_path}")

        if not file_path.exists():
            self.critical.append(f"File not found: {file_path}")
            return self.get_summary()

        try:
            with open(file_path, 'r') as f:
                content = f.read()
                workflow = yaml.safe_load(content)
        except yaml.YAMLError as e:
            self.critical.append(f"YAML parsing error: {e}")
            return self.get_summary()

        if not isinstance(workflow, dict):
            return self.get_summary()

        # Run security checks
        self.check_permissions(workflow)
        self.check_dangerous_triggers(workflow)
        self.check_secrets_exposure(workflow, content)
        self.check_action_security(workflow)
        self.check_command_injection(workflow)
        self.check_self_hosted_runners(workflow)

        # Print results
        self.print_results()

        return self.get_summary()

    def check_permissions(self, workflow: Dict):
        """Check for overly permissive configurations."""
        permissions = workflow.get('permissions')

        if permissions == 'write-all':
            self.critical.append(
                "CRITICAL: 'permissions: write-all' grants excessive permissions. "
                "This violates principle of least privilege."
            )

        if permissions is None:
            self.high.append(
                "HIGH: No permissions specified. Workflow uses default permissions which may be excessive. "
                "Explicitly set minimal permissions."
            )

        if isinstance(permissions, dict):
            dangerous_perms = []

            if permissions.get('contents') == 'write':
                dangerous_perms.append('contents: write')

            if permissions.get('packages') == 'write':
                dangerous_perms.append('packages: write')

            if permissions.get('deployments') == 'write':
                dangerous_perms.append('deployments: write')

            if dangerous_perms:
                self.medium.append(
                    f"MEDIUM: Workflow has write permissions: {', '.join(dangerous_perms)}. "
                    "Ensure these are necessary."
                )

        # Check job-level permissions
        for job_id, job in workflow.get('jobs', {}).items():
            if isinstance(job, dict):
                job_perms = job.get('permissions')
                if job_perms == 'write-all':
                    self.critical.append(
                        f"CRITICAL: Job '{job_id}' has 'permissions: write-all'"
                    )

    def check_dangerous_triggers(self, workflow: Dict):
        """Check for dangerous event triggers."""
        triggers = workflow.get('on', {})

        if isinstance(triggers, str):
            triggers = {triggers: None}
        elif isinstance(triggers, list):
            triggers = {t: None for t in triggers}

        # pull_request_target is dangerous
        if 'pull_request_target' in triggers:
            self.high.append(
                "HIGH: Using 'pull_request_target' trigger. "
                "This runs in the context of the base repository with access to secrets. "
                "NEVER checkout PR code or run untrusted code with this trigger."
            )

        # workflow_run can also be dangerous
        if 'workflow_run' in triggers:
            self.medium.append(
                "MEDIUM: Using 'workflow_run' trigger. "
                "Ensure you're not exposing secrets to untrusted code."
            )

    def check_secrets_exposure(self, workflow: Dict, content: str):
        """Check for hardcoded secrets or secret exposure."""
        # Check for hardcoded secrets (common patterns)
        secret_patterns = [
            (r'password\s*=\s*["\'][^"\']+["\']', 'hardcoded password'),
            (r'api[_-]?key\s*=\s*["\'][^"\']+["\']', 'hardcoded API key'),
            (r'token\s*=\s*["\'][^"\']+["\']', 'hardcoded token'),
            (r'secret\s*=\s*["\'][^"\']+["\']', 'hardcoded secret'),
            (r'ghp_[a-zA-Z0-9]{36}', 'GitHub Personal Access Token'),
            (r'AKIA[0-9A-Z]{16}', 'AWS Access Key'),
        ]

        for pattern, description in secret_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                self.critical.append(
                    f"CRITICAL: Possible {description} found in workflow file. "
                    "Never hardcode secrets!"
                )

        # Check for secrets in logs
        for job in workflow.get('jobs', {}).values():
            if not isinstance(job, dict):
                continue

            for step in job.get('steps', []):
                if not isinstance(step, dict):
                    continue

                run_cmd = step.get('run', '')

                # Check for direct secret usage in commands
                if re.search(r'\$\{\{\s*secrets\.\w+\s*\}\}', run_cmd):
                    self.medium.append(
                        f"MEDIUM: Secret used directly in run command. "
                        "Consider using environment variables to prevent accidental logging. "
                        f"Step: {step.get('name', 'unnamed')}"
                    )

    def check_action_security(self, workflow: Dict):
        """Check for action security issues."""
        for job_id, job in workflow.get('jobs', {}).items():
            if not isinstance(job, dict):
                continue

            for i, step in enumerate(job.get('steps', [])):
                if not isinstance(step, dict):
                    continue

                uses = step.get('uses')
                if not uses:
                    continue

                # Check if action is pinned to version
                if '@' not in uses:
                    self.high.append(
                        f"HIGH: Action '{uses}' in job '{job_id}' is not pinned to a version. "
                        "Always specify a version or commit SHA."
                    )
                    continue

                action, version = uses.rsplit('@', 1)

                # Check for mutable references
                if version in ['main', 'master', 'latest', 'develop']:
                    self.high.append(
                        f"HIGH: Action '{action}' uses mutable reference '{version}'. "
                        "Pin to a specific version or commit SHA."
                    )

                # Check if using major version only (medium risk)
                if re.match(r'^v?\d+$', version):
                    self.low.append(
                        f"LOW: Action '{action}' pinned to major version only ('{version}'). "
                        "For maximum security, pin to specific SHA."
                    )

                # Warn about third-party actions
                if not action.startswith('actions/') and not action.startswith('github/'):
                    if '/' in action:  # It's from another org
                        self.low.append(
                            f"INFO: Using third-party action '{action}'. "
                            "Ensure you trust this publisher and review the code."
                        )

    def check_command_injection(self, workflow: Dict):
        """Check for command injection vulnerabilities."""
        dangerous_contexts = [
            'github.event.issue.title',
            'github.event.issue.body',
            'github.event.pull_request.title',
            'github.event.pull_request.body',
            'github.event.comment.body',
            'github.event.review.body',
            'github.event.discussion.title',
            'github.event.discussion.body',
            'github.head_ref',
        ]

        for job_id, job in workflow.get('jobs', {}).items():
            if not isinstance(job, dict):
                continue

            for step_num, step in enumerate(job.get('steps', [])):
                if not isinstance(step, dict):
                    continue

                run_cmd = step.get('run', '')
                if not run_cmd:
                    continue

                # Check for dangerous context usage
                for context in dangerous_contexts:
                    if f'${{{{{context}' in run_cmd:
                        # Check if it's in env (safe)
                        step_env = step.get('env', {})
                        if not any(f'${{{{{context}' in str(v) for v in step_env.values()):
                            self.critical.append(
                                f"CRITICAL: Command injection vulnerability in job '{job_id}', step {step_num}. "
                                f"Using '{context}' directly in run command. "
                                "Use environment variables to prevent injection."
                            )

    def check_self_hosted_runners(self, workflow: Dict):
        """Check for security issues with self-hosted runners."""
        triggers = workflow.get('on', {})
        if isinstance(triggers, str):
            triggers = {triggers: None}
        elif isinstance(triggers, list):
            triggers = {t: None for t in triggers}

        # Check if workflow runs on public PRs
        runs_on_public_prs = (
            'pull_request' in triggers or
            'pull_request_target' in triggers
        )

        for job_id, job in workflow.get('jobs', {}).items():
            if not isinstance(job, dict):
                continue

            runs_on = job.get('runs-on')

            if isinstance(runs_on, str) and 'self-hosted' in runs_on:
                if runs_on_public_prs:
                    self.critical.append(
                        f"CRITICAL: Job '{job_id}' uses self-hosted runner with public PR trigger. "
                        "NEVER use self-hosted runners for public repositories or untrusted code!"
                    )
                else:
                    self.medium.append(
                        f"MEDIUM: Job '{job_id}' uses self-hosted runner. "
                        "Ensure proper isolation and security measures."
                    )

            elif isinstance(runs_on, list) and 'self-hosted' in runs_on:
                if runs_on_public_prs:
                    self.critical.append(
                        f"CRITICAL: Job '{job_id}' uses self-hosted runner with public PR trigger!"
                    )

    def print_results(self):
        """Print audit results."""
        if self.critical:
            print("\n🔴 CRITICAL ISSUES:")
            for issue in self.critical:
                print(f"  - {issue}")

        if self.high:
            print("\n🟠 HIGH SEVERITY:")
            for issue in self.high:
                print(f"  - {issue}")

        if self.medium:
            print("\n🟡 MEDIUM SEVERITY:")
            for issue in self.medium:
                print(f"  - {issue}")

        if self.low:
            print("\n🟢 LOW SEVERITY / INFO:")
            for issue in self.low:
                print(f"  - {issue}")

        if not (self.critical or self.high or self.medium or self.low):
            print("\n✅ No security issues found!")

        # Reset for next file
        summary = self.get_summary()
        self.critical = []
        self.high = []
        self.medium = []
        self.low = []

        return summary

    def get_summary(self) -> Dict[str, int]:
        """Get summary of issues."""
        return {
            'critical': len(self.critical),
            'high': len(self.high),
            'medium': len(self.medium),
            'low': len(self.low),
        }


def main():
    parser = argparse.ArgumentParser(
        description='Security audit for GitHub Actions workflows'
    )
    parser.add_argument(
        'files',
        nargs='+',
        type=Path,
        help='Workflow files to audit'
    )
    parser.add_argument(
        '--fail-on',
        choices=['critical', 'high', 'medium', 'low'],
        default='critical',
        help='Exit with error if issues at this level or higher are found'
    )

    args = parser.parse_args()

    auditor = SecurityAuditor()
    total_issues = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}

    for file_path in args.files:
        summary = auditor.audit_file(file_path)
        for level, count in summary.items():
            total_issues[level] += count

    # Print summary
    print("\n" + "=" * 50)
    print("SECURITY AUDIT SUMMARY")
    print("=" * 50)
    print(f"🔴 Critical: {total_issues['critical']}")
    print(f"🟠 High:     {total_issues['high']}")
    print(f"🟡 Medium:   {total_issues['medium']}")
    print(f"🟢 Low:      {total_issues['low']}")

    # Determine exit code based on fail-on level
    severity_levels = ['low', 'medium', 'high', 'critical']
    fail_index = severity_levels.index(args.fail_on)

    should_fail = False
    for i in range(fail_index, len(severity_levels)):
        if total_issues[severity_levels[i]] > 0:
            should_fail = True
            break

    if should_fail:
        print(f"\n❌ Security audit failed (threshold: {args.fail_on})")
        sys.exit(1)
    else:
        print("\n✅ Security audit passed!")
        sys.exit(0)


if __name__ == '__main__':
    main()
