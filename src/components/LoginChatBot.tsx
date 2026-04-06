import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, Bot } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function LoginChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    let assistantContent = "";

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage],
          }),
        }
      );

      if (response.status === 429) {
        setIsRateLimited(true);
        throw new Error("⚠️ ကန့်သတ်ချက် ပြည့်သွားပါပြီ။ တစ်နာရီအကြာ ပြန်မေးနိုင်ပါတယ်။");
      }

      if (!response.ok || !response.body) {
        throw new Error("ချိတ်ဆက်မှု မအောင်မြင်ပါ။ ခဏနေပြီး ပြန်ကြိုးစားပါ။");
      }

      // Handle non-streaming blocked response (security probe)
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        const blockedContent = data.choices?.[0]?.message?.content;
        if (blockedContent) {
          setMessages((prev) => [...prev, { role: "assistant", content: blockedContent }]);
        }
        setIsLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (error) {
      const isNetworkError = error instanceof TypeError && error.message === "Failed to fetch";
      const errorMessage = isNetworkError
        ? "ချိတ်ဆက်မှု မအောင်မြင်ပါ။ ခဏနေပြီး ပြန်ကြိုးစားပါ။"
        : error instanceof Error ? error.message : "တစ်ခုခု မှားသွားပါတယ်။";
      setMessages((prev) => [...prev, { role: "assistant", content: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 transition-colors font-extrabold text-xs text-emerald-400 hover:text-emerald-300"
      >
        <Bot className="w-3.5 h-3.5" />
        AI Assistant
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">Nova AI Assistant</h2>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <Bot className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-white/50 text-xs">
              App အကြောင်း၊ Plan နဲ့ Price အကြောင်း၊ Credit အကြောင်း စသဖြင့် မေးမြန်းနိုင်ပါတယ်။
            </p>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                message.role === "user"
                  ? "bg-violet-600 text-white"
                  : "bg-white/10 text-white/90 border border-white/5"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-white/10 border border-white/5 rounded-2xl px-3 py-2">
              <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={isRateLimited ? "ကန့်သတ်ချက် ပြည့်သွားပါပြီ" : "မေးခွန်းမေးရန်..."}
            disabled={isRateLimited}
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-40"
            autoFocus
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim() || isRateLimited}
            className="p-2.5 rounded-full bg-emerald-600 text-white disabled:opacity-50 transition-all hover:bg-emerald-500"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
