import { AssetLoanService } from "../services/assetLoanService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const listAssetLoans = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.listAssetLoans(req.user, req.query);
  res.status(200).json(data);
});

export const getAssetLoanById = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.getAssetLoanById(
    req.params.assetLoanId,
    req.user
  );
  res.status(200).json(data);
});

export const getPublicAssetLoanByToken = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.getPublicAssetLoanByToken(req.params.token);
  res.status(200).json(data);
});

export const createAssetLoan = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.createAssetLoan(req.body, req.user);
  res.status(201).json(data);
});

export const updateAssetLoan = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.updateAssetLoan(
    req.params.assetLoanId,
    req.body,
    req.user
  );
  res.status(200).json(data);
});

export const updateLoanItemStatus = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.updateLoanItemStatus(
    req.params.assetLoanId,
    req.params.loanItemId,
    req.body,
    req.user
  );
  res.status(200).json(data);
});

export const returnAssetLoan = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.returnAssetLoan(
    req.params.assetLoanId,
    req.body,
    req.user
  );
  res.status(200).json(data);
});

export const cancelAssetLoan = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.cancelAssetLoan(
    req.params.assetLoanId,
    req.body,
    req.user
  );
  res.status(200).json(data);
});

export const deleteAssetLoan = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.deleteAssetLoan(
    req.params.assetLoanId,
    req.user
  );
  res.status(200).json(data);
});

export const createAssetLoanShare = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.createAssetLoanShare(
    req.params.assetLoanId,
    req.user
  );
  res.status(200).json(data);
});

export const disableAssetLoanShare = wrapAsync(async (req, res) => {
  const data = await AssetLoanService.disableAssetLoanShare(
    req.params.assetLoanId,
    req.user
  );
  res.status(200).json(data);
});
