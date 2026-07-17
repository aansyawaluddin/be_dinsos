import { error } from "../utils/response.js";

export default function errorHandler(err, req, res, next) {
    console.error(err);

    if (err.code === "P2002") {
        return error(res, `Data duplikat pada field: ${err.meta?.target}`, 409);
    }
    if (err.code === "P2025") {
        return error(res, "Data tidak ditemukan", 404);
    }
    if (err.code === "P2003") {
        return error(res, "Referensi data tidak valid (foreign key)", 400);
    }

    return error(res, err.message || "Terjadi kesalahan pada server", err.statusCode || 500);
}