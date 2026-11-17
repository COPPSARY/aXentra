import path from "path";
import { fileURLToPath } from "url";
import SwaggerParser from "@apidevtools/swagger-parser";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENAPI_FILE = path.join(__dirname, "swagger", "openapi.yaml");

let openApiSpec;

try {
  openApiSpec = await SwaggerParser.bundle(OPENAPI_FILE);
} catch (error) {
  logger.error("Failed to load Swagger OpenAPI spec", error);
  openApiSpec = {
    openapi: "3.0.3",
    info: {
      title: "IT Asset Inventory Backend API",
      version: "1.0.0",
    },
    paths: {},
  };
}

export { openApiSpec };
export default openApiSpec;
