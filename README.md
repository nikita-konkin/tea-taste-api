# tea-taste-api

Backend of the **Tea Taste** app (`teaform.ru`) — a REST API for structured tea-tasting notes. Node.js / Express 4 / MongoDB (Mongoose). Users register, create a tasting **session** for a tea, then log each **brewing** with a rating, brewing time, and detailed **aroma** / **taste** descriptors. Sessions marked `publicAccess: true` are readable without authentication.

## Stack

- **Express 4** with `celebrate`/Joi request validation on every mutating route
- **Mongoose 6** — models: `user`, `teaform`, `brewing`, `aroma`, `taste` + reference dictionaries `aromaDB`, `tasteDB`
- **Auth**: JWT signed with `JWT_SECRET`, delivered as an `httpOnly` `jwt` cookie (secure in production); `middlewares/auth.js` guards all `/my-*`, `/profile`, `/create-form` routes
- **helmet**, per-IP rate limiting (stricter on `/sign-in` and `/sign-up`), graceful shutdown on SIGTERM/SIGINT

## Configuration (`.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `API_MONGO_URI` | prod: yes | `mongodb://localhost:27017` | MongoDB connection string (include the DB name, e.g. `.../teadb`) |
| `JWT_SECRET` | prod: **yes** (startup fails without it) | `dev-secret` in non-prod | JWT signing key |
| `NODE_ENV` | yes | — | `production` enables secure cookies and the real JWT secret |
| `PORT` | no | `3001` | HTTP port |
| `ALLOWED_CORS` | yes | empty (cross-origin blocked) | Comma-separated allowed origins |
| `DEFAULT_ALLOWED_METHODS` | no | `GET,HEAD,PUT,PATCH,POST,DELETE` | CORS methods header |

`.env` is not baked into the Docker image; provide it via `env_file` in docker-compose. Never commit it.

## Run

```bash
npm install
npm run dev      # nodemon
npm start        # node app.js
npm run lint
```

`app.js` is the single entrypoint: it connects to MongoDB first, then starts listening, and shuts down gracefully. Importing it (e.g. from supertest) does **not** start the server.

With Docker (expects the external network `mynetwork` and a reachable MongoDB):

```bash
docker compose up -d --build
```

For a fully local stack (MongoDB included, no external network) use the sandbox in [`../sandbox`](../sandbox).

## Tests

Integration tests (jest + supertest) live in `tests/` and cover the auth flow, the auth middleware, tea-form CRUD (including the PATCH regression), per-user data isolation, brewings, and the health endpoint. They need a MongoDB to talk to — the URI comes from `API_MONGO_URI` (default `mongodb://localhost:27017/tea-taste-test`; the target database is **wiped** at the start of each suite, so never point it at real data).

The easiest way to run them is through the sandbox, which provides a throwaway DB:

```bash
cd ../sandbox
docker compose --profile test run --rm tea-tests
```

With Node installed locally: `API_MONGO_URI=mongodb://localhost:27017/tea-taste-test npm test`.

## Seeding the descriptor dictionaries

`GET /aromadb` and `GET /tastedb` serve reference dictionaries used by the frontend autocomplete. Populate them once per database:

```bash
API_MONGO_URI=mongodb://localhost:27017/teadb node utils/seedAromaData.jsx
API_MONGO_URI=mongodb://localhost:27017/teadb node utils/seedTasteData.jsx
# or inside a container:
docker compose exec tea-backend node utils/seedAromaData.jsx
```

## API

Errors: `{ "status": "error", "message": "…" }`. Health probe: `GET /health` — returns `503` if the MongoDB connection is down.

### Public

| Method & path | Description |
|---|---|
| `POST /sign-up` | Register (`name`, `email`, `password`) |
| `POST /sign-in` | Login; sets the `jwt` cookie |
| `POST /sign-out` | Logout; clears the cookie |
| `GET /public-forms` | All public tea forms |
| `GET /public-brewings/:sessionId` | Public brewings of a session |
| `GET /public-aromas/:sessionId` | Public aromas of a session |
| `GET /public-tastes/:sessionId` | Public tastes of a session |

### Private (require the `jwt` cookie)

| Method & path | Description |
|---|---|
| `GET /profile/me` | Current user profile |
| `PATCH /profile/me` | Update `name`, `email`, `career`, `about`, `avatar` (URL); any subset, empty string clears an optional field |
| `PATCH /profile/password` | Change password (`oldPassword`, `newPassword`); verifies the current password |
| `GET /my-forms` | All of the user's tea forms |
| `GET /my-form/:sessionId` | One session's tea form |
| `POST /create-form/:sessionId` | Create a tea form |
| `PATCH /create-form/:sessionId` | Update a tea form |
| `DELETE /my-form/:sessionId` | Delete a session's form |
| `GET /my-brewings/:sessionId` | Brewings of a session |
| `POST /my-brewings/:sessionId/brew/:brewId` | Create a brewing |
| `PATCH /my-brewings/:sessionId/brew/:brewId` | Update a brewing |
| `DELETE /my-brews/:sessionId` | Delete all brewings of a session |
| `GET /my-aromas/:sessionId` | Aromas of a session |
| `POST/PATCH/DELETE /my-aromas/:sessionId/brew/:brewId/aroma/:aromaId` | Manage one aroma descriptor |
| `DELETE /my-aromas/:sessionId` | Delete all aromas of a session |
| `GET /my-tastes/:sessionId` | Tastes of a session |
| `POST/PATCH/DELETE /my-tastes/:sessionId/brew/:brewId/taste/:tasteId` | Manage one taste descriptor |
| `DELETE /my-tastes/:sessionId` | Delete all tastes of a session |
| `GET /aromadb` · `GET /tastedb` | Reference descriptor dictionaries |

`:sessionId` must be a UUIDv4 (generated by the client); `:brewId`, `:aromaId`, `:tasteId` are integers. All `/my-*` reads and deletes are scoped to the authenticated owner.

## Deployment

In production the API sits behind an outer nginx that terminates TLS and proxies
`https://teaform.ru/api/ → http://tea-backend:3001/` (the `/api` prefix is stripped
by the trailing slash in `proxy_pass`). The app sets `trust proxy`, so the rate
limiter uses the real client IP from `X-Forwarded-For`.
