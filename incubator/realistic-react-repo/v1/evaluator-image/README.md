# Realistic evaluator image

Build from the benchmark repository root so the Dockerfile can copy the frozen
starter directly:

```powershell
docker build --file incubator/realistic-react-repo/v1/evaluator-image/Dockerfile --tag lorelum-realistic-evaluator:local .
```

The build runs the production Next build and installs the pinned Chromium
revision. A local tag or Docker config image ID is useful for development but
is not a formal evaluator identity. Before a task becomes a pilot, publish this
exact image to the protected registry and write its immutable OCI manifest
digest to `image.lock.yaml`. The task/experiment manifest must reference that
digest, never a tag.

The image evaluates a copied candidate app. It is separate from the Pi image:
the Pi container receives only the public workspace, while this evaluator image
is run by the trusted coordinator with private probes mounted outside the
candidate project.
