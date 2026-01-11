/**
 * Branch management utilities for zeroshot CLI
 * Provides safe operations for listing and cleaning up git branches
 */

const { execSync } = require('child_process');

/**
 * Check if we're in a git repository
 * @param {string} cwd - Directory to check
 * @returns {boolean}
 */
function isGitRepo(cwd = process.cwd()) {
  try {
    execSync('git rev-parse --git-dir', {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the default branch name (usually 'main' or 'master')
 * @param {string} cwd - Repository directory
 * @returns {string}
 */
function getDefaultBranch(cwd = process.cwd()) {
  try {
    // Try to get default branch from remote
    const result = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null', {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
    
    // Extract branch name from refs/remotes/origin/HEAD
    const match = result.match(/refs\/remotes\/origin\/(.+)/);
    if (match) {
      return match[1];
    }
  } catch {
    // Fall through to defaults
  }

  // Try to detect by checking if 'main' or 'master' exists
  try {
    const branches = execSync('git branch -a', {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    
    if (branches.includes('main')) {
      return 'main';
    } else if (branches.includes('master')) {
      return 'master';
    }
  } catch {
    // Fall through to default
  }

  return 'main'; // Default to 'main'
}

/**
 * Get current branch name
 * @param {string} cwd - Repository directory
 * @returns {string|null}
 */
function getCurrentBranch(cwd = process.cwd()) {
  try {
    return execSync('git branch --show-current', {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return null;
  }
}

/**
 * List all local branches
 * @param {string} cwd - Repository directory
 * @returns {string[]}
 */
function listLocalBranches(cwd = process.cwd()) {
  try {
    const output = execSync('git branch --format="%(refname:short)"', {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    
    return output
      .split('\n')
      .map((b) => b.trim())
      .filter((b) => b);
  } catch {
    return [];
  }
}

/**
 * List all remote branches
 * @param {string} cwd - Repository directory
 * @returns {Array<{remote: string, branch: string, fullName: string}>}
 */
function listRemoteBranches(cwd = process.cwd()) {
  try {
    const output = execSync('git branch -r --format="%(refname:short)"', {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    
    return output
      .split('\n')
      .map((b) => b.trim())
      .filter((b) => b && !b.includes('HEAD'))
      .map((fullName) => {
        const parts = fullName.split('/');
        const remote = parts[0];
        const branch = parts.slice(1).join('/');
        return { remote, branch, fullName };
      });
  } catch {
    return [];
  }
}

/**
 * Check if a branch is merged into the default branch
 * @param {string} branch - Branch name to check
 * @param {string} cwd - Repository directory
 * @returns {boolean}
 */
function isBranchMerged(branch, cwd = process.cwd()) {
  try {
    const defaultBranch = getDefaultBranch(cwd);
    const output = execSync(`git branch --merged ${defaultBranch} --format="%(refname:short)"`, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    
    return output.split('\n').includes(branch);
  } catch {
    return false;
  }
}

/**
 * Delete a local branch (safe mode - requires merge)
 * @param {string} branch - Branch name
 * @param {string} cwd - Repository directory
 * @param {boolean} force - Force delete even if not merged
 * @returns {{success: boolean, error?: string}}
 */
function deleteLocalBranch(branch, cwd = process.cwd(), force = false) {
  try {
    const flag = force ? '-D' : '-d';
    execSync(`git branch ${flag} "${branch}"`, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Delete a remote branch
 * @param {string} remote - Remote name (e.g., 'origin')
 * @param {string} branch - Branch name
 * @param {string} cwd - Repository directory
 * @returns {{success: boolean, error?: string}}
 */
function deleteRemoteBranch(remote, branch, cwd = process.cwd()) {
  try {
    execSync(`git push ${remote} --delete "${branch}"`, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get branches to clean up (all except protected ones)
 * @param {Object} options
 * @param {string} options.cwd - Repository directory
 * @param {string[]} options.protect - Branches to protect (defaults to [defaultBranch, currentBranch])
 * @param {boolean} options.includeRemote - Include remote branches
 * @returns {{local: string[], remote: Array<{remote: string, branch: string, fullName: string}>}}
 */
function getBranchesToClean(options = {}) {
  const {
    cwd = process.cwd(),
    protect = [],
    includeRemote = false,
  } = options;

  const defaultBranch = getDefaultBranch(cwd);
  const currentBranch = getCurrentBranch(cwd);
  
  // Build protectedBranches list: always include default and current
  const protectedBranches = new Set([defaultBranch, currentBranch, ...protect].filter(Boolean));

  // Get local branches to clean
  const allLocal = listLocalBranches(cwd);
  const localToClean = allLocal.filter((branch) => !protectedBranches.has(branch));

  // Get remote branches to clean
  let remoteToClean = [];
  if (includeRemote) {
    const allRemote = listRemoteBranches(cwd);
    remoteToClean = allRemote.filter(({ branch }) => !protectedBranches.has(branch));
  }

  return {
    local: localToClean,
    remote: remoteToClean,
  };
}

module.exports = {
  isGitRepo,
  getDefaultBranch,
  getCurrentBranch,
  listLocalBranches,
  listRemoteBranches,
  isBranchMerged,
  deleteLocalBranch,
  deleteRemoteBranch,
  getBranchesToClean,
};
