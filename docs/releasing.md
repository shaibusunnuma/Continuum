# Releasing (maintainers)

Published packages in this repo: **`@durion/sdk`**, **`@durion/react`**, **`@durion/eval`**, **`@durion/cli`**, and **`create-durion`**. **`@durion/studio`** and **`studio-server`** are **private** and excluded from npm publish (see `.changeset/config.json` `ignore`). **`@durion/cli`** still ships the Studio UI by running **`npm run build`** before publish, which builds **`@durion/studio`** and copies **`packages/studio/dist`** into **`packages/cli/studio-dist/`** (vendored static assets in the CLI tarball).

## 1. Prepare a changeset

After merging feature work on **`master`**, add a changeset so the next “Version packages” PR can bump versions and changelog entries consistently:

```bash
npx changeset
```

Follow the prompts: pick packages, semver bump (**major** / **minor** / **patch**), and write a short summary for consumers. That creates a new file under **`.changeset/`** (commit it).

You can also hand-author a `.changeset/*.md` file with the same YAML frontmatter format the CLI generates.

## 2. Version PR

Merge the changeset(s), then either:

- Open a PR that runs **`npm run version-packages`** (alias for **`changeset version`**), which updates **`package.json`** versions, dedupes changesets, and refreshes changelogs per Changesets config; **or**
- Run **`changeset version`** locally on **`master`** and open a PR with the version bumps.

## 3. Publish

From a clean **`master`** with versions already bumped and **`npm run build`** green:

```bash
npm run release
```

This runs **`npm run build`** then **`changeset publish`** (publishes to npm per your registry auth). CI may automate this step instead; keep **`NPM_TOKEN`** (or equivalent) configured where publish runs.

## 4. After release

- Tag / GitHub Release: optional but helpful for **`@durion/sdk`** consumers.
- Confirm **`create-durion`** and **`@durion/cli`** install cleanly via **`npx create-durion@latest`** / **`npx durion@latest`** once caches propagate.

## See also

- [Changesets documentation](https://github.com/changesets/changesets)
- Root [CHANGELOG.md](../CHANGELOG.md) for human-readable release notes
