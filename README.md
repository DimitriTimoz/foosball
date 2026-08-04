# Office Foos

An office foosball leaderboard with username/password invitation-only accounts, 1v1/2v1/2v2
matches, global and position-specific Elo ratings, balanced teams, statistics,
and tournaments.

## Development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Run the algorithm tests and a complete production build with:

```bash
npm test
```

## Docker

The image contains the production build and starts Office Foos with a local D1
database persisted in `/data`.

```bash
docker build -t office-foos .
docker run --rm -p 3000:3000 \
  -e BUROBALL_DEMO_MODE=true \
  -v office-foos-data:/data \
  office-foos
```

The app is then available at `http://localhost:3000`.

Demo mode provides a local identity and sample data without requiring a login.
Keep it disabled in production so Office Foos uses its built-in username and
password authentication. Change the port with `-e PORT=8080 -p 8080:8080`.
Configure the internal persistence path with `BUROBALL_DATA_DIR`.

## Continuous delivery

The `.github/workflows/docker-publish.yml` GitHub Action builds the image for
`linux/amd64` and `linux/arm64`:

- pull requests validate the image without publishing it;
- pushes to `main` publish `latest`, `main`, and `sha-…`;
- Git tags starting with `v` also publish the matching version tag.

Images are published to `ghcr.io/<owner>/<repository>` with the `GITHUB_TOKEN`
automatically provided by GitHub Actions. No additional secret is required.

Example after the first publication:

```bash
docker pull ghcr.io/dimitritimoz/foosball:latest
```
