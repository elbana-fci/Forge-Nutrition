import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { catalog } from "../src/catalog.js";
const db = new PrismaClient();
try {
  for (const p of catalog)
    await db.product.upsert({ where: { id: p.id }, create: p, update: {} });
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 12)
      throw Error("Admin password must have at least 12 characters");
    await db.user.upsert({
      where: { email: process.env.ADMIN_EMAIL.toLowerCase() },
      create: {
        email: process.env.ADMIN_EMAIL.toLowerCase(),
        name: "Store admin",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12),
      },
      update: {},
    });
  }
  console.log(
    "Catalog seeded. Admin created only when ADMIN_PASSWORD is configured.",
  );
} finally {
  await db.$disconnect();
}
