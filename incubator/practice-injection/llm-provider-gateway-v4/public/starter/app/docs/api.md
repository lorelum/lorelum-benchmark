# Gateway API

POST /api/chat accepts `{ tenant, message }` and returns `{ content }`. Failed upstream calls use a domain error. Billing records include tenant, provider, usage, cost, and trace id.
