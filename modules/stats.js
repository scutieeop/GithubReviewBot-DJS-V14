const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

// Stats storage
let stats = {
  startTime: new Date(),
  apiCalls: 0,
  newReposFound: 0,
  updatesDetected: 0,
  notificationsSent: 0,
  lastCheck: null,
  errors: 0,
  memoryUsage: {},
  uptime: 0
};

// Path to save stats
const STATS_FILE = path.join(__dirname, '..', 'data', 'stats.json');

// Initialize the stats module
function init(client) {
  logger.info('Statistics module initialized');
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  
  // Load existing stats if available
  try {
    if (fs.existsSync(STATS_FILE)) {
      const loadedStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      // Keep the new start time, but preserve other stats
      loadedStats.startTime = stats.startTime;
      stats = loadedStats;
      logger.info('Loaded existing statistics');
    }
  } catch (error) {
    logger.error('Error loading statistics:', error);
  }
  
  // Set up periodic stats collection
  setInterval(() => {
    updateSystemStats();
    saveStats();
  }, 5 * 60 * 1000); // Every 5 minutes
  
  // Set up slash command for stats
  if (client.commands) {
    // Stats are accessible through the /stats command which is defined separately
    logger.info('Stats commands are available');
  }
  
  return stats;
}

// Update system statistics
function updateSystemStats() {
  stats.uptime = process.uptime();
  stats.memoryUsage = {
    rss: Math.round(process.memoryUsage().rss / 1024 / 1024), // RSS in MB
    heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // Heap total in MB
    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // Heap used in MB
    external: Math.round(process.memoryUsage().external / 1024 / 1024) // External in MB
  };
  stats.systemLoad = os.loadavg();
  stats.systemMemory = {
    total: Math.round(os.totalmem() / 1024 / 1024), // Total memory in MB
    free: Math.round(os.freemem() / 1024 / 1024) // Free memory in MB
  };
}

// Save stats to file
function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (error) {
    logger.error('Error saving statistics:', error);
  }
}

// Increment API calls counter
function incrementApiCalls() {
  stats.apiCalls++;
}

// Record a new repository found
function recordNewRepo() {
  stats.newReposFound++;
}

// Record an update detected
function recordUpdate() {
  stats.updatesDetected++;
}

// Record a notification sent
function recordNotification() {
  stats.notificationsSent++;
}

// Record an error
function recordError() {
  stats.errors++;
}

// Record the last check time
function recordCheckTime() {
  stats.lastCheck = new Date();
}

// Get current stats
function getStats() {
  return {
    ...stats,
    formattedUptime: formatUptime(stats.uptime)
  };
}

// Format uptime into a readable string
function formatUptime(seconds) {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  let result = '';
  if (days > 0) result += `${days} gün `;
  if (hours > 0) result += `${hours} saat `;
  if (minutes > 0) result += `${minutes} dakika `;
  if (secs > 0) result += `${secs} saniye`;
  
  return result.trim();
}

module.exports = {
  init,
  incrementApiCalls,
  recordNewRepo,
  recordUpdate,
  recordNotification,
  recordError,
  recordCheckTime,
  getStats
}; 