// backend/capabilities/fileCapabilities.js

export const fileCapabilities = {
  list_files: {
    description: "Explores the directory structure. Use for: 'what is in this folder?', 'show me the files', 'explore the project', 'list contents'.",
    parameters: ["path"]
  },
  read_file: {
    description: "Retrieves the text content of a specific file. Use for: 'open the code', 'show me the contents of X', 'read the readme', 'examine the logic'.",
    parameters: ["path"]
  },
  write_file: {
    description: "Creates a new file or overwrites an existing one with new text. Use for: 'create a file called X', 'save this code to X', 'update the config', 'write a new script'.",
    parameters: ["path", "content"]
  },
  upload_file: {
    description: "Moves a local file into the cloud workspace directory. Use for: 'upload my image', 'import this file', 'send this to the server'.",
    parameters: ["filename", "content_base64"]
  }
};