# Changesets

Use [Changesets](https://github.com/changesets/changesets) to record what should ship in the next npm release.

```bash
npx changeset
```

Commit the generated file under `.changeset/` with your PR. On `master`, the release workflow opens or updates a “Version Packages” PR; when that merges, packages publish to npm. See [Releasing](../docs/releasing.md).
