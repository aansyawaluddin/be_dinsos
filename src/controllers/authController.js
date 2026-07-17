import prisma from "../lib/prisma.js";
import { comparePassword } from "../utils/hash.js";
import { signToken } from "../utils/jwt.js";
import { success, error } from "../utils/response.js";

export async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
        return error(res, "email dan password wajib diisi", 400);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.aktif) {
        return error(res, "Email atau password salah", 401);
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
        return error(res, "Email atau password salah", 401);
    }

    const payload = {
        id: user.id,
        nama: user.nama,
        role: user.role,
        kabupatenKota: user.kabupatenKota,
    };

    const token = signToken(payload);
    return success(res, { token, user: payload }, "Login berhasil");
}