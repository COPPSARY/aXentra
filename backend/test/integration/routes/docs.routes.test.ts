import SwaggerParser from "@apidevtools/swagger-parser";
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../../src/app.js";

describe("Swagger Docs", () => {
  it("GET /api/docs/openapi.json should return public docs json", async () => {
    const res = await request(app).get("/api/docs/openapi.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");

    await expect(SwaggerParser.validate(res.body)).resolves.toBeTruthy();

    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        "/api/users/{userId}",
        "/api/locations",
        "/api/locations/{locationId}",
        "/api/licenses",
        "/api/licenses/{softwareLicenseId}",
        "/api/licenses/{softwareLicenseId}/assignments",
        "/api/licenses/assignments/{licenseLinkAssetId}/unassign",
        "/api/assets",
        "/api/assets/{assetId}",
        "/api/assets/{assetId}/licenses",
        "/api/assets/{assetId}/specs",
        "/api/assets/types",
        "/api/assets/types/overview",
        "/api/assets/types/{assetTypeId}",
        "/api/assets/types/{assetTypeId}/assets",
        "/api/assets/types/{assetTypeId}/fields",
        "/api/assets/types/{assetTypeId}/fields/{fieldId}",
        "/api/assets/types/{assetTypeId}/products",
        "/api/assets/products/{productId}",
        "/api/assets/spec-values/{assetSpecValueId}",
        "/api/files",
        "/api/files/upload",
        "/api/files/{fileId}/assignments",
        "/api/dashboard",
        "/api/realtime/stream",
      ])
    );

    expect(res.body.paths["/api/users/{userId}"].patch).toBeDefined();
    expect(res.body.paths["/api/users/{userId}"].delete).toBeDefined();
    expect(res.body.paths["/api/licenses/{softwareLicenseId}"].patch).toBeDefined();
    expect(res.body.paths["/api/licenses/{softwareLicenseId}"].delete).toBeDefined();
    expect(res.body.paths["/api/licenses/{softwareLicenseId}/assignments"].get).toBeDefined();
    expect(res.body.paths["/api/licenses/{softwareLicenseId}/assignments"].post).toBeDefined();
    expect(res.body.paths["/api/assets/{assetId}"].patch).toBeDefined();
    expect(res.body.paths["/api/assets/{assetId}"].delete).toBeDefined();
    expect(res.body.paths["/api/assets/{assetId}/licenses"].get).toBeDefined();

    const publicLoanProperties =
      res.body.paths["/api/loans/public/{token}"].get.responses["200"].content[
        "application/json"
      ].schema.properties;
    expect(publicLoanProperties.shareUrl).toBeUndefined();
    expect(publicLoanProperties.shareToken).toBeUndefined();
    expect(publicLoanProperties.shareEnabled).toBeUndefined();

    expect(JSON.stringify(res.body)).not.toContain("companyName");
    expect(JSON.stringify(res.body)).not.toContain("company_name");
  });

  it("GET /api/docs/ should render public Swagger UI", async () => {
    const res = await request(app).get("/api/docs/");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });
});
