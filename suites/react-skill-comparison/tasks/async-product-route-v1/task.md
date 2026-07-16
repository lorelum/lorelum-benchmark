# Keep the product route responsive after product lookup

The product page needs the product record before it knows which dependent data
to request. Once that record is available, inventory, review summary, and
related products are all needed for the same page response. The route currently
adds avoidable wait time after the product lookup completes.

Update `src/product-route.ts` so the page keeps the same response shape and
error behavior while avoiding that avoidable delay. Do not change the API
interfaces or add dependencies.
