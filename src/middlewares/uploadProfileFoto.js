import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma.js"; // Pastikan import prisma

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const userId = req.user?.id;

            if (!userId) {
                return cb(new Error("ID User tidak ditemukan di kredensial"));
            }

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { username: true },
            });

            if (!user?.username) {
                return cb(new Error("Data user tidak ditemukan atau username kosong"));
            }

            const folder = path.join(UPLOADS_ROOT, "enumerator", user.username);
            fs.mkdirSync(folder, { recursive: true });

            cb(null, folder);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname) || ".jpg";
        cb(null, `profile_${timestamp}${ext}`);
    },
});

const uploadProfileFoto = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Maksimal 5MB
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/jpg"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Foto profil harus berformat JPG atau PNG"));
        }
    },
});

export default uploadProfileFoto;