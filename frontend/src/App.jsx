import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askPuter } from './puter/agent';
import Editor from "@monaco-editor/react";


const App = () => {
  const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [activityStream, setActivityStream] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef(null);
  const [user, setUser] = useState(null);
  const [puterReady, setPuterReady] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [metrics, setMetrics] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState('activity'); // 'activity' or 'explorer'
  const [fileTree, setFileTree] = useState([]);
  const [currentPath, setCurrentPath] = useState(".");
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, text: "", type: null, data: null });
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [repoBranches, setRepoBranches] = useState({ all: [], current: "" });
  const [activeRepository, setActiveRepository] = useState(null);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  // Tabs and Editor State
  const [openFiles, setOpenFiles] = useState([]); // Array of { path, content, hash, isDirty }
  const [activeFilePath, setActiveFilePath] = useState(null);
  const editorRef = useRef(null); 
  const monacoRef = useRef(null);
  // Left Sidebar Toggle
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);

  const [showRightPanel, setShowRightPanel] = useState(true); 
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);

  const [commitModal, setCommitModal] = useState({ isOpen: false, repoName: null, message: "" });
  const [isGeneratingCommit, setIsGeneratingCommit] = useState(false);
  const [conflictModal, setConflictModal] = useState({ isOpen: false, instructions: "" });
  
  const [isCreatingFolder, setIsCreatingFolder] = useState(false); 
  const [newFolderName, setNewFolderName] = useState(""); 

  const [agentTask, setAgentTask] = useState("");

  // 🧠 SMART CONTEXT SYNCRONIZATION
  // Automatically determine the active repo based on Editor OR Explorer
  useEffect(() => {
    let detectedRepo = null;
    
    if (activeFilePath) {
      // Priority 1: The currently open editor tab
      detectedRepo = activeFilePath.split('/')[0];
    } else if (currentPath && currentPath !== ".") {
      // Priority 2: The folder they are browsing in the sidebar
      detectedRepo = currentPath.split('/')[0];
    }

    setActiveRepository(detectedRepo);
  }, [activeFilePath, currentPath]);

  // 👇 ADD THIS NEW EFFECT: Tell the backend whenever the active repo changes!
  useEffect(() => {
    if (activeRepository && user?.login) {
      fetch("http://localhost:5000/api/actions/set-active-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": user.login },
        body: JSON.stringify({ repoName: activeRepository })
      }).catch(err => console.warn("Silent DB Sync failed:", err));
    }
  }, [activeRepository, user]);
  
  // 1. Open or Focus a File Tab
  // Helper to open editor
  const openInEditor = (path, content, hash) => {
    setOpenFiles(prev => {
      const existingIndex = prev.findIndex(f => f.path === path);
      if (existingIndex >= 0) {
        // Update content/hash if already open but fetched fresh
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], content, hash };
        return updated;
      }
      // Add new tab
      return [...prev, { path, content, hash, isDirty: false }];
    });
    setActiveFilePath(path);
  };

  // 2. Handle Typing in Editor
  const handleEditorChange = (value) => {
    setOpenFiles(prev => prev.map(f => 
      f.path === activeFilePath ? { ...f, content: value, isDirty: true } : f
    ));
  };  

  // 3. Close a Tab
  const closeTab = (e, pathToClose) => {
    e.stopPropagation();
    setOpenFiles(prev => {
      const newFiles = prev.filter(f => f.path !== pathToClose);
      // If closing the active tab, switch to the last available tab
      if (activeFilePath === pathToClose) {
        setActiveFilePath(newFiles.length > 0 ? newFiles[newFiles.length - 1].path : null);
      }
      return newFiles;
    });
  };

  // 4. Save the Active Tab
  const handleSaveFromEditor = async () => {
    const activeFile = openFiles.find(f => f.path === activeFilePath);
    if (!user?.login || !activeFile) return;

    try {
      const res = await fetch("http://localhost:5000/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": user.login },
        body: JSON.stringify({
          path: activeFile.path,
          content: activeFile.content,
          lastKnownHash: activeFile.hash 
        })
      });

      const data = await res.json();

      if (res.status === 409) {
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'error',
          content: `🚨 Conflict in ${activeFile.path}! The file was modified externally.`,
          timestamp: new Date()
        }]);
      } else if (res.ok) {
        // Mark as saved and update hash
        setOpenFiles(prev => prev.map(f => 
          f.path === activeFilePath ? { ...f, hash: data.doc.hash, isDirty: false } : f
        ));
        setActivityStream(prev => [{
          id: Date.now(),
          action: 'write_file',
          message: `Saved ${activeFile.path.split('/').pop()}`,
          timestamp: new Date()
        }, ...prev]);
      }
    } catch (err) {
      console.error("Save error:", err);
    }
  };
// 🤖 1-Click AI Merge Conflict Resolver
  const handleAIAutoResolve = async (userInstructions) => {
    const activeFile = openFiles.find(f => f.path === activeFilePath);
    if (!activeFile || !activeFile.content.includes("<<<<<<< HEAD")) return;

    // 👇 Close the custom modal immediately
    setConflictModal({ isOpen: false, instructions: "" }); 

    setIsProcessing(true);
    setAgentTask("Gemini is analyzing conflict markers and surrounding code context..."); 
    
    // Visually notify the user we are working on it
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: "assistant",
      content: "Analyzing the merge conflict... I'll inject the resolved code directly into your editor in a moment. 🛠️",
      timestamp: new Date()
    }]);

   try {
      // 🧠 2. Send the code, the repo name, AND the instructions to the backend
      const res = await fetch("http://localhost:4000/ask/resolve-conflict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: activeFile.content,
          repoName: activeRepository, // 👈 CHANGED: Now using your bulletproof global state!
          instructions: userInstructions 
        })
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      const resolvedCode = data.resolvedCode;

      // Instantly inject the clean code into the Monaco Editor
      setOpenFiles(prev => prev.map(f => 
        f.path === activeFilePath ? { ...f, content: resolvedCode, isDirty: true } : f
      ));

      // ✨ 3. Paint the editor green for visual feedback!
      setTimeout(() => {
        if (editorRef && editorRef.current) {
          try {
            const lineCount = resolvedCode.split('\n').length;
            
            // Bypass the Monaco API and use a raw coordinate object
            const decorations = editorRef.current.deltaDecorations([], [
              {
                range: { 
                  startLineNumber: 1, 
                  startColumn: 1, 
                  endLineNumber: lineCount, 
                  endColumn: 1 
                },
                options: {
                  isWholeLine: true,
                  className: 'ai-success-glow',
                  marginClassName: 'ai-success-glow'
                }
              }
            ]);

            // Clear the glow after 2 seconds
            setTimeout(() => {
              if (editorRef.current) {
                editorRef.current.deltaDecorations(decorations, []);
              }
            }, 2000);
            
          } catch (err) {
            console.error("❌ Glow Error:", err);
          }
        }
      }, 500);

      setMessages(prev => [...prev, {
        id: Date.now(),
        type: "system",
        content: "✨ Conflict automatically resolved!! Please review the changes and click **Save File**.",
        timestamp: new Date()
      }]);

    } catch (err) {
      console.error("Auto-Resolve Error:", err);
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: "error",
        content: `❌ Failed to auto-resolve: ${err.message}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };
  
useEffect(() => {
  console.log("[auth] useEffect mount; url:", window.location.href);
  const url = new URL(window.location.href);

  const authed = url.searchParams.get("authed");
  if (authed) {
    url.searchParams.delete("authed");
    window.history.replaceState({}, "", url.pathname + url.search);
    fetchAuthStatus();
    return;
  }

  const code = url.searchParams.get("code");
  if (code && !window.__handledAuth) {
    window.__handledAuth = true;
    fetch(`http://localhost:4000/auth/callback?code=${code}`, { method: "GET", credentials: "include" })
      .finally(async () => {
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.pathname);
        await fetchAuthStatus();
      });
    return;
  }

  fetchAuthStatus();
}, []);


