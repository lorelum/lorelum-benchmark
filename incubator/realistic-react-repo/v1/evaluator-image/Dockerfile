FROM node:22.19.0-bookworm@sha256:f2bf1588ef7e8dd183d9e4cb4330a0d952204b7348ead42afb1aab11f9c4911b

ARG BUN_VERSION=1.3.11
ARG PLAYWRIGHT_VERSION=1.61.1
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN npm install --global bun@${BUN_VERSION} && \
    test "$(bun --version)" = "${BUN_VERSION}" && \
    test "$(node --version)" = "v22.19.0"

WORKDIR /opt/realistic-app
COPY incubator/realistic-react-repo/v1/public/starter/app/package.json ./
COPY incubator/realistic-react-repo/v1/public/starter/app/bun.lock ./
RUN bun install --frozen-lockfile && \
    bunx playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium

COPY incubator/realistic-react-repo/v1/public/starter/app/ ./
RUN bun run build && \
    test "$(bunx playwright --version)" = "Version ${PLAYWRIGHT_VERSION}"

USER 65532:65532
ENTRYPOINT ["bun"]
