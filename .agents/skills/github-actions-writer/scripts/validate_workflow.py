#!/usr/bin/env python3
"""
GitHub Actions Workflow Validator

Validates workflow YAML files for:
- Syntax errors
- Schema compliance
- Best practices
- Common mistakes
"""

import sys
import yaml
import argparse
from pathlib import Path
from typing import Dict, List, Any


class WorkflowValidator:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.info = []

    def validate_file(self, file_path: Path) -> bool:
        """Validate a single workflow file."""
        print(f"\n🔍 Validating: {file_path}")

        if not file_path.exists():
            self.errors.append(f"File not found: {file_path}")
            return False

        try:
            with open(file_path, 'r') as f:
                workflow = yaml.safe_load(f)
        except yaml.YAMLError as e:
            self.errors.append(f"YAML parsing error: {e}")
            return False

        if not isinstance(workflow, dict):
            self.errors.append("Workflow must be a YAML object/dictionary")
            return False

        # Run validation checks
        self.check_required_fields(workflow)
        self.check_permissions(workflow)
        self.check_triggers(workflow)
        self.check_jobs(workflow)
        self.check_best_practices(workflow)

        # Print results
        self.print_results()

        return len(self.errors) == 0

    def check_required_fields(self, workflow: Dict):
        """Check for required workflow fields."""
        if 'on' not in workflow:
            self.errors.append("Missing required field: 'on' (workflow triggers)")

        if 'jobs' not in workflow:
            self.errors.append("Missing required field: 'jobs'")
        elif not workflow['jobs']:
            self.errors.append("Workflow must define at least one job")

        if 'name' not in workflow:
            self.warnings.append("Consider adding 'name' field for better readability")

    def check_permissions(self, workflow: Dict):
        """Check permissions configuration."""
        if 'permissions' not in workflow:
            self.warnings.append(
                "No 'permissions' set - using defaults. "
                "Consider setting minimal permissions explicitly for security."
            )
            return

        permissions = workflow['permissions']

        if permissions == 'write-all':
            self.errors.append(
                "Security: 'permissions: write-all' is dangerous. "
                "Use minimal permissions instead."
            )

        if isinstance(permissions, dict):
            # Check for overly broad permissions
            if permissions.get('contents') == 'write':
                self.info.append("Using 'contents: write' - ensure this is necessary")

            if permissions.get('id-token') == 'write':
                self.info.append("Good: Using OIDC with 'id-token: write'")

    def check_triggers(self, workflow: Dict):
        """Validate workflow triggers."""
        triggers = workflow.get('on', {})

        if isinstance(triggers, str):
            triggers = {triggers: None}
        elif isinstance(triggers, list):
            triggers = {t: None for t in triggers}

        # Check for dangerous pull_request_target usage
        if 'pull_request_target' in triggers:
            self.warnings.append(
                "Security: 'pull_request_target' can be dangerous. "
                "Ensure you're not checking out PR code or exposing secrets."
            )

        # Check for missing concurrency control
        if ('push' in triggers or 'pull_request' in triggers) and 'concurrency' not in workflow:
            self.info.append(
                "Consider adding 'concurrency' to cancel stale workflow runs"
            )

        # Check path filters
        if 'push' in triggers and isinstance(triggers['push'], dict):
            push_config = triggers['push']
            if 'paths' not in push_config and 'paths-ignore' not in push_config:
                self.info.append(
                    "Consider using 'paths' or 'paths-ignore' filters "
                    "to avoid unnecessary workflow runs"
                )

    def check_jobs(self, workflow: Dict):
        """Validate jobs configuration."""
        jobs = workflow.get('jobs', {})

        for job_id, job in jobs.items():
            self.check_job(job_id, job)

    def check_job(self, job_id: str, job: Dict):
        """Validate individual job."""
        if 'runs-on' not in job:
            self.errors.append(f"Job '{job_id}': missing 'runs-on'")

        if 'steps' not in job and 'uses' not in job:
            self.errors.append(
                f"Job '{job_id}': must have either 'steps' or 'uses' (for reusable workflows)"
            )

        # Check for timeout
        if 'timeout-minutes' not in job:
            self.warnings.append(
                f"Job '{job_id}': no timeout set. "
                "Consider adding 'timeout-minutes' to prevent hung jobs"
            )

        # Check steps
        if 'steps' in job:
            self.check_steps(job_id, job['steps'])

    def check_steps(self, job_id: str, steps: List[Dict]):
        """Validate job steps."""
        if not steps:
            self.warnings.append(f"Job '{job_id}': has no steps")
            return

        for i, step in enumerate(steps):
            if not isinstance(step, dict):
                self.errors.append(f"Job '{job_id}', step {i}: must be an object")
                continue

            # Check for either 'run' or 'uses'
            if 'run' not in step and 'uses' not in step:
                self.errors.append(
                    f"Job '{job_id}', step {i}: "
                    "must have either 'run' or 'uses'"
                )

            # Check action versions
            if 'uses' in step:
                self.check_action_version(job_id, i, step['uses'])

            # Check for secret exposure
            if 'run' in step:
                self.check_command_injection(job_id, i, step)

    def check_action_version(self, job_id: str, step_num: int, uses: str):
        """Check if action is properly versioned."""
        if '@' not in uses:
            self.errors.append(
                f"Job '{job_id}', step {step_num}: "
                f"Action '{uses}' must specify a version (e.g., @v4 or @SHA)"
            )
            return

        action, version = uses.rsplit('@', 1)

        # Check for floating tags
        if version in ['main', 'master', 'latest']:
            self.warnings.append(
                f"Job '{job_id}', step {step_num}: "
                f"Action '{action}' uses floating tag '{version}'. "
                "Consider pinning to a specific version or SHA"
            )

    def check_command_injection(self, job_id: str, step_num: int, step: Dict):
        """Check for potential command injection vulnerabilities."""
        run_command = step.get('run', '')

        # Dangerous patterns in commands
        dangerous_patterns = [
            'github.event.issue.title',
            'github.event.issue.body',
            'github.event.pull_request.title',
            'github.event.pull_request.body',
            'github.event.comment.body',
            'github.head_ref',
        ]

        for pattern in dangerous_patterns:
            if f'${{{{{pattern}' in run_command:
                self.warnings.append(
                    f"Job '{job_id}', step {step_num}: "
                    f"Potential command injection using '{pattern}'. "
                    "Use environment variables instead of direct interpolation"
                )

    def check_best_practices(self, workflow: Dict):
        """Check for general best practices."""
        # Check for caching
        jobs = workflow.get('jobs', {})
        has_setup_node = False
        has_cache = False

        for job in jobs.values():
            if not isinstance(job, dict):
                continue

            steps = job.get('steps', [])
            for step in steps:
                if not isinstance(step, dict):
                    continue

                uses = step.get('uses', '')
                if 'actions/setup-node' in uses:
                    has_setup_node = True
                    if step.get('with', {}).get('cache'):
                        has_cache = True

                if 'actions/cache' in uses:
                    has_cache = True

        if has_setup_node and not has_cache:
            self.info.append(
                "Consider enabling caching in actions/setup-node or adding actions/cache "
                "for faster dependency installation"
            )

    def print_results(self):
        """Print validation results."""
        if self.errors:
            print("\n❌ ERRORS:")
            for error in self.errors:
                print(f"  - {error}")

        if self.warnings:
            print("\n⚠️  WARNINGS:")
            for warning in self.warnings:
                print(f"  - {warning}")

        if self.info:
            print("\n💡 SUGGESTIONS:")
            for info in self.info:
                print(f"  - {info}")

        if not self.errors and not self.warnings:
            print("\n✅ No issues found!")

        # Reset for next file
        self.errors = []
        self.warnings = []
        self.info = []


def main():
    parser = argparse.ArgumentParser(
        description='Validate GitHub Actions workflow files'
    )
    parser.add_argument(
        'files',
        nargs='+',
        type=Path,
        help='Workflow files to validate'
    )
    parser.add_argument(
        '--strict',
        action='store_true',
        help='Treat warnings as errors'
    )

    args = parser.parse_args()

    validator = WorkflowValidator()
    all_valid = True

    for file_path in args.files:
        if not validator.validate_file(file_path):
            all_valid = False

    if not all_valid:
        print("\n❌ Validation failed")
        sys.exit(1)

    print("\n✅ All workflows valid!")
    sys.exit(0)


if __name__ == '__main__':
    main()
