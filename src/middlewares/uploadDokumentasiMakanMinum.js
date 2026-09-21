import multer from "multer";

export const MAX_FOTO_DOKUMENTASI = 10;

const uploadDokumentasiMakanMinum = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: MAX_FOTO_DOKUMENTASI },
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/jpg"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Foto harus berformat JPG atau PNG"));
        }
    },
});

export default uploadDokumentasiMakanMinum;