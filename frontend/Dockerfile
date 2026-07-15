FROM node:20-slim

WORKDIR /app

# Copy dependency definition files
COPY package.json yarn.lock* package-lock.json* ./

# Install dependencies (defaulting to yarn since yarn.lock is present)
RUN yarn install --frozen-lockfile || yarn install || npm install

# Copy application files
COPY . .

# Expose the port CRA/Craco uses by default
EXPOSE 3000

# Set environment variables for development
ENV PORT=3000
ENV HOST=0.0.0.0
# Ensure hot reloading (polling) works nicely on Windows/Docker mounted volumes
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true

# Start the development server
CMD ["yarn", "start"]
