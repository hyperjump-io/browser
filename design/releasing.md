# Releasing

A release is published from `main`. The site builds `website/` from `main`
too, so the docs are live before the code is on npm. That's why a feature
that isn't released is marked `*Coming soon*`.

## Before

- [ ] `main` is clean and pushed, and CI passed on its last commit
  (`gh run list --branch main --limit 1`).
- [ ] `npm test`, `npm run lint`, and `npm run type-check` pass.
- [ ] `vale website design` has no errors.
- [ ] Every page in `website/` about a feature that isn't released has
  `*Coming soon*` on its own line under the heading. A major release has no
  markers, since what's in it is the starting point.
- [ ] `npm pack --dry-run` lists `src/` without tests, `src/test-helpers/`,
  or `src/json/jsonast-util-tests/`, plus `README.md`, `LICENCE`, and
  `package.json`.
- [ ] The version follows from the `.d.ts` files: a change to what they
  declare that breaks code using them is major, an addition is minor, and
  anything else is a patch.

## Release

- [ ] `npm version <major|minor|patch>`. It bumps `package.json`, runs
  `scripts/version-docs.js`, which replaces `*Coming soon*` with
  `*Added in vX.Y.Z*` in `website/`, and commits and tags. A prerelease,
  like `2.1.0-dev.0`, leaves the markers.
- [ ] `git push --follow-tags`
- [ ] `npm publish`. A prerelease gets `--tag next`, and a release from the
  `v1` branch gets `--tag v1`, so `latest` stays the newest stable version.

## After

- [ ] At <https://hyperjump.io/browser/>, the sidebar shows the new version and
  released features show their "Added in" badge.
- [ ] `npm view @hyperjump/browser dist-tags` shows the version under the
  right tag.
- [ ] Packages that depend on this one, like `@hyperjump/json-schema`, are
  updated to it if they need what's new.
