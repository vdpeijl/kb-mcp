# GitHub Actions Workflows

## Publish to npm

The `publish.yml` workflow automatically publishes to npm when code is pushed to the `main` branch, **but only if the version in `package.json` has changed**.

### Setup Instructions

1. **Create an npm access token**:
   - Go to https://www.npmjs.com/settings/[your-username]/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type
   - Copy the token (it starts with `npm_...`)

2. **Add token to GitHub repository secrets**:
   - Go to your GitHub repository
   - Navigate to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: paste your npm token
   - Click "Add secret"

3. **Publishing workflow**:
   - When you want to publish a new version:
     ```bash
     # Bump version (patch, minor, or major)
     npm version patch  # or minor, or major

     # Push to main
     git push origin main --follow-tags
     ```
   - The GitHub Action will automatically:
     - Detect the version change
     - Build the project
     - Publish to npm
     - Create a GitHub release with the version tag

### Is it free?

**Yes!** Both GitHub Actions and npm publishing are completely free for public repositories:

- **GitHub Actions**: 2,000 minutes/month for free (public repos have unlimited minutes)
- **npm**: Free for public packages (scoped packages like `@vdpeijl/kb-mcp` are public by default)

### Manual publishing (if needed)

If you prefer to publish manually:

```bash
npm version patch  # Bump version
npm run build      # Build project
npm publish        # Publish to npm
git push --follow-tags  # Push version tag to GitHub
```

### Workflow Features

- ✅ Only publishes when `package.json` version changes
- ✅ Automatically creates GitHub releases
- ✅ Includes npm provenance for supply chain security
- ✅ Tags releases with version number (e.g., `v0.1.1`)
- ✅ Links GitHub release to npm package