useEffect(() => {
  const checkPuter = async () => {
    if (!window.puter) return;

    const isSignedIn = await window.puter.auth.isSignedIn();
    setPuterReady(isSignedIn);
  };

  checkPuter();
}, []);


const fetchAuthStatus = async () => {
  console.log("[auth] fetchAuthStatus: start");
  try {
    const res = await fetch("http://localhost:4000/auth/status", { credentials: "include" });
    console.log("[auth] /auth/status response status:", res.status);
    const data = await res.json().catch(e => {
      console.error("[auth] failed to parse /auth/status json", e);
      return null;
    });
    console.log("[auth] /auth/status payload:", data);
    if (data && data.loggedIn) {
      setUser({ login: data.login, avatar_url: data.avatar_url, name: data.name });
      console.log("[auth] setUser ->", data.login);
    } else {
      setUser(null);
      console.log("[auth] not logged in (set user null)");
    }
  } catch (err) {
    console.error("[auth] fetchAuthStatus error", err);
    setUser(null);
  }
};


  useEffect(() => {
    console.log("[auth] useEffect mount; url:", window.location.href);
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    if (code && !window.__handledAuth) {
      window.__handledAuth = true;

      // IMPORTANT: call the backend callback endpoint that exchanges code -> token
      // your backend route is /auth/callback (not /api/auth/callback)
      fetch(`http://localhost:4000/auth/callback?code=${code}`, 
        { method: "GET", credentials: "include" })

        .finally(async () => {
          // remove code from URL and refresh auth status
          url.searchParams.delete("code");
          window.history.replaceState({}, "", url.pathname);
          await fetchAuthStatus();
        });
    } else {
      // normal mount: check if already logged in
      fetchAuthStatus();
    }
  }, []);


const loginToPuter = async () => {
  if (!window.puter) return;

  try {
    await window.puter.auth.signIn({ popup: true });
    const isSignedIn = await window.puter.auth.isSignedIn();
    setPuterReady(isSignedIn);
  } catch (err) {
    await window.puter.auth.signIn({
    redirect: window.location.href
  });
  }
};

const handleFileUpload = async (file) => {
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("targetPath", currentPath); // <--- Add this line

  try {
    setIsUploading(true);

    // Update URL to point to backend (5000) instead of orchestrator (4000)
    // to bypass JSON parsing errors with binary files
    const res = await fetch("http://localhost:5000/api/files/upload", { 
      method: "POST",
      body: formData,
      headers: { "X-User-Id": user.login } // Ensure backend knows who is uploading
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Upload failed");

    setMessages(prev => [...prev, {
      id: Date.now(),
      type: "system",
      content: `📎 Uploaded **${file.name}** to ${currentPath === '.' ? 'workspace root' : currentPath}`,
      timestamp: new Date()
    }]);
    
    fetchFiles(currentPath); // <--- Refresh explorer after upload

  } catch (err) {
    // ... your existing catch logic
  } finally {
    setIsUploading(false);
  }
};

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const renderMessageContent = (content, type, data) => {
    // ✅ NEW Case: Commits (Git History)
  if (type === "commits") {
    // Determine if commits are in data.commits or just data
    const commitsArray = data?.commits || (Array.isArray(data) ? data : []);

    if (commitsArray.length === 0) {
      return <p className="text-gray-500 italic text-xs">No commits found or repository empty.</p>;
    }

    return (
      <div className="mt-2 space-y-3 border-l-2 border-blue-500 pl-4 py-1">
        <p className="text-blue-400 text-sm font-semibold mb-2">{content}</p>
        {commitsArray.map((commit, index) => (
          <div key={index} className="bg-gray-800/40 p-2 rounded border border-gray-700">
            <div className="flex justify-between items-center mb-1">
              <span className="text-blue-300 font-mono text-[10px]">
                {commit.hash?.substring(0, 7) || "No Hash"}
              </span>
              <span className="text-[10px] text-gray-500">
                {commit.date ? new Date(commit.date).toLocaleDateString() : ""}
              </span>
            </div>
            <p className="text-gray-200 text-sm">{commit.message}</p>
            <p className="text-gray-500 text-[10px] mt-1">By {commit.author_name || "Unknown"}</p>
          </div>
        ))}
      </div>
    );
  }

  // ✅ NEW Case: Branches
  if (type === "branches" && data?.all) {
    return (
      <div className="mt-2 grid grid-cols-1 gap-2">
        <p className="text-xs text-gray-400 mb-1">Available Branches:</p>
        {data.all.map((branch) => (
          <div 
            key={branch} 
            className={`flex items-center justify-between p-2 rounded text-sm border ${
              branch === data.current 
              ? 'border-green-500 bg-green-900/20 text-green-400' 
              : 'border-gray-700 bg-gray-800/40 text-gray-300'
            }`}
          >
            <span>{branch}</span>
            {branch === data.current && <span className="text-[10px] font-bold uppercase tracking-wider bg-green-500 text-black px-1 rounded">Active</span>}
          </div>
        ))}
      </div>
    );
  }
  // ✅ Case 0: Repo list (structured data)
  if (type === "repos" && Array.isArray(content)) {
    return (
      <ul className="space-y-2">
        {content.map(repo => (
          <li
            key={repo.name}
            className="flex items-center gap-2"
          >
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {repo.name}
            </a>
            {repo.private && <span title="Private">🔒</span>}
          </li>
        ))}
      </ul>
    );
  }

  // Case 1: Plain string
  if (typeof content === "string") {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    );
  }

  // Case 2: Gemini / Puter structured text parts
  if (Array.isArray(content)) {
    const text = content
      .filter(part => part && part.type === "text")
      .map(part => part.text || "")
      .join("\n");

    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {text || "No text content"}
      </ReactMarkdown>
    );
  }

  // Case 3: Fallback
  return (
    <pre className="whitespace-pre-wrap text-sm bg-gray-900 p-2 rounded">
      {content ? JSON.stringify(content, null, 2) : "Empty response"}
    </pre>
  );
};


