FROM node:16-alpine

RUN apk update && apk add --no-cache ca-certificates openssl \
    && update-ca-certificates 2>/dev/null || true

# Install Doppler CLI
RUN apk add --no-cache ca-certificates && \
    wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add doppler

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

EXPOSE 80

ENV NODE_ENV=production
ENV PORT=80

ENTRYPOINT ["doppler", "run", "--"]
CMD ["npm", "start"]
