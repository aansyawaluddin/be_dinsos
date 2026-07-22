import express from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import uploadFoto from "../middlewares/uploadFoto.js";
import * as ctrl from "../controllers/enumeratorController.js";

const router = express.Router();

router.get("/dashboard", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.getDashboard));
router.get("/warga", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.listTugasWarga));
router.get("/warga/:id", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.getTugasWargaDetail));

router.get("/instrumen", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.getInstrumen));

router.post(
    "/warga/:id/wawancara",
    authenticate,
    authorize("ENUMERATOR"),
    uploadFoto.single("foto"),
    asyncHandler(ctrl.submitWawancara)
);

router.get(
    "/warga/:id/hasil-wawancara",
    authenticate,
    authorize("ENUMERATOR"),
    asyncHandler(ctrl.getHasilWawancara)
);

export default router;