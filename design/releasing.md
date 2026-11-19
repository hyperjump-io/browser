# Releasing

A release is published from `main`. The site builds `website/` from `main`
too, so the docs are live before the code is on npm. That's why a feature
that isn't released is marked `*Coming soon*`.

## Before

- [ ] `main` is clean, and CI passed on the last commit pushed
  (`gh run list --branch main --limit 1`).
- [ ] `npm test`, `npm run lint`, and `npm run type-check` pass in a clean
  worktree of `main`, as they do in CI. In a checkout, Vitest also finds the
  tests in `scratch/`.
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
- [ ] `npm publish`. A prerelease gets `--tag next`, and a release from the
  `v1` branch gets `--tag v1`, so `latest` stays the newest stable version.
- [ ] `git push --follow-tags`. It's after publishing, so the site shows the
  new version and its "Added in" badges once it's on npm.
- [ ] `gh release create vX.Y.Z --title vX.Y.Z --notes-file <notes>`, with
  `--prerelease` for a prerelease. The notes are written, not generated.
  See [Release notes](#release-notes).

## After

- [ ] At <https://hyperjump.io/browser/>, the sidebar shows the new version and
  released features show their "Added in" badge.
- [ ] `npm view @hyperjump/browser dist-tags` shows the version under the
  right tag.
- [ ] Packages that depend on this one, like `@hyperjump/json-schema`, are
  updated to it if they need what's new.

## Release notes

The notes say what changed for someone who uses the package, in the docs'
voice, like the other Hyperjump packages' releases. They link to the page
at <https://hyperjump.io/browser/> for each feature they name.

- A major release starts with a sentence that says what it is and where the
  documentation is, like "A rewrite of `@hyperjump/browser`. The
  documentation is now at …". Then `## What's new`, as bullets that start
  with the feature in bold, and `## Breaking changes`, one bullet for each.
  It ends by linking the page on migrating, if there is one.
- A minor or patch release has a section for each kind of change, in this
  order, leaving out what's empty: a section named for each new feature,
  with an example, then `## Security`, `## Fixes`, `## Performance`, and
  `## Internal`. A bullet says what changed and what it means for the
  user, and ends with the pull request and who wrote it, like
  "(#140, by `@name`)", when it's someone else's.
- A release with no code changes starts with "No changes to the code." and
  says what did change, like the README.
- Except for a major release, the notes end with
  `**Full Changelog**: https://github.com/hyperjump-io/browser/compare/vA.B.C...vX.Y.Z`,
  from the release before.
