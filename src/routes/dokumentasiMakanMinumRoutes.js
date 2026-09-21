import express from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import uploadDokumentasiMakanMinum from "../middlewares/uploadDokumentasiMakanMinum.js";
import * as ctrl from "../controllers/dokumentasiMakanMinumController.js";

const router = express.Router();

router.get("/enumerator", asyncHandler(ctrl.listEnumerator));
router.get("/periode", asyncHandler(ctrl.listPeriode));
router.get("/status", asyncHandler(ctrl.cekStatusDokumentasi));
router.post("/upload", uploadDokumentasiMakanMinum.array("foto", 10), asyncHandler(ctrl.uploadDokumentasi));

export default router;