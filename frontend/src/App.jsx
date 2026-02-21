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
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, text: "" });
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  // Tabs and Editor State
  const [openFiles, setOpenFiles] = useState([]); // Array of { path, content, hash, isDirty }
  const [activeFilePath, setActiveFilePath] = useState(null);

  // Left Sidebar Toggle
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);

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
  const handleAIAutoResolve = async () => {
    const activeFile = openFiles.find(f => f.path === activeFilePath);
    if (!activeFile || !activeFile.content.includes("<<<<<<< HEAD")) return;

    setIsProcessing(true);
    
    // Visually notify the user we are working on it
    setMessages(prev => [...prev, {
      id: Date.now(),
      type: "assistant",
      content: "Analyzing the merge conflict... I'll inject the resolved code directly into your editor in a moment. 🛠️",
      timestamp: new Date()
    }]);

    try {
      // Strict prompt to ensure the AI only returns raw code
      const prompt = `You are an expert developer. Resolve the following git merge conflict. Combine the logic intelligently if both changes are valuable, or pick the most correct one. 
      CRITICAL INSTRUCTION: RETURN ONLY THE RAW, FINAL RESOLVED CODE. DO NOT wrap it in markdown blocks (no \`\`\`javascript). DO NOT include any explanations or conversational text. 
      Here is the conflicted file:\n\n${activeFile.content}`;
      
      const response = await window.puter.ai.chat(prompt);
      let resolvedCode = response?.text || response?.message?.content || String(response);
      
      // Safety net: Strip markdown formatting if the AI disobeys
      resolvedCode = resolvedCode.replace(/^```[a-z]*\n/gm, '').replace(/```$/gm, '').trim();

      // Instantly inject the clean code into the Monaco Editor
      setOpenFiles(prev => prev.map(f => 
        f.path === activeFilePath ? { ...f, content: resolvedCode, isDirty: true } : f
      ));

      setMessages(prev => [...prev, {
        id: Date.now(),
        type: "system",
        content: "✨ Conflict automatically resolved in the editor! Please review the changes and click **Save File**.",
        timestamp: new Date()
      }]);

    } catch (err) {
      console.error("Auto-resolve failed:", err);
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: "error",
        content: "❌ Failed to auto-resolve. Please check your Puter AI connection.",
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

  try {
    setIsUploading(true);

    const res = await fetch("http://localhost:4000/file/upload", {
      method: "POST",
      body: formData,
      credentials: "include"
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || "Upload failed");
    }

    setMessages(prev => [
      ...prev,
      {
        id: Date.now(),
        type: "system",
        content: `📎 Uploaded **${file.name}** to uploads folder.`,
        timestamp: new Date()
      }
    ]);

  } catch (err) {
    setMessages(prev => [
      ...prev,
      {
        id: Date.now(),
        type: "error",
        content: `❌ Upload failed: ${err.message}`,
        timestamp: new Date()
      }
    ]);
  } finally {
    setIsUploading(false);
  }
};  

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const renderMessageContent = (content, type) => {
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
    setConfirmDialog({ isOpen: false, text: "" }); // Close modal immediately
    
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
  e.preventDefault();

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

  if (!inputValue.trim()) return;

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

  try {
        let payload;

        // 🛑 HARD COMMAND INTERCEPTOR: Bypass AI hallucination for branching & pushing
        const lowerInput = currentInput.toLowerCase();
        
        if (lowerInput.includes("branch")) {
          // 🧠 UPGRADED REGEX: Safely ignores "to", "named", and "called"
          const branchMatch = currentInput.match(/branch\s+(?:named\s+|called\s+|to\s+)?([^\s]+)/i);
          
          if (branchMatch) {
            payload = {
              action: "switch_branch",
              parameters: { branch: branchMatch[1] }
            };
            const repoMatch = currentInput.match(/in (?:the )?([^\s]+)/i);
            if (repoMatch) payload.parameters.name = repoMatch[1];
          }
        } else if (lowerInput.startsWith("push") || lowerInput.includes("push changes")) {
          // Instantly lock in the push command without asking the AI
          payload = {
            action: "push_repo",
            parameters: {}
          };
          const repoMatch = currentInput.match(/in (?:the )?([^\s]+)/i);
          if (repoMatch) payload.parameters.name = repoMatch[1];
        }

        // Only ask the AI Router if we haven't manually intercepted the command
        if (!payload) {
          // 🧠 ALWAYS USE ROUTER MODE (Allow context switching)
          const chatHistory = messages
            .slice(-4)
            .map(m => ({
              role: m.type === "user" ? "user" : "assistant",
              content: typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content)
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
    // If the router didn't recognize a new command (action is null) but we have a pending action,
    // we assume the user is answering a clarification question.
    if (pendingAction && payload.action === null) {
      payload.action = pendingAction;
      payload.parameters = payload.parameters || {};
      payload.parameters._continuation = currentInput;
    }
    // 🛟 SAFETY NET: If the AI router STILL failed to pick an action, fallback to keyword matching
    if (!payload.action && !pendingAction) {
      const lowerInput = currentInput.toLowerCase();
      if (lowerInput.includes("push") || lowerInput.includes("sync")) {
        payload.action = "push_repo";
      } else if (lowerInput.includes("clone") || lowerInput.includes("download")) {
        payload.action = "clone_repo";
      } else {
        // 🧠 CONVERSATIONAL FALLBACK: The user is asking a question!
        // Grab the content of the currently open file so the AI can read it.
        const activeFile = openFiles.find(f => f.path === activeFilePath);
        const contextString = activeFile 
          ? `\n\n[Context: I am currently looking at ${activeFile.path}. Here is the exact code containing the conflict:]\n${activeFile.content}` 
          : "";

        // Send it to the AI as a chat prompt instead of a backend action
        try {
          // Using Puter's direct AI chat to bypass the JSON router
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
        return; // Halt here so we don't hit the backend with an undefined action
      }
    }
    
    // 🎯 NEW: Auto-Inject Active Repository for Git operations
    if (payload.action === "push_repo" || payload.action === "clone_repo" || payload.action === "switch_branch") {
      payload.parameters = payload.parameters || {};
      
      // If the AI didn't specify a repo name, but we have a file open in the editor...
      if (!payload.parameters.name && activeFilePath) {
         // Extract the root folder name from the active tab (e.g., "goback_N" from "goback_N/sort.c")
         payload.parameters.name = activeFilePath.split('/')[0];
      }
    }
    // 🚀 SEND TO ORCHESTRATOR
    // 🚀 SEND TO ORCHESTRATOR
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
    // 4. Handle Pending Action / Clarification
    if (data.needsInput && data.pendingAction) {
      setPendingAction(data.pendingAction);
      
      // 🚨 NEW: Trigger the modal if it's a dangerous action!
      if (data.aiResponse.includes("HUMAN-IN-THE-LOOP") || data.pendingAction === "delete_repo") {
         setConfirmDialog({ isOpen: true, text: data.aiResponse });
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
    const baseStyles = "rounded-2xl px-4 py-3 max-w-[80%]";
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
            {activeSidebarTab === 'activity' && (
              <div className="space-y-4">
                {activityStream.length === 0 ? (
                  <div className="text-xs text-gray-500 text-center mt-10">No recent activity</div>
                ) : (
                  activityStream.map((item) => (
                    <div key={item.id} className="flex items-start space-x-3 text-sm">
                      <div className={`mt-0.5 ${item.action === 'conflict' ? 'text-yellow-500' : 'text-green-500'}`}>
                        {item.action === 'conflict' ? '⚠️' : '✓'}
                      </div>
                      <div>
                        <div className="text-gray-300 font-medium capitalize">
                          {item.action.replace(/_/g, ' ')}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
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
                      <button 
                        onClick={() => setIsCreatingFile(true)}
                        className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded transition-colors"
                        title="New File"
                      >
                        📄+
                      </button>
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
                      <button 
                        key={file.name} 
                        onClick={() => handleFileClick(file)} 
                        className="text-left text-sm text-gray-300 hover:text-white flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        <span className="text-lg leading-none opacity-80">{file.type === 'dir' ? '📁' : '📄'}</span> 
                        <span className="font-mono text-xs truncate">{file.name}</span>
                      </button>
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
        <div className={`flex flex-col border-r border-gray-700 transition-all duration-300 ${openFiles.length > 0 ? 'w-[450px]' : 'flex-1'}`}>
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-700">
            {messages.map((message) => (
              <div key={message.id} className="flex flex-col mb-2">
                <div className={getMessageStyles(message.type)}>
                  {renderMessageContent(message.content, message.type)}
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

        {/* Editor Section (Slides in from Right) */}
        {/* Multi-Tab Editor Section */}
        {openFiles.length > 0 && (
          <div className="flex-1 flex flex-col bg-[#1e1e1e] animate-in slide-in-from-right duration-300 border-l border-gray-800 min-w-0">
            
            {/* 1. Tab Bar */}
            <div className="flex bg-[#181818] overflow-x-auto scrollbar-none border-b border-gray-800 shrink-0">
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

            {/* 2. Editor Toolbar */}
            <div className="p-2 bg-[#1e1e1e] border-b border-gray-800 flex justify-between items-center shrink-0">
               <span className="text-[10px] text-gray-500 font-mono truncate px-2">
                 {activeFilePath}
               </span>
               <div className="flex gap-2">
                 {/* 🤖 MAGIC AUTO-RESOLVE BUTTON (Only shows if conflict markers exist) */}
                 {String(openFiles.find(f => f.path === activeFilePath)?.content || "").includes("<<<<<<< HEAD") && (
                   <button 
                     onClick={handleAIAutoResolve} 
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
<div className={`bg-gray-800 border-l border-gray-700 transition-all duration-300 flex flex-col relative shrink-0 ${showAnalytics ? 'w-80' : 'w-12'}`}>
  
  {/* Retract/Expand Toggle Button */}
  <button 
    onClick={() => setShowAnalytics(!showAnalytics)}
    className="absolute -left-4 top-10 transform bg-gray-700 border border-gray-600 rounded-full w-8 h-8 flex items-center justify-center z-50 hover:bg-blue-600 transition-colors shadow-lg"
    title={showAnalytics ? "Collapse Sidebar" : "Expand Sidebar"}
  >
    {showAnalytics ? '→' : '←'}
  </button>

  {showAnalytics ? (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-gray-700 shrink-0">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <span className="text-blue-400">📊</span> Analytics
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
        {/* Performance Metrics */}
        <div className="p-6 border-b border-gray-700">
          <h3 className="font-semibold mb-4 text-gray-400 text-xs uppercase tracking-wider text-left">Performance</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* Success Rate */}
            <div className="bg-gray-750 p-4 rounded-xl border border-gray-600 text-center shadow-inner">
              <div className="text-2xl font-bold text-green-400">
                {performanceData.successRate}%
              </div>
              <div className="text-gray-400 text-[10px] mt-1 uppercase tracking-tighter font-semibold">Success Rate</div>
            </div>

            {/* Avg Response */}
            <div className="bg-gray-750 p-4 rounded-xl border border-gray-600 text-center shadow-inner">
              <div className="text-2xl font-bold text-blue-400">
                {performanceData.responseTimes.length
                  ? Math.round(
                      performanceData.responseTimes.reduce((a, b) => a + b, 0) /
                      performanceData.responseTimes.length
                    )
                  : 0}ms
              </div>
              <div className="text-gray-400 text-[10px] mt-1 uppercase tracking-tighter font-semibold">Avg Response</div>
            </div>
          </div>
        </div>

        {/* Response Time Chart */}
        <div className="p-6 border-b border-gray-700">
          <h3 className="font-semibold mb-4 text-gray-400 text-xs uppercase tracking-wider text-left text-left">Response Time Variance</h3>
          <div className="flex items-end space-x-1 h-48">
            {performanceData.responseTimes.map((time, index) => {
              const maxTime = Math.max(...performanceData.responseTimes);
              const minTime = Math.min(...performanceData.responseTimes);
              const previousTime = index > 0 ? performanceData.responseTimes[index - 1] : time;
              const difference = time - previousTime;
              
              return (
                <div key={index} className="flex flex-col items-center flex-1">
                  <div className="relative w-full group">
                    <div className="w-full bg-gradient-to-t from-gray-800 to-gray-900 rounded-t-lg h-32 flex flex-col justify-end">
                      <div
                        className={`rounded-t-lg w-full transition-all duration-500 ${
                          time <= 100 ? 'bg-gradient-to-t from-green-400 to-emerald-600' :
                          time <= 150 ? 'bg-gradient-to-t from-yellow-400 to-amber-600' :
                          'bg-gradient-to-t from-red-400 to-rose-600'
                        }`}
                        style={{ 
                          height: `${((time - minTime) / (maxTime - minTime || 1)) * 90 + 10}%`,
                          boxShadow: `0 0 10px ${time <= 100 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                        }}
                      >
                        {time > 150 && (
                          <div className="absolute inset-0 rounded-t-lg bg-red-400 animate-pulse opacity-10"></div>
                        )}
                      </div>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-all z-50 shadow-2xl pointer-events-none">
                       <div className="text-xs font-bold text-white whitespace-nowrap">{time}ms</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500 font-mono">#{index + 1}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System Status */}
        <div className="p-6">
          <h3 className="font-semibold mb-4 text-gray-400 text-xs uppercase tracking-wider text-left">System Status</h3>
          <div className="space-y-3">
            {[
              { name: 'LLM Orchestrator', status: 'online' },
              { name: 'API Gateway', status: 'online' },
              { name: 'Database', status: 'online' }
            ].map((service) => (
              <div key={service.name} className="flex items-center justify-between p-3 bg-gray-750 rounded-lg border border-gray-700 group hover:border-blue-500/50 transition-colors">
                <span className="text-sm text-gray-300">{service.name}</span>
                <div className="w-2.5 h-2.5 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.5)] animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  ) : (
  /* Retracted View - Vertical Sidebar */
  <div 
    className="w-12 flex flex-col items-center py-6 h-full cursor-pointer hover:bg-gray-750 transition-all duration-300 border-l border-gray-700 bg-gray-800"
    onClick={() => setShowAnalytics(true)}
  >
    {/* Rotate container to keep text centered in the narrow bar */}
    <div className="flex-1 flex flex-col items-center justify-center w-full overflow-hidden">
      <span className="transform -rotate-90 whitespace-nowrap font-bold tracking-[0.2em] text-[10px] uppercase text-gray-500 origin-center">
        Analytics Dashboard
      </span>
    </div>

    {/* Icons at the bottom */}
    <div className="flex flex-col space-y-6 pb-10 opacity-40">
      <span className="text-sm" title="Performance">📈</span>
      <span className="text-sm" title="Latency">⚡</span>
      <span className="text-sm" title="System Health">💾</span>
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
    </div>
  );
};

export default App; 