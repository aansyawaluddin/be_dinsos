import express from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import uploadFoto from "../middlewares/uploadFoto.js";
import uploadProfileFoto from "../middlewares/uploadProfileFoto.js";
import * as ctrl from "../controllers/enumeratorController.js";

const router = express.Router();

router.post(
    "/profile/foto",
    authenticate,
    authorize("ENUMERATOR"),
    uploadProfileFoto.single("foto"),
    asyncHandler(ctrl.uploadFotoProfile)
);

router.get("/dashboard", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.getDashboard));
router.post("/warga", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.createWargaBaru));
router.get("/warga", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.listTugasWarga));
router.post(
    "/warga/:id/kendala",
    authenticate,
    authorize("ENUMERATOR"),
    uploadFoto.single("fotoKendala"),
    asyncHandler(ctrl.reportKendalaSurvei)
);

router.get("/warga/:id", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.getTugasWargaDetail));

router.get("/instrumen", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.getInstrumen));

router.post(
    "/warga/:id/wawancara",
    authenticate,
    authorize("ENUMERATOR"),
    uploadFoto.fields([
        { name: "foto", maxCount: 1 },
        { name: "fotoRumah", maxCount: 1 },
        { name: "tandaTanganResponden", maxCount: 1 },
        { name: "tandaTanganEnumerator", maxCount: 1 },
    ]),
    asyncHandler(ctrl.submitWawancara)
);

router.get(
    "/warga/:id/hasil-wawancara",
    authenticate,
    authorize("ENUMERATOR"),
    asyncHandler(ctrl.getHasilWawancara)
);

export default router;