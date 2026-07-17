import { verifyToken } from "../utils/jwt.js";
import { error } from "../utils/response.js";

export function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return error(res, "Token tidak ditemukan", 401);
    }

    const token = header.split(" ")[1];
    try {
        req.user = verifyToken(token);
        next();
    } catch (err) {
        return error(res, "Token tidak valid atau kedaluwarsa", 401);
    }
}

export function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) return error(res, "Belum login", 401);
        if (!allowedRoles.includes(req.user.role)) {
            return error(res, "Tidak punya akses untuk aksi ini", 403);
        }
        next();
    };
}