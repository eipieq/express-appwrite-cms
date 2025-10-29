# Contributing to Express Appwrite CMS

Thanks for your interest in contributing! This guide explains how to propose changes, report issues, and collaborate with the Express Appwrite CMS maintainers.

## Ways to contribute
- Report bugs or request features in GitHub Issues.
- Ask questions or share ideas via GitHub Discussions.
- Improve documentation, examples, or developer tooling.
- Submit pull requests for fixes, enhancements, or tests.

## Development workflow
1. **Fork the repository** and create a local clone.
2. **Create a feature branch** from `main`: `git checkout -b feat/amazing-improvement`.
3. **Install dependencies**: `npm install`.
4. **Set up environment variables** by copying `.env.example` to `.env.local` and filling in your Appwrite credentials.
5. Make your changes, keeping commits focused and well-described.
6. **Run checks** before submitting:
   ```bash
   npm run lint
   npm run build
   ```
7. Open a pull request that clearly explains:
   - What changed and why
   - Testing performed (include commands)
   - Any follow-up work or open questions

## Coding standards
- Prefer TypeScript and modern React patterns (App Router, Server Actions where appropriate).
- Maintain strict typing—avoid `any` unless necessary and justified.
- Keep components and utilities small, composable, and well-tested.
- Reuse shared helpers from `src/lib` or `src/components` rather than duplicating logic.
- Document complex business rules with concise comments.

## Commit and PR guidelines
- Write descriptive commit messages (e.g. `fix: validate Appwrite config before upload`).
- Reference related issues in the PR description (e.g. `Closes #123`).
- Add tests or update existing ones when fixing bugs or adding features.
- Update documentation if behaviour or configuration changes.

## Review process
Maintainers will review your pull request and may request changes. Please:
- Respond to feedback within a reasonable time.
- Keep discussions respectful and constructive.
- Mark conversations as resolved when addressed.

## Code of Conduct
By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behaviour to the maintainers listed in that document.

Thank you for helping make Express Appwrite CMS better for everyone!
