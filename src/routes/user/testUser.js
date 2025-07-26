const express = require("express");
const router = express.Router();
const prisma = require("../../db/index");
const { verifyToken, isUser } = require("../../middleware/authMiddleware");

// All routes here are for any logged-in user
router.use(verifyToken, isUser);

/**
 * @route   GET /api/tests/available
 * @desc    Get a list of tests currently active and available to take
 * @access  Private (User)
 */
router.get("/available", async (req, res) => {
  const now = new Date();
  try {
    const availableTests = await prisma.scheduledTest.findMany({
      where: {
        isActive: true,
        startTime: { lte: now }, // lte = less than or equal to
        endTime: { gte: now }, // gte = greater than or equal to
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
 * @access  Private (User)
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
    // Handle case where user has already started this test (from @@unique constraint)
    if (error.code === "P2002") {
      // Find the existing attempt and return it instead of an error
      const existingAttempt = await prisma.testAttempt.findUnique({
        where: { userId_scheduledTestId: { userId, scheduledTestId } },
      });
      return res.status(200).json(existingAttempt);
    }
    res.status(500).json({ error: "Could not start test." });
  }
});

/**
 * @route   GET /api/tests/templates/:templateId/sections
 * @desc    Get all sections for a specific test template (for the user to take)
 * @access  Private (User)
 */
router.get("/templates/:templateId/sections", async (req, res) => {
  const { templateId } = req.params;
  try {
    const sections = await prisma.section.findMany({
      where: { testTemplateId: templateId },
      // CRITICAL: NEVER send the 'answers' to the user during the test.
      select: {
        id: true,
        type: true,
        content: true,
      },
    });

    if (!sections || sections.length === 0) {
      return res
        .status(404)
        .json({ error: "Sections not found for this test." });
    }
    res.json(sections);
  } catch (error) {
    res.status(500).json({ error: "Could not retrieve sections." });
  }
});

/**
 * @route   POST /api/tests/attempts/:attemptId/submit
 * @desc    Submit answers for a test, get it auto-graded, and return results.
 * @access  Private (User)
 */
router.post("/attempts/:attemptId/submit", async (req, res) => {
  const { attemptId } = req.params;
  const { userAnswers } = req.body; // Expecting { "LISTENING": {...}, "READING": {...}, "WRITING": {...} }

  try {
    // 1. Get the correct answers from the database
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        scheduledTest: {
          include: {
            testTemplate: {
              include: {
                sections: true,
              },
            },
          },
        },
      },
    });

    if (!attempt)
      return res.status(404).json({ error: "Test attempt not found." });

    const correctAnswers = {};
    attempt.scheduledTest.testTemplate.sections.forEach((sec) => {
      correctAnswers[sec.type] = sec.answers;
    });

    // 2. Perform auto-grading
    let listeningScore = 0;
    const listeningUserAns = userAnswers.LISTENING || {};
    const listeningCorrectAns = correctAnswers.LISTENING || {};
    for (const key in listeningCorrectAns) {
      if (listeningUserAns[key] === listeningCorrectAns[key]) {
        listeningScore++;
      }
    }

    let readingScore = 0;
    const readingUserAns = userAnswers.READING || {};
    const readingCorrectAns = correctAnswers.READING || {};
    for (const key in readingCorrectAns) {
      if (readingUserAns[key] === readingCorrectAns[key]) {
        readingScore++;
      }
    }

    //  user's answers and final results 
    const finalResults = { listeningScore, readingScore };
    const updatedAttempt = await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        userAnswers,
        results: finalResults,
      },
    });

    // 4. Return the results immediately
    res.json(updatedAttempt);
  } catch (error) {
    console.error("Failed to submit test:", error);
    res.status(500).json({ error: "Could not submit answers." });
  }
});

module.exports = router;
