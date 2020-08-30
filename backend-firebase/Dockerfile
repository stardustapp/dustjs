FROM node:14-alpine

# Add system deps
#RUN apk add --no-cache python build-base

# Add node manifests
WORKDIR /app
ADD package*.json ./

# Add node deps
RUN npm ci --production

# Add source files
ADD src src
ADD builtin-schemas builtin-schemas

# Entrypoint on just node
CMD ["node", "--unhandled-rejections=strict", "src/app-standalone.js"]
