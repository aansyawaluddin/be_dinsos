import prisma from "../lib/prisma.js";
import { comparePassword } from "../utils/hash.js";
import { signToken } from "../utils/jwt.js";
import { success, error } from "../utils/response.js";

export async function login(req, res) {
    const { username, password } = req.body;
    if (!username || !password) {
        return error(res, "Username dan password wajib diisi", 400);
    }

    const user = await prisma.user.findUnique({
        where: { username: String(username).trim().toLowerCase() },
    });
    if (!user || !user.aktif) {
        return error(res, "Username atau password salah", 401);
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
        return error(res, "Username atau password salah", 401);
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