const startRequest = () => ({
  id: crypto.randomUUID(),
  startTime: performance.now(),
  endTime: null,
  success: false
});

  const finishRequest = (req, success) => ({
    ...req,
    endTime: performance.now(),
    success
  });
  // 🔘 Handles clicks from the Confirmation Modal
  const handleDialogResponse = async (answer) => {
    // 1. Capture current modal data before closing it
    const dialogType = confirmDialog.type;
    const dialogData = confirmDialog.data;
    
    setConfirmDialog({ isOpen: false, text: "", type: null, data: null }); // Close modal immediately
    
    // 🟢 2. NEW: Intercept Direct File/Folder Deletions from the UI!
    if (dialogType === "delete_file") {
      if (answer === "yes") {
        try {
          const res = await fetch("http://localhost:5000/api/files/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-User-Id": user?.login },
            body: JSON.stringify({ path: dialogData.path })
          });
          
          if (res.ok) {
            fetchFiles(currentPath); // Refresh the folder tree
            
            // If the deleted file is currently open in the editor, close the tab!
            setOpenFiles(prev => prev.filter(f => f.path !== dialogData.path));
            if (activeFilePath === dialogData.path) setActiveFilePath(null);
            
            setActivityStream(prev => [{ 
              id: Date.now(), action: "delete_file", message: `Deleted ${dialogData.path.split('/').pop()}`, timestamp: new Date() 
            }, ...prev]);
          } else {
            console.error("Failed to delete file/folder on server.");
          }
        } catch (err) { console.error("Delete request failed:", err); }
      }
      return; // Stop here! Do not send this to the AI Orchestrator.
    }

    // 🤖 3. EXISTING LOGIC: Handle AI Orchestrator Confirmations (like delete_repo)
    // Visually add your choice to the chat
    setMessages(prev => [...prev, {
      id: Date.now(), type: "user", content: answer, timestamp: new Date()
    }]);
    setIsProcessing(true);

    try {
      const payload = {
        action: pendingAction,
        parameters: { _continuation: answer }
      };

      const backendRes = await fetch("http://localhost:4000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      const data = await backendRes.json();
      
      if (data.success) {
         setActivityStream(prev => [{ 
           id: Date.now(), 
           action: payload.action, 
           message: `Successfully executed ${payload.action.replace(/_/g, ' ')}`, 
           timestamp: new Date() 
         }, ...prev]);
      }
      
      setPendingAction(null);
      setMessages(prev => [...prev, {
        id: Date.now(), 
        type: data.success ? "assistant" : "error", 
        content: data.aiResponse || data.error, 
        timestamp: new Date()
      }]);
    } catch (err) {
       console.error(err);
    } finally {
       setIsProcessing(false);
    }
  };


  const handleSubmit = async (e) => {
  const req = startRequest();
  e?.preventDefault();

  if (!user) {
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: "system",
      content: "Please login with GitHub to continue.",
      timestamp: new Date()
    }]);
    return;
  }

  if (!puterReady) {
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: "system",
      content: "Please login to AI (Puter) to continue.",
      timestamp: new Date()
    }]);
    return;
  }

  if (!inputValue.trim() || isProcessing) return;

  const currentInput = inputValue;

  // show user message immediately
  setMessages(prev => [...prev, {
    id: Date.now(),
    type: "user",
    content: currentInput,
    timestamp: new Date()
  }]);

  setIsProcessing(true);
  setInputValue("");
  setAgentTask("Parsing natural language intent..."); 

  try {
    let payload;
    const lowerInput = currentInput.toLowerCase();
    
    // 🛑 2. GITHUB-STYLE COMMIT MODAL TRIGGER
    if (lowerInput.startsWith("push") || lowerInput.includes("push changes") || lowerInput.includes("sync")) {
      
      const repoMatch = currentInput.match(/(?:in|to|for|sync)\s+(?:the\s+)?(?!changes\b|all\b)([a-zA-Z0-9_-]+)/i);
      
      // Final Decision: Regex > Smart State > null
      let detectedRepo = repoMatch ? repoMatch[1] : activeRepository; // 👇 SO MUCH CLEANER!

      if (detectedRepo && detectedRepo.toLowerCase().endsWith('repo')) {
          detectedRepo = detectedRepo.slice(0, -4).trim();
      }

      setCommitModal({ isOpen: true, repoName: detectedRepo, message: "" });
      setIsProcessing(false);
      return; 
    }

    // Only ask the AI Router if we haven't manually intercepted the command
    if (!payload) {
      setAgentTask("Routing command via Puter AI to find correct tool...");
      // 🧠 ALWAYS USE ROUTER MODE (Allow context switching)
      const chatHistory = messages
        .slice(-4)
        .map(m => ({
          role: m.type === "user" ? "user" : "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        }));

      const routerResponse = await askPuter(currentInput, chatHistory, "router");

      try {
        payload = JSON.parse(routerResponse);
      } catch {
        // fallback: router responded with text
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: "assistant",
          content: routerResponse,
          timestamp: new Date()
        }]);
        setIsProcessing(false);
        return;
      }
    }

    // 🔄 SMART CONTEXT MERGING
    if (pendingAction && payload.action === null) {
      payload.action = pendingAction;
      payload.parameters = payload.parameters || {};
      payload.parameters._continuation = currentInput;
    }

    // 🛟 SAFETY NET: If the AI router STILL failed to pick an action, fallback to keyword matching
    if (!payload.action && !pendingAction) {
      // (Removed the old push override here so it doesn't bypass the modal!)
      if (lowerInput.includes("clone") || lowerInput.includes("download")) {
        payload.action = "clone_repo";
      } else {
        // 🧠 CONVERSATIONAL FALLBACK: The user is asking a question!
        const activeFile = openFiles.find(f => f.path === activeFilePath);
        const contextString = activeFile 
          ? `\n\n[Context: I am currently looking at ${activeFile.path}. Here is the exact code containing the conflict:]\n${activeFile.content}` 
          : "";

        try {
          const chatResponse = await window.puter.ai.chat(currentInput + contextString);
          setMessages(prev => [...prev, {
            id: Date.now(),
            type: "assistant",
            content: chatResponse?.text || chatResponse?.message?.content || String(chatResponse),
            timestamp: new Date()
          }]);
        } catch (chatErr) {
          setMessages(prev => [...prev, {
            id: Date.now(),
            type: "assistant",
            content: "I couldn't analyze the code right now. Make sure you are logged into Puter.",
            timestamp: new Date()
          }]);
        }
        setIsProcessing(false);
        return; 
      }
    }
    
    // 🎯 Auto-Inject Active Repository for Git operations
   if (payload.action === "push_repo" || payload.action === "clone_repo" || payload.action === "switch_branch") {
      payload.parameters = payload.parameters || {};
      // ✅ NEW LOGIC
      if (!payload.parameters.name && activeRepository) {
         payload.parameters.name = activeRepository;
      }
    }

    // Inside handleSubmit, add this alongside your 'push' interceptor:
    if (lowerInput === "pull" || lowerInput === "sync" || lowerInput.startsWith("git pull")) {
        handleManualPull(activeRepository); // 👈 Uses the Smart State context
        setIsProcessing(false);
        return;
    }

    // 🚀 SEND TO ORCHESTRATOR
    setAgentTask(`Executing ${payload.action} sequence in Orchestrator...`);
    const backendRes = await fetch("http://localhost:4000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await backendRes.json();

    // 1. Log High-Level Activity to the new left panel
    if (data.success) {
      setActivityStream(prev => [{
        id: Date.now(),
        action: payload.action,
        message: `Successfully executed ${payload.action.replace(/_/g, ' ')}`,
        timestamp: new Date()
      }, ...prev]);
    }

    // 2. Auto-Open Editor on Read or Conflict
    if (data.editorData) {
      openInEditor(data.editorData.path, data.editorData.content, data.editorData.hash);
    } else if (data.error === "MERGE_CONFLICT") {
      setActivityStream(prev => [{
        id: Date.now(),
        action: "conflict",
        message: `Merge conflict in ${data.conflictedFiles?.join(', ')}`,
        timestamp: new Date()
      }, ...prev]);
    }

    // 3. Handle Structured Data (Repos)
    if (data.data?.type === "github_repos") {
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: "repos",
        content: data.data.repos,
        timestamp: new Date()
      }]);
    }

    // 4. Handle Pending Action / Clarification
    if (data.needsInput && data.pendingAction) {
      setPendingAction(data.pendingAction);
      
      // Trigger the modal if it's a dangerous action!
      if (data.aiResponse.includes("HUMAN-IN-THE-LOOP") || data.pendingAction === "delete_repo") {
         setConfirmDialog({ isOpen: true, text: data.aiResponse, type: "ai_action" });
      }

      setMessages(prev => [...prev, {
        id: Date.now(),
        type: "assistant",
        content: data.aiResponse,
        timestamp: new Date()
      }]);
      return;
    }

    // 5. Normal Action Complete
    setPendingAction(null);
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: data.success ? "assistant" : "error",
      content: data.aiResponse || data.error || "Action finished invisibly.",
      data: data.data,
      timestamp: new Date()
    }]);

    setMetrics(prev => [...prev, finishRequest(req, true)]);

  } catch (err) {
    console.error("HANDLE SUBMIT ERROR:", err);
    setMetrics(prev => [...prev, finishRequest(req, false)]);
  } finally {
    setIsProcessing(false);
  }
};
// 👇 ADD THESE TWO FUNCTIONS
  const fetchFiles = async (path = ".") => {
    if (!user?.login) return;
    try {
      const res = await fetch("http://localhost:5000/api/files/list", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": user.login },
        body: JSON.stringify({ path })
      });
      if (res.ok) {
        const data = await res.json();
        // Sort directories first, then files
        data.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'dir' ? -1 : 1;
        });
        setFileTree(data);
        setCurrentPath(path);
      }
    } catch (err) {
      console.error("Failed to fetch files:", err);
    }
  };

  const handleFileClick = async (file) => {
    if (file.type === "dir") {
      // It's a folder, open it!
      const newPath = currentPath === "." ? file.name : `${currentPath}/${file.name}`;
      fetchFiles(newPath);
    } else {
      // It's a file, read it and open Monaco!
      const filePath = currentPath === "." ? file.name : `${currentPath}/${file.name}`;
      try {
        const res = await fetch("http://localhost:5000/api/files/read", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-User-Id": user.login },
          body: JSON.stringify({ path: filePath })
        });
        if (res.ok) {
          const data = await res.json();
          openInEditor(filePath, data.content, data.doc?.hash);
        }
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    }
  };

  // 👇 ADD THIS EFFECT
  useEffect(() => {
    if (user?.login && activeSidebarTab === 'explorer') {
      fetchFiles(currentPath);
    }
  }, [user, activeSidebarTab]);

  // 📄 VS Code-Style New File Creator
  const handleCreateNewFile = async (e) => {
    if (e.key === 'Enter' && newFileName.trim()) {
      const filePath = currentPath === "." ? newFileName : `${currentPath}/${newFileName}`;
      try {
        const res = await fetch("http://localhost:5000/api/files/write", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-User-Id": user.login },
          body: JSON.stringify({
            path: filePath,
            content: "", // Start with an empty file
          })
        });
        
        if (res.ok) {
          const data = await res.json();
          setIsCreatingFile(false);
          setNewFileName("");
          fetchFiles(currentPath); // Refresh the folder list
          openInEditor(filePath, "", data.doc?.hash); // Instantly open the editor!
        }
      } catch (err) {
        console.error("Failed to create file:", err);
      }
    } else if (e.key === 'Escape') {
      // Cancel on Escape key
      setIsCreatingFile(false);
      setNewFileName("");
    }
  };

  //crete a new folder
  const handleCreateNewFolder = async (e) => {
  if (e.key === 'Enter' && newFolderName.trim()) {
    const folderPath = currentPath === "." ? newFolderName : `${currentPath}/${newFolderName}`;
    try {
      const res = await fetch("http://localhost:5000/api/files/mkdir", { // Ensure this route exists on backend
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": user.login },
        body: JSON.stringify({ path: folderPath })
      });
      
      if (res.ok) {
        setIsCreatingFolder(false);
        setNewFolderName("");
        fetchFiles(currentPath); // Refresh view
      }
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
  } else if (e.key === 'Escape') {
    setIsCreatingFolder(false);
    setNewFolderName("");
  }
};

// Performance metrics data
  const performanceData = React.useMemo(() => {
    if (!metrics.length) {
      return {
        responseTimes: [],
        successRate: 0,
        activeConnections: 1 // Hardcoded since we removed server tracking
      };
    }

    const responseTimes = metrics.map(m =>
      Math.round(m.endTime - m.startTime)
    );

    const successRate = (
      (metrics.filter(m => m.success).length / metrics.length) * 100
    ).toFixed(1);

    return {
      responseTimes,
      successRate,
      activeConnections: 1
    };
  }, [metrics]);

  const getMessageStyles = (type) => {
    const baseStyles = "rounded-2xl px-4 py-3 max-w-[80%] break-words";
    switch (type) {
      case 'user':
        return `${baseStyles} bg-blue-600 text-white ml-auto`;
      case 'assistant':
        return `${baseStyles} bg-gray-700 text-white`;
      case 'system':
        return `${baseStyles} bg-gray-800 text-gray-300 border border-dashed border-gray-600`;
      case 'error':
        return `${baseStyles} bg-red-600 text-white`;
      default:
        return `${baseStyles} bg-gray-700 text-white`;
    }
  };
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    // 1. Safely get the model
    const model = editor.getModel();
    if (!model) return;

    const currentContent = model.getValue() || ""; 
    
    // 2. If the file contains Git conflict markers, dynamically highlight them
    if (currentContent.includes("<<<<<<< HEAD")) {
      const startMatches = model.findMatches("<<<<<<< HEAD", false, false, false, null, true);
      const endMatches = model.findMatches(">>>>>>>", false, false, false, null, true);
      
      if (startMatches.length > 0) {
        const startLine = startMatches[0].range.startLineNumber;
        // Find the matching end marker, or just highlight to the end of the file if missing
        const endLine = endMatches.length > 0 ? endMatches[0].range.startLineNumber : model.getLineCount();

        // Safely draw the decoration
        editor.deltaDecorations([], [{
          range: new monaco.Range(startLine, 1, endLine, 1),
          options: { 
            isWholeLine: true, 
            className: 'bg-red-900/30 border-l-4 border-red-500',
            overviewRulerColor: 'red'
          }
        }]);
      }
    }
  };

  // Fetch branches whenever the active repo changes
  useEffect(() => {
    const fetchBranches = async () => {
      if (!activeRepository) return setRepoBranches({ all: [], current: "" });
      try {
        const res = await fetch("http://localhost:4000/ask/list-branches", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ name: activeRepository })
        });
        const data = await res.json();
        if (data.success) {
          setRepoBranches({ all: data.all, current: data.current });
        }
      } catch (err) { console.error("Failed to fetch branches:", err); }
    };
    fetchBranches();
  }, [activeRepository, activityStream]); // Re-fetch on activity so branches update after a push/switch

  // Handle clicking a branch from the list
  const handleBranchSwitch = async (branchName) => {
    setShowBranchDropdown(false);
    if (branchName === repoBranches.current) return;

    setIsProcessing(true);
    setAgentTask(`Fetching from GitHub and checking out branch: ${branchName}...`); 
    setMessages(prev => [...prev, { id: Date.now(), type: "user", content: `Switching to branch: ${branchName}`, timestamp: new Date() }]);

    try {
      // ✅ NEW LOGIC: Use the global state directly
      const payload = { action: "switch_branch", parameters: { branch: branchName, name: activeRepository } };
      const backendRes = await fetch("http://localhost:4000/ask", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(payload)
      });
      const data = await backendRes.json();
      
      if (data.success) {
        setActivityStream(prev => [{ id: Date.now(), action: "switch_branch", message: `Switched to ${branchName}`, timestamp: new Date() }, ...prev]);
      }
      setMessages(prev => [...prev, { id: Date.now() + 1, type: data.success ? "assistant" : "error", content: data.aiResponse || data.error || `Failed to switch to ${branchName}`, timestamp: new Date() }]);
    } catch (e) { 
      console.error(e); 
    } finally {
      setIsProcessing(false);
    }
  };

