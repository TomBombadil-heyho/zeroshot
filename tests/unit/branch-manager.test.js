/**
 * Tests for branch-manager utility
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const branchManager = require('../../lib/branch-manager');

describe('branch-manager', () => {
  let testRepoPath;

  beforeEach(() => {
    // Create a temporary test repository
    testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'zeroshot-test-repo-'));
    
    // Initialize git repo
    execSync('git init', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: testRepoPath, stdio: 'pipe' });
    
    // Create initial commit on main
    fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Test Repo');
    execSync('git add .', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git branch -M main', { cwd: testRepoPath, stdio: 'pipe' });
  });

  afterEach(() => {
    // Clean up test repository
    if (testRepoPath && fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('isGitRepo', () => {
    it('should return true for a git repository', () => {
      expect(branchManager.isGitRepo(testRepoPath)).to.be.true;
    });

    it('should return false for a non-git directory', () => {
      const nonGitPath = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-repo-'));
      try {
        expect(branchManager.isGitRepo(nonGitPath)).to.be.false;
      } finally {
        fs.rmSync(nonGitPath, { recursive: true, force: true });
      }
    });
  });

  describe('getDefaultBranch', () => {
    it('should detect main as default branch', () => {
      const defaultBranch = branchManager.getDefaultBranch(testRepoPath);
      expect(defaultBranch).to.equal('main');
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', () => {
      const currentBranch = branchManager.getCurrentBranch(testRepoPath);
      expect(currentBranch).to.equal('main');
    });

    it('should return updated branch after checkout', () => {
      // Create and checkout a new branch
      execSync('git checkout -b feature-test', { cwd: testRepoPath, stdio: 'pipe' });
      const currentBranch = branchManager.getCurrentBranch(testRepoPath);
      expect(currentBranch).to.equal('feature-test');
    });
  });

  describe('listLocalBranches', () => {
    it('should list all local branches', () => {
      // Create additional branches
      execSync('git checkout -b feature-1', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout -b feature-2', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout main', { cwd: testRepoPath, stdio: 'pipe' });

      const branches = branchManager.listLocalBranches(testRepoPath);
      expect(branches).to.include('main');
      expect(branches).to.include('feature-1');
      expect(branches).to.include('feature-2');
      expect(branches).to.have.lengthOf(3);
    });
  });

  describe('deleteLocalBranch', () => {
    beforeEach(() => {
      // Create a feature branch with commits
      execSync('git checkout -b feature-delete', { cwd: testRepoPath, stdio: 'pipe' });
      fs.writeFileSync(path.join(testRepoPath, 'feature.txt'), 'feature content');
      execSync('git add .', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git commit -m "Add feature"', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout main', { cwd: testRepoPath, stdio: 'pipe' });
    });

    it('should delete a merged branch safely', () => {
      // Merge the branch
      execSync('git merge feature-delete', { cwd: testRepoPath, stdio: 'pipe' });

      const result = branchManager.deleteLocalBranch('feature-delete', testRepoPath, false);
      expect(result.success).to.be.true;

      const branches = branchManager.listLocalBranches(testRepoPath);
      expect(branches).to.not.include('feature-delete');
    });

    it('should not delete unmerged branch without force', () => {
      const result = branchManager.deleteLocalBranch('feature-delete', testRepoPath, false);
      expect(result.success).to.be.false;

      const branches = branchManager.listLocalBranches(testRepoPath);
      expect(branches).to.include('feature-delete');
    });

    it('should delete unmerged branch with force', () => {
      const result = branchManager.deleteLocalBranch('feature-delete', testRepoPath, true);
      expect(result.success).to.be.true;

      const branches = branchManager.listLocalBranches(testRepoPath);
      expect(branches).to.not.include('feature-delete');
    });
  });

  describe('getBranchesToClean', () => {
    beforeEach(() => {
      // Create multiple branches
      execSync('git checkout -b feature-1', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout -b feature-2', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout -b hotfix-1', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout main', { cwd: testRepoPath, stdio: 'pipe' });
    });

    it('should return all branches except main and current', () => {
      const { local } = branchManager.getBranchesToClean({ cwd: testRepoPath });
      
      expect(local).to.not.include('main');
      expect(local).to.include('feature-1');
      expect(local).to.include('feature-2');
      expect(local).to.include('hotfix-1');
    });

    it('should protect specified branches', () => {
      const { local } = branchManager.getBranchesToClean({
        cwd: testRepoPath,
        protect: ['feature-1'],
      });
      
      expect(local).to.not.include('main');
      expect(local).to.not.include('feature-1');
      expect(local).to.include('feature-2');
      expect(local).to.include('hotfix-1');
    });

    it('should not include current branch in cleanup list', () => {
      execSync('git checkout feature-1', { cwd: testRepoPath, stdio: 'pipe' });
      
      const { local } = branchManager.getBranchesToClean({ cwd: testRepoPath });
      
      expect(local).to.not.include('main');
      expect(local).to.not.include('feature-1'); // current branch
      expect(local).to.include('feature-2');
      expect(local).to.include('hotfix-1');
    });
  });

  describe('isBranchMerged', () => {
    beforeEach(() => {
      // Create a merged branch
      execSync('git checkout -b merged-branch', { cwd: testRepoPath, stdio: 'pipe' });
      fs.writeFileSync(path.join(testRepoPath, 'merged.txt'), 'merged content');
      execSync('git add .', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git commit -m "Add merged content"', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout main', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git merge merged-branch', { cwd: testRepoPath, stdio: 'pipe' });

      // Create an unmerged branch
      execSync('git checkout -b unmerged-branch', { cwd: testRepoPath, stdio: 'pipe' });
      fs.writeFileSync(path.join(testRepoPath, 'unmerged.txt'), 'unmerged content');
      execSync('git add .', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git commit -m "Add unmerged content"', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout main', { cwd: testRepoPath, stdio: 'pipe' });
    });

    it('should return true for merged branches', () => {
      expect(branchManager.isBranchMerged('merged-branch', testRepoPath)).to.be.true;
    });

    it('should return false for unmerged branches', () => {
      expect(branchManager.isBranchMerged('unmerged-branch', testRepoPath)).to.be.false;
    });

    it('should return true for the default branch itself', () => {
      expect(branchManager.isBranchMerged('main', testRepoPath)).to.be.true;
    });
  });
});
