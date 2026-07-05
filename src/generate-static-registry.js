import { generateStaticRegistry } from "./lib/static-registry.js";

await generateStaticRegistry(process.env["PUBLISH_DIR"] || "public");
