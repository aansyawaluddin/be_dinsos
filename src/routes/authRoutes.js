import express from "express";
import asyncHandler from "../middlewares/asyncHandler.js";
import * as ctrl from "../controllers/authController.js";

const router = express.Router();

router.post("/login", asyncHandler(ctrl.login));

export default router;