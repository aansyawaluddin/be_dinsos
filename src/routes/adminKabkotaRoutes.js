import express from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import * as ctrl from "../controllers/adminKabkotaController.js";

const router = express.Router();

router.get("/list-warga", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.listWarga));

router.get("/warga/:id", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.getWargaDetail));

router.get("/chart", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.getCharts));

router.get("/surveyor", authenticate, authorize("ADMIN_KABKOTA"), asyncHandler(ctrl.listSurveyor));

router.get(
    "/sebaran-wilayah",
    authenticate,
    authorize("ADMIN_KABKOTA"),
    asyncHandler(ctrl.getSebaranWilayah)
);

export default router;