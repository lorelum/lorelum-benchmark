# Harden the local admin deployment configuration

The `admin-service` container exposes an unauthenticated administrative API.
Update the local deployment configuration so this API is not broadly reachable
from the host by default.

Modify `docker-compose.yaml` and `.env.example` while preserving the existing
host-port environment variable and the service's internal port. The sample
configuration should make clear how deployments are expected to provide
external access. Do not add dependencies or start containers.
