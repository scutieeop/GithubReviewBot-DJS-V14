const axios = require('axios');
const logger = require('./logger');
const stats = require('./stats');

// GitHub API URL
const GITHUB_API_URL = 'https://api.github.com';

// GitHub API rate limit details
let rateLimitRemaining = null;
let rateLimitReset = null;

// API client with rate limiting handling
const githubClient = axios.create({
  baseURL: GITHUB_API_URL,
  timeout: 10000,
  headers: {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Monitor-Bot'
  }
});

// Add a response interceptor for rate limit tracking
githubClient.interceptors.response.use(response => {
  // Extract rate limit information from headers
  rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining'] || '60');
  rateLimitReset = parseInt(response.headers['x-ratelimit-reset'] || '0') * 1000;
  
  return response;
}, error => {
  if (error.response && error.response.status === 403 && error.response.headers['x-ratelimit-remaining'] === '0') {
    // Handle rate limit exceeded
    const resetTime = new Date(parseInt(error.response.headers['x-ratelimit-reset']) * 1000);
    logger.warn(`GitHub API rate limit exceeded. Resets at ${resetTime.toLocaleString()}`);
  }
  stats.recordError();
  return Promise.reject(error);
});

// Get user information
async function getUserInfo(username) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/users/${username}`);
    return response.data;
  } catch (error) {
    logger.error(`Error fetching user info for ${username}:`, error);
    throw error;
  }
}

// Get user repositories
async function getUserRepositories(username, sort = 'updated', direction = 'desc') {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/users/${username}/repos`, {
      params: {
        sort: sort,
        direction: direction,
        per_page: 100
      }
    });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repositories for ${username}:`, error);
    throw error;
  }
}

// Get repository details
async function getRepositoryDetails(owner, repo) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}`);
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repository details for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get repository languages
async function getRepositoryLanguages(owner, repo) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}/languages`);
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repository languages for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get repository contributors
async function getRepositoryContributors(owner, repo) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}/contributors`, {
      params: { per_page: 10 }
    });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repository contributors for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get repository commits
async function getRepositoryCommits(owner, repo, limit = 10) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}/commits`, {
      params: { per_page: limit }
    });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repository commits for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get repository commit activity (weekly stats)
async function getRepositoryCommitActivity(owner, repo) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}/stats/commit_activity`);
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repository commit activity for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get repository README
async function getRepositoryReadme(owner, repo) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}/readme`);
    return {
      content: Buffer.from(response.data.content, 'base64').toString('utf8'),
      name: response.data.name,
      url: response.data.html_url
    };
  } catch (error) {
    // This is expected to fail sometimes if there's no README
    if (error.response && error.response.status === 404) {
      logger.info(`No README found for ${owner}/${repo}`);
      return null;
    }
    logger.error(`Error fetching repository README for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get repository releases
async function getRepositoryReleases(owner, repo, limit = 5) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}/releases`, {
      params: { per_page: limit }
    });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repository releases for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get repository tags
async function getRepositoryTags(owner, repo, limit = 5) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}/tags`, {
      params: { per_page: limit }
    });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repository tags for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get repository issues
async function getRepositoryIssues(owner, repo, limit = 5) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}/issues`, {
      params: {
        per_page: limit,
        state: 'open'
      }
    });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repository issues for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get repository pull requests
async function getRepositoryPullRequests(owner, repo, limit = 5) {
  try {
    stats.incrementApiCalls();
    const response = await githubClient.get(`/repos/${owner}/${repo}/pulls`, {
      params: {
        per_page: limit,
        state: 'open'
      }
    });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching repository pull requests for ${owner}/${repo}:`, error);
    throw error;
  }
}

// Get rate limit status
function getRateLimit() {
  return {
    remaining: rateLimitRemaining,
    reset: rateLimitReset ? new Date(rateLimitReset) : null
  };
}

// Check if enough rate limit is available
function hasEnoughRateLimit(requiredCalls = 1) {
  return rateLimitRemaining === null || rateLimitRemaining >= requiredCalls;
}

// Parse repository name from URL
function parseRepoFromUrl(url) {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match && match.length === 3) {
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, '')
    };
  }
  return null;
}

// Get the primary language color
function getLanguageColor(language) {
  const colors = {
    'JavaScript': '#f1e05a',
    'TypeScript': '#2b7489',
    'Python': '#3572A5',
    'Java': '#b07219',
    'C#': '#178600',
    'PHP': '#4F5D95',
    'C++': '#f34b7d',
    'C': '#555555',
    'Ruby': '#701516',
    'Go': '#00ADD8',
    'Swift': '#ffac45',
    'Kotlin': '#F18E33',
    'Rust': '#dea584',
    'HTML': '#e34c26',
    'CSS': '#563d7c',
    'Shell': '#89e051',
    'PowerShell': '#012456',
    'Dart': '#00B4AB',
    'Elixir': '#6e4a7e',
    'Vue': '#2c3e50',
    'Lua': '#000080',
    'Haskell': '#5e5086',
    'Clojure': '#db5855'
  };
  
  return colors[language] || '#858585';
}

// Get language icon emoji
function getLanguageEmoji(language) {
  const languageEmojis = {
    'JavaScript': '🟨',
    'TypeScript': '🔷',
    'Python': '🐍',
    'Java': '☕',
    'C#': '🟢',
    'PHP': '🐘',
    'C++': '🔴',
    'C': '⚪',
    'Ruby': '💎',
    'Go': '🔵',
    'Swift': '🟠',
    'Kotlin': '🟠',
    'Rust': '⚙️',
    'HTML': '🌐',
    'CSS': '🎨',
    'Shell': '🐚',
    'PowerShell': '💠',
    'Dart': '🎯',
    'Vue': '🟩',
    'React': '⚛️',
    'Angular': '🅰️'
  };
  
  return languageEmojis[language] || '📄';
}

// Generate a summary of repository details
function generateRepositorySummary(repo) {
  const summary = [];
  
  // Add repo name and description
  summary.push(`📦 **${repo.name}**`);
  if (repo.description) {
    summary.push(`📝 ${repo.description}`);
  }
  
  // Add basic stats
  summary.push(`⭐ ${repo.stargazers_count} | 🍴 ${repo.forks_count} | 👀 ${repo.watchers_count}`);
  
  // Add language
  if (repo.language) {
    const emoji = getLanguageEmoji(repo.language);
    summary.push(`${emoji} ${repo.language}`);
  }
  
  // Add dates
  const created = new Date(repo.created_at);
  const updated = new Date(repo.updated_at);
  summary.push(`📅 Created: ${created.toLocaleDateString()} | Updated: ${updated.toLocaleDateString()}`);
  
  return summary.join('\n');
}

module.exports = {
  getUserInfo,
  getUserRepositories,
  getRepositoryDetails,
  getRepositoryLanguages,
  getRepositoryContributors,
  getRepositoryCommits,
  getRepositoryCommitActivity,
  getRepositoryReadme,
  getRepositoryReleases,
  getRepositoryTags,
  getRepositoryIssues,
  getRepositoryPullRequests,
  getRateLimit,
  hasEnoughRateLimit,
  parseRepoFromUrl,
  getLanguageColor,
  getLanguageEmoji,
  generateRepositorySummary
}; 