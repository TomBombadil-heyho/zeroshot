/**
 * Integration tests for branch CLI commands
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('CLI branches command integration', () => {
  let testRepoPath;
  const cliPath = path.join(__dirname, '..', '..', 'cli', 'index.js');

  beforeEach(() => {
    // Create a temporary test repository
    testRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'zeroshot-cli-test-'));
    
    // Initialize git repo
    execSync('git init', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: testRepoPath, stdio: 'pipe' });
    
    // Create initial commit on main
    fs.writeFileSync(path.join(testRepoPath, 'README.md'), '# Test Repo');
    execSync('git add .', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git branch -M main', { cwd: testRepoPath, stdio: 'pipe' });

    // Create some feature branches
    execSync('git checkout -b feature-1', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git checkout -b feature-2', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git checkout main', { cwd: testRepoPath, stdio: 'pipe' });
  });

  afterEach(() => {
    // Clean up test repository
    if (testRepoPath && fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('branches list', () => {
    it('should list all local branches', () => {
      const output = execSync(`node ${cliPath} branches list`, {
        cwd: testRepoPath,
        encoding: 'utf8',
      });

      expect(output).to.include('Local Branches');
      expect(output).to.include('main');
      expect(output).to.include('feature-1');
      expect(output).to.include('feature-2');
    });

    it('should output JSON with --json flag', () => {
      const output = execSync(`node ${cliPath} branches list --json`, {
        cwd: testRepoPath,
        encoding: 'utf8',
      });

      const result = JSON.parse(output);
      expect(result).to.have.property('default', 'main');
      expect(result).to.have.property('current', 'main');
      expect(result.local).to.include('main');
      expect(result.local).to.include('feature-1');
      expect(result.local).to.include('feature-2');
    });

    it('should error when not in a git repository', () => {
      const nonGitPath = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-repo-'));
      try {
        expect(() => {
          execSync(`node ${cliPath} branches list`, {
            cwd: nonGitPath,
            encoding: 'utf8',
          });
        }).to.throw();
      } finally {
        fs.rmSync(nonGitPath, { recursive: true, force: true });
      }
    });
  });

  describe('branches clean', () => {
    it('should show branches to delete in dry-run mode', () => {
      const output = execSync(`node ${cliPath} branches clean --dry-run`, {
        cwd: testRepoPath,
        encoding: 'utf8',
      });

      expect(output).to.include('Branch Cleanup');
      expect(output).to.include('feature-1');
      expect(output).to.include('feature-2');
      // Check that main isn't in the list of branches to delete (not in the default branch label)
      expect(output).to.match(/Local branches to delete:/);
      const branchesSection = output.split('Local branches to delete:')[1];
      if (branchesSection) {
        expect(branchesSection).to.not.match(/^\s+main\s/m);
      }
      expect(output).to.include('Dry run mode');
    });

    it('should protect specified branches', () => {
      const output = execSync(`node ${cliPath} branches clean --dry-run --protect feature-1`, {
        cwd: testRepoPath,
        encoding: 'utf8',
      });

      expect(output).to.include('feature-2');
      expect(output).to.not.include('feature-1 ');
    });

    it('should delete merged branches with --yes flag', () => {
      // Merge feature-1 into main
      execSync('git merge feature-1 --no-edit', { cwd: testRepoPath, stdio: 'pipe' });

      const output = execSync(`node ${cliPath} branches clean --yes`, {
        cwd: testRepoPath,
        encoding: 'utf8',
      });

      // Should have deleted at least feature-1, and possibly feature-2 depending on whether it's considered merged
      expect(output).to.match(/Deleted: [12]/);
      
      // Verify feature-1 is gone
      const branches = execSync('git branch --format="%(refname:short)"', {
        cwd: testRepoPath,
        encoding: 'utf8',
      });
      expect(branches).to.not.include('feature-1');
      expect(branches).to.include('main');
    });

    it('should skip unmerged branches without --force', () => {
      // Add a commit to feature-1 to make it unmerged
      execSync('git checkout feature-1', { cwd: testRepoPath, stdio: 'pipe' });
      fs.writeFileSync(path.join(testRepoPath, 'feature.txt'), 'new feature');
      execSync('git add .', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git commit -m "Add feature"', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout main', { cwd: testRepoPath, stdio: 'pipe' });

      const output = execSync(`node ${cliPath} branches clean --yes`, {
        cwd: testRepoPath,
        encoding: 'utf8',
      });

      expect(output).to.include('Skipped:');
      
      // Verify branch still exists
      const branches = execSync('git branch --format="%(refname:short)"', {
        cwd: testRepoPath,
        encoding: 'utf8',
      });
      expect(branches).to.include('feature-1');
    });

    it('should delete unmerged branches with --force', () => {
      // Add a commit to feature-1 to make it unmerged
      execSync('git checkout feature-1', { cwd: testRepoPath, stdio: 'pipe' });
      fs.writeFileSync(path.join(testRepoPath, 'feature.txt'), 'new feature');
      execSync('git add .', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git commit -m "Add feature"', { cwd: testRepoPath, stdio: 'pipe' });
      execSync('git checkout main', { cwd: testRepoPath, stdio: 'pipe' });

      const output = execSync(`node ${cliPath} branches clean --yes --force`, {
        cwd: testRepoPath,
        encoding: 'utf8',
      });

      expect(output).to.include('Deleted:');
      
      // Verify branch is gone
      const branches = execSync('git branch --format="%(refname:short)"', {
        cwd: testRepoPath,
        encoding: 'utf8',
      });
      expect(branches).to.not.include('feature-1');
    });

    it('should error when not in a git repository', () => {
      const nonGitPath = fs.mkdtempSync(path.join(os.tmpdir(), 'not-a-repo-'));
      try {
        expect(() => {
          execSync(`node ${cliPath} branches clean --dry-run`, {
            cwd: nonGitPath,
            encoding: 'utf8',
          });
        }).to.throw();
      } finally {
        fs.rmSync(nonGitPath, { recursive: true, force: true });
      }
    });
  });
});
