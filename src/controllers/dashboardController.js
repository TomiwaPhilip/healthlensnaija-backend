// controllers/dashboardController.js
const { getDashboardStats } = require("../services/statsService");

const getStats = async (req, res, next) => {
  try {
    const stats = await getDashboardStats();
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};

module.exports = { getStats };
