"""Regression tests run the exact trusted code embedded in the enterprise workflow."""
from pathlib import Path
import subprocess
import tempfile
import unittest
import yaml

WORKFLOW = Path(__file__).resolve().parents[1] / '.github/workflows/included-runner-policy.yml'
document = yaml.safe_load(WORKFLOW.read_text())
step = next(step for step in document['jobs']['runner-policy']['steps'] if step.get('name') == 'Check runner policy')
source = step['run'].split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
policy = {'__name__': 'runner_policy_tests'}
exec(compile(source, str(WORKFLOW), 'exec'), policy)

class RunnerPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / '.github/workflows').mkdir(parents=True)

    def tearDown(self):
        self.temp.cleanup()

    def workflow(self, selector):
        path = self.root / '.github/workflows/check.yml'
        path.write_text(yaml.safe_dump({'on': 'pull_request', 'jobs': {'check': {'runs-on': selector, 'steps': [{'run': 'true'}]}}}))
        return '.github/workflows/check.yml'

    def check(self, selector):
        policy['check_workflow'](self.root, self.workflow(selector))

    def test_standard_linux_and_windows_allowed(self):
        for runner in ['ubuntu-latest', 'ubuntu-24.04-arm', 'windows-2025', 'ubuntu-slim']:
            with self.subTest(runner=runner):
                self.check(runner)

    def test_hosted_mac_and_larger_or_unknown_runners_rejected(self):
        for runner in ['macos-latest', 'macos-26', 'xcode-27', 'ubuntu-latest-16-cores', 'namespace-profile-mac-large', 'self-32vcpu-windows-2022']:
            with self.subTest(runner=runner), self.assertRaises(policy['PolicyError']):
                self.check(runner)

    def test_self_hosted_mac_preserved(self):
        self.check(['self-hosted', 'macOS', 'ARM64', 'self-mini-macos'])
        self.check(['self-hosted', 'dev-mini', 'heavy'])

    def test_group_must_be_explicitly_self_hosted(self):
        self.check({'group': 'local', 'labels': ['self-hosted', 'dev-mini']})
        with self.assertRaises(policy['PolicyError']):
            self.check({'group': 'large', 'labels': 'ubuntu-latest'})

    def test_all_conditional_outcomes_are_checked(self):
        self.check("${{ vars.LINUX_RUNNER == 'hosted' && 'ubuntu-latest' || fromJSON('[\"self-hosted\",\"dev-mini\"]') }}")
        self.check("${{ inputs.runner == 'dev-mini' && fromJSON('[\"self-hosted\",\"light\"]') || 'ubuntu-latest' }}")
        with self.assertRaises(policy['PolicyError']):
            self.check("${{ vars.RUNNER == 'linux' && 'ubuntu-latest' || 'macos-latest' }}")

    def test_unbounded_input_variable_and_job_outputs_rejected(self):
        for expression in ['${{ inputs.runner }}', '${{ vars.RUNNER }}', '${{ needs.setup.outputs.runner }}', 'ubuntu-${{ inputs.size }}']:
            with self.subTest(expression=expression), self.assertRaises(policy['PolicyError']):
                self.check(expression)

    def test_mac_in_matrix_include_rejected(self):
        path = self.root / self.workflow('${{ matrix.runner }}')
        data = yaml.safe_load(path.read_text())
        data['jobs']['check']['strategy'] = {'matrix': {'include': [{'runner': 'ubuntu-latest'}, {'runner': 'macos-latest'}]}}
        path.write_text(yaml.safe_dump(data))
        with self.assertRaises(policy['PolicyError']):
            policy['check_workflow'](self.root, '.github/workflows/check.yml')
        data['jobs']['check']['strategy']['matrix']['include'][1]['runner'] = 'windows-latest'
        path.write_text(yaml.safe_dump(data))
        policy['check_workflow'](self.root, '.github/workflows/check.yml')

    def test_local_reusable_workflow_is_inspected(self):
        self.workflow('macos-latest')
        caller = self.root / '.github/workflows/caller.yml'
        caller.write_text('jobs:\n  check:\n    uses: ./.github/workflows/check.yml\n')
        with self.assertRaises(policy['PolicyError']):
            policy['check_workflow'](self.root, '.github/workflows/caller.yml')

    def test_unknown_external_reusable_workflow_rejected(self):
        caller = self.root / '.github/workflows/caller.yml'
        caller.write_text('jobs:\n  check:\n    uses: stranger/runner/.github/workflows/mac.yml@main\n')
        with self.assertRaises(policy['PolicyError']):
            policy['check_workflow'](self.root, '.github/workflows/caller.yml')

    def test_symlink_workflow_rejected(self):
        self.workflow('ubuntu-latest')
        (self.root / '.github/workflows/link.yml').symlink_to('check.yml')
        with self.assertRaises(policy['PolicyError']):
            policy['check_workflow'](self.root, '.github/workflows/link.yml')

    def test_bad_base_fails_closed(self):
        with self.assertRaises(policy['PolicyError']):
            policy['changed_workflows'](self.root, '')

    def test_only_new_or_modified_workflow_files_are_selected(self):
        def git(*args):
            return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.DEVNULL).decode().strip()
        git('init')
        git('config', 'user.name', 'Policy Test')
        git('config', 'user.email', 'policy@example.invalid')
        self.workflow('ubuntu-latest')
        git('add', '.')
        git('commit', '-m', 'base')
        base = git('rev-parse', 'HEAD')
        self.workflow('macos-latest')
        (self.root / 'README.md').write_text('ordinary documentation')
        git('add', '.')
        git('commit', '-m', 'change')
        self.assertEqual(policy['changed_workflows'](self.root, base), ['.github/workflows/check.yml'])

if __name__ == '__main__':
    unittest.main()
