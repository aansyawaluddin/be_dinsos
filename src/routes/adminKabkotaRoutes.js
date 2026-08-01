import express from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import upload from "../middlewares/upload.js";
import * as ctrl from "../controllers/adminKabkotaController.js";

const router = express.Router();

router.get("/list-warga", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.listWarga));

router.get("/warga/:id", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.getWargaDetail));

router.get("/warga/:id/hasil", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.getHasilWawancara));

router.get("/chart", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.getCharts));

router.post("/surveyor", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.createSurveyor));

router.get("/surveyor", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.listSurveyor));

router.get(
    "/sebaran-wilayah",
    authenticate,
    authorize("ADMIN_KABKOTA"),
    asyncHandler(ctrl.getSebaranWilayah)
);

// Tahap 1: upload file -> preview JSON (belum masuk DB)
router.post(
    "/upload/preview",
    authenticate,
    authorize("ADMIN_KABKOTA"),
    upload.single("file"),
    asyncHandler(ctrl.previewUpload)
);

// Tahap 2: konfirmasi -> baru insert ke DB
router.post(
    "/upload/:uploadId/import",
    authenticate,
    authorize("ADMIN_KABKOTA"),
    asyncHandler(ctrl.importWarga)
);

// Batal / ganti file -> bersihkan file sementara
router.delete(
    "/upload/:uploadId",
    authenticate,
    authorize("ADMIN_KABKOTA"),
    asyncHandler(ctrl.cancelUpload)
);

router.get("/export/excel", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.exportExcel));
router.get("/export/pdf", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.exportPdf));

export default router;