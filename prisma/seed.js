// prisma/seed.js
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs"); // Import bcryptjs

async function main() {
  console.log("Seeding roles...");

  // Create ADMIN and USER roles if they don't exist
  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: {
      name: "ADMIN",
      description: "Administrator with full access",
    },
  });

  await prisma.role.upsert({
    where: { name: "USER" },
    update: {},
    create: {
      name: "USER",
      description: "Standard user with basic access",
    },
  });

  console.log("Seeding admin user...");

  // Hash the admin password
  const adminPasswordHash = await bcrypt.hash("your_admin_password", 10);

  // Define the personal ID you want to use for login
  const adminPersonalID = "ADMIN_LOGIN_ID"; // <<< SET YOUR ADMIN'S PERSONAL ID HERE

  // Create or update an admin user, finding them by their unique email
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" }, // Use the required unique email to find the user
    update: {
      // Data to update if the user is found
      passwordHash: adminPasswordHash,
      personalID: adminPersonalID, // Ensure the personalID is set on update
    },
    create: {
      // Data to use if a new user is created
      email: "admin@example.com",
      username: "adminuser",
      passwordHash: adminPasswordHash,
      firstName: "Admin",
      lastName: "User",
      personalID: adminPersonalID, // Set the personalID on create
      emailVerified: true,
    },
  });

  console.log("Assigning ADMIN role to admin user...");

  // Assign the ADMIN role to the admin user
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  // --- Log the admin user's credentials ---
  console.log("\n--- Admin Login Credentials ---");
  console.log(`Personal ID: ${adminUser.personalID}`);
  console.log(`Password: 'your_admin_password'`); // This is the raw password you set
  console.log("---------------------------------\n");

  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
