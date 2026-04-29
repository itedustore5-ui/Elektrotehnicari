import bcrypt from "bcryptjs";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";

async function seed() {
  const existing = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  if (existing.length > 0) {
    console.log("Seed: admin korisnik već postoji, preskačem.");
    return;
  }

  const hash = await bcrypt.hash("admin123", 10);
  await db.insert(users).values({
    username: "admin",
    passwordHash: hash,
    passwordPlain: "admin123",
    fullName: "Administrator",
    role: "admin",
    active: true,
    neverExpires: true,
    quizOnce: false,
  });

  console.log("Seed: admin korisnik kreiran (admin / admin123)");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed greška:", err);
    process.exit(1);
  });
