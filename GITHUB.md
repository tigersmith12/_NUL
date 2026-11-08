# Importing NUL into GitHub

This project is ready to be hosted as a source repository. Application code is included; generated dependencies, desktop packages, local saves, logs, and signing credentials are excluded.

## Option A — push the included Git repository

The supplied project directory is initialized on `main` with an initial commit and **no remote configured**.

1. Create an empty repository on GitHub. Do not initialize it with a README, license, or `.gitignore`, because those files already exist here.
2. From this directory, run:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

If the remote repository already contains commits, reconcile them deliberately rather than force-pushing over work you need.

## Option B — upload the clean repo ZIP

The `nul-github-repo.zip` archive contains only the committed source tree, with no `.git`, `node_modules`, or `dist` directory.

1. Extract the archive.
2. Create an empty repository on GitHub.
3. In GitHub's web interface, choose **Add file → Upload files** and upload the **contents** of the extracted `nul/` directory, including hidden paths such as `.github/`, `.gitignore`, and `.gitattributes`.
4. Commit directly to `main`.

The web-upload route creates a new GitHub commit rather than preserving the local commit metadata.

## After import

- Read `README.md` for running, packaging, persistence, and RAM details.
- Read `project.md` for architectural context, validation results, constraints, and unresolved decisions.
- Enable GitHub Actions if your repository settings do not enable them automatically.
- Run **Build desktop apps** manually with **workflow_dispatch**, or push a tag such as `v0.2.0` to build Windows, macOS, and Linux artifacts on native runners.
- Add code-signing credentials only through your platform's encrypted secret storage. Do not commit certificates, private keys, notarization credentials, or tokens.

## Requirements

- Repository development/build: **Node.js 22.12+**
- Browser runtime: open `index.html`; no Node required
- Packaged desktop recipients: no Node, npm, or internet connection required

No GitHub remote has been configured and nothing has been published by the preparation process.
