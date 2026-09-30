# Included runner policy

`included-runner-policy.yml` is the public source for Swedflow AB's centrally
required enterprise runner check. Enterprise rules apply it to pull requests
targeting default branches; individual repositories do not need caller files.
The `merge_group` event is included for repositories using a merge queue.

The check inspects new or modified workflow files and their local reusable
workflows as data. It rejects GitHub-hosted macOS, larger/unknown hosted labels,
unbounded runner inputs, unsafe matrix values, and unreviewed external reusable
workflows. Explicit `self-hosted` labels preserve free local Mac runners.
Conditional selectors are accepted only when both outcomes are verifiably safe.
The standard Linux/Windows allowlist follows GitHub's standard-runner reference.

Existing unchanged workflow files are not revalidated on unrelated application
changes. Inherited third-party runner configurations must be reviewed or removed
before those workflow files can be changed. This check is a merge safeguard;
the enterprise $0 Actions stop budget remains the financial boundary for runs
on feature branches and other events before a pull request is merged.

The policy code is embedded in the centrally sourced workflow, uses read-only
permissions, does not persist checkout credentials, and never executes scripts
from the repository it inspects. The YAML parser is installed in an isolated
environment and Python runs with `-I` from the runner's temporary directory.

Run regression tests with Python and PyYAML 6.0.3 installed:

```sh
python3 tests/test_runner_policy.py
actionlint .github/workflows/included-runner-policy.yml
```

The tests execute the exact code embedded in the workflow, including matrix,
conditional, reusable-workflow, symlink, and base-commit failure cases.
