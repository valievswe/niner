// src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const prisma = require("../../db/index");
const { verifyToken, isAdmin } = require("../../middleware/authMiddleware");

router.get("/users", [verifyToken, isAdmin], async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        personalID: true,
        phoneNumber: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc", // newest users first
      },
    });

    const formattedUsers = users.map((user) => ({
      ...user,
      roles: user.roles.map((userRole) => userRole.role.name),
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    res.status(500).json({ error: "Could not fetch users." });
  }
});

router.post("/assign-role", [verifyToken, isAdmin], async (req, res) => {
  const { userId, roleName } = req.body; //"ADMIN" or "USER"

  if (!userId || !roleName) {
    return res
      .status(400)
      .json({ error: "User ID and Role Name are required." });
  }

  try {
    // Find the role to get its ID
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      return res.status(404).json({ error: `Role '${roleName}' not found.` });
    }

    // Assign the role to the user by creating an entry in the UserRole table
    const userRole = await prisma.userRole.create({
      data: {
        userId: userId,
        roleId: role.id,
      },
    });

    res
      .status(201)
      .json({ message: `Role '${roleName}' assigned to user ${userId}.` });
  } catch (error) {
    // Handle case where user already has the role (unique constraint violation)
    if (error.code === "P2002") {
      return res
        .status(409)
        .json({ error: `User already has the '${roleName}' role.` });
    }
    res.status(500).json({ error: "Could not assign role." });
  }
});

router.delete("/users/:userId/", [verifyToken, isAdmin], async (req, res) => {
  const userIdToDelete = req.params.userId;
  const loggedInAdminId = req.user.userId;

  if (userIdToDelete === loggedInAdminId) {
    return res
      .status(403)
      .json({ error: "Action forbidden: You cannot delete your own account." });
  }

  try {
    await prisma.user.delete({
      where: {
        id: userIdToDelete,
      },
    });

    res.status(200).json({ message: "User deleted successfuly" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ message: "User not found" });
    }
    console.error("failed ti delete user: ", error);
    res.status(500).json({ message: "Server: Could not delete user." });
  }
});

router.delete(
  "/users/:userId/roles/:roleName",
  [verifyToken, isAdmin],
  async (req, res) => {
    const { userId, roleName } = req.params;
    try {
      const role = await prisma.role.findUnique({
        where: { name: roleName.toUpperCase() },
      });

      if (!role) {
        return res.status(404).json({ error: `Role ${roleName} not found` });
      }

      await prisma.userRole.delete({
        where: {
          userId_roleId: {
            userId: userId,
            roleId: role.id,
          },
        },
      });
      res.status(200).json({
        message: `Role ${roleName} revoked from user successfully.`,
      });
    } catch (error) {
      if (error.code === "P2025") {
        return res
          .status(404)
          .json({ message: "The user does not have this role to begin with" });
      }
      console.error("Failed to revoke:", error);
      res
        .status(500)
        .json({ message: "Server error while trying to revoke role" });
    }
  }
);

router.get("/attempts", [verifyToken, isAdmin], async (req, res) => {
  try {
    const attempts = await prisma.testAttempt.findMany({
      where: {
        status: "COMPLETED", // Only show finished tests
      },
      orderBy: {
        completedAt: "desc",
      },
      include: {
        // Include info about the user who took the test
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
        // Include info about which test was taken
        scheduledTest: {
          include: {
            testTemplate: {
              select: { title: true },
            },
          },
        },
      },
    });
    res.json(attempts);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch test attempts." });
  }
});

/**
 * @route   GET /api/admin/attempts/:id
 * @desc    Get the full details for a single test attempt for grading/review
 * @access  Private (Admin)
 */
router.get("/attempts/:id", [verifyToken, isAdmin], async (req, res) => {
  const { id } = req.params;
  try {
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: id },
      include: {
        user: {
          select: { firstName: true, lastName: true },
        },
        scheduledTest: {
          include: {
            testTemplate: {
              include: {
                // Get the sections to access BOTH content and correct answers
                sections: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      return res.status(404).json({ error: "Test attempt not found." });
    }

    res.json(attempt);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch attempt details." });
  }
});

module.exports = router;
