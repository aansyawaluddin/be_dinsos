import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma.js";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) {
                return cb(new Error("ID warga tidak valid"));
            }

            const warga = await prisma.warga.findUnique({
                where: { id },
                select: { nik: true },
            });
            if (!warga?.nik) {
                return cb(new Error("Data warga tidak ditemukan, gagal menentukan folder upload"));
            }

            const folder = path.join(UPLOADS_ROOT, "warga", warga.nik);
            fs.mkdirSync(folder, { recursive: true });
            cb(null, folder);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname) || ".jpg";
        cb(null, `${file.fieldname}_${timestamp}${ext}`);
    },
});

const uploadFoto = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/jpg"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Foto harus berformat JPG atau PNG"));
        }
    },
});

export default uploadFoto;