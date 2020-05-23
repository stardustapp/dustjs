FROM node:12-alpine
WORKDIR /app

# Add node deps
ADD package*.json ./
RUN npm ci --production

# Add source files
ADD src src

# Entrypoint on node
CMD ["node", "--unhandled-rejections=strict", "/app"]
