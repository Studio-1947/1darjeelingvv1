FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 8000

# Applies versioned SQL migrations from drizzle/, tracked in a __drizzle_migrations ledger, so each
# one runs exactly once and a re-deploy is a no-op.
#
# This replaced `drizzle-kit push --force`, which diffed the live database against schema.ts and
# reconciled it *without asking* on every single container start — a renamed or dropped column
# would have silently taken the production data with it. Schema changes now go through
# `npm run db:generate`, are reviewed as SQL in the diff, and are replayable.
CMD ["sh", "-c", "npx drizzle-kit migrate && npm start"]
