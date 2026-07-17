import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const defaultPassword = await bcrypt.hash("password123", 10);

    await prisma.user.upsert({
        where: { email: "admin@gmail.com" },
        update: {},
        create: {
            nama: "Admin Provinsi",
            email: "admin@gmail.com",
            password: defaultPassword,
            role: "ADMIN_PROVINSI",
            kabupatenKota: null,
        },
    });

    await prisma.user.upsert({
        where: { email: "admin.palu@gmail.com" },
        update: {},
        create: {
            nama: "Admin Kota Palu",
            email: "admin.palu@gmail.com",
            password: defaultPassword,
            role: "ADMIN_KABKOTA",
            kabupatenKota: "KOTA_PALU",
        },
    });

    await prisma.user.upsert({
        where: { email: "enumerator1@gmail.com" },
        update: {},
        create: {
            nama: "Enumerator Contoh",
            email: "enumerator1@gmail.com",
            password: defaultPassword,
            role: "ENUMERATOR",
            kabupatenKota: "KOTA_PALU",
        },
    });

    console.log("3 akun contoh berhasil di-seed (password: password123)");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });