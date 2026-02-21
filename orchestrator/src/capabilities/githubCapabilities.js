// backend/capabilities/githubCapabilities.js

export const githubCapabilities = {
  list_github_repos: {
    description: "List all repositories for the authenticated user",
    parameters: []
  },

  create_repo: {
    description: "Create a new GitHub repository",
    parameters: ["name", "private", "initialize_with_readme"]
  },

  update_repo: {
    description: "Update repository settings like visibility or README",
    parameters: ["name", "private", "add_readme"]
  },

  rename_repo: {
  description: "Rename an existing repository",
  parameters: ["old_name", "new_name"]
},

  delete_repo: {
    description: "Delete a repository",
    parameters: ["name"]
  },

  repo_exists: {
    description: "Check whether a repository exists",
    parameters: ["name"]
  },

  get_repo_details: {
    description: "Get details of a specific repository",
    parameters: ["name"]
  },

  list_repos_by_language: {
    description: "List repositories filtered by language",
    parameters: ["language"]
  },

  latest_repo: {
    description: "Get the most recently updated repository",
    parameters: []
  },
  
  clone_repo: {
  description: "Clone a GitHub repository locally",
  parameters: ["repo_url", "local_path"]
},

pull_repo: {
  description: "Pull latest changes from remote repository",
  parameters: ["repo_path"]
},

push_repo: {
  description: "Push all local changes to GitHub (add, commit, push)",
  parameters: ["repo_path", "message"]
},

git_status: {
  description: "Check git status of a repository",
  parameters: ["repo_path"]
}

};
