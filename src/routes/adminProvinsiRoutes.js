import express from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import upload from "../middlewares/upload.js";
import * as ctrl from "../controllers/adminProvinsi.js";

const router = express.Router();

router.get("/list-warga", authenticate, authorize("ADMIN_PROVINSI"), asyncHandler(ctrl.listWarga));

router.get("/warga/:id", authenticate, authorize("ADMIN_PROVINSI"), asyncHandler(ctrl.getWargaDetail));

// Tahap 1: upload file -> preview JSON (belum masuk DB)
router.post(
    "/upload/preview",
    authenticate,
    authorize("ADMIN_PROVINSI"),
    upload.single("file"),
    asyncHandler(ctrl.previewUpload)
);

// Tahap 2: konfirmasi -> baru insert ke DB
router.post(
    "/upload/:uploadId/import",
    authenticate,
    authorize("ADMIN_PROVINSI"),
    asyncHandler(ctrl.importWarga)
);

// Batal / ganti file -> bersihkan file sementara
router.delete(
    "/upload/:uploadId",
    authenticate,
    authorize("ADMIN_PROVINSI"),
    asyncHandler(ctrl.cancelUpload)
);

router.get(
    "/chart",
    authenticate,
    authorize("ADMIN_PROVINSI"),
    asyncHandler(ctrl.getCharts)
);

// Data Surveyor
router.get("/surveyor", authenticate, authorize("ADMIN_PROVINSI"), asyncHandler(ctrl.listSurveyor));
router.post("/surveyor", authenticate, authorize("ADMIN_PROVINSI"), asyncHandler(ctrl.createSurveyor));

router.patch("/surveyor/:id/status", authenticate, authorize("ADMIN_PROVINSI"), asyncHandler(ctrl.setSurveyorStatus));
router.delete("/surveyor/:id", authenticate, authorize("ADMIN_PROVINSI"), asyncHandler(ctrl.deleteSurveyor));

router.get(
    "/sebaran-wilayah",
    authenticate,
    authorize("ADMIN_PROVINSI"),
    asyncHandler(ctrl.getSebaranWilayah)
);

router.get("/export/excel", authenticate, authorize("ADMIN_PROVINSI"), asyncHandler(ctrl.exportExcel));
router.get("/export/pdf", authenticate, authorize("ADMIN_PROVINSI"), asyncHandler(ctrl.exportPdf));


export default router;