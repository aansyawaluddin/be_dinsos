import prisma from "../lib/prisma.js";
import { comparePassword, hashPassword } from "../utils/hash.js";
import { signToken } from "../utils/jwt.js";
import { success, error } from "../utils/response.js";

const USERNAME_REGEX = /^[a-zA-Z0-9._]+$/;

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
        tokenVersion: user.tokenVersion,
    };

    const token = signToken(payload);
    return success(res, { token, user: payload }, "Login berhasil");
}

export async function logout(req, res) {
    await prisma.user.update({
        where: { id: req.user.id },
        data: { tokenVersion: { increment: 1 } },
    });

    return success(res, null, "Logout berhasil");
}

export async function updateProfile(req, res) {
    const { username, newPassword, password } = req.body;

    if (!password) {
        return error(res, "Password saat ini wajib diisi buat konfirmasi", 400);
    }
    if (!username && !newPassword) {
        return error(res, "Isi username baru dan/atau password baru", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
        return error(res, "User tidak ditemukan", 404);
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
        return error(res, "Password saat ini salah", 401);
    }

    const data = {};

    if (username) {
        const newUsername = String(username).trim().toLowerCase();
        if (!USERNAME_REGEX.test(newUsername)) {
            return error(res, "Username hanya boleh huruf, angka, titik, dan underscore (tanpa spasi)", 400);
        }
        data.username = newUsername;
    }

    if (newPassword) {
        if (String(newPassword).length < 6) {
            return error(res, "Password baru minimal 6 karakter", 400);
        }
        data.password = await hashPassword(newPassword);
        data.tokenVersion = { increment: 1 };
    }

    const updated = await prisma.user.update({
        where: { id: user.id },
        data,
    });

    const payload = {
        id: updated.id,
        nama: updated.nama,
        role: updated.role,
        kabupatenKota: updated.kabupatenKota,
        tokenVersion: updated.tokenVersion,
    };
    const token = signToken(payload);

    return success(
        res,
        { id: updated.id, username: updated.username, token, user: payload },
        newPassword
            ? "Profil berhasil diubah. Sesi di perangkat lain otomatis logout."
            : "Username berhasil diubah"
    );
}