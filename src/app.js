import express from "express";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes.js";
import adminProvinsiRoutes from "./routes/adminProvinsiRoutes.js";
import adminKabkotaRoutes from "./routes/adminKabkotaRoutes.js";
import enumeratorRoutes from "./routes/enumeratorRoutes.js";
import errorHandler from "./middlewares/errorHandler.js";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("Origin tidak diizinkan oleh CORS"));
        },
        credentials: true,
    })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
}

app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/adminProvinsi", adminProvinsiRoutes);
app.use("/api/adminKabkota", adminKabkotaRoutes);
app.use("/api/enumerator", enumeratorRoutes);

app.use((req, res) => {
    res.status(404).json({ success: false, message: "Endpoint tidak ditemukan" });
});

app.use(errorHandler);

export default app;