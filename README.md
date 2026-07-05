# Eterm Extensions

This is the central repository containing the extensions available for Eterm.

Eterm keeps the same source-of-truth model as Zed's extension registry:
`extensions.toml` lists extension IDs, versions, and submodule paths, while
`.gitmodules` pins the extension source repositories. CI packages changed
extensions with `eterm-extension` and publishes a static marketplace registry to
GitHub Pages.

## Getting started

Until Eterm has dedicated extension authoring docs, use Zed's
[Developing Extensions](https://zed.dev/docs/extensions/developing-extensions)
docs for manifest format and extension APIs, then open a PR against this
repository.

Looking for extension ideas? Check out:

- [Top theme requests](https://github.com/swedflow-oss/extensions/issues?q=is%3Aissue+is%3Aopen+label%3Atheme+sort%3Areactions-%2B1-desc)
- [Top language requests](https://github.com/swedflow-oss/extensions/issues?q=is%3Aissue+is%3Aopen+label%3Alanguage+sort%3Areactions-%2B1-desc)

If an issue requesting an extension is tagged with the `needs infrastructure` label, it indicates that the extension cannot currently be developed due to the absence of necessary system infrastructure.

## Static Marketplace

The marketplace endpoint consumed by Eterm is:

```text
https://swedflow-oss.github.io/extensions/api
```

The generated registry shape is intentionally static:

- `extensions.json` contains the latest published metadata for every packaged extension.
- `extensions/updates.json` contains the same latest metadata for update checks.
- `extensions/<extension-id>.json` contains all packaged versions for one extension.
- `extensions/<extension-id>/<version>/archive.tar.gz` contains the packaged extension archive.
- `extensions/<extension-id>/latest/archive.tar.gz` points at the latest packaged archive.
