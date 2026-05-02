// backend/capabilities/githubCapabilities.js

export const githubCapabilities = {
  list_github_repos: {
    description: "Fetches all repositories owned by the user. Use this when the user wants to 'show', 'view', or 'find' their projects, or if the URL of a repo is needed for another step.",
    parameters: ["state"]
  },

  create_repo: {
    description: "Initializes a brand new repository on GitHub. Use for: 'start a project', 'make a new repo', 'initialize project'.",
    parameters: ["name", "private", "initialize_with_readme"]
  },

  update_repo: {
    description: "Modifies settings of an existing repository, such as changing visibility (private/public). Use for: 'make it private', 'add a readme to it'.",
    parameters: ["name", "private", "add_readme"]
  },

  rename_repo: {
    description: "Changes the name of a repository on GitHub. Use for: 'change name from X to Y', 'rename it'.",
    parameters: ["old_name", "new_name"]
  },

  delete_repo: {
    description: "Permanently removes a repository. DANGEROUS. Use for: 'delete', 'remove', 'get rid of repo'. Requires Human-in-the-loop confirmation.",
    parameters: ["name"]
  },

  repo_exists: {
    description: "Checks GitHub to see if a specific repository name is already taken or exists. Use for: 'check if X exists', 'do I have a repo called X?'.",
    parameters: ["name"]
  },

  clone_repo: {
    description: "Downloads/copies a remote GitHub repository to the local workspace. Synonyms: 'copy to system', 'download repo', 'grab the code', 'checkout locally'.",
    parameters: ["repo_url", "local_path"]
  },

  pull_repo: {
    description: "Synchronizes the local folder with the latest changes from GitHub. Use for: 'update my code', 'sync from cloud', 'pull changes', 'refresh'.",
    parameters: ["repo_path"]
  },

  push_repo: {
    description: "Saves local work and uploads it to GitHub. This is a multi-step git action (add, commit, push). Synonyms: 'sync my changes', 'upload code', 'save to github', 'send updates'.",
    parameters: ["repo_path", "message"]
  },

  switch_branch: {
    description: "Changes the active working branch or creates one if it doesn't exist. Use for: 'move to branch X', 'checkout X', 'switch context to X'.",
    parameters: ["branch"]
  },

  create_pull_request: {
    description: "Initiates a request to merge changes from one branch into another. Use for: 'propose my changes', 'open a PR', 'notify team of updates'.",
    parameters: ["name", "title", "head", "base", "body"]
  },

  list_pull_requests: {
    description: "Shows active or closed PRs. Use for: 'what are my open PRs?', 'check merge requests', 'review history'.",
    parameters: ["name", "state"]
  },

  merge_pull_request: {
    description: "Accepts and merges a Pull Request. Use for: 'accept the changes', 'merge PR #X', 'finalize the merge'.",
    parameters: ["name", "pull_number", "commit_message"]
  },

  close_pull_request: {
    description: "Rejects and stops a Pull Request with an optional reason. Use for: 'stop this PR', 'reject changes', 'cancel the merge request'.",
    parameters: ["name", "pull_number", "reason"]
  },

  list_branches: {
    description: "Retrieves a list of all versions/branches of the code. Use for: 'show branches', 'what branches do I have?', 'list versions'.",
    parameters: ["name"]
  },

  delete_branch: {
    description: "Deletes a specific branch. Use for: 'delete branch X', 'clean up branch', 'remove old branch'.",
    parameters: ["name", "branch"]
  },

  list_commits: {
    description: "REQUIRED for seeing ANY history. Use for: 'list commits', 'show my history', 'what changed?', 'show all my commits', 'history log'. MUST have a 'name' parameter.",
    parameters: ["name", "branch"]
  },

  // --- Missing Capabilities to reach your total of 23 ---

  get_pull_request_diff: {
    description: "Detailed line-by-line inspection of changes in a PR. Use for: 'review the code', 'show me what changed in PR #X', 'audit the changes'.",
    parameters: ["name", "pull_number"]
  },

  create_branch: {
    description: "Creates a new branch starting from the current point. Use for: 'start a new feature', 'make a branch called X', 'create version Y'.",
    parameters: ["name", "branch_name", "checkout"]
  },

  
  list_repos_by_language: {
    description: "Filters the user's repository list by programming language. Use for: 'show my Java projects', 'find all Python repos'.",
    parameters: ["language"]
  },

  get_repo_details: {
    description: "Provides metadata like stars, forks, and creation date. Use for: 'tell me more about project X', 'is repo Y public?', 'get stats for X'.",
    parameters: ["name"]
  },

  git_status: {
    description: "Checks for unstaged changes or untracked files. Use for: 'did I forget to save anything?', 'what is the status of my files?', 'is my branch clean?'.",
    parameters: ["repo_path"]
  }
};