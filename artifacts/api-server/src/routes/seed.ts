async function seed() {
  const hash = await bcrypt.hash("admin123", 10);
  
  const existing = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  
  if (existing.length > 0) {
    // Forsiraj reset lozinke
    await db.update(users)
      .set({ passwordHash: hash, passwordPlain: "admin123" })
      .where(eq(users.username, "admin"));
    console.log("Seed: admin lozinka resetovana");
    return;
  }

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
