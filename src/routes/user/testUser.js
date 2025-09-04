// src/routes/testUserRoutes.js

const express = require("express");
const router = express.Router();
const prisma = require("../../db/index");
const { verifyToken, isUser } = require("../../middleware/authMiddleware");

// All routes here are for any logged-in user with the 'USER' role
router.use(verifyToken, isUser);

/**
 * @route   GET /api/tests/available
 * @desc    Get a list of tests currently active and available to take
 */
router.get("/available", async (req, res) => {
  const now = new Date();
  try {
    const availableTests = await prisma.scheduledTest.findMany({
      where: {
        isActive: true,
        startTime: { lte: now },
        endTime: { gte: now },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        testTemplate: {
          select: { id: true, title: true, description: true },
        },
      },
    });
    res.json(availableTests);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch available tests." });
  }
});

/**
 * @route   POST /api/tests/:testId/start
 * @desc    Start a test attempt for a specific scheduled test
 */
router.post("/:testId/start", async (req, res) => {
  const scheduledTestId = req.params.testId;
  const userId = req.user.userId;
  try {
    const testAttempt = await prisma.testAttempt.create({
      data: {
        userId: userId,
        scheduledTestId: scheduledTestId,
      },
    });
    res.status(201).json(testAttempt);
  } catch (error) {
    if (error.code === "P2002") {
      const existingAttempt = await prisma.testAttempt.findUnique({
        where: { userId_scheduledTestId: { userId, scheduledTestId } },
      });
      return res.status(200).json(existingAttempt);
    }
    res.status(500).json({ error: "Could not start test." });
  }
});

/**
 * @route   GET /api/tests/attempts/:attemptId/section/:sectionType
 * @desc    Get the content for ONLY ONE specific section of a test.
 */
router.get("/attempts/:attemptId/section/:sectionType", async (req, res) => {
  const { attemptId, sectionType } = req.params;
  const userId = req.user.userId;

  try {
    // Security check: Verify this attempt belongs to the logged-in user
    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, userId: userId },
      select: { scheduledTest: { select: { testTemplateId: true } } },
    });
    if (!attempt)
      return res.status(404).json({
        error: "Test attempt not found or you do not have permission.",
      });

    const section = await prisma.section.findFirst({
      where: {
        testTemplateId: attempt.scheduledTest.testTemplateId,
        type: sectionType.toUpperCase(),
      },

      select: { id: true, type: true, content: true },
    });
    if (!section) return res.status(404).json({ error: "Section not found." });

    res.json(section);
  } catch (error) {
    console.error("Failed to retrieve section:", error);
    res.status(500).json({ error: "Could not retrieve section." });
  }
});

/**
 * @route   POST /api/tests/attempts/:attemptId/submit-section
 * @desc    Submit answers for a SINGLE section and save them to the database.
 */
router.post("/attempts/:attemptId/submit-section", async (req, res) => {
  const { attemptId } = req.params;
  const { sectionType, answers } = req.body; // e.g., sectionType: "LISTENING", answers: { q1: "A", ... }

  try {
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
      select: { userAnswers: true },
    });

    if (!attempt) return res.status(404).json({ error: "Attempt not found." });

    // Merge the new section answers with any existing answers from other sections
    const currentUserAnswers = attempt.userAnswers ? attempt.userAnswers : {};
    const updatedUserAnswers = {
      ...currentUserAnswers,
      [sectionType.toUpperCase()]: answers,
    };

    // Update the attempt record with the new, merged answers
    await prisma.testAttempt.update({
      where: { id: attemptId },
      data: { userAnswers: updatedUserAnswers },
    });

    res
      .status(200)
      .json({ message: `${sectionType} answers submitted successfully.` });
  } catch (error) {
    console.error("Failed to submit section:", error);
    res.status(500).json({ error: "Could not submit section answers." });
  }
});

/**
 * @route   POST /api/tests/attempts/:attemptId/submit
 * @desc    Submit the entire test's answers in one go from the test room.
 */
router.post("/attempts/:attemptId/submit", async (req, res) => {
  const { attemptId } = req.params;
  const userId = req.user.userId;
  const allAnswers = req.body; // This will be the full userAnswers object

  try {
    // Security: Find the attempt and ensure it belongs to the logged-in user
    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, userId: userId },
    });

    if (!attempt) {
      return res
        .status(404)
        .json({ error: "Attempt not found or permission denied." });
    }

    // Update the attempt with the complete set of answers
    await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        userAnswers: allAnswers, // Save the entire JSON object
      },
    });

    res.status(200).json({ message: "Test answers submitted successfully." });
  } catch (error) {
    console.error("Failed to submit test answers:", error);
    res.status(500).json({ error: "Could not submit answers." });
  }
});

/**
 * @route   POST /api/tests/attempts/:attemptId/finish
 * @desc    Finalize the test after all sections are complete, perform grading, and mark as completed.
 */
router.post("/attempts/:attemptId/finish", async (req, res) => {
  const { attemptId } = req.params;

  try {
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        scheduledTest: {
          include: { testTemplate: { include: { sections: true } } },
        },
        user: true, // We need the user to check their ID
      },
    });

    if (!attempt || attempt.userId !== req.user.userId) {
      return res
        .status(404)
        .json({ error: "Attempt not found or permission denied." });
    }

    const userAnswers = attempt.userAnswers || {};
    const answerKey = {};
    attempt.scheduledTest.testTemplate.sections.forEach((sec) => {
      answerKey[sec.type] = sec.answers;
    });

    // --- Perform the full, final grading ---
    let listeningScore = 0;
    const listeningUserAns = userAnswers.LISTENING || {};
    const listeningCorrectAns = answerKey.LISTENING || {};
    for (const key in listeningCorrectAns) {
      if (listeningUserAns[key] === listeningCorrectAns[key]) {
        listeningScore++;
      }
    }

    let readingScore = 0;
    const readingUserAns = userAnswers.READING || {};
    const readingCorrectAns = answerKey.READING || {};
    for (const key in readingCorrectAns) {
      if (readingUserAns[key] === readingCorrectAns[key]) {
        readingScore++;
      }
    }

    // --- Update the database with the final status and results ---
    const finalResults = { listeningScore, readingScore };
    const updatedAttempt = await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        results: finalResults,
      },
    });

    res.status(200).json({
      message: "Test completed and graded successfully!",
      finalResults,
    });
  } catch (error) {
    console.error("Failed to finalize test:", error);
    res.status(500).json({ error: "Could not finalize test." });
  }
});

/**
 * @route   GET /api/tests/attempts/:attemptId
 * @desc    Get full details for a single completed test attempt
 * @access  Private (User who took the test)
 */
router.get("/attempts/:attemptId", async (req, res) => {
  const { attemptId } = req.params;
  const userId = req.user.userId;

  try {
    const attempt = await prisma.testAttempt.findFirst({
      where: {
        id: attemptId,
        userId: userId, // SECURITY: Ensures users can only see their own attempts
      },
      include: {
        user: {
          select: { firstName: true, lastName: true },
        },
        scheduledTest: {
          include: {
            testTemplate: {
              include: {
                // This is the key part: include all sections and their content
                sections: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      return res
        .status(404)
        .json({ error: "Attempt not found or you do not have permission." });
    }

    res.json(attempt);
  } catch (error) {
    console.error("Failed to fetch attempt details:", error);
    res.status(500).json({ error: "Could not fetch attempt details." });
  }
});

module.exports = router;
