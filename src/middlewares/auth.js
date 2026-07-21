import { verifyToken } from "../utils/jwt.js";
import { error } from "../utils/response.js";
import prisma from "../lib/prisma.js";

export async function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return error(res, "Token tidak ditemukan", 401);
    }

    const token = header.split(" ")[1];
    let payload;
    try {
        payload = verifyToken(token);
    } catch (err) {
        return error(res, "Token tidak valid atau kedaluwarsa", 401);
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.id },
            select: { tokenVersion: true, aktif: true },
        });

        if (!user || !user.aktif || user.tokenVersion !== payload.tokenVersion) {
            return error(res, "Sesi sudah tidak valid, silakan login ulang", 401);
        }

        req.user = payload;
        next();
    } catch (err) {
        next(err);
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