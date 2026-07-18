import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const defaultPassword = await bcrypt.hash("password123", 10);

    await prisma.user.upsert({
        where: { username: "admin.provinsi" },
        update: {},
        create: {
            nama: "Admin Provinsi",
            username: "admin.provinsi",
            password: defaultPassword,
            role: "ADMIN_PROVINSI",
            kabupatenKota: null,
        },
    });

    await prisma.user.upsert({
        where: { username: "admin.palu" },
        update: {},
        create: {
            nama: "Admin Kota Palu",
            username: "admin.palu",
            password: defaultPassword,
            role: "ADMIN_KABKOTA",
            kabupatenKota: "KOTA_PALU",
        },
    });

    await prisma.user.upsert({
        where: { username: "enumerator1" },
        update: {},
        create: {
            nama: "Enumerator Contoh",
            username: "enumerator1",
            password: defaultPassword,
            role: "ENUMERATOR",
            kabupatenKota: "KOTA_PALU",
        },
    });

    console.log("3 akun contoh berhasil di-seed (password: password123)");
    console.log("Login pakai username: admin.provinsi / admin.palu / enumerator1");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });