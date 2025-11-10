# Use Node.js LTS version
FROM node:16-alpine

# Install Doppler CLI
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler

# Set working directory
WORKDIR /app

# Install production dependencies first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose the port the app runs on (default 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Default environment (can be overridden)
ENV ENV=production

# Start the application
# If DOPPLER_TOKEN is set and ENV != workstation, use Doppler; otherwise run directly
CMD if [ "$ENV" != "workstation" ] && [ -n "$DOPPLER_TOKEN" ]; then \
        echo "Starting with Doppler..."; \
        doppler run --token="$DOPPLER_TOKEN" -- npm start; \
    else \
        echo "Starting with local environment..."; \
        npm start; \
    fi
