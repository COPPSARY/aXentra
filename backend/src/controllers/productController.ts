import { ProductService } from "../services/productService.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor } from "../middleware/requestContext.js";

export const listProductsByAssetType = wrapAsync(async (req, res) => {
  const data = await ProductService.listProductsByAssetType(
    req.params.assetTypeId,
    getActor(req),
    req.query
  );
  res.status(200).json(data);
});

export const getProductById = wrapAsync(async (req, res) => {
  const data = await ProductService.getProductById(req.params.productId, getActor(req));
  res.status(200).json(data);
});

export const createProduct = wrapAsync(async (req, res) => {
  const data = await ProductService.createProduct(
    req.params.assetTypeId,
    req.body,
    getActor(req)
  );
  res.status(201).json(data);
});

export const updateProduct = wrapAsync(async (req, res) => {
  const data = await ProductService.updateProduct(req.params.productId, req.body, getActor(req));
  res.status(200).json(data);
});

export const deleteProduct = wrapAsync(async (req, res) => {
  const data = await ProductService.deleteProduct(req.params.productId, getActor(req));
  res.status(200).json(data);
});
