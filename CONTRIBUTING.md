# Contributing to Eterm Extensions

Thanks for contributing to the Eterm extension ecosystem!

For the process to go smoothly, please read Zed's [Extension Publishing Prerequisites](https://zed.dev/docs/extensions/developing-extensions#extension-publishing-prerequisites) thoroughly and make sure to follow the steps described in [Publishing Your Extension](https://zed.dev/docs/extensions/developing-extensions#publishing-your-extension). Eterm currently uses the same extension manifest and API model, while this repository owns the marketplace registry consumed by Eterm.

Note that not every extension is a good fit for being published - for example, if your extension provides functionality already provided by another extension, you should consider contributing fixes in the existing extension for all users first before opening a pull request for a new extension here.

Furthermore, we expect extensions to be tested locally as a dev extension before they're submitted. PRs for extensions that clearly don't work will be closed.

Your extension repository also needs to include an [accepted license](https://zed.dev/docs/extensions/developing-extensions#extension-license-requirements).

## Updating an existing extension

If you're updating an extension you maintain, please make sure to follow the [Updating an Extension](https://zed.dev/docs/extensions/developing-extensions#updating-an-extension) guide.

CI packages changed extensions with the `eterm-extension` CLI and publishes the generated registry to GitHub Pages after changes land on `main`.

## Documentation

For anything not covered here, start with Zed's [extension documentation](https://zed.dev/docs/extensions) while Eterm-specific docs are still being written.
