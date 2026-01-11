import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askPuter } from './puter/agent';


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

  const renderMessageContent = (content) => {
  // Case 1: Plain string
  if (typeof content === "string") {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    );
  }

  // Case 2: Array handling (Gemini/Puter structured content)
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

  // Case 3: Fallback for objects (The error likely hits here if data is null/undefined)
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

  const userMessage = {
    id: Date.now(),
    type: 'user',
    content: currentInput,
    timestamp: new Date()
  };

  setMessages(prev => [...prev, userMessage]);

  let chatHistory = messages.map(m => ({
    role: m.type === "user" ? "user" : "assistant",
    content:
      typeof m.content === "string"
        ? m.content
        : JSON.stringify(m.content)
  }));

  setIsProcessing(true);
  setInputValue('');

  try {
    let aiResponse = await askPuter(currentInput, chatHistory,"router");

    let parsed = null;
    try { parsed = JSON.parse(aiResponse); } catch {}

    if (parsed?.action) {
      const backendRes = await fetch("http://localhost:4000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
        credentials: "include"
      });

      const toolResult = await backendRes.json();

      const toolOutputStr = `
IMPORTANT:
You are now in RESPONSE MODE.
DO NOT return JSON.
DO NOT return structured data.
DO NOT repeat the tool output.

User request:
"${currentInput}"

Tool executed:
${parsed.action}

Tool result:
${JSON.stringify(toolResult)}

Respond to the user in a clear, helpful, conversational way.
- Be specific to the user's request
- Do NOT expose raw JSON unless asked
- Summarize important details
`;


      chatHistory.push({ role: "user", content: currentInput });
      chatHistory.push({ role: "assistant", content: aiResponse });

      aiResponse = await askPuter(toolOutputStr, chatHistory,"responder");
    }

    setMessages(prev => [...prev, {
      id: Date.now(),
      type: "assistant",
      content: aiResponse,
      timestamp: new Date()
    }]);

    setMetrics(prev => [
  ...prev,
  finishRequest(req, true)
]);


  } catch (err) {
    console.error("HANDLE SUBMIT ERROR:", err);

    setMetrics(prev => [
  ...prev,
  finishRequest(req, false)
]);

  } finally {
    setIsProcessing(false);
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
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Left Panel - MCP Servers */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
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
            {mcServers?.map(server => (
              <div
                key={server.id}
                className={`p-4 rounded-xl cursor-pointer transition-all duration-200 border-2 ${
                  selectedServer?.id === server.id
                    ? 'bg-gray-700 border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'bg-gray-750 border-transparent hover:bg-gray-700 hover:border-gray-600'
                } ${server.status === 'offline' ? 'opacity-50' : ''}`}
                onClick={() => handleServerClick(server)}
              >
                <div className="flex items-start space-x-3">
                  <div className="text-2xl">{server.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm truncate">{server.name}</span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        server.status === 'online' 
                          ? 'bg-green-900 text-green-300' 
                          : 'bg-red-900 text-red-300'
                      }`}>
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
                      <div className="font-mono font-semibold text-sm mb-1">
                        {tool.name}
                      </div>
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-gray-900">
        {/* Chat/Messages Area */}
        <div className="flex-1 flex flex-col">
          <div className="p-6 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-green-500 bg-clip-text text-transparent">
                MCP Orchestrator
              </h2>
               {/* AUTH AREA */}
              {/* AUTH AREA */}
<div className="flex items-center space-x-4">

  {/* ───────── GitHub Auth ───────── */}
  {user ? (
    <>
      <div className="flex items-center space-x-2">
        {user.avatar_url && (
          <img
            src={user.avatar_url}
            alt="avatar"
            className="w-8 h-8 rounded-full"
          />
        )}
        <div className="text-sm text-right">
          <div className="font-medium">GitHub</div>
          <div className="truncate max-w-[10rem]">
            {user.login || user.name}
          </div>
        </div>
      </div>

      <button
        onClick={async () => {
          await fetch("http://localhost:4000/auth/logout", {
            method: "POST",
            credentials: "include",
          });
          await fetchAuthStatus();
        }}
        className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition"
      >
        Logout GitHub
      </button>
    </>
  ) : (
    <button
      onClick={() => {
        window.location.href =
          `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo,user`;
      }}
      className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition"
    >
      Login GitHub
    </button>
  )}

  {/* ───────── AI Status (Puter) ───────── */}
  {puterReady ? (
    <div className="flex items-center space-x-2 text-sm text-purple-300">
      <span className="w-2 h-2 rounded-full bg-green-400"></span>
      <span>AI Ready</span>
    </div>
  ) : (
    <div className="flex items-center space-x-2 text-sm text-yellow-300">
  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
  <button
    onClick={loginToPuter}
    className="underline hover:text-yellow-200 transition"
  >
    Login AI
  </button>
</div>

  )}

</div>
{/* end AUTH AREA */}


</div>
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              {messages.map((message) => (
                <div key={message.id} className="flex flex-col mb-2">
                  <div className={getMessageStyles(message.type)}>
                    {renderMessageContent(message.content)}
                  </div>
                  <div
                    className={`text-xs text-gray-500 mt-1 ${
                      message.type === 'user' ? 'text-right mr-2' : 'ml-2'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex space-x-2 items-center">
                  <div className="bg-gray-700 rounded-2xl px-4 py-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

          </div>
        </div>

        {/* Input Area - Fixed at Bottom */}
        <div className="border-t border-gray-700 bg-gray-900 p-6">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="flex space-x-4 items-center">
              <input
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  disabled={isProcessing || !user || !puterReady}
                  placeholder={
                  !user
                    ? "Login with GitHub to start..."
                    : !puterReady
                      ? "Login to AI (Puter) to continue..."
                      : "Ask me anything about your repos..."
                }


                  className="flex-1 bg-gray-800 border-2 border-gray-700 rounded-2xl px-6 py-4 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                />
              <button
                type="submit"
                disabled={isProcessing || !inputValue.trim() || !user || !puterReady}
                className="bg-blue-600 text-white rounded-2xl p-4 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 disabled:hover:scale-100 w-14 h-14 flex items-center justify-center"
              >
                {isProcessing ? '⏳' : '➤'}
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="bg-gray-700 text-white rounded-2xl p-4 hover:bg-gray-600 transition-all"
              >
                {isUploading ? "⏳" : "🔗"}
              </button>

            </div>
            {selectedServer && (
              <div className="text-sm text-gray-400 mt-2 ml-2">
                Active: {selectedServer.icon} {selectedServer.name}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Right Panel - Analytics */}
      <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Analytics</h2>
        </div>
        
        {/* Performance Metrics */}
<div className="p-6 border-b border-gray-700">
  <h3 className="font-semibold mb-4">Performance</h3>

  <div className="grid grid-cols-2 gap-3">
    {/* Success Rate */}
    <div className="bg-gray-750 p-4 rounded-xl border border-gray-600 text-center">
      <div className="text-2xl font-bold text-green-400">
        {performanceData.successRate}%
      </div>
      <div className="text-gray-400 text-sm mt-1">Success Rate</div>
    </div>

    {/* Avg Response */}
    <div className="bg-gray-750 p-4 rounded-xl border border-gray-600 text-center">
      <div className="text-2xl font-bold text-blue-400">
        {performanceData.responseTimes.length
          ? Math.round(
              performanceData.responseTimes.reduce((a, b) => a + b, 0) /
              performanceData.responseTimes.length
            )
          : 0}ms
      </div>
      <div className="text-gray-400 text-sm mt-1">Avg Response</div>
    </div>
  </div>
</div>

{/* Response Time Chart */}
<div className="p-6 border-b border-gray-700">
  <h3 className="font-semibold mb-4">Response Time Variance</h3>
  
  <div className="flex items-end space-x-1 h-48">
    {performanceData.responseTimes.map((time, index) => {
      const maxTime = Math.max(...performanceData.responseTimes);
      const minTime = Math.min(...performanceData.responseTimes);
      const previousTime = index > 0 ? performanceData.responseTimes[index - 1] : time;
      const difference = time - previousTime;
      const variance = Math.abs(difference) / (maxTime - minTime || 1);
      
      return (
        <div key={index} className="flex flex-col items-center flex-1">
          {/* Variance indicator */}
          <div className="relative w-full mb-2">
            <div className="flex justify-center items-center h-6">
              {difference !== 0 && (
                <div className={`text-xs px-2 py-1 rounded-full ${
                  difference > 0 
                    ? 'bg-red-500/20 text-red-400' 
                    : 'bg-green-500/20 text-green-400'
                }`}>
                  {difference > 0 ? `+${difference}` : difference}ms
                </div>
              )}
            </div>
          </div>
          
          {/* Main bar */}
          <div className="relative w-full group">
            <div className="w-full bg-gradient-to-t from-gray-800 to-gray-900 rounded-t-lg h-32 flex flex-col justify-end">
              {/* Actual value bar */}
              <div
                className={`rounded-t-lg w-full transition-all duration-500 ${
                  time <= 100 ? 'bg-gradient-to-t from-green-400 to-emerald-600' :
                  time <= 150 ? 'bg-gradient-to-t from-yellow-400 to-amber-600' :
                  'bg-gradient-to-t from-red-400 to-rose-600'
                }`}
                style={{ 
                  height: `${((time - minTime) / (maxTime - minTime || 1)) * 90}%`,
                  boxShadow: `0 0 20px ${
                    time <= 100 ? 'rgba(34, 197, 94, 0.3)' :
                    time <= 150 ? 'rgba(234, 179, 8, 0.3)' :
                    'rgba(239, 68, 68, 0.3)'
                  }`
                }}
              >
                {/* Animated pulse for high values */}
                {time > 150 && (
                  <div className="absolute inset-0 rounded-t-lg bg-red-400 animate-pulse opacity-20"></div>
                )}
              </div>
              
              {/* Comparison line */}
              {index > 0 && (
                <div
                  className="absolute left-0 right-0 h-0.5 bg-white/30"
                  style={{
                    bottom: `${((previousTime - minTime) / (maxTime - minTime || 1)) * 90}%`
                  }}
                ></div>
              )}
            </div>
            
            {/* Enhanced tooltip */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-xl p-3 opacity-0 group-hover:opacity-100 transition-all z-50 shadow-2xl min-w-[160px]">
              <div className="text-center">
                <div className="text-2xl font-bold text-white mb-1">{time}ms</div>
                <div className="text-xs text-gray-400 mb-2">Request {index + 1}</div>
                
                {index > 0 && (
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <div className={`text-xs ${
                      difference > 0 ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {difference > 0 ? '↑' : '↓'} {Math.abs(difference)}ms
                    </div>
                    <div className="text-xs text-gray-500">
                      from Req {index}
                    </div>
                  </div>
                )}
                
                <div className="text-xs text-gray-400">
                  {time <= 100 ? 'Performance: Excellent' : 
                   time <= 150 ? 'Performance: Good' : 
                   'Performance: Needs Attention'}
                </div>
              </div>
              <div className="absolute bottom-0 left-1/2 w-3 h-3 bg-gray-900 border-b border-r border-gray-700 -translate-x-1/2 translate-y-1/2 rotate-45"></div>
            </div>
          </div>
          
          {/* X-axis */}
          <div className="mt-2 text-center">
            <div className="text-gray-300 text-sm font-semibold">#{index + 1}</div>
            <div className="text-gray-500 text-xs">{time}ms</div>
          </div>
        </div>
      );
    })}
  </div>
</div>
        {/* System Status */}
        <div className="p-6">
          <h3 className="font-semibold mb-4">System Status</h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 bg-gray-750 rounded-lg border border-gray-600">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>LLM Orchestrator</span>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-gray-750 rounded-lg border border-gray-600">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>API Gateway</span>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-gray-750 rounded-lg border border-gray-600">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Database</span>
            </div>
          </div>
        </div>
      </div>
      {/* ✅ HIDDEN FILE INPUT — HERE */}
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