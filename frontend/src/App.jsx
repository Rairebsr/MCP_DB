import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askPuter } from './puter/agent';
import Editor from "@monaco-editor/react";


const App = () => {
  const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [mcServers, setMcServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [tools, setTools] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef(null);
  const [user, setUser] = useState(null);
  const [puterReady, setPuterReady] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [metrics, setMetrics] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(true);

  // Inside App component
  const [editorFile, setEditorFile] = useState({
    path: null,
    content: "",
    isOpen: false,
    hash: null
  });

  // Helper to open editor
  const openInEditor = (path, content, hash) => {
    setEditorFile({ path, content, hash, isOpen: true });
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


  // Enhanced mock data for MCP servers
  const mockServers = [
    {
      id: 1,
      name: 'Github server',
      status: 'online',
      description: 'git tool',
      icon: '🗄️',
      tools: [
        { name: 'create-repo', description: 'Get current weather for location' },
         { name: 'list-repo', description: 'Search for locations' }
      ]
    },
    {
      id: 2,
      name: 'Docker server',
      status: 'online',
      description: 'Docker operation',
      icon: '',
      tools: [
        { name: 'create-image', description: 'Execute SQL queries' },
        { name: 'deploy', description: 'Update database records' }
      ]
    }
  ];

  useEffect(() => {
    // Simulate loading MCP servers
    setMcServers(mockServers);
    // Add welcome message
    setMessages([
      {
        id: 1,
        type: 'system',
        content: 'Welcome to MCP Orchestrator! I can help you interact with various MCP servers. Select a server to see available tools.',
        timestamp: new Date()
      }
    ]);
  }, []);

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

    // 🔒 CONTINUATION MODE (NO PUTER)
    // 🔒 MODIFIED CONTINUATION MODE in App.jsx
      if (pendingAction) {
        // Instead of bypassing, let Puter extract params from the new input
        const routerResponse = await askPuter(`For the ${pendingAction} action: ${currentInput}`, chatHistory, "router");
        try {
          payload = JSON.parse(routerResponse);
        } catch {
          payload = { action: pendingAction, parameters: { _continuation: currentInput } };
        }
      } else {
            // 🧠 NORMAL ROUTER MODE
      const chatHistory = messages
        .slice(-4)
        .map(m => ({
          role: m.type === "user" ? "user" : "assistant",
          content: typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content)
        }));

      const routerResponse = await askPuter(currentInput, chatHistory, "router");

      let parsed;
      try {
        parsed = JSON.parse(routerResponse);
      } catch {
        // fallback: router responded with text
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: "assistant",
          content: routerResponse,
          timestamp: new Date()
        }]);
        return;
      }

      payload = parsed;
    }

    // 🚀 SEND TO ORCHESTRATOR
    const backendRes = await fetch("http://localhost:4000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await backendRes.json();
    if (data.editorData) {
      openInEditor(
        data.editorData.path, 
        data.editorData.content, 
        data.editorData.hash
      );
    }
    // 📦 STRUCTURED DATA (repos, files, etc.)
    if (data.data?.type === "github_repos") {
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: "repos",
        content: data.data.repos,
        timestamp: new Date()
      }]);
    }

    // ❓ STILL NEED INPUT
    if (data.needsInput && data.pendingAction) {
      setPendingAction(data.pendingAction);

      setMessages(prev => [...prev, {
        id: Date.now(),
        type: "assistant",
        content: data.aiResponse,
        timestamp: new Date()
      }]);

      return;
    }

    // ✅ ACTION COMPLETE
    setPendingAction(null);

    setMessages(prev => [...prev, {
      id: Date.now(),
      type: "assistant",
      content: data.aiResponse,
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

  const handleSaveFromEditor = async () => {
  if (!user?.login) return;

  try {
    const res = await fetch("http://localhost:5000/api/files/write", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-User-Id": user.login 
      },
      body: JSON.stringify({
        path: editorFile.path,
        content: editorFile.content,
        lastKnownHash: editorFile.hash 
      })
    });

    const data = await res.json();

    if (res.status === 409) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'error',
        content: `🚨 Conflict in ${editorFile.path}! The file was modified externally.`,
        timestamp: new Date()
      }]);
    } else if (res.ok) {
      // ✅ SUCCESS: Update local state with the NEW hash from the server
      setEditorFile(prev => ({
        ...prev,
        hash: data.doc.hash // Syncing the new hash is critical
      }));

      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'system',
        content: `✅ Successfully saved ${editorFile.path}`,
        timestamp: new Date()
      }]);
    }
  } catch (err) {
    console.error("Save error:", err);
  }
};

  const handleServerClick = (server) => {
    setSelectedServer(server);
    setTools(server.tools);
    
    // Add server selection message
    const serverMessage = {
      id: Date.now(),
      type: 'system',
      content: `Selected ${server.name}: ${server.description}`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, serverMessage]);
  };

  const handleToolClick = (tool) => {
    const toolMessage = {
      id: Date.now(),
      type: 'system',
      content: `Tool selected: ${tool.name} - ${tool.description}`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, toolMessage]);
    setInputValue(`Use ${tool.name} to `);
  };

  // Performance metrics data
  const performanceData = React.useMemo(() => {
  if (!metrics.length) {
    return {
      responseTimes: [],
      successRate: 0,
      activeConnections: mcServers.filter(s => s.status === "online").length
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
    activeConnections: mcServers.filter(s => s.status === "online").length
  };
}, [metrics, mcServers]);


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

  return (
  <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
    {/* Left Panel - MCP Servers */}
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0">
      <div className="p-6 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">MCP Servers</h2>
          <span className="bg-blue-600 text-white px-2 py-1 rounded-full text-xs font-medium">
            {performanceData.activeConnections} Active
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {mcServers?.map((server) => (
            <div
              key={server.id}
              className={`p-4 rounded-xl cursor-pointer transition-all duration-200 border-2 ${
                selectedServer?.id === server.id
                  ? "bg-gray-700 border-blue-500 shadow-lg shadow-blue-500/20"
                  : "bg-gray-750 border-transparent hover:bg-gray-700 hover:border-gray-600"
              } ${server.status === "offline" ? "opacity-50" : ""}`}
              onClick={() => handleServerClick(server)}
            >
              <div className="flex items-start space-x-3">
                <div className="text-2xl">{server.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm truncate">{server.name}</span>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        server.status === "online"
                          ? "bg-green-900 text-green-300"
                          : "bg-red-900 text-red-300"
                      }`}
                    >
                      ● {server.status}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    {server.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tools Section */}
      {selectedServer && (
        <div className="border-t border-gray-700 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Available Tools</h3>
            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded-full text-xs">
              {tools.length} tools
            </span>
          </div>
          <div className="space-y-2">
            {tools.map((tool, index) => (
              <div
                key={index}
                className="p-3 bg-gray-750 rounded-lg cursor-pointer transition-all duration-200 hover:bg-gray-700 hover:border-gray-500 border-2 border-transparent"
                onClick={() => handleToolClick(tool)}
              >
                <div className="flex items-start space-x-3">
                  <div className="text-lg">⚙️</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-semibold text-sm mb-1">{tool.name}</div>
                    <div className="text-gray-400 text-xs leading-relaxed">
                      {tool.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                onClick={() => window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo,user`}
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
        <div className={`flex flex-col border-r border-gray-700 transition-all duration-300 ${editorFile.isOpen ? 'w-[450px]' : 'flex-1'}`}>
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
              {selectedServer && <div className="text-sm text-gray-400 ml-2">Active: {selectedServer.icon} {selectedServer.name}</div>}
            </form>
          </div>
        </div>

        {/* Editor Section (Slides in from Right) */}
        {editorFile.isOpen && (
          <div className="flex-1 flex flex-col bg-[#1e1e1e] animate-in slide-in-from-right duration-300">
            <div className="p-3 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
              <span className="text-sm font-mono text-blue-400 truncate px-2">{editorFile.path}</span>
              <div className="flex space-x-2">
                <button onClick={handleSaveFromEditor} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-bold">
                  Save Changes
                </button>
                <button onClick={() => setEditorFile(prev => ({...prev, isOpen: false}))} className="text-gray-400 hover:text-white px-2">
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1">
              <Editor
                theme="vs-dark"
                defaultLanguage="javascript"
                value={editorFile.content}
                onChange={(value) => setEditorFile(prev => ({...prev, content: value}))}
                options={{
                fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                fontLigatures: true,
                cursorSmoothCaretAnimation: "on",
                smoothScrolling: true,
                lineHeight: 24,
                letterSpacing: 0.5,
                padding: { top: 20 }
              }}
              />
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