// 🧠 Auto-Generate Commit Message when the modal opens
  useEffect(() => {
    if (commitModal.isOpen && !commitModal.message) {
      const fetchAutoCommit = async () => {
        setIsGeneratingCommit(true);
        setAgentTask("Gemini is analyzing Git diff to generate semantic commit...");
        try {
          const res = await fetch("http://localhost:4000/ask/generate-commit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: commitModal.repoName })
          });
          const data = await res.json();
          if (data.success && data.message) {
            setCommitModal(prev => ({ ...prev, message: data.message }));
          } else {
            setCommitModal(prev => ({ ...prev, message: "Update files" }));
          }
        } catch (e) {
          console.error("Failed to auto-generate commit:", e);
        } finally {
          setIsGeneratingCommit(false);
        }
      };
      fetchAutoCommit();
    }
  }, [commitModal.isOpen, commitModal.repoName]);

  // 🔄 Manual Pull/Sync Function
const handleManualPull = async (repoName) => {
  if (!repoName || isProcessing) return;

  const payload = { 
    action: "pull_repo", 
    parameters: { name: repoName } 
  };

  setIsProcessing(true);
  setAgentTask(`Pulling latest changes for ${repoName}...`);
  setMessages(prev => [...prev, { 
    id: Date.now(), 
    type: "user", 
    content: `Syncing ${repoName} with GitHub...`, 
    timestamp: new Date() 
  }]);

  try {
    const res = await fetch("http://localhost:4000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      setActivityStream(prev => [{ 
        id: Date.now(), 
        action: "pull_repo", 
        message: `Successfully synced ${repoName}`, 
        timestamp: new Date() 
      }, ...prev]);
    }

    // Handle potential merge conflicts found during pull
    if (data.error === "MERGE_CONFLICT") {
       setActivityStream(prev => [{
        id: Date.now(),
        action: "conflict",
        message: `Merge conflict during pull in ${repoName}`,
        timestamp: new Date()
      }, ...prev]);
    }

    setMessages(prev => [...prev, { 
      id: Date.now() + 1, 
      type: data.success ? "assistant" : "error", 
      content: data.aiResponse || data.error, 
      timestamp: new Date() 
    }]);

  } catch (err) {
    console.error("Pull Error:", err);
  } finally {
    setIsProcessing(false);
  }
};

  return (
  <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
    {/* Left Panel - Sidebar (Collapsible) */}
    <div className={`bg-[#1e1e1e] border-r border-gray-800 flex flex-col shrink-0 relative transition-all duration-300 ${showLeftSidebar ? 'w-64' : 'w-12'}`}>
      
      {/* Toggle Button */}
      <button 
        onClick={() => setShowLeftSidebar(!showLeftSidebar)}
        className="absolute -right-4 top-10 transform bg-gray-700 border border-gray-600 rounded-full w-8 h-8 flex items-center justify-center z-50 hover:bg-blue-600 transition-colors shadow-lg"
      >
        {showLeftSidebar ? '←' : '→'}
      </button>

      {showLeftSidebar ? (
        <>
          {/* Tabs */}
          <div className="flex border-b border-gray-800 shrink-0">
            <button 
              onClick={() => setActiveSidebarTab('activity')}
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider transition-colors ${activeSidebarTab === 'activity' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}
            >
              Activity
            </button>
            <button 
              onClick={() => setActiveSidebarTab('explorer')}
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider transition-colors ${activeSidebarTab === 'explorer' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}
            >
              Explorer
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-700">
            {/* VIEW 1: ACTIVITY STREAM */}
            {/* VIEW 1: ACTIVITY STREAM & SYSTEM STATUS */}
            {activeSidebarTab === 'activity' && (
              <div className="flex flex-col h-full overflow-hidden">
                
                {/* 🧠 NEW: ACTIVE THINKING INDICATOR */}
                {(isProcessing || isGeneratingCommit || isUploading) && (
                  <div className="mx-2 mt-2 mb-3 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg shadow-[0_0_15px_rgba(147,51,234,0.15)] shrink-0 animate-in fade-in zoom-in duration-300">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-3 w-3 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">DevMind Thinking...</span>
                        <span className="text-[11px] text-purple-300/80 animate-pulse font-mono truncate">
                          {agentTask || "Orchestrating background tasks..."}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 📜 Upgraded Scrollable Activity List */}
                <div className="flex-1 overflow-y-auto space-y-3 px-2 scrollbar-thin scrollbar-thumb-gray-700">
                  {activityStream.length === 0 ? (
                    <div className="text-xs text-gray-500 text-center mt-10 font-mono">No recent activity</div>
                  ) : (
                    activityStream.map((item) => (
                      <div key={item.id} className="flex items-start space-x-3 text-sm animate-in slide-in-from-left-2 duration-300 bg-gray-800/30 p-2 rounded-lg border border-gray-800/50">
                        <div className={`mt-0.5 ${item.action === 'conflict' ? 'text-yellow-500' : item.action === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                          {item.action === 'conflict' ? '⚠️' : item.action === 'error' ? '❌' : '✓'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-gray-300 font-bold capitalize text-[12px] tracking-wide">{item.action.replace(/_/g, ' ')}</div>
                          <div className="text-[11px] text-gray-400 font-mono mt-1 leading-relaxed break-words">{item.message}</div>
                          <div className="text-[9px] text-gray-600 mt-2 font-mono">{item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Relocated Mini-Analytics (Pinned to bottom) */}
                <div className="pt-4 mt-4 border-t border-gray-800 shrink-0 px-2">
                  <h3 className="font-semibold text-gray-500 text-[10px] uppercase tracking-wider mb-3">System Health</h3>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-gray-800/50 p-2 rounded border border-gray-700/50 text-center">
                      <div className="text-sm font-bold text-green-400">{performanceData.successRate}%</div>
                      <div className="text-gray-500 text-[8px] uppercase tracking-tighter">Success</div>
                    </div>
                    <div className="bg-gray-800/50 p-2 rounded border border-gray-700/50 text-center">
                      <div className="text-sm font-bold text-blue-400">
                        {performanceData.responseTimes.length ? Math.round(performanceData.responseTimes.reduce((a, b) => a + b, 0) / performanceData.responseTimes.length) : 0}ms
                      </div>
                      <div className="text-gray-500 text-[8px] uppercase tracking-tighter">Latency</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {['LLM Orchestrator', 'API Gateway'].map((service) => (
                      <div key={service} className="flex items-center justify-between px-2 py-1 bg-gray-800/30 rounded border border-gray-700/50">
                        <span className="text-[10px] text-gray-400">{service}</span>
                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: FILE EXPLORER */}
            {activeSidebarTab === 'explorer' && (
              <div className="flex flex-col space-y-1">
                 {!user ? (
                  <div className="text-xs text-gray-500 text-center mt-10">Login to view files</div>
                ) : (
                  <>
                    {/* Explorer Header & Action Bar */}
                    <div className="flex items-center justify-between px-2 mb-2 pb-2 border-b border-gray-800">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                        {currentPath === "." ? "WORKSPACE" : currentPath.split('/').pop()}
                      </span>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded transition-colors"
                          title="Upload to folder"
                        >
                          ⬆️
                        </button>
                        <button 
                          onClick={() => { setIsCreatingFolder(true); setIsCreatingFile(false); }}
                          className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded transition-colors"
                          title="New Folder"
                        >
                          📂+
                        </button>
                        <button 
                          onClick={() => { setIsCreatingFile(true); setIsCreatingFolder(false); }}
                          className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded transition-colors"
                          title="New File"
                        >
                          📄+
                        </button>
                      </div>
                    </div>

                    {/* Back Button (if not in root) */}
                    {currentPath !== "." && (
                      <button 
                        onClick={() => fetchFiles(currentPath.split('/').slice(0, -1).join('/') || '.')} 
                        className="text-left text-sm text-gray-400 hover:text-white flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                      >
                        <span className="text-lg leading-none">🔙</span> 
                        <span className="font-mono text-xs">.. (Go back)</span>
                      </button>
                    )}
                    {/* 📂 NEW FOLDER INPUT */}
                    {isCreatingFolder && (
                      <div className="flex items-center gap-2 py-1.5 px-2 bg-gray-800/80 rounded-lg border border-yellow-500/50 mb-1">
                        <span className="text-sm leading-none opacity-80">📁</span>
                        <input 
                          autoFocus
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={handleCreateNewFolder}
                          onBlur={() => { setIsCreatingFolder(false); setNewFolderName(""); }}
                          placeholder="folder name"
                          className="bg-transparent text-xs text-white focus:outline-none w-full font-mono"
                        />
                      </div>
                    )}

                    {/* Inline New File Input */}
                    {isCreatingFile && (
                      <div className="flex items-center gap-2 py-1.5 px-2 bg-gray-800/80 rounded-lg border border-blue-500/50 mb-1">
                        <span className="text-sm leading-none opacity-80">📄</span>
                        <input 
                          autoFocus
                          type="text"
                          value={newFileName}
                          onChange={(e) => setNewFileName(e.target.value)}
                          onKeyDown={handleCreateNewFile}
                          onBlur={() => { setIsCreatingFile(false); setNewFileName(""); }}
                          placeholder="filename.ext"
                          className="bg-transparent text-xs text-white focus:outline-none w-full font-mono placeholder-gray-500"
                        />
                      </div>
                    )}

                    {/* File/Folder List */}
                    {fileTree.map(file => (
                      <div key={file.name} className="group flex items-center justify-between py-1 px-2 rounded-lg hover:bg-gray-800 transition-colors">
                        
                        {/* 📄 Clickable File/Folder Name */}
                        <button 
                          onClick={() => handleFileClick(file)} 
                          className="flex-1 text-left text-sm text-gray-300 hover:text-white flex items-center gap-2 truncate"
                        >
                          <span className="text-lg leading-none opacity-80 shrink-0">{file.type === 'dir' ? '📁' : '📄'}</span> 
                          <span className="font-mono text-xs truncate">{file.name}</span>
                        </button>
                        
                        {/* 🗑️ Hidden Hover Delete Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent the file from opening!
                            const filePath = currentPath === "." ? file.name : `${currentPath}/${file.name}`;
                            
                            // Trigger the global safety modal
                            setConfirmDialog({
                               isOpen: true,
                               type: "delete_file",
                               data: { path: filePath },
                               text: `⚠️ **HUMAN-IN-THE-LOOP AUTHORIZATION REQUIRED:**\n\nAre you absolutely sure you want to permanently delete the ${file.type === 'dir' ? 'folder' : 'file'} **\`${file.name}\`**?\n\nThis action cannot be undone.\n\nReply **"yes"** to confirm or **"no"** to cancel.`
                            });
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-700 transition-all ml-2 shrink-0"
                          title={`Delete ${file.type === 'dir' ? 'folder' : 'file'}`}
                        >
                          🗑️
                        </button>
                        
                      </div>
                    ))}
                    
                    {fileTree.length === 0 && !isCreatingFile && (
                      <div className="text-xs text-gray-500 text-center mt-10">Folder is empty</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Retracted View */
        <div 
          className="flex-1 flex flex-col items-center py-6 h-full cursor-pointer hover:bg-gray-800/50" 
          onClick={() => setShowLeftSidebar(true)}
        >
          <span className="transform -rotate-90 whitespace-nowrap font-bold tracking-[0.2em] text-[10px] uppercase text-gray-500 mt-20">
            Workspace
          </span>
        </div>
      )}
    </div>

      {/* Main Content Area - Split into Chat (Left) and Editor (Right) */}
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Shared Header (Auth Area) */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-green-500 bg-clip-text text-transparent">
            MCP Orchestrator
          </h2>
              
              {/* Auth Area Code */}
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <div className="flex items-center space-x-2">
                  {user.avatar_url && (
                    <img src={user.avatar_url} alt="avatar" className="w-8 h-8 rounded-full" />
                  )}
                  <div className="text-sm text-right">
                    <div className="font-medium">GitHub</div>
                    <div className="truncate max-w-[10rem]">{user.login || user.name}</div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await fetch("http://localhost:4000/auth/logout", { method: "POST", credentials: "include" });
                    await fetchAuthStatus();
                  }}
                  className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition"
                >
                  Logout GitHub
                </button>
              </>
            ) : (
              <button
                onClick={() => window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo,user,delete_repo`}
                className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition"
              >
                Login GitHub
              </button>
            )}
            {puterReady ? (
              <div className="flex items-center space-x-2 text-sm text-purple-300">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <span>AI Ready</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-sm text-yellow-300">
                <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                <button onClick={loginToPuter} className="underline hover:text-yellow-200 transition">Login AI</button>
              </div>
            )}
          </div>
        </div>
      </div>
          
          {/* Horizontal Container for Chat and Editor */}
      <div className="flex-1 flex flex-row overflow-hidden">
        {/* Chat Section */}
        {!isEditorExpanded && (
        <div className={`flex flex-col border-r border-gray-700 transition-all duration-300 ${openFiles.length > 0 ? 'w-[450px]' : 'flex-1'}`}>
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-700">
            {messages.map((message) => (
              <div key={message.id} className="flex flex-col mb-2">
                <div className={getMessageStyles(message.type)}>
                  {renderMessageContent(message.content,message.data?.type, message.data)}
                </div>
                <div className={`text-xs text-gray-500 mt-1 ${message.type === 'user' ? 'text-right mr-2' : 'ml-2'}`}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex space-x-2 items-center">
                <div className="bg-gray-700 rounded-2xl px-4 py-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

        {/* Input Area (Bottom of Chat) */}
          <div className="border-t border-gray-700 bg-gray-900 p-6">
            <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
              <div className="flex space-x-4 items-center">
                <input
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  disabled={isProcessing || !user || !puterReady}
                  placeholder={!user ? "Login with GitHub..." : "Ask me anything..."}
                  className="flex-1 bg-gray-800 border-2 border-gray-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-blue-500"
                />
                <button type="submit" disabled={isProcessing || !inputValue.trim()} className="bg-blue-600 rounded-2xl p-4 w-14 h-14">
                  {isProcessing ? '⏳' : '➤'}
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-gray-700 rounded-2xl p-4 w-14 h-14">
                  🔗
                </button>
              </div>
            </form>
          </div>
        </div>
        )}
        {/* Editor Section (Slides in from Right) */}
        {/* Multi-Tab Editor Section */}
        {openFiles.length > 0 && (
          <div className="flex-1 flex flex-col bg-[#1e1e1e] animate-in slide-in-from-right duration-300 border-l border-gray-800 min-w-0">
            
            {/* 1. Tab Bar */}
            {/* 1. Tab Bar & Global Controls */}
            <div className="flex bg-[#181818] border-b border-gray-800 shrink-0 justify-between">
              
              {/* Tabs */}
              <div className="flex overflow-x-auto scrollbar-none flex-1">
                {openFiles.map(file => (
                  <div 
                    key={file.path}
                    onClick={() => setActiveFilePath(file.path)}
                    className={`group flex items-center gap-2 px-4 py-2 text-xs font-mono cursor-pointer border-r border-gray-800 max-w-[200px] ${
                      activeFilePath === file.path 
                        ? 'bg-[#1e1e1e] text-blue-400 border-t-2 border-t-blue-500' 
                        : 'text-gray-500 hover:bg-[#252525]'
                    }`}
                  >
                    <span className="truncate">{file.path.split('/').pop()}</span>
                    {file.isDirty && <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0"></span>}
                    <button 
                      onClick={(e) => closeTab(e, file.path)} 
                      className={`ml-auto p-1 rounded hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity ${file.isDirty ? 'opacity-100' : ''}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* 🎛️ GLOBAL EDITOR CONTROLS */}
              <div className="flex items-center px-2 space-x-1 border-l border-gray-800 bg-[#1e1e1e] shrink-0">
                <button
                  onClick={() => setIsEditorExpanded(!isEditorExpanded)}
                  className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors"
                  title={isEditorExpanded ? "Collapse Editor" : "Expand Editor"}
                >
                  {isEditorExpanded ? '🗗' : '🗖'}
                </button>
                <button
                  onClick={() => { setOpenFiles([]); setActiveFilePath(null); setIsEditorExpanded(false); }}
                  className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-700 transition-colors"
                  title="Close All Files"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 2. Editor Toolbar */}
            <div className="p-2 bg-[#1e1e1e] border-b border-gray-800 flex justify-between items-center shrink-0">
               <span className="text-[10px] text-gray-500 font-mono truncate px-2">
                 {activeFilePath}
               </span>
               <div className="flex gap-2">

                {/* ↩️ NATIVE MONACO UNDO/REDO */}
                 <div className="flex border border-gray-700 rounded mr-2 bg-[#252525] overflow-hidden">
                   <button 
                     onClick={() => editorRef.current?.trigger('ui', 'undo', null)}
                     className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-600 transition-colors border-r border-gray-700"
                     title="Undo (Ctrl+Z)"
                   >
                     ↩️
                   </button>
                   <button 
                     onClick={() => editorRef.current?.trigger('ui', 'redo', null)}
                     className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-600 transition-colors"
                     title="Redo (Ctrl+Y)"
                   >
                     ↪️
                   </button>
                 </div>

                 {/* 🤖 MAGIC AUTO-RESOLVE BUTTON */}
                  {String(openFiles.find(f => f.path === activeFilePath)?.content || "").includes("<<<<<<< HEAD") && (
                    <button 
                      // 👇 CHANGE THIS onClick to open the modal
                      onClick={() => setConflictModal({ isOpen: true, instructions: "" })} 
                      disabled={isProcessing}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors shadow-[0_0_10px_rgba(147,51,234,0.3)] animate-pulse hover:animate-none"
                    >
                      ✨ Auto-Resolve with AI
                    </button>
                  )}
                 <button 
                   onClick={handleSaveFromEditor} 
                   disabled={!openFiles.find(f => f.path === activeFilePath)?.isDirty}
                   className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors"
                 >
                   Save File
                 </button>
               </div>
            </div>

            {/* 3. Monaco Editor Instance */}
            <div className="flex-1 relative">
              {activeFilePath ? (
                <Editor
                  theme="vs-dark"
                  path={activeFilePath} // Helps Monaco manage internal models
                  defaultLanguage="javascript"
                  value={openFiles.find(f => f.path === activeFilePath)?.content || ""}
                  onChange={handleEditorChange}
                  onMount={handleEditorDidMount}
                  options={{
                    fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                    fontLigatures: true,
                    minimap: { enabled: false },
                    padding: { top: 20 },
                    scrollBeyondLastLine: false
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm font-mono">
                  Select a tab to view content
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

      {/* Right Panel - Analytics (Retractable) */}
{/* Right Panel - Git Context (Retractable) */}
      <div className={`bg-[#161b22] border-l border-gray-800 transition-all duration-300 flex flex-col relative shrink-0 ${showRightPanel ? 'w-80' : 'w-12'}`}>
        
        {/* Retract/Expand Toggle Button */}
        <button 
          onClick={() => setShowRightPanel(!showRightPanel)}
          className="absolute -left-4 top-10 transform bg-gray-700 border border-gray-600 rounded-full w-8 h-8 flex items-center justify-center z-50 hover:bg-blue-600 transition-colors shadow-lg"
          title={showRightPanel ? "Collapse Git Panel" : "Expand Git Panel"}
        >
          {showRightPanel ? '→' : '←'}
        </button>

        {showRightPanel ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-gray-800 shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-200">
                <span className="text-blue-400">🐙</span> Git Context
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-gray-700">
              
              {/* Repository Information */}
              <div className="space-y-3">
                <div className="bg-[#0d1117] border border-gray-700 rounded-lg p-4 shadow-inner">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-bold">Active Repository</div>
                  <div className="font-mono text-sm text-blue-400 truncate">
                    {activeRepository || "No Active Repo"}
                  </div>
                </div>

                {/* 🔀 Branch Selector Component */}
                <div className="bg-[#0d1117] border border-gray-700 rounded-lg p-4 relative shadow-inner">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-bold">Current Branch</div>
                  
                  {/* Dropdown Toggle Button */}
                  <button 
                    onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                    disabled={!repoBranches.current}
                    className="w-full flex items-center justify-between font-mono text-sm text-green-400 hover:text-green-300 transition-colors bg-gray-900/50 hover:bg-gray-800 border border-gray-700 rounded px-3 py-2 disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                        <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Z"></path>
                      </svg>
                      {repoBranches.current || "No branch"}
                    </div>
                    <span className="text-[10px] text-gray-500">▼</span>
                  </button>

                  {/* Dropdown Menu List */}
                  {showBranchDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-[#161b22] border border-gray-700 rounded-lg shadow-2xl z-50 max-h-48 overflow-y-auto animate-in fade-in zoom-in duration-100">
                      <div className="p-2 text-[10px] font-bold text-gray-500 border-b border-gray-800 uppercase tracking-wider bg-[#0d1117] rounded-t-lg">
                        Switch Branch
                      </div>
                      <div className="p-1">
                        {repoBranches.all.map(branch => (
                          <button
                            key={branch}
                            onClick={() => handleBranchSwitch(branch)}
                            className="w-full text-left px-3 py-2 text-sm font-mono text-gray-300 hover:bg-[#238636] hover:text-white rounded transition-colors flex items-center group"
                          >
                            <span className={`w-4 mr-2 text-green-400 group-hover:text-white ${branch === repoBranches.current ? 'opacity-100' : 'opacity-0'}`}>
                              ✓
                            </span>
                            {branch}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Quick Actions Grid */}
              <div>
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() =>  handleManualPull(activeRepository)}
                    disabled={!activeRepository || isProcessing}
                    className="flex flex-col items-center justify-center py-4 px-2 bg-gray-800/40 hover:bg-gray-700 border border-gray-700 rounded-xl transition-all hover:border-blue-500/50 group"
                  >
                    <span className="text-xl mb-2 group-hover:-translate-y-1 transition-transform">⬇️</span>
                    <span className="text-xs text-gray-300 font-mono">Pull</span>
                  </button>
                  
                  {/* Commits trigger the actual GitHub modal directly! */}
                  <button 
                  onClick={() => setCommitModal({ isOpen: true, repoName: activeRepository, message: "" })} 
                  className="flex flex-col items-center justify-center py-4 px-2 bg-[#238636]/10 hover:bg-[#238636]/20 border border-[#238636]/30 rounded-xl transition-all hover:border-[#2ea043] group shadow-[0_0_15px_rgba(35,134,54,0.1)]"
                  >
                    <span className="text-xl mb-2 group-hover:-translate-y-1 transition-transform">✨</span>
                    <span className="text-xs text-[#3fb950] font-mono">Commit</span>
                  </button>

                  <button 
                    onClick={() => setInputValue("push changes")}
                    className="flex flex-col items-center justify-center py-4 px-2 bg-blue-900/10 hover:bg-blue-900/20 border border-blue-800/30 rounded-xl transition-all hover:border-blue-500 group"
                  >
                    <span className="text-xl mb-2 group-hover:-translate-y-1 transition-transform">⬆️</span>
                    <span className="text-xs text-blue-400 font-mono">Push</span>
                  </button>

                  <button 
                    onClick={() => setInputValue("switch branch to ")}
                    className="flex flex-col items-center justify-center py-4 px-2 bg-purple-900/10 hover:bg-purple-900/20 border border-purple-800/30 rounded-xl transition-all hover:border-purple-500 group"
                  >
                    <span className="text-xl mb-2 group-hover:-translate-y-1 transition-transform">🔀</span>
                    <span className="text-xs text-purple-400 font-mono">Branch</span>
                  </button>
                </div>
              </div>

              {/* File Status Area */}
              <div className="pt-4 border-t border-gray-800">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-bold">Working Tree Status</div>
                <div className="text-sm bg-gray-900/50 p-3 rounded-lg border border-gray-800 font-mono flex items-center gap-2">
                  {openFiles.some(f => f.isDirty) ? (
                    <><span className="text-yellow-400 animate-pulse">●</span> <span className="text-gray-300">Unsaved changes</span></>
                  ) : (
                    <><span className="text-green-400">✓</span> <span className="text-gray-300">Clean tree</span></>
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* Retracted View - Vertical Sidebar */
          <div 
            className="w-12 flex flex-col items-center py-6 h-full cursor-pointer hover:bg-gray-800 transition-all duration-300 border-l border-gray-700 bg-[#161b22]"
            onClick={() => setShowRightPanel(true)}
          >
            <div className="flex-1 flex flex-col items-center justify-center w-full overflow-hidden">
              <span className="transform -rotate-90 whitespace-nowrap font-bold tracking-[0.2em] text-[10px] uppercase text-gray-500 origin-center">
                Git Context
              </span>
            </div>
            <div className="flex flex-col space-y-6 pb-10 opacity-40">
              <span className="text-sm">🐙</span>
              <span className="text-sm">🔀</span>
            </div>
          </div>
        )}
      </div>

{/* Global Hidden Utilities */}
{/* 🛑 Destructive Action Confirmation Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center space-x-3 mb-4 text-red-400">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-lg font-bold">Authorization Required</h3>
            </div>
            <div className="text-gray-300 text-sm mb-6 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {confirmDialog.text.replace('⚠️ **HUMAN-IN-THE-LOOP AUTHORIZATION REQUIRED:**\n\n', '')}
              </ReactMarkdown>
            </div>
            <div className="flex space-x-3 justify-end">
              <button 
                onClick={() => handleDialogResponse("no")}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDialogResponse("yes")}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-lg shadow-red-500/30"
              >
                Yes, Delete it
              </button>
            </div>
          </div>
        </div>
      )}
      <input
  type="file"
  ref={fileInputRef}
  className="hidden"
  onChange={(e) => handleFileUpload(e.target.files[0])}
/>
      {/* 🛑 GitHub-Style Commit Modal */}
      {commitModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0d1117] border border-gray-700 rounded-xl p-0 max-w-[450px] w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-center p-3 border-b border-gray-700 bg-[#161b22]">
              <h3 className="text-sm font-semibold text-white">Commit changes</h3>
              <button onClick={() => setCommitModal({ isOpen: false, repoName: null, message: "" })} className="text-gray-400 hover:text-white transition-colors">✕</button>
            </div>
            
            {/* Body */}
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[13px] font-semibold text-white mb-2">
                  Commit message
                  {isGeneratingCommit && <span className="text-[#8b949e] ml-2 font-normal animate-pulse">Generating...</span>}
                </label>
                
                {/* 🎯 FOOLPROOF ALIGNMENT WRAPPER */}
                <div className="relative w-full">
                  <input 
                    type="text" 
                    disabled={isGeneratingCommit}
                    value={commitModal.message}
                    onChange={(e) => setCommitModal(prev => ({ ...prev, message: e.target.value }))}
                    placeholder={isGeneratingCommit ? "✨ DevMind is thinking..." : "Update files"}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-md py-[5px] pl-3 pr-8 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] disabled:opacity-70 transition-colors"
                  />
                  
                  {/* ✨ The Authentic GitHub Generate Button (Now uses Gemini backend to Regenerate) */}
                  <button 
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      setIsGeneratingCommit(true);
                      setCommitModal(prev => ({ ...prev, message: "" })); // Clear input for the thinking animation
                      try {
                        const res = await fetch("http://localhost:4000/ask/generate-commit", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ name: commitModal.repoName })
                        });
                        const data = await res.json();
                        if (data.success && data.message) {
                          setCommitModal(prev => ({ ...prev, message: data.message }));
                        } else {
                          setCommitModal(prev => ({ ...prev, message: "Update files" }));
                        }
                      } catch (err) {
                        console.error("❌ Gemini commit error:", err);
                        setCommitModal(prev => ({ ...prev, message: "Update files" }));
                      } finally {
                        setIsGeneratingCommit(false);
                      }
                    }}
                    disabled={isGeneratingCommit}
                    className="absolute inset-y-0 right-0 flex items-center justify-center w-8 text-[#8b949e] hover:text-[#58a6ff] bg-transparent disabled:opacity-50 transition-colors"
                    title="Regenerate commit message"
                  >
                    {isGeneratingCommit ? (
                      <span className="text-xs animate-spin">⏳</span>
                    ) : (
                      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" fill="currentColor">
                        <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"></path>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-[13px] font-semibold text-white mb-2">Extended description</label>
                <textarea 
                  rows="3"
                  disabled={isGeneratingCommit}
                  placeholder="Add an optional extended description..."
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md py-2 px-3 text-sm text-[#8b949e] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] resize-none disabled:opacity-50 transition-colors"
                ></textarea>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-3 bg-[#161b22] border-t border-gray-700 flex justify-end space-x-2">
              <button 
                onClick={() => setCommitModal({ isOpen: false, repoName: null, message: "" })}
                className="px-3 py-1.5 text-sm font-medium text-gray-300 bg-[#21262d] border border-[rgba(240,246,252,0.1)] rounded-md hover:bg-[#30363d] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  const finalMessage = commitModal.message.trim() || "Update files";
                  const payload = { action: "push_repo", parameters: { message: finalMessage, name: commitModal.repoName } };
                  setCommitModal({ isOpen: false, repoName: null, message: "" });
                  
                  setIsProcessing(true);
                  setMessages(prev => [...prev, { id: Date.now(), type: "user", content: "Pushing changes...", timestamp: new Date() }]);
                  try {
                    const backendRes = await fetch("http://localhost:4000/ask", {
                        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                        body: JSON.stringify(payload)
                    });
                    const data = await backendRes.json();
                    if (data.success) {
                        setActivityStream(prev => [{ id: Date.now(), action: "push_repo", message: "Successfully pushed changes", timestamp: new Date() }, ...prev]);
                    }
                    setMessages(prev => [...prev, { id: Date.now() + 1, type: data.success ? "assistant" : "error", content: data.aiResponse || data.error, timestamp: new Date() }]);
                  } catch(e) { console.error(e); }
                  setIsProcessing(false);
                }}
                disabled={isProcessing || isGeneratingCommit}
                className="px-3 py-1.5 text-sm font-medium text-white bg-[#238636] border border-[rgba(240,246,252,0.1)] rounded-md hover:bg-[#2ea043] disabled:opacity-50 transition-colors"
              >
                Commit & Push
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🧠 AI Conflict Resolver Modal UPGRADED */}
      {conflictModal.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-[#0d1117] border border-purple-500/40 rounded-xl p-0 max-w-[550px] w-full shadow-[0_0_50px_rgba(147,51,234,0.2)] overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gradient-to-r from-[#161b22] to-purple-900/10">
              <h3 className="text-sm font-bold flex items-center gap-2 text-gray-200">
                <span className="text-purple-400 text-lg">✨</span> DevMind Conflict Resolver
              </h3>
              <button 
                onClick={() => setConflictModal({ isOpen: false, instructions: "" })} 
                className="text-gray-500 hover:text-white transition-colors"
              >✕</button>
            </div>
            
            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="text-[13px] text-gray-300 leading-relaxed font-medium">
                I found git conflict markers in this file. How would you like me to resolve them? 
              </div>

              {/* ✨ NEW: Quick Action Chips */}
              <div className="flex flex-wrap gap-2">
                {[
                  "Keep my local changes and discard incoming", 
                  "Accept incoming changes,do not keep mine", 
                  "Combine both intelligently", 
                  "Analyze and choose the best version", 
                ].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => setConflictModal(prev => ({ ...prev, instructions: prompt }))}
                    className="text-[11px] px-3 py-1.5 rounded-full border border-purple-500/30 text-purple-300 bg-purple-500/10 hover:bg-purple-500/30 hover:border-purple-400 transition-all font-mono text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              
              <div>
                <textarea 
                  rows="3"
                  autoFocus
                  value={conflictModal.instructions}
                  onChange={(e) => setConflictModal(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Or type custom instructions here... (Leave blank for auto-resolve)"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md py-3 px-3 text-sm text-[#e6edf3] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none font-mono transition-colors"
                ></textarea>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#161b22] border-t border-gray-800 flex justify-between items-center">
              <div className="text-[11px] text-gray-500 font-mono">
                Powered by Gemini
              </div>
              <div className="flex space-x-3">
                <button 
                  onClick={() => setConflictModal({ isOpen: false, instructions: "" })}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-[#21262d] border border-[rgba(240,246,252,0.1)] rounded-md hover:bg-[#30363d] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleAIAutoResolve(conflictModal.instructions)}
                  className="px-4 py-2 text-sm font-bold text-white bg-purple-600 border border-purple-500/50 rounded-md hover:bg-purple-500 transition-colors shadow-lg shadow-purple-500/20 flex items-center gap-2"
                >
                  <span>Resolve Conflict</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App; 