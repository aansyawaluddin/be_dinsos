import express from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import { authenticate } from "../middlewares/auth.js";
import * as ctrl from "../controllers/authController.js";

const router = express.Router();

router.post("/login", asyncHandler(ctrl.login));
router.post("/logout", authenticate, asyncHandler(ctrl.logout));
router.patch("/profile", authenticate, asyncHandler(ctrl.updateProfile));

export default router;