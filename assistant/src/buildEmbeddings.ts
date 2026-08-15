import { buildEmbeddingsCache } from "./embeddings.ts";

buildEmbeddingsCache().catch((err) => {
  console.error(err);
  process.exit(1);
});
