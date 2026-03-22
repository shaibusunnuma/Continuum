# Releasing (Changesets)

Published packages: **`@durion/sdk`**, **`@durion/react`**, **`@durion/eval`**. They are **linked** in Changesets during `0.x` (one shared version line). Private workspace packages (`example-server`, repo root) are not published. The Vite HITL demo under `examples/react-hitl-ui/` is part of the `examples` install only (not a workspace package).

## Maintainer flow

1. **After a change that should ship**, run from the repo root:

   ```bash
   npx changeset
   ```

   Choose the bump level (patch / minor / major) and write a short summary. Commit the new file under `.changeset/` with your PR.

2. **On `master`**, the [Release workflow](../.github/workflows/release.yml) runs. If there are pending changesets, it opens or updates a **“Version Packages”** pull request that bumps versions and updates changelogs.

3. **Merge that PR** when you are ready. The next run on `master` will **`npm run release`** (`changeset publish`) and publish to the npm registry.

## GitHub setup

- Add an npm **automation** token as repository secret **`NPM_TOKEN`** so CI can publish.
- The Release workflow uses **`GITHUB_TOKEN`** to open the **Version Packages** PR. If you see  
  `GitHub Actions is not permitted to create or approve pull requests`, set:
  - **Settings → Actions → General → Workflow permissions:** choose **Read and write permissions**.
  - Enable **Allow GitHub Actions to create and approve pull requests** (same page).

  Orgs can block this with a policy; an admin may need to allow it for the repo.

- The workflow already requests `contents: write` and `pull-requests: write`; without the settings above, GitHub still denies PR creation.

## Further reading

- [Changesets — Adding a changeset](https://github.com/changesets/changesets/blob/main/docs/adding-a-changeset.md)
- [Changesets — Introduction](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)

The repo root [CHANGELOG.md](../CHANGELOG.md) can still hold high-level notes; per-package changelogs are generated under each `packages/*` directory when you version.
