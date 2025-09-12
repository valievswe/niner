// src/routes/testAdminRoutes.js

const express = require("express");
const router = express.Router();
const prisma = require("../../db/index");
const { verifyToken, isAdmin } = require("../../middleware/authMiddleware");

// All routes in this file are protected and require ADMIN role
router.use(verifyToken, isAdmin);

// --- ROUTES FOR THE  TEST BUILDER ---

// In: src/routes/testAdminRoutes.js

/**
 * @route   POST /api/admin/tests/templates
 * @desc    Create a new "shell" Test Template with all three sections.
 * @access  Private (Admin)
 */
router.post("/templates", async (req, res) => {
  const { title, description } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Title is required." });
  }
  try {
    const newTemplate = await prisma.testTemplate.create({
      data: {
        title,
        description,

        sections: {
          create: [
            {
              type: "LISTENING",
              content: { audioUrl: "", blocks: [] }, // Use 'blocks' instead of 'questions'
              answers: {},
            },
            {
              type: "READING",
              content: { passageText: "", blocks: [] },
              answers: {},
            },
            {
              type: "WRITING",

              content: { blocks: [] },
              answers: {},
            },
          ],
        },
      },
      include: { sections: true },
    });
    res.status(201).json(newTemplate);
  } catch (error) {
    console.error("Failed to create test template shell:", error);
    res.status(500).json({ error: "Could not create test template." });
  }
});

/**
 * @route   PATCH /api/admin/tests/templates/:templateId/sections/:sectionType
 * @desc    Update the content and answers for a specific section of a test.
 * @access  Private (Admin)
 */
router.patch(
  "/templates/:templateId/sections/:sectionType",
  async (req, res) => {
    const { templateId, sectionType } = req.params;
    const { content, answers } = req.body;

    try {
      const section = await prisma.section.findFirst({
        where: { testTemplateId: templateId, type: sectionType.toUpperCase() },
      });

      if (!section) {
        return res
          .status(404)
          .json({ error: "Section not found for this template." });
      }

      const updatedSection = await prisma.section.update({
        where: { id: section.id },
        data: { content, answers },
      });
      res.json(updatedSection);
    } catch (error) {
      console.error("Failed to update section:", error);
      res.status(500).json({ error: "Could not update section." });
    }
  }
);

// --- ROUTES FOR GENERAL TEST MANAGEMENT ---

/**
 * @route   GET /api/admin/tests/templates
 * @desc    Get a list of all created test templates.
 * @access  Private (Admin)
 */
router.get("/templates", async (req, res) => {
  try {
    const templates = await prisma.testTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch test templates." });
  }
});

/**
 * @route   GET /api/admin/tests/templates/:id
 * @desc    Get full details for one specific template (for editing in the builder).
 * @access  Private (Admin)
 */
router.get("/templates/:id", async (req, res) => {
  try {
    const template = await prisma.testTemplate.findUnique({
      where: { id: req.params.id },
      include: { sections: true },
    });
    if (!template)
      return res.status(404).json({ error: "Template not found." });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch template." });
  }
});

/**
 * @route   POST /api/admin/tests/schedule
 * @desc    Schedule an existing Test Template for a specific time window.
 * @access  Private (Admin)
 */
router.post("/schedule", async (req, res) => {
  const { testTemplateId, startTime, endTime } = req.body;

  if (!testTemplateId || !startTime || !endTime) {
    return res.status(400).json({
      error: "A test template ID, start time, and end time are required.",
    });
  }

  try {
    const scheduledTest = await prisma.scheduledTest.create({
      data: {
        testTemplateId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
      },
    });
    res.status(201).json(scheduledTest);
  } catch (error) {
    console.error("Failed to schedule test:", error);
    res.status(500).json({ error: "Could not schedule test." });
  }
});

/**
 * @route   GET /api/admin/tests/scheduled
 * @desc    Get a list of all scheduled tests (past, present, and future).
 * @access  Private (Admin)
 */
router.get("/scheduled", async (req, res) => {
  try {
    const scheduledTests = await prisma.scheduledTest.findMany({
      orderBy: {
        startTime: "desc",
      },
      include: {
        testTemplate: {
          select: {
            title: true,
          },
        },
      },
    });
    res.json(scheduledTests);
  } catch (error) {
    console.error("Failed to fetch scheduled tests:", error);
    res.status(500).json({ error: "Could not fetch scheduled tests." });
  }
});

/**
 * @route   DELETE /api/admin/tests/templates/:id
 * @desc    Delete a test template and all its associated sections
 * @access  Private (Admin)
 */

router.delete("/templates/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.scheduledTest.deleteMany({
        where: {
          testTemplateId: id,
        },
      });

      // 2. Now that the children are gone, it is safe to delete the parent TestTemplate.
      // The cascading delete for Sections will still happen automatically.
      await tx.testTemplate.delete({
        where: {
          id: id,
        },
      });
    });

    res.status(200).json({
      message: "Test template and all its schedules deleted successfully.",
    });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Test template not found." });
    }
    console.error("Failed to delete template", error);
    res
      .status(500)
      .json({ error: "Server Error, could not delete test template." });
  }
});
module.exports = router;
