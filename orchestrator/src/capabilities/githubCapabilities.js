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

  create_branch: {
    description: "Create a new branch in a repository",
    parameters: ["repo", "name", "source"] // source is optional (defaults to main)
  },
  list_branch: {
    description: "List all branches in a repository",
    parameters: ["repo"]
  },
  switch_branch: {
    description: "Switch the active branch for a repository",
    parameters: ["repo", "name"]
  }

};
