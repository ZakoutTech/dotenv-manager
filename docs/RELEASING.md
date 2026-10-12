# Releasing

Versions, the changelog and releases are managed with [Changesets](https://github.com/changesets/changesets) and GitHub Actions on a self-hosted Linux runner.

## Making a change

1. Open a pull request whose **title** is a [Conventional Commit](https://www.conventionalcommits.org/): `feat: …`, `fix(editor): …`, `feat!: …` for a breaking change. Squash-merge it, so the title becomes the commit message on `main`.
2. For a user-facing change (`feat`, `fix`, `perf`, `revert`), add a changeset:

   ```sh
   npx changeset
   ```

   Choose `patch` for fixes and `minor` for features (before 1.0.0, also for breaking changes), and write one or two sentences for users. Commit the generated `.changeset/*.md` file. That text becomes the CHANGELOG entry.

The **PR Checks** workflow enforces both: it rejects titles that are not Conventional Commits, labels the PR with its type (`type: feat`, `breaking change`, …), and fails `feat`/`fix`/`perf`/`revert` PRs without a changeset. Add the `skip changeset` label to a PR that needs no release note.

The **CI** workflow runs on every pull request: format check, lint, type check, unit tests, integration tests (under `xvfb-run`) and packaging. The `.vsix` is kept as a build artifact for 14 days. Pull requests from forks are not run, so outside code never runs on the self-hosted runner.

## How a release happens

On every push to `main`, the **Release** workflow first runs the full CI. Then:

1. While there are unreleased changesets, it keeps a **`chore: version packages`** pull request open. It bumps the version in `package.json` and `package-lock.json`, writes the new `CHANGELOG.md` section from the changesets, and deletes them.
2. Merging that pull request (by hand, or automatically with `AUTO_RELEASE`, below) tags `vX.Y.Z` and creates the GitHub release, then publishes the `.vsix` to the **VS Code Marketplace** and **Open VSX** and attaches it to the release.

`package.json` is `"private": true`, so nothing is ever published to npm.

## One-time setup

### Runner

A self-hosted runner with the labels `self-hosted` and `linux`, with:

- `xvfb` (for `xvfb-run`) and the libraries VS Code needs to start, for example on Debian/Ubuntu: `sudo apt-get install -y xvfb libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2 libxkbfile1 libsecret-1-0`
- `git` and the GitHub CLI (`gh`)

Node.js is installed by the workflows from `.nvmrc`.

### Repository

1. **Settings → Actions → General → Workflow permissions:** tick **Allow GitHub Actions to create and approve pull requests** (for the Version Packages PR).
2. **Settings → Environments:** create an environment named `marketplace` with these secrets, and add yourself as a required reviewer to approve every publish.
   - `VSCE_PAT`: an Azure DevOps personal access token with the **Marketplace → Manage** scope, for the `zakout` publisher ([guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token)).
   - `OVSX_PAT`: an [Open VSX](https://open-vsx.org/) access token. Before the first publish, create the namespace once: `npx ovsx create-namespace zakout -p <token>`.
3. Optional but recommended: a repository secret `RELEASE_TOKEN`, a fine-grained personal access token (or GitHub App token) with read/write access to contents and pull requests. Pull requests opened with the default `GITHUB_TOKEN` do not start other workflows, so without it CI does not run on the Version Packages PR. (The release is still fully checked, because the Release workflow runs CI after it is merged.)
4. Recommended branch protection for `main`: require pull requests and the **Lint, test and package**, **Conventional PR title** and **Changeset** checks.

### Fully automatic releases (optional)

To release and publish whenever a pull request with a changeset is merged, without merging the Version Packages PR by hand:

1. Add the `RELEASE_TOKEN` secret (required: a merge made with the default `GITHUB_TOKEN` does not start the Release workflow, so nothing would be tagged or published).
2. **Settings → General:** tick **Allow auto-merge** and **Allow squash merging**.
3. **Settings → Secrets and variables → Actions → Variables:** add `AUTO_RELEASE` = `true`.

The Version Packages PR is then squash-merged as soon as its checks pass (or immediately when `main` has no required checks). Approval on the `marketplace` environment, if you set reviewers, still applies.
