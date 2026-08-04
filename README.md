# BuroBall

Application de classement de babyfoot entre collègues : comptes sur invitation,
matchs 1v1/2v1/2v2, Elo global et par poste, équipes équilibrées, statistiques
et tournois.

## Développement

Prérequis : Node.js 22.13 ou plus récent.

```bash
npm ci
npm run dev
```

Les algorithmes et le build complet sont validés avec :

```bash
npm test
```

## Docker

L'image contient le build de production et démarre BuroBall avec une base D1
locale persistante dans `/data`.

```bash
docker build -t buroball .
docker run --rm -p 3000:3000 \
  -e BUROBALL_DEMO_MODE=true \
  -v buroball-data:/data \
  buroball
```

L'application est ensuite disponible sur `http://localhost:3000`.

Le mode démo fournit une identité locale et des données d'exemple. Laissez-le
désactivé derrière un proxy qui injecte les en-têtes d'identité ChatGPT attendus
par l'application. Le port peut être modifié avec `-e PORT=8080 -p 8080:8080`.
Le chemin de persistance interne peut être configuré avec
`BUROBALL_DATA_DIR`.

## Publication continue

La GitHub Action `.github/workflows/docker-publish.yml` construit l'image pour
`linux/amd64` et `linux/arm64` :

- une pull request vérifie l'image sans la publier ;
- un push sur `main` publie `latest`, `main` et `sha-…` ;
- un tag Git commençant par `v` publie également ce tag de version.

Les images sont publiées dans `ghcr.io/<propriétaire>/<dépôt>` avec le
`GITHUB_TOKEN` fourni automatiquement par GitHub Actions. Aucun secret
supplémentaire n'est nécessaire.

Exemple après la première publication :

```bash
docker pull ghcr.io/dimitritimoz/foosball:latest
```
