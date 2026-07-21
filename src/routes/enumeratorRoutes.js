import express from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import * as ctrl from "../controllers/enumeratorController.js";

const router = express.Router();

router.get("/dashboard", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.getDashboard));
router.get("/warga", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.listTugasWarga));
router.get("/warga/:id", authenticate, authorize("ENUMERATOR"), asyncHandler(ctrl.getTugasWargaDetail));

export default